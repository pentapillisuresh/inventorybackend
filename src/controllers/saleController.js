const { Op } = require('sequelize');
const { sequelize, Sale, SaleItem, OutletProduct } = require('../models');

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

async function generateInvoiceNumber(outletId, transaction) {
  const prefix = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const count = await Sale.count({
    where: { outletId },
    transaction
  });
  return `INV-${outletId}-${prefix}-${String(count + 1).padStart(4, '0')}`;
}

/* ------------------------------------------------------------------ */
/* 1. Create Sale (multiple products)                                  */
/* POST /api/sales                                                     */
/* ------------------------------------------------------------------ */
exports.createSale = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const {
      outletId, customerName, customerPhone, customerAddress,
      state, saleDate, discount = 0, notes, createdBy, items
    } = req.body;

    // ---- Validation ----
    if (!outletId || !state) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: 'outletId and state are required'
      });
    }
    if (!Array.isArray(items) || items.length === 0) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: 'At least one sale item is required'
      });
    }

    // ---- Fetch products and build line items ----
    const productIds = items.map((i) => i.outletProductId);
    const products = await OutletProduct.findAll({
      where: { id: { [Op.in]: productIds } },
      transaction: t
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    let subtotal = 0;
    let totalTax = 0;
    const saleItemPayload = [];

    for (const item of items) {
      const { outletProductId, quantity, unitPrice } = item;

      if (!outletProductId || !quantity || quantity <= 0) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: `Invalid item — outletProductId and quantity > 0 required`
        });
      }

      const product = productMap.get(Number(outletProductId));
      if (!product) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: `Product with id ${outletProductId} not found`
        });
      }

      // Ensure product belongs to the sale's outlet
      if (product.outletId && Number(product.outletId) !== Number(outletId)) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: `Product ${product.name} does not belong to outlet ${outletId}`
        });
      }

      const price = round2(unitPrice ?? product.price);
      const baseAmount = round2(price * quantity);

      // Inherit tax rates from product unless overridden
      const IGST = round2(item.IGST ?? product.IGST ?? 0);
      const SGST = round2(item.SGST ?? product.SGST ?? 0);
      const CGST = round2(item.CGST ?? product.CGST ?? 0);

      const taxRate = IGST + SGST + CGST;               // percentages
      const taxAmount = round2(baseAmount * (taxRate / 100));
      const lineTotal = round2(baseAmount + taxAmount);

      subtotal = round2(subtotal + baseAmount);
      totalTax = round2(totalTax + taxAmount);

      saleItemPayload.push({
        outletProductId: product.id,
        productName: product.name,
        sku: product.sku,
        HSN_No: product.HSN_No,
        quantity,
        units: product.units,
        unitPrice: price,
        IGST,
        SGST,
        CGST,
        taxAmount,
        lineTotal,
        costPrice: product.costPrice
      });
    }

    const totalAmount = round2(subtotal + totalTax - Number(discount));
    const invoiceNumber = await generateInvoiceNumber(outletId, t);

    // ---- Create Sale ----
    const sale = await Sale.create({
      invoiceNumber,
      outletId,
      customerName,
      customerPhone,
      customerAddress,
      state,
      saleDate: saleDate || new Date(),
      subtotal,
      totalTax,
      discount: Number(discount),
      totalAmount,
      status: 'pending',
      notes,
      createdBy
    }, { transaction: t });

    // ---- Create Sale Items ----
    const saleItems = await SaleItem.bulkCreate(
      saleItemPayload.map((it) => ({ ...it, saleId: sale.id })),
      { transaction: t }
    );

    await t.commit();

    return res.status(201).json({
      success: true,
      message: 'Sale created successfully (pending approval)',
      data: { ...sale.toJSON(), items: saleItems }
    });
  } catch (error) {
    await t.rollback();
    console.error('createSale error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create sale',
      error: error.message
    });
  }
};

/* ------------------------------------------------------------------ */
/* 2. Get all sales (with filters)                                     */
/* GET /api/sales                                                      */
/* ------------------------------------------------------------------ */
exports.getAllSales = async (req, res) => {
  try {
    const {
      page = 1, limit = 10,
      outletId, state, status,
      fromDate, toDate, search
    } = req.query;

    const where = {};
    if (outletId) where.outletId = outletId;
    if (state) where.state = state;
    if (status) where.status = status;

    if (fromDate || toDate) {
      where.saleDate = {};
      if (fromDate) where.saleDate[Op.gte] = new Date(fromDate);
      if (toDate) {
        const end = new Date(toDate);
        end.setHours(23, 59, 59, 999);
        where.saleDate[Op.lte] = end;
      }
    }

    if (search) {
      where[Op.or] = [
        { invoiceNumber: { [Op.like]: `%${search}%` } },
        { customerName: { [Op.like]: `%${search}%` } },
        { customerPhone: { [Op.like]: `%${search}%` } }
      ];
    }

    const offset = (Number(page) - 1) * Number(limit);

    const { count, rows } = await Sale.findAndCountAll({
      where,
      include: [{ model: SaleItem, as: 'items' }],
      offset,
      limit: Number(limit),
      order: [['id', 'DESC']]
    });

    return res.status(200).json({
      success: true,
      total: count,
      page: Number(page),
      totalPages: Math.ceil(count / limit),
      data: rows
    });
  } catch (error) {
    console.error('getAllSales error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch sales',
      error: error.message
    });
  }
};

/* ------------------------------------------------------------------ */
/* 3. Get single sale                                                  */
/* GET /api/sales/:id                                                  */
/* ------------------------------------------------------------------ */
exports.getSaleById = async (req, res) => {
  try {
    const sale = await Sale.findByPk(req.params.id, {
      include: [
        { model: SaleItem, as: 'items', include: [{ model: OutletProduct, as: 'product' }] }
      ]
    });
    if (!sale) {
      return res.status(404).json({ success: false, message: 'Sale not found' });
    }
    return res.status(200).json({ success: true, data: sale });
  } catch (error) {
    console.error('getSaleById error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch sale',
      error: error.message
    });
  }
};

/* ------------------------------------------------------------------ */
/* 4. Approve Sale (deducts stock) — REQUIREMENT #2                    */
/* PATCH /api/sales/:id/approve                                        */
/* ------------------------------------------------------------------ */
exports.approveSale = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { approvedBy } = req.body;

    // Lock the sale row so two approvals can't run simultaneously
    const sale = await Sale.findByPk(id, {
      include: [{ model: SaleItem, as: 'items' }],
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    if (!sale) {
      await t.rollback();
      return res.status(404).json({ success: false, message: 'Sale not found' });
    }
    if (sale.status !== 'pending') {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: `Only pending sales can be approved (current status: ${sale.status})`
      });
    }

    // ---- Step 1: verify stock for every item ----
    const products = await OutletProduct.findAll({
      where: { id: { [Op.in]: sale.items.map((i) => i.outletProductId) } },
      transaction: t,
      lock: t.LOCK.UPDATE
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    for (const item of sale.items) {
      const product = productMap.get(item.outletProductId);
      if (!product) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: `Product (id ${item.outletProductId}) no longer exists`
        });
      }
      if (product.quantity < item.quantity) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for "${product.name}" — available: ${product.quantity}, required: ${item.quantity}`
        });
      }
    }

    // ---- Step 2: deduct stock ----
    for (const item of sale.items) {
      const product = productMap.get(item.outletProductId);
      product.quantity -= item.quantity;
      await product.save({ transaction: t });
    }

    // ---- Step 3: mark sale approved ----
    await sale.update(
      { status: 'approved', approvedBy: approvedBy || null, approvedAt: new Date() },
      { transaction: t }
    );

    await t.commit();

    return res.status(200).json({
      success: true,
      message: 'Sale approved and stock updated successfully',
      data: sale
    });
  } catch (error) {
    await t.rollback();
    console.error('approveSale error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to approve sale',
      error: error.message
    });
  }
};

/* ------------------------------------------------------------------ */
/* 5. Reject Sale (no stock change — only pending allowed)             */
/* PATCH /api/sales/:id/reject                                         */
/* ------------------------------------------------------------------ */
exports.rejectSale = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const sale = await Sale.findByPk(req.params.id, { transaction: t, lock: t.LOCK.UPDATE });

    if (!sale) {
      await t.rollback();
      return res.status(404).json({ success: false, message: 'Sale not found' });
    }
    if (sale.status !== 'pending') {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: `Only pending sales can be rejected (current status: ${sale.status})`
      });
    }

    await sale.update({ status: 'rejected', notes: req.body.notes || sale.notes }, { transaction: t });
    await t.commit();

    return res.status(200).json({
      success: true,
      message: 'Sale rejected',
      data: sale
    });
  } catch (error) {
    await t.rollback();
    console.error('rejectSale error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to reject sale',
      error: error.message
    });
  }
};

/* ------------------------------------------------------------------ */
/* 6. Cancel Sale (restores stock if already approved)                 */
/* PATCH /api/sales/:id/cancel                                         */
/* ------------------------------------------------------------------ */
exports.cancelSale = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const sale = await Sale.findByPk(req.params.id, {
      include: [{ model: SaleItem, as: 'items' }],
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    if (!sale) {
      await t.rollback();
      return res.status(404).json({ success: false, message: 'Sale not found' });
    }
    if (!['pending', 'approved'].includes(sale.status)) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: `Cannot cancel a sale with status: ${sale.status}`
      });
    }

    // If it was approved, restore the stock
    if (sale.status === 'approved') {
      const products = await OutletProduct.findAll({
        where: { id: { [Op.in]: sale.items.map((i) => i.outletProductId) } },
        transaction: t,
        lock: t.LOCK.UPDATE
      });
      const productMap = new Map(products.map((p) => [p.id, p]));

      for (const item of sale.items) {
        const product = productMap.get(item.outletProductId);
        if (product) {
          product.quantity += item.quantity;
          await product.save({ transaction: t });
        }
      }
    }

    await sale.update({ status: 'cancelled' }, { transaction: t });
    await t.commit();

    return res.status(200).json({
      success: true,
      message: sale.status === 'approved'
        ? 'Sale cancelled and stock restored'
        : 'Pending sale cancelled',
      data: sale
    });
  } catch (error) {
    await t.rollback();
    console.error('cancelSale error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to cancel sale',
      error: error.message
    });
  }
};

/* ------------------------------------------------------------------ */
/* 7. Reports by date range + state — REQUIREMENT #3                   */
/* GET /api/sales/reports?fromDate=&toDate=&state=&outletId=&status=   */
/* ------------------------------------------------------------------ */
exports.getSalesReport = async (req, res) => {
  try {
    const { fromDate, toDate, state, outletId, status = 'approved' } = req.query;

    if (!fromDate || !toDate) {
      return res.status(400).json({
        success: false,
        message: 'fromDate and toDate are required (YYYY-MM-DD)'
      });
    }

    const start = new Date(fromDate);
    const end = new Date(toDate);
    end.setHours(23, 59, 59, 999);

    if (isNaN(start) || isNaN(end)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format. Use YYYY-MM-DD'
      });
    }
    if (start > end) {
      return res.status(400).json({
        success: false,
        message: 'fromDate cannot be greater than toDate'
      });
    }

    const where = {
      saleDate: { [Op.between]: [start, end] }
    };
    if (state) where.state = state;
    if (outletId) where.outletId = outletId;
    if (status) where.status = status;

    // ---- Overall summary ----
    const summaryRow = await Sale.findOne({
      where,
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('id')), 'totalSales'],
        [sequelize.fn('SUM', sequelize.col('subtotal')), 'grossSubtotal'],
        [sequelize.fn('SUM', sequelize.col('totalTax')), 'totalTax'],
        [sequelize.fn('SUM', sequelize.col('discount')), 'totalDiscount'],
        [sequelize.fn('SUM', sequelize.col('totalAmount')), 'netRevenue']
      ],
      raw: true
    });

    const summary = {
      totalSales: Number(summaryRow?.totalSales || 0),
      grossSubtotal: round2(summaryRow?.grossSubtotal || 0),
      totalTax: round2(summaryRow?.totalTax || 0),
      totalDiscount: round2(summaryRow?.totalDiscount || 0),
      netRevenue: round2(summaryRow?.netRevenue || 0)
    };

    // ---- Breakdown by state ----
    const byState = await Sale.findAll({
      where,
      attributes: [
        'state',
        [sequelize.fn('COUNT', sequelize.col('Sale.id')), 'totalSales'],
        [sequelize.fn('SUM', sequelize.col('Sale.subtotal')), 'grossSubtotal'],
        [sequelize.fn('SUM', sequelize.col('Sale.totalTax')), 'totalTax'],
        [sequelize.fn('SUM', sequelize.col('Sale.totalAmount')), 'netRevenue']
      ],
      group: ['Sale.state'],
      order: [[sequelize.literal('netRevenue'), 'DESC']],
      raw: true
    });

    // ---- Optional: breakdown by day for trend ----
    const byDay = await Sale.findAll({
      where,
      attributes: [
        [sequelize.fn('DATE', sequelize.col('saleDate')), 'date'],
        [sequelize.fn('COUNT', sequelize.col('Sale.id')), 'totalSales'],
        [sequelize.fn('SUM', sequelize.col('Sale.totalAmount')), 'netRevenue']
      ],
      group: [sequelize.fn('DATE', sequelize.col('saleDate'))],
      order: [[sequelize.literal('date'), 'ASC']],
      raw: true
    });

    return res.status(200).json({
      success: true,
      filters: {
        fromDate, toDate,
        state: state || 'ALL',
        outletId: outletId || 'ALL',
        status: status || 'ALL'
      },
      summary,
      byState: byState.map((r) => ({
        state: r.state,
        totalSales: Number(r.totalSales),
        grossSubtotal: round2(r.grossSubtotal),
        totalTax: round2(r.totalTax),
        netRevenue: round2(r.netRevenue)
      })),
      byDay: byDay.map((r) => ({
        date: r.date,
        totalSales: Number(r.totalSales),
        netRevenue: round2(r.netRevenue)
      }))
    });
  } catch (error) {
    console.error('getSalesReport error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate sales report',
      error: error.message
    });
  }
};

/* ------------------------------------------------------------------ */
/* 8. Product-wise report (bonus — helps see what sells)               */
/* GET /api/sales/reports/products?fromDate=&toDate=&state=            */
/* ------------------------------------------------------------------ */
exports.getProductReport = async (req, res) => {
  try {
    const { fromDate, toDate, state, outletId, status = 'approved' } = req.query;

    if (!fromDate || !toDate) {
      return res.status(400).json({ success: false, message: 'fromDate and toDate are required' });
    }

    const start = new Date(fromDate);
    const end = new Date(toDate);
    end.setHours(23, 59, 59, 999);

    const saleWhere = { saleDate: { [Op.between]: [start, end] } };
    if (state) saleWhere.state = state;
    if (outletId) saleWhere.outletId = outletId;
    if (status) saleWhere.status = status;

    const rows = await SaleItem.findAll({
      attributes: [
        'outletProductId',
        'productName',
        'sku',
        [sequelize.fn('SUM', sequelize.col('SaleItem.quantity')), 'totalQuantity'],
        [sequelize.fn('SUM', sequelize.col('SaleItem.lineTotal')), 'totalRevenue']
      ],
      include: [{
        model: Sale,
        as: 'sale',
        attributes: [],
        where: saleWhere,
        required: true
      }],
      group: ['SaleItem.outletProductId', 'SaleItem.productName', 'SaleItem.sku'],
      order: [[sequelize.literal('totalRevenue'), 'DESC']],
      raw: true
    });

    return res.status(200).json({
      success: true,
      filters: { fromDate, toDate, state: state || 'ALL' },
      data: rows.map((r) => ({
        outletProductId: r.outletProductId,
        productName: r.productName,
        sku: r.sku,
        totalQuantity: Number(r.totalQuantity),
        totalRevenue: round2(r.totalRevenue)
      }))
    });
  } catch (error) {
    console.error('getProductReport error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate product report',
      error: error.message
    });
  }
};