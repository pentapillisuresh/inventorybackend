const { Op, fn, col, literal } = require('sequelize');
const { sequelize, StockRequest, StockRequestItem, OutletProduct, Outlet, Inventory } = require('../models');


const generateRequestNumber = async (outletId, transaction) => {
    const prefix = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const count = await StockRequest.count({ where: { outletId }, transaction });
    return `REQ-${outletId}-${prefix}-${String(count + 1).padStart(4, '0')}`;
};

/* =========================================================
   Get Admin Dashboard Summary & List
   GET /api/stock-requests/admin-dashboard
========================================================= */
exports.getAdminDashboardData = async (req, res) => {
    try {
        const {
            search,
            status,
            page = 1,
            limit = 10
        } = req.query;

        const offset = (page - 1) * limit;

        /* =========================================================
           1. CALCULATE TOP SUMMARY CARDS
           ========================================================= */

        // Count Total Requests
        const totalRequests = await StockRequest.count();

        // Count Pending Approval
        const pendingApproval = await StockRequest.count({ where: { status: 'pending' } });

        // Count Awaiting Payment (Approved/Completed but paymentStatus is pending/credit)
        const awaitingPayment = await StockRequest.count({
            where: {
                status: { [Op.in]: ['approved', 'partially_approved', 'completed'] },
                paymentStatus: { [Op.ne]: 'paid' }
            }
        });

        // Count Completed (Fulfilled and Paid, or just Fulfilled depending on your logic)
        const completed = await StockRequest.count({ where: { status: 'completed' } });

        // Calculate Outstanding Request Value (Total Amount of non-completed requests)
        const outstandingValueData = await StockRequest.findOne({
            where: { status: { [Op.ne]: 'completed' } },
            attributes: [[fn('SUM', col('totalAmount')), 'total']],
            raw: true
        });
        const outstandingValue = Number(outstandingValueData?.total || 0);

        /* =========================================================
           2. FETCH PAGINATED LIST
           ========================================================= */
        const whereClause = {};
        if (status && status !== 'All statuses') {
            whereClause.status = status.toLowerCase();
        }
        if (search) {
            whereClause[Op.or] = [
                { requestNumber: { [Op.like]: `%${search}%` } },
                { '$Outlet.name$': { [Op.like]: `%${search}%` } }
            ];
        }

        const { count, rows: requests } = await StockRequest.findAndCountAll({
            where: whereClause,
            include: [
                {
                    model: Outlet,
                    as: 'outlet',
                    attributes: ['id', 'name', 'contactPerson', 'phoneNumber']
                },
                {
                    model: StockRequestItem,
                    as: 'items',
                    attributes: ['id', 'status', 'requestedQuantity', 'approvedQuantity']
                }
            ],
            order: [['createdAt', 'DESC']],
            limit: Number(limit),
            offset: offset,
            distinct: true // Important when including hasMany (items)
        });

        /* =========================================================
           3. FORMAT DATA TO MATCH UI
           ========================================================= */
        const formattedRequests = requests.map(req => {
            const totalProducts = req.items.length;
            // Count items that are fully approved or partially approved
            const approvedProducts = req.items.filter(i =>
                i.status === 'approved' || i.status === 'partially_approved'
            ).length;

            // Format date: 24 Oct 2026 09:30 am
            const dateObj = new Date(req.createdAt);
            const dateStr = dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
            const timeStr = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase();

            return {
                id: req.id,
                requestNumber: req.requestNumber,
                outletName: req.outlet?.name || 'Unknown Outlet',
                contactPerson: req.outlet?.contactPerson || 'N/A',
                requestedOn: `${dateStr}\n${timeStr}`, // React native can render \n
                rawDate: req.createdAt,
                totalProducts,
                approvedProducts,
                // Generates the "0/3" or "2/2" string
                approvalString: `${approvedProducts}/${totalProducts}`,
                progressPercentage: totalProducts > 0 ? (approvedProducts / totalProducts) * 100 : 0,
                totalAmount: Number(req.totalAmount),
                paymentStatus: req.paymentStatus, // 'paid', 'credit', 'pending'
                status: req.status, // 'pending', 'completed', etc.
            };
        });

        /* =========================================================
           4. RETURN RESPONSE
           ========================================================= */
        return res.status(200).json({
            success: true,
            summary: {
                totalRequests,
                pendingApproval,
                awaitingPayment,
                completed,
                outstandingValue
            },
            requests: formattedRequests,
            pagination: {
                total: count,
                page: Number(page),
                totalPages: Math.ceil(count / limit),
                limit: Number(limit)
            }
        });

    } catch (error) {
        console.error('getAdminDashboardData error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch admin dashboard data',
            error: error.message
        });
    }
};

/* =========================================================
   1. Create a Stock Request (By Outlet)
   POST /api/stock-requests
========================================================= */
exports.createRequest = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { outletId, requestType = 'refill', notes, items } = req.body;
        const requestedBy = req.user?.id || req.body.requestedBy; // Assuming auth middleware sets req.user

        if (!outletId || !items || items.length === 0) {
            await t.rollback();
            return res.status(400).json({ success: false, message: 'outletId and at least one item are required' });
        }

        const requestNumber = await generateRequestNumber(outletId, t);

        // Create Header
        const request = await StockRequest.create({
            requestNumber,
            outletId,
            requestType,
            notes,
            requestedBy,
            status: 'pending'
        }, { transaction: t });

        // Create Items
        const requestItems = items.map(item => ({
            requestId: request.id,
            outletProductId: item.outletProductId || null,
            productName: item.productName,
            requestedQuantity: item.requestedQuantity,
            status: 'pending'
        }));

        const createdItems = await StockRequestItem.bulkCreate(requestItems, { transaction: t });

        await t.commit();

        return res.status(201).json({
            success: true,
            message: 'Stock request generated successfully',
            data: { ...request.toJSON(), items: createdItems }
        });
    } catch (error) {
        await t.rollback();
        console.error('createRequest error:', error);
        return res.status(500).json({ success: false, message: 'Failed to create request', error: error.message });
    }
};

/* =========================================================
   2. Get All Requests (Filtered by Role)
   GET /api/stock-requests
========================================================= */
exports.getAllRequests = async (req, res) => {
    try {
        const { outletId, status, page = 1, limit = 10 } = req.query;
        const offset = (page - 1) * limit;

        const where = {};
        if (outletId) where.outletId = outletId;
        if (status) where.status = status;

        const { count, rows } = await StockRequest.findAndCountAll({
            where,
            include: [{ model: StockRequestItem, as: 'items' }],
            order: [['createdAt', 'DESC']],
            limit: Number(limit),
            offset
        });

        return res.status(200).json({
            success: true,
            total: count,
            page: Number(page),
            totalPages: Math.ceil(count / limit),
            data: rows
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Failed to fetch requests', error: error.message });
    }
};

/* =========================================================
   3. Get Single Request Details
   GET /api/stock-requests/:id
========================================================= */
exports.getRequestById = async (req, res) => {
    try {
        const request = await StockRequest.findByPk(req.params.id, {
            include: [{ model: StockRequestItem, as: 'items' }]
        });

        if (!request) {
            return res.status(404).json({ success: false, message: 'Request not found' });
        }

        return res.status(200).json({ success: true, data: request });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Failed to fetch request', error: error.message });
    }
};

/* =========================================================
   Get Single Request Details (For Modal)
   GET /api/stock-requests/:id/details
========================================================= */
exports.getRequestDetails = async (req, res) => {
    try {
        const { id } = req.params;

        // Fetch Request with Outlet and Items (including Product details)
        const request = await StockRequest.findByPk(id, {
            include: [
                {
                    model: Outlet,
                    as: 'outlet',
                    attributes: ['id', 'name', 'contactPerson', 'phoneNumber', 'address', 'email']
                },
                {
                    model: StockRequestItem,
                    as: 'items',
                    include: [
                        {
                            model: OutletProduct,
                            as: 'product',
                            attributes: ['id', 'name', 'sku', 'categoryName', 'units', 'price']
                        }
                    ]
                }
            ]
        });

        if (!request) {
            return res.status(404).json({ success: false, message: 'Request not found' });
        }

        /* =========================================================
           FORMAT DATA FOR THE UI
           ========================================================= */

        // Date Formatting (e.g., 24 Oct 2026 & 09:30 am)
        const dateObj = new Date(request.createdAt);
        const formattedDate = dateObj.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        const formattedTime = dateObj.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase();

        let grandTotal = 0;
        let totalQuantity = 0;
        let approvedCount = 0;

        // Process each item
        const formattedItems = request.items.map(item => {
            // Fallback to item data if product join fails, otherwise use product data
            const product = item.product || {};

            const unitPrice = Number(product.price || item.price || 0);
            const quantity = Number(item.requestedQuantity);
            const lineTotal = unitPrice * quantity;

            grandTotal += lineTotal;
            totalQuantity += quantity;

            if (item.status === 'approved' || item.status === 'partially_approved') {
                approvedCount++;
            }

            return {
                itemId: item.id,
                productName: product.name || item.productName,
                sku: product.sku || 'N/A',
                categoryName: product.categoryName || 'Uncategorized',
                quantity: quantity,
                unit: product.units || 'Pc',
                unitPrice: unitPrice,
                lineTotal: lineTotal,
                status: item.status // 'pending', 'approved', 'rejected'
            };
        });

        const totalProducts = request.items.length;

        /* =========================================================
           FINAL RESPONSE
           ========================================================= */
        return res.status(200).json({
            success: true,
            data: {
                // Header Info
                requestId: request.requestNumber,
                status: request.status,

                // Outlet Info Card
                outletInfo: {
                    name: request.outlet?.name || 'Unknown Outlet',
                    contactPerson: request.outlet?.contactPerson || 'N/A',
                    phoneNumber: request.outlet?.phoneNumber || 'N/A',
                    address: request.outlet?.address || 'N/A',
                    email: request.outlet?.email || 'N/A'
                },

                // Request Summary Card
                summary: {
                    requestDate: formattedDate,
                    requestTime: formattedTime,
                    totalProducts: totalProducts,
                    approvalProgressString: `${approvedCount}/${totalProducts}`,
                    approvalProgressPercentage: totalProducts > 0 ? (approvedCount / totalProducts) * 100 : 0
                },

                // Requested Products Table
                products: formattedItems,

                // Footer Summary
                footer: {
                    totalQuantity: totalQuantity,
                    grandTotal: grandTotal
                }
            }
        });

    } catch (error) {
        console.error('getRequestDetails error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch request details',
            error: error.message
        });
    }
};

/* =========================================================
   4. Approve/Reject Request (By Admin/Store Manager)
   PATCH /api/stock-requests/:id/approve
========================================================= */
exports.approveRequest = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { id } = req.params;
        const { approvedItems, action = 'approve' } = req.body;
        // approvedItems format: [{ itemId: 1, approvedQuantity: 5 }, ...]
        // action: 'approve' or 'reject'

        const approvedBy = req.user?.id || req.body.approvedBy;

        const request = await StockRequest.findByPk(id, {
            include: [{ model: StockRequestItem, as: 'items' }],
            transaction: t,
            lock: t.LOCK.UPDATE
        });

        if (!request) {
            await t.rollback();
            return res.status(404).json({ success: false, message: 'Request not found' });
        }

        if (request.status !== 'pending') {
            await t.rollback();
            return res.status(400).json({ success: false, message: `Request already ${request.status}` });
        }

        // If Rejecting
        if (action === 'reject') {
            await request.update({ status: 'rejected', approvedBy, approvedAt: new Date() }, { transaction: t });
            await StockRequestItem.update({ status: 'rejected' }, { where: { requestId: id }, transaction: t });
            await t.commit();
            return res.status(200).json({ success: true, message: 'Request rejected' });
        }

        // If Approving
        let allApproved = true;
        let anyApproved = false;

        for (const item of request.items) {
            // Find what admin approved for this item
            const approvedEntry = approvedItems?.find(a => a.itemId === item.id);
            const qtyToApprove = approvedEntry ? Number(approvedEntry.approvedQuantity) : item.requestedQuantity;

            if (qtyToApprove > 0) {
                anyApproved = true;

                // 1. Update Item status
                await item.update({
                    approvedQuantity: qtyToApprove,
                    status: qtyToApprove === item.requestedQuantity ? 'approved' : 'partially_approved'
                }, { transaction: t });

                if (qtyToApprove < item.requestedQuantity) allApproved = false;

                // 2. Fulfill the stock (Add to OutletProduct)
                if (item.outletProductId) {
                    const outletProduct = await OutletProduct.findByPk(item.outletProductId, { transaction: t, lock: t.LOCK.UPDATE });
                    if (outletProduct) {
                        outletProduct.quantity += qtyToApprove;
                        outletProduct.liveStock += qtyToApprove;
                        await outletProduct.save({ transaction: t });
                    }
                } else {
                    // Note: If outletProductId is null, it means it's a new product.
                    // You would typically map it to an OutletProduct here, or create a new one.
                }
            } else {
                // Admin approved 0 for this item
                await item.update({ status: 'rejected', approvedQuantity: 0 }, { transaction: t });
                allApproved = false;
            }
        }

        // Determine overall status
        let finalStatus = 'rejected';
        if (allApproved) finalStatus = 'approved';
        else if (anyApproved) finalStatus = 'partially_approved';

        await request.update({
            status: finalStatus,
            approvedBy,
            approvedAt: new Date()
        }, { transaction: t });

        await t.commit();
        return res.status(200).json({ success: true, message: `Request ${finalStatus} successfully` });

    } catch (error) {
        await t.rollback();
        console.error('approveRequest error:', error);
        return res.status(500).json({ success: false, message: 'Failed to process request', error: error.message });
    }
};

/* =========================================================
   Approve Request Items (Single, Bulk, or All)
   PATCH /api/stock-requests/:id/approve
========================================================= */

exports.approveRequestItems = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { id } = req.params;
        const { itemIds, approveAll = false } = req.body;
        const approvedBy = req.user?.id || req.body.approvedBy;

        // 1. Fetch Request and Items
        const request = await StockRequest.findByPk(id, {
            include: [{ model: StockRequestItem, as: 'items' }],
            transaction: t,
            lock: t.LOCK.UPDATE
        });

        if (!request) {
            await t.rollback();
            return res.status(404).json({ success: false, message: 'Request not found' });
        }

        if (request.status === 'completed') {
            await t.rollback();
            return res.status(400).json({ success: false, message: 'Request is already completed' });
        }

        // 2. Determine which items to approve
        let itemsToApprove = [];
        if (approveAll) {
            itemsToApprove = request.items.filter(i => i.status === 'pending');
        } else if (itemIds && Array.isArray(itemIds) && itemIds.length > 0) {
            itemsToApprove = request.items.filter(i => itemIds.includes(i.id));
        } else {
            await t.rollback();
            return res.status(400).json({ success: false, message: 'Please provide itemIds or set approveAll to true' });
        }

        if (itemsToApprove.length === 0) {
            await t.rollback();
            return res.status(400).json({ success: false, message: 'No pending items found to approve' });
        }

        // 3. Process Each Approved Item
        for (const item of itemsToApprove) {
            // A. Update Item Status
            item.status = 'approved';
            item.approvedQuantity = item.requestedQuantity;
            await item.save({ transaction: t });

            // B. Fulfill the stock (Add to OutletProduct, Deduct from Store Inventory)
            if (item.outletProductId) {
                const outletProduct = await OutletProduct.findByPk(item.outletProductId, {
                    transaction: t,
                    lock: t.LOCK.UPDATE
                });

                if (outletProduct) {
                    // 🆕 1. Deduct from Store Inventory
                    // Assuming `comeFromInventory` holds the Product ID from the Store
                    if (outletProduct.comeFromInventory && request.storeId) {
                        const storeInventory = await Inventory.findByPk(
                            outletProduct.comeFromInventory,
                            {
                                transaction: t,
                                lock: t.LOCK.UPDATE,
                            }
                        );

                        if (storeInventory) {
                            if (storeInventory.quantity < item.requestedQuantity) {
                                throw new Error(`Insufficient stock in Store for product: ${outletProduct.name}. Available: ${storeInventory.quantity}`);
                            }

                            storeInventory.quantity -= item.requestedQuantity;
                            storeInventory.lastUpdated = new Date();
                            await storeInventory.save({ transaction: t });
                        } else {
                            console.warn(`Store Inventory not found for Product ${outletProduct.comeFromInventory} in Store ${request.storeId}`);
                            // Optional: Decide if you want to throw an error or just warn
                            // throw new Error(`Store inventory record not found for product ${outletProduct.name}`);
                        }
                    }

                    // 🆕 2. Add to OutletProduct
                    outletProduct.quantity += item.requestedQuantity;
                    outletProduct.liveStock += item.requestedQuantity;
                    await outletProduct.save({ transaction: t });
                }
            }
        }

        // 4. Determine Overall Request Status
        const allItems = request.items;
        const pendingItemsCount = allItems.filter(i => i.status === 'pending').length;
        const approvedItemsCount = allItems.filter(i => i.status === 'approved').length;

        let newRequestStatus = 'pending';
        if (pendingItemsCount === 0) {
            newRequestStatus = 'approved';
        } else if (approvedItemsCount > 0) {
            newRequestStatus = 'partially_approved';
        }

        // 5. Update Request Header
        await request.update({
            status: newRequestStatus,
            approvedBy,
            approvedAt: new Date()
        }, { transaction: t });

        await t.commit();

        return res.status(200).json({
            success: true,
            message: approveAll ? 'All items approved successfully' : `${itemsToApprove.length} item(s) approved successfully`,
            status: newRequestStatus
        });

    } catch (error) {
        await t.rollback();
        console.error('approveRequestItems error:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Failed to approve items',
            error: error.message
        });
    }
};