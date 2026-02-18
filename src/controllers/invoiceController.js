const { Invoice, InvoiceItem, Product, Store, Outlet, User, sequelize, Inventory } = require('../models');
const { Op } = require('sequelize');
const PDFDocument = require('pdfkit');

// Generate invoice number
function generateInvoiceNumber(type = 'INV') {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000);
  return `${type}-${timestamp}-${random}`;
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
      status: 'pending'
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
    const { items, paymentMethod, notes } = req.body;

    // Generate invoice number
    const invoiceNumber = generateInvoiceNumber('SALE');

    // Check outlet belongs to store
    const outlet = await Outlet.findOne({
      where: { id: outletId, storeId },
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
      storeManagerId: req.user.id,
      type: 'outlet_sale',
      paymentMethod,
      totalAmount: 0,
      status: 'pending'
    }, { transaction: t });

    let totalAmount = 0;
    const invoiceItems = [];

    // Process each item
    for (const item of items) {
      const { productId, quantity, price } = item;

      // Check product availability
      const inventory = await Inventory.findOne({
        where: {
          productId,
          storeId,
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

      const itemTotal = quantity * price;
      totalAmount += itemTotal;

      // Create invoice item
      const invoiceItem = await InvoiceItem.create({
        invoiceId: invoice.id,
        productId,
        quantity,
        price,
        totalPrice: itemTotal,
        locationType: inventory.roomId ? 'room' :
          inventory.rackId ? 'rack' : 'freezer',
        locationId: inventory.roomId || inventory.rackId || inventory.freezerId
      }, { transaction: t });

      invoiceItems.push(invoiceItem);

      // Reduce inventory
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
      type:"distribution"
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
    const { status, paymentDetails } = req.body;

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
      invoice.status = status;
    }

    await invoice.save({ transaction: t });

    // Record payment if provided
    if (paymentDetails) {
      await sequelize.models.Payment.create({
        invoiceId: invoice.id,
        amount: paymentDetails.amount,
        paymentMethod: paymentDetails.paymentMethod,
        transactionId: paymentDetails.transactionId,
        notes: paymentDetails.notes,
        paidById: req.user.id
      }, { transaction: t });
    }

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