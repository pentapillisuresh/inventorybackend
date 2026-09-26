const { Invoice, InvoiceItem, Product, Store, Outlet, User, sequelize, Inventory } = require('../models');
const { Op } = require('sequelize');
const PDFDocument = require('pdfkit');

// Generate invoice number
function generateInvoiceNumber(type = 'INV') {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000);
  return `${type}-${timestamp}-${random}`;
}

async function generateBatchNumber(type = 'BATH', userId) {
  const now = new Date();

  // Format: dd/mm/yy
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = String(now.getFullYear()).slice(-2);

  const date = `${day}/${month}/${year}`;

  const count = await Invoice.count({
    where: {
      createdBy: userId
    }
  });
  return `${type}-${date}-${count + 1}`;
}


// Create invoice for store manager to outlet
exports.createOutletInvoice = async (req, res) => {
  const t = await sequelize.transaction();

  try {
    const { storeId, outletId } = req.params;
    const { paymentMethod, paidAmount } = req.body;

    // Generate invoice number
    const invoiceNumber = generateInvoiceNumber('SALE');

    // Check outlet belongs to store
    const outlet = await Outlet.findOne({
      where: { id: outletId, storeId },
      transaction: t
    });
    const store = await Store.findOne({
      where: { id: storeId },
      transaction: t
    });

    if (!outlet) {
      await t.rollback();
      return res.status(404).json({ error: 'Outlet not found in this store' });
    }

    // Create invoice
    const invoice = await Invoice.create({
      invoiceNumber,
      storeId,
      outletId,
      adminId: store.adminId,
      paidAmount,
      storeManagerId: store.managerId,
      type: 'outlet_sale',
      paymentMethod,
      totalAmount: paidAmount,
      status: 'pending',
      createdBy: req.user.id
    }, { transaction: t });


    // Update invoice total

    res.status(201).json({
      message: 'Invoice created successfully',
      invoice,
    });
  } catch (error) {
    await t.rollback();
    res.status(500).json({ error: error.message });
  }
};

exports.createOutletInvoiceWithItem = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { storeId, outletId } = req.params;

    const { items, paymentMethod, notes, creditAmount = 0 } = req.body;
    const batchNumber = await generateBatchNumber('BATCH', req.user.id);

    // Generate invoice number
    const invoiceNumber = generateInvoiceNumber('SALE');

    // Check outlet belongs to store
    const outlet = await Outlet.findOne({
      where: { id: outletId },
      transaction: t
    });
    if (!outlet) {
      await t.rollback();
      return res.status(404).json({ error: 'Outlet not found in this store' });
    }

    // Create invoice
    const invoice = await Invoice.create({
      invoiceNumber,
      storeId,
      batchID: batchNumber,
      outletId,
      storeManagerId: req.user.id,
      type: 'outlet_sale',
      paymentMethod,
      totalAmount: 0,
      status: 'pending',
      createdBy: req.user.id
    }, { transaction: t });

    let totalAmount = 0;
    const invoiceItems = [];

    // Process each item
    for (const item of items) {
      const { productId, quantity, price, inventoryId, boxName } = item;

      console.log("storeId::", storeId);
      // Check product availability
      const inventory = await Inventory.findOne({
        where: {
          productId,
          id: inventoryId,
          quantity: { [Op.gte]: quantity }
        },
        include: [Product],
        transaction: t
      });

      if (!inventory) {
        await t.rollback();
        return res.status(400).json({
          error: `Insufficient stock for product ${productId}`
        });
      }
      const product = await Product.findByPk(productId, { transaction: t });
      if (!product) {
        throw new Error(`Product ${productId} not found`);
      }

      // ❗ Check stock availability
      if (product.quantity < quantity) {
        throw new Error(`Insufficient stock for product ${product.name}`);
      }
      const itemTotal = quantity * price;
      totalAmount += itemTotal;

      const IGSTAmount = (product.IGST / 100) * itemTotal;
      const SGSTAmount = (product.SGST / 100) * itemTotal;
      const CGSTAmount = (product.CGST / 100) * itemTotal;

      const netTotal = itemTotal + IGSTAmount + SGSTAmount + CGSTAmount;


      // Create invoice item
      const invoiceItem = await InvoiceItem.create({
        invoiceId: invoice.id,
        batchId: batchNumber,
        productId,
        quantity,
        price,
        boxName,
        IGST: IGSTAmount,
        CGST: CGSTAmount,
        SGST: SGSTAmount,
        netTotal,
        totalPrice: itemTotal,
        locationType: inventory.roomId ? 'room' : inventory.rackId ? 'rack' : 'freezer',
        locationId: inventory.roomId || inventory.rackId || inventory.freezerId,
        createdBy: req.user.id
      }, { transaction: t });
      
      const invoiceItemWithProduct = await InvoiceItem.findByPk(invoiceItem.id, {
        include: [
          {
            model: Product,
            as: 'Product' // use your association alias
          }
        ],
        transaction: t
      });
      
      invoiceItems.push(invoiceItemWithProduct);      // Reduce inventory
      inventory.quantity -= quantity;
      await inventory.save({ transaction: t });

      // Check threshold after reduction
      if (inventory.quantity <= inventory.reorderLevel) {
        // Create alert
        console.log(`Low stock alert for product ${productId}`);
      }
    }

    // Update invoice total
    invoice.totalAmount = totalAmount;

    // Handle payment
    if (paymentMethod === 'credit') {
      invoice.creditAmount = totalAmount;
      invoice.paidAmount = 0;
    } else if (paymentMethod === 'paid') {
      invoice.creditAmount = 0;
      invoice.paidAmount = totalAmount;
    }

    invoice.status = 'completed';
    await invoice.save({ transaction: t });

    if (paymentMethod === 'credit' || paymentMethod === 'mixed') {
      const outlet = await Outlet.findByPk(storeId, { transaction: t });

      if (!outlet) {
        throw new Error(`Store ${storeId} not found`);
      }

      if (paymentMethod === 'credit') {
        outlet.currentCredit += creditAmount;
        outlet.creditLimit -= creditAmount;
        await outlet.save({ transaction: t });
      }
    }

    // ✅ Commit transaction
    await t.commit();
    res.status(201).json({
      message: 'Invoice created successfully',
      invoice,
      invoiceItems
    });
  } catch (error) {
    await t.rollback();
    res.status(500).json({ error: error.message });
  }
};

exports.createOutletInvoiceWithItemByAdmin = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { storeId, outletId } = req.params;

    const { items, paymentMethod, notes, creditAmount = 0 } = req.body;
    const batchNumber = await generateBatchNumber('BATCH', req.user.id);

    // Generate invoice number
    const invoiceNumber = generateInvoiceNumber('SALE');

    // Check outlet belongs to store
    const outlet = await Outlet.findOne({
      where: { id: outletId },
      transaction: t
    });
    if (!outlet) {
      await t.rollback();
      return res.status(404).json({ error: 'Outlet not found in this store' });
    }

    // Create invoice
    const invoice = await Invoice.create({
      invoiceNumber,
      storeId,
      batchID: batchNumber,
      outletId,
      storeManagerId: req.user.id,
      type: 'outlet_sale',
      paymentMethod,
      totalAmount: 0,
      status: 'pending',
      createdBy: req.user.id
    }, { transaction: t });

    let totalAmount = 0;
    const invoiceItems = [];

    // Process each item
    for (const item of items) {
      const { productId, quantity, price, boxName } = item;

      console.log("storeId::", storeId);
      // Check product availability
      const inventory = await Inventory.findOne({
        where: {
          productId,storeId,
          quantity: { [Op.gte]: quantity }
        },
        include: [Product],
        transaction: t
      });

      if (!inventory) {
        await t.rollback();
        return res.status(400).json({
          error: `Insufficient stock for product ${productId}`
        });
      }
      const product = await Product.findByPk(productId, { transaction: t });
      if (!product) {
        throw new Error(`Product ${productId} not found`);
      }

      // ❗ Check stock availability
      if (product.quantity < quantity) {
        throw new Error(`Insufficient stock for product ${product.name}`);
      }
      const itemTotal = quantity * price;
      totalAmount += itemTotal;

      const IGSTAmount = (product.IGST / 100) * itemTotal;
      const SGSTAmount = (product.SGST / 100) * itemTotal;
      const CGSTAmount = (product.CGST / 100) * itemTotal;

      const netTotal = itemTotal + IGSTAmount + SGSTAmount + CGSTAmount;


      // Create invoice item
      const invoiceItem = await InvoiceItem.create({
        invoiceId: invoice.id,
        batchId: batchNumber,
        productId,
        quantity,
        price,
        boxName,
        IGST: IGSTAmount,
        CGST: CGSTAmount,
        SGST: SGSTAmount,
        netTotal,
        totalPrice: itemTotal,
        locationType: inventory.roomId ? 'room' : inventory.rackId ? 'rack' : 'freezer',
        locationId: inventory.roomId || inventory.rackId || inventory.freezerId,
        createdBy: req.user.id
      }, { transaction: t });
      
      const invoiceItemWithProduct = await InvoiceItem.findByPk(invoiceItem.id, {
        include: [
          {
            model: Product,
            as: 'Product' // use your association alias
          }
        ],
        transaction: t
      });
      
      invoiceItems.push(invoiceItemWithProduct);      // Reduce inventory
      inventory.quantity -= quantity;
      await inventory.save({ transaction: t });

      // Check threshold after reduction
      if (inventory.quantity <= inventory.reorderLevel) {
        // Create alert
        console.log(`Low stock alert for product ${productId}`);
      }
    }

    // Update invoice total
    invoice.totalAmount = totalAmount;

    // Handle payment
    if (paymentMethod === 'credit') {
      invoice.creditAmount = totalAmount;
      invoice.paidAmount = 0;
    } else if (paymentMethod === 'paid') {
      invoice.creditAmount = 0;
      invoice.paidAmount = totalAmount;
    }

    invoice.status = 'completed';
    await invoice.save({ transaction: t });

    if (paymentMethod === 'credit' || paymentMethod === 'mixed') {
      const outlet = await Outlet.findByPk(storeId, { transaction: t });

      if (!outlet) {
        throw new Error(`Store ${storeId} not found`);
      }

      if (paymentMethod === 'credit') {
        outlet.currentCredit += creditAmount;
        outlet.creditLimit -= creditAmount;
        await outlet.save({ transaction: t });
      }
    }

    // ✅ Commit transaction
    await t.commit();
    res.status(201).json({
      message: 'Invoice created successfully',
      invoice,
      invoiceItems
    });
  } catch (error) {
    await t.rollback();
    res.status(500).json({ error: error.message });
  }
};

// Get all invoices
exports.getAllInvoices = async (req, res) => {
  try {
    const { storeId, type, status, startDate, endDate, page = 1, limit = 10 } = req.query;

    const where = {};
    if (storeId) where.storeId = storeId;
    if (type) where.type = type;
    if (status) where.status = status;

    if (startDate && endDate) {
      where.invoiceDate = {
        [Op.between]: [new Date(startDate), new Date(endDate)]
      };
    }

    const offset = (page - 1) * limit;

    const { count, rows: invoices } = await Invoice.findAndCountAll({
      where,
      include: [
        { model: Store },
        { model: Outlet },
        { model: User, as: 'Admin', attributes: ['id', 'name', 'email'] },
        { model: User, as: 'StoreManager', attributes: ['id', 'name', 'email'] }
      ],
      order: [['invoiceDate', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      total: count,
      totalPages: Math.ceil(count / limit),
      currentPage: parseInt(page),
      invoices
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getAllInvoicesByStoreManager = async (req, res) => {
  try {
    const { storeId, type, status, startDate, endDate, page = 1, limit = 10 } = req.query;

    const where = { storeManagerId: req.user.id };
    if (storeId) where.storeId = storeId;
    if (type) where.type = type;
    if (status) where.status = status;

    if (startDate && endDate) {
      where.invoiceDate = {
        [Op.between]: [new Date(startDate), new Date(endDate)]
      };
    }

    const offset = (page - 1) * limit;

    const { count, rows: invoices } = await Invoice.findAndCountAll({
      where,
      include: [
        { model: Store },
        { model: Outlet },
        { model: User, as: 'Admin', attributes: ['id', 'name', 'email'] },
        { model: User, as: 'StoreManager', attributes: ['id', 'name', 'email'] }
      ],
      order: [['invoiceDate', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      total: count,
      totalPages: Math.ceil(count / limit),
      currentPage: parseInt(page),
      invoices
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getAllInvoicesByAdmin = async (req, res) => {
  try {
    const { storeId, type, status, startDate, endDate, page = 1, limit = 10 } = req.query;

    const where = {
      adminId: req.user.id
    };
    if (storeId) where.storeId = storeId;
    if (type) where.type = type;
    if (status) where.status = status;

    if (startDate && endDate) {
      where.invoiceDate = {
        [Op.between]: [new Date(startDate), new Date(endDate)]
      };
    }

    const offset = (page - 1) * limit;

    const { count, rows: invoices } = await Invoice.findAndCountAll({
      where,
      distinct: true,
      col: 'id',
      include: [
        { model: Store },
        { model: Outlet },
        { model: User, as: 'Admin', attributes: ['id', 'name', 'email'] },
        { model: User, as: 'StoreManager', attributes: ['id', 'name', 'email'] },
        {
          model: InvoiceItem,
          as: 'items',
          attributes: ['id', 'productId', 'quantity', 'price', 'totalPrice'],
          include: [
            {
              model: Product,
              attributes: ['id', 'name', 'sku'] // optional but useful
            }
          ]
        }
      ],
      order: [['invoiceDate', 'DESC']],
      limit: Number(limit),
      offset: Number(offset)
    });

    res.json({
      total: count,
      totalPages: Math.ceil(count / limit),
      currentPage: parseInt(page),
      invoices
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
exports.getAllDistributedInvoicesByAdmin = async (req, res) => {
  try {
    const { storeId, status, startDate, endDate, page = 1, limit = 10 } = req.query;

    const where = {
      adminId: req.user.id,
      type: "distribution"
    };
    if (storeId) where.storeId = storeId;
    if (status) where.status = status;

    if (startDate && endDate) {
      where.invoiceDate = {
        [Op.between]: [new Date(startDate), new Date(endDate)]
      };
    }

    const offset = (page - 1) * limit;

    const { count, rows: invoices } = await Invoice.findAndCountAll({
      where,
      distinct: true,
      col: 'id',
      include: [
        {
          model: Store, as: 'Store',
          include: [
            {
              model: User,
              as: 'Manager',
              attributes: ['id', 'name', 'FSSAI_No', 'GST_No'] // optional but useful
            }
          ]
        },
        { model: Outlet },
        { model: User, as: 'Admin' },
        { model: User, as: 'StoreManager' },
        {
          model: InvoiceItem,
          as: 'items',
          include: [
            {
              model: Product,
              attributes: ['id', 'name', 'sku', 'HSN_No', 'units', 'costPrice'] // optional but useful
            }
          ]
        }
      ],
      order: [['invoiceDate', 'DESC']],
      limit: Number(limit),
      offset: Number(offset)
    });

    res.json({
      total: count,
      totalPages: Math.ceil(count / limit),
      currentPage: parseInt(page),
      invoices
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
exports.getAllNonDistributionInvoicesByAdmin = async (req, res) => {
  try {
    const { storeId, type, status, startDate, endDate, page = 1, limit = 10 } = req.query;

    const where = {
      adminId: req.user.id,
      type: { [Op.ne]: 'distribution' }
    };
    if (storeId) where.storeId = storeId;
    if (type) where.type = type;
    if (status) where.status = status;

    if (startDate && endDate) {
      where.invoiceDate = {
        [Op.between]: [new Date(startDate), new Date(endDate)]
      };
    }

    const offset = (page - 1) * limit;

    const { count, rows: invoices } = await Invoice.findAndCountAll({
      where,
      distinct: true,
      col: 'id',
      include: [
        { model: Store },
        { model: Outlet },
        { model: User, as: 'Admin', attributes: ['id', 'name', 'email'] },
        { model: User, as: 'StoreManager', attributes: ['id', 'name', 'email'] },
        {
          model: InvoiceItem,
          as: 'items',
          attributes: ['id', 'productId', 'quantity', 'price', 'totalPrice'],
          include: [
            {
              model: Product,
              attributes: ['id', 'name', 'sku'] // optional but useful
            }
          ]
        }
      ],
      order: [['invoiceDate', 'DESC']],
      limit: Number(limit),
      offset: Number(offset)
    });

    res.json({
      total: count,
      totalPages: Math.ceil(count / limit),
      currentPage: parseInt(page),
      invoices
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get invoice by ID
exports.getInvoiceById = async (req, res) => {
  try {
    const { id } = req.params;

    const invoice = await Invoice.findByPk(id, {
      include: [
        { model: Store },
        { model: Outlet },
        { model: User, as: 'Admin', attributes: ['id', 'name', 'email'] },
        { model: User, as: 'StoreManager', attributes: ['id', 'name', 'email'] },
        {
          model: InvoiceItem,
          include: [Product]
        }
      ]
    });

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    res.json(invoice);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Generate PDF invoice
exports.generateInvoicePDF = async (req, res) => {
  try {
    const { id } = req.params;

    const invoice = await Invoice.findByPk(id, {
      include: [
        { model: Store },
        { model: Outlet },
        {
          model: InvoiceItem,
          include: [Product]
        }
      ]
    });

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    // Create PDF document
    const doc = new PDFDocument({ margin: 50 });

    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=invoice-${invoice.invoiceNumber}.pdf`);

    // Pipe PDF to response
    doc.pipe(res);

    // Add content to PDF
    doc.fontSize(20).text('INVOICE', { align: 'center' });
    doc.moveDown();

    // Invoice details
    doc.fontSize(12);
    doc.text(`Invoice Number: ${invoice.invoiceNumber}`);
    doc.text(`Date: ${invoice.invoiceDate.toLocaleDateString()}`);
    doc.text(`Store: ${invoice.Store.name}`);

    if (invoice.Outlet) {
      doc.text(`Outlet: ${invoice.Outlet.name}`);
    }

    doc.text(`Payment Method: ${invoice.paymentMethod.toUpperCase()}`);
    doc.text(`Status: ${invoice.status.toUpperCase()}`);
    doc.moveDown();

    // Invoice items table
    const tableTop = doc.y;
    const itemCodeX = 50;
    const descriptionX = 150;
    const quantityX = 350;
    const priceX = 400;
    const totalX = 470;

    // Table headers
    doc.text('Code', itemCodeX, tableTop);
    doc.text('Description', descriptionX, tableTop);
    doc.text('Qty', quantityX, tableTop);
    doc.text('Price', priceX, tableTop);
    doc.text('Total', totalX, tableTop);

    doc.moveTo(50, tableTop + 15)
      .lineTo(550, tableTop + 15)
      .stroke();

    let y = tableTop + 25;

    // Table rows
    invoice.InvoiceItems.forEach((item, i) => {
      doc.text(item.Product.sku, itemCodeX, y);
      doc.text(item.Product.name, descriptionX, y, { width: 180 });
      doc.text(item.quantity.toString(), quantityX, y);
      doc.text(`$${item.price.toFixed(2)}`, priceX, y);
      doc.text(`$${item.totalPrice.toFixed(2)}`, totalX, y);
      y += 20;
    });

    // Total
    y += 10;
    doc.moveTo(400, y)
      .lineTo(550, y)
      .stroke();

    y += 10;
    doc.text('Total Amount:', 400, y);
    doc.text(`$${invoice.totalAmount.toFixed(2)}`, totalX, y);

    // Footer
    doc.fontSize(10)
      .text('Thank you for your business!', 50, 650, { align: 'center' });

    doc.end();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Update invoice status
exports.updateInvoiceStatus = async (req, res) => {
  const t = await sequelize.transaction();

  try {
    const { id } = req.params;
    const { status } = req.body;

    const invoice = await Invoice.findByPk(id, { transaction: t });

    if (!invoice) {
      await t.rollback();
      return res.status(404).json({ error: 'Invoice not found' });
    }

    if (status === 'paid' && invoice.paymentMethod === 'credit') {
      // Mark credit as paid
      invoice.status = 'completed';
      invoice.paidAmount = invoice.totalAmount;
      invoice.creditAmount = 0;

      // Update store credit
      const store = await Store.findByPk(invoice.storeId, { transaction: t });
      if (store) {
        store.currentCredit -= invoice.totalAmount;
        await store.save({ transaction: t });
      }
    } else {
      invoice.status = status === 'paid'?"completed":status;
    }

    await invoice.save({ transaction: t });

    await t.commit();

    res.json({
      message: 'Invoice status updated successfully',
      invoice
    });
  } catch (error) {
    await t.rollback();
    res.status(500).json({ error: error.message });
  }
};