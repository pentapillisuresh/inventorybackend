const {
  Invoice,
  Inventory,
  Expenditure,
  Product,
  Store,
  Category,
  Ticket,
  sequelize,
  Room,
  Rack, User,
  Freezer,
  Outlet,
  InvoiceItem
} = require('../models');
const { Op } = require('sequelize');
const PDFDocument = require('pdfkit');
const XLSX = require('xlsx');
const moment = require('moment');

// Generate various reports
exports.generateReport = async (req, res) => {
  try {
    const {
      reportType,
      startDate,
      endDate,
      storeId,
      format = 'json',
      categoryId
    } = req.body;

    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { Op } = require('sequelize');

    const baseWhere = {
      adminId: req.user.id,
      ...(startDate && endDate && {
        createdAt: {
          [Op.between]: [startDate, endDate]
        }
      })
    };

    const TotalRevenue = await Invoice.sum('paidAmount', {
      where: { ...baseWhere, paymentMethod: 'paid' }
    });

    const TotalCredit = await Invoice.sum('creditAmount', {
      where: { ...baseWhere, paymentMethod: 'credit' }
    });

    const TotalInvoice = await Invoice.count({
      where: baseWhere
    });

    let report;

    switch (reportType) {
      case 'inventory':
        report = await generateInventoryReport(startDate, endDate, storeId, categoryId);
        break;
      case 'sales':
        report = await generateSalesReport(startDate, endDate, storeId);
        break;
      case 'credit':
        report = await generateCreditReport(startDate, endDate, storeId);
        break;
      case 'expenditure':
        report = await generateExpenditureReport(startDate, endDate);
        break;
      case 'tickets':
        report = await generateTicketReport(startDate, endDate, storeId);
        break;
      case 'profit-loss':
        report = await generateProfitLossReport(startDate, endDate, storeId);
        break;
      default:
        return res.status(400).json({ error: 'Invalid report type' });
    }

    if (format === 'pdf') {
      return generatePDF(res, report, reportType, startDate, endDate);
    }

    if (format === 'excel') {
      return generateExcel(res, report, reportType, startDate, endDate);
    }

    return res.json({
      success: true,
      message: `${reportType} report successfully`,
      TotalRevenue: TotalRevenue || 0,
      TotalCredit: TotalCredit || 0,
      TotalInvoice,
      report
    });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

// Specific report endpoints
exports.getInventoryReport = async (req, res) => {
  try {
    const { startDate, endDate, storeId, categoryId, lowStock } = req.query;

    const report = await generateInventoryReport(
      startDate,
      endDate,
      storeId,
      categoryId,
      lowStock
    );

    res.json(report);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getSalesReport = async (req, res) => {
  try {
    const { startDate, endDate, storeId, type = 'distribution' } = req.query;

    const report = await generateSalesReport(startDate, endDate, storeId, type);
    res.json(report);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getCreditReport = async (req, res) => {
  try {
    const { startDate, endDate, storeId } = req.query;

    const report = await generateCreditReport(startDate, endDate, storeId);
    res.json(report);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// exports.getExpenditureReport = async (req, res) => {
//   try {
//     const { startDate, endDate, category } = req.query;

//     const report = await generateExpenditureReport(startDate, endDate, category);
//     res.json(report);
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// };

exports.getDashboardStats = async (req, res) => {
  try {
    const user = req.user;
    let stats = {};

    if (user.role === 'superadmin') {
      stats = await getSuperAdminStats();
    } else if (user.role === 'admin') {
      stats = await getAdminStats(user.id);
    } else if (user.role === 'store_manager') {
      stats = await getStoreManagerStats(user.id);
    }

    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Helper functions
async function generateInventoryReport(startDate, endDate, storeId, categoryId, lowStock) {
  const where = {};
  const productWhere = {};

  if (storeId) where.storeId = storeId;
  if (categoryId) productWhere.categoryId = categoryId;

  if (startDate && endDate) {
    where.lastUpdated = {
      [Op.between]: [new Date(startDate), new Date(endDate)]
    };
  }

  if (lowStock === 'true') {
    where.quantity = {
      [Op.lte]: sequelize.col('reorderLevel')
    };
  }

  const inventory = await Inventory.findAll({
    where,
    include: [
      {
        model: Product,
        where: productWhere,
        include: [Category]
      },
      { model: Store },
      { model: Room },
      { model: Rack },
      { model: Freezer }
    ],
    order: [['lastUpdated', 'DESC']]
  });

  // Calculate summary
  const summary = {
    totalItems: inventory.length,
    totalQuantity: inventory.reduce((sum, item) => sum + item.quantity, 0),
    totalValue: inventory.reduce((sum, item) =>
      sum + (item.quantity * item.Product.price), 0),
    lowStockItems: inventory.filter(item => item.quantity <= item.reorderLevel).length,
    outOfStockItems: inventory.filter(item => item.quantity === 0).length
  };

  return { summary, inventory };
}

async function generateSalesReport(startDate, endDate, storeId, type) {
  const where = { type };

  if (storeId) where.storeId = storeId;

  if (startDate && endDate) {
    where.invoiceDate = {
      [Op.between]: [new Date(startDate), new Date(endDate)]
    };
  }

  const invoices = await Invoice.findAll({
    where,
    include: [
      { model: Store },
      { model: Outlet },
      {
        model: InvoiceItem,
        include: [Product]
      }
    ],
    order: [['invoiceDate', 'DESC']]
  });

  const summary = {
    totalInvoices: invoices.length,
    totalSales: invoices.reduce((sum, invoice) => sum + invoice.totalAmount, 0),
    totalCredit: invoices.reduce((sum, invoice) => sum + invoice.creditAmount, 0),
    totalPaid: invoices.reduce((sum, invoice) => sum + invoice.paidAmount, 0),
    avgInvoiceValue: invoices.length > 0 ?
      invoices.reduce((sum, invoice) => sum + invoice.totalAmount, 0) / invoices.length : 0
  };

  // Daily sales breakdown
  const dailySales = await Invoice.findAll({
    where,
    attributes: [
      [sequelize.fn('DATE', sequelize.col('invoiceDate')), 'date'],
      [sequelize.fn('COUNT', sequelize.col('id')), 'invoiceCount'],
      [sequelize.fn('SUM', sequelize.col('totalAmount')), 'totalSales'],
      [sequelize.fn('SUM', sequelize.col('creditAmount')), 'totalCredit'],
      [sequelize.fn('SUM', sequelize.col('paidAmount')), 'totalPaid']
    ],
    group: [sequelize.fn('DATE', sequelize.col('invoiceDate'))],
    order: [[sequelize.fn('DATE', sequelize.col('invoiceDate')), 'DESC']]
  });

  // Top selling products
  const topProducts = await InvoiceItem.findAll({
    include: [
      {
        model: Invoice,
        where: where
      },
      { model: Product }
    ],
    attributes: [
      'productId',
      [sequelize.fn('SUM', sequelize.col('quantity')), 'totalQuantity'],
      [sequelize.fn('SUM', sequelize.col('totalPrice')), 'totalRevenue']
    ],
    group: ['productId'],
    order: [[sequelize.fn('SUM', sequelize.col('totalPrice')), 'DESC']],
    limit: 10
  });

  return { summary, invoices, dailySales, topProducts };
}

async function generateCreditReport(startDate, endDate, storeId) {
  const where = {
    paymentMethod: { [Op.in]: ['credit', 'mixed'] },
    creditAmount: { [Op.gt]: 0 }
  };

  if (storeId) where.storeId = storeId;

  if (startDate && endDate) {
    where.invoiceDate = {
      [Op.between]: [new Date(startDate), new Date(endDate)]
    };
  }

  const creditInvoices = await Invoice.findAll({
    where,
    include: [
      { model: Store },
      { model: Outlet }
    ],
    order: [['invoiceDate', 'ASC']]
  });

  const storeCredits = await Store.findAll({
    attributes: ['id', 'name', 'creditLimit', 'currentCredit'],
    where: storeId ? { id: storeId } : undefined,
    order: [['currentCredit', 'DESC']]
  });

  const summary = {
    totalCreditGiven: creditInvoices.reduce((sum, invoice) => sum + invoice.creditAmount, 0),
    totalOutstanding: storeCredits.reduce((sum, store) => sum + store.currentCredit, 0),
    creditUtilization: storeCredits.reduce((sum, store) =>
      sum + (store.currentCredit / store.creditLimit * 100), 0) / storeCredits.length,
    overdueInvoices: creditInvoices.filter(invoice =>
      invoice.invoiceDate && new Date() > invoice.invoiceDate).length
  };

  return { summary, creditInvoices, storeCredits };
}

async function generateExpenditureReport(startDate, endDate, storeId) {
  const where = {};

  if (storeId) where.storeId = storeId;

  if (startDate && endDate) {
    where.date = {
      [Op.between]: [new Date(startDate), new Date(endDate)]
    };
  }

  const expenditures = await Expenditure.findAll({
    where,
    include: [
      {
        model: User,
        as: 'Admin',
        attributes: ['id', 'name', 'email']
      }
    ],
    order: [['date', 'DESC']]
  });

  // Calculate summary
  const totalAmount = await Expenditure.sum('amount', { where });
  const verifiedAmount = await Expenditure.sum('amount', {
    where: { ...where, verified: true }
  });

  // Category breakdown
  const categoryBreakdown = await Expenditure.findAll({
    where,
    attributes: [
      'category',
      [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
      [sequelize.fn('SUM', sequelize.col('amount')), 'amount']
    ],
    group: ['category'],
    order: [[sequelize.fn('SUM', sequelize.col('amount')), 'DESC']]
  });

  // Monthly breakdown
  const monthlyBreakdown = await Expenditure.findAll({
    where,
    attributes: [
      [sequelize.fn('DATE_FORMAT', sequelize.col('date'), '%Y-%m'), 'month'],
      [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
      [sequelize.fn('SUM', sequelize.col('amount')), 'amount']
    ],
    group: [sequelize.fn('DATE_FORMAT', sequelize.col('date'), '%Y-%m')],
    order: [[sequelize.fn('DATE_FORMAT', sequelize.col('date'), '%Y-%m'), 'ASC']]
  });

  const report = {
    summary: {
      totalExpenditures: expenditures.length,
      totalAmount: totalAmount || 0,
      verifiedAmount: verifiedAmount || 0,
      pendingAmount: (totalAmount - verifiedAmount) || 0
    },
    categoryBreakdown,
    monthlyBreakdown,
    expenditures
  }
  return { report };
}

async function getSuperAdminStats() {
  const [
    totalStores,
    totalAdmins,
    totalRevenue,
    totalCredit
  ] = await Promise.all([
    Store.count(),
    User.count({ where: { role: 'admin' } }),
    Invoice.sum('totalAmount'),
    Store.sum('currentCredit')
  ]);

  const recentActivities = await Invoice.findAll({
    limit: 10,
    order: [['invoiceDate', 'DESC']],
    subQuery: false,
    attributes: ['id', 'invoiceDate', 'totalAmount'],
    include: [{
      model: Store,
      attributes: ['id', 'name']
    }]
  });

  return {
    totalStores,
    totalAdmins,
    totalRevenue: totalRevenue || 0,
    totalCredit: totalCredit || 0,
    recentActivities
  };
}

async function getAdminStats(adminId) {

  const storeIds = await Store.findAll({
    where: { adminId },
    attributes: ['id'],
    raw: true
  });

  const ids = storeIds.map(s => s.id);

  const [
    myStores,
    storeManagers,
    outlets,
    inventoryValue,
    pendingTickets,
    lowStockItems
  ] = await Promise.all([
    Store.count({ where: { adminId } }),
    User.count({ where: { createdBy: adminId, role: 'store_manager' } }),
    Outlet.count({ where: { storeId: ids } }),
    Inventory.sum('quantity', {
      where: { storeId: ids }
    }),
    Ticket.count({
      where: {
        status: 'open',
        storeId: ids
      }
    }),
    await Inventory.findAll({
      where: {storeId:ids,
        quantity: {
          [Op.lte]: sequelize.col('reorderLevel')
        }
      },
      include: [
        {
          model: Product,
          include: ['Category']
        },
        { model: Store },
      ],
      order: [['quantity', 'ASC']]
    })

  ]);

  return {
    myStores,
    storeManagers,
    outlets,
    inventoryValue: inventoryValue || 0,
    pendingTickets,
    lowStockItems
  };
}

async function getStoreManagerStats(managerId) {
  const store = await Store.findOne({ where: { managerId } });

  if (!store) {
    return { error: 'No store assigned' };
  }

  const [
    totalProducts,
    lowStockItems,
    dailySales,
    pendingOrders
  ] = await Promise.all([
    Inventory.sum('quantity', { where: { storeId: store.id } }),
    Inventory.count({
      where: {
        storeId: store.id,
        quantity: { [Op.lte]: sequelize.col('reorderLevel') }
      }
    }),
    Invoice.sum('totalAmount', {
      where: {
        storeId: store.id,
        invoiceDate: {
          [Op.gte]: moment().startOf('day').toDate(),
          [Op.lte]: moment().endOf('day').toDate()
        }
      }
    }),
    Invoice.count({
      where: {
        storeId: store.id,
        status: 'pending'
      }
    })
  ]);

  return {
    storeName: store.name,
    totalProducts: totalProducts || 0,
    lowStockItems,
    dailySales: dailySales || 0,
    pendingOrders,
    creditLimit: store.creditLimit,
    currentCredit: store.currentCredit
  };
}

// PDF Generation
async function generatePDF(res, report, reportType, startDate, endDate) {
  const doc = new PDFDocument({ margin: 50 });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition',
    `attachment; filename=${reportType}-report-${Date.now()}.pdf`);

  doc.pipe(res);

  // Header
  doc.fontSize(20).text(`${reportType.toUpperCase()} REPORT`, { align: 'center' });

  if (startDate && endDate) {
    doc.fontSize(12).text(
      `Period: ${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}`,
      { align: 'center' }
    );
  }

  doc.text(`Generated on: ${new Date().toLocaleDateString()}`, { align: 'center' });
  doc.moveDown();

  // Add report content based on type
  // ... (implementation depends on report structure)

  doc.end();
}

// Excel Generation
async function generateExcel(res, report, reportType, startDate, endDate) {
  const wb = XLSX.utils.book_new();

  // Create worksheets based on report data
  // ... (implementation depends on report structure)

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition',
    `attachment; filename=${reportType}-report-${Date.now()}.xlsx`);

  res.send(buffer);
}

// In src/controllers/reportController.js - Add expenditure report method

exports.getExpenditureReport = async (req, res) => {
  try {
    const { startDate, endDate, adminId, verified } = req.query;

    const where = {};

    // Date filter
    if (startDate && endDate) {
      where.date = {
        [Op.between]: [new Date(startDate), new Date(endDate)]
      };
    }

    // Admin filter
    if (adminId) {
      where.adminId = adminId;
    }

    // Verified filter
    if (verified !== undefined) {
      where.verified = verified === 'true';
    }

    // Role-based filtering
    if (req.user.role === 'admin') {
      where.adminId = req.user.id;
    }

    const expenditures = await Expenditure.findAll({
      where,
      include: [
        {
          model: User,
          as: 'Admin',
          attributes: ['id', 'name', 'email']
        }
      ],
      order: [['date', 'DESC']]
    });

    // Calculate summary
    const totalAmount = await Expenditure.sum('amount', { where });
    const verifiedAmount = await Expenditure.sum('amount', {
      where: { ...where, verified: true }
    });

    // Category breakdown
    const categoryBreakdown = await Expenditure.findAll({
      where,
      attributes: [
        'category',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
        [sequelize.fn('SUM', sequelize.col('amount')), 'amount']
      ],
      group: ['category'],
      order: [[sequelize.fn('SUM', sequelize.col('amount')), 'DESC']]
    });

    // Monthly breakdown
    const monthlyBreakdown = await Expenditure.findAll({
      where,
      attributes: [
        [sequelize.fn('DATE_FORMAT', sequelize.col('date'), '%Y-%m'), 'month'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
        [sequelize.fn('SUM', sequelize.col('amount')), 'amount']
      ],
      group: [sequelize.fn('DATE_FORMAT', sequelize.col('date'), '%Y-%m')],
      order: [[sequelize.fn('DATE_FORMAT', sequelize.col('date'), '%Y-%m'), 'ASC']]
    });

    const report = {
      summary: {
        totalExpenditures: expenditures.length,
        totalAmount: totalAmount || 0,
        verifiedAmount: verifiedAmount || 0,
        pendingAmount: (totalAmount - verifiedAmount) || 0
      },
      categoryBreakdown,
      monthlyBreakdown,
      expenditures
    };

    res.json(report);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get low stock inventory report
exports.getLowStockReport = async (req, res) => {
  try {
    const { storeId, categoryId, threshold = 10 } = req.query;

    const where = {
      quantity: {
        [Op.lte]: sequelize.col('reorderLevel')
      }
    };

    if (storeId) where.storeId = storeId;

    // Role-based filtering
    if (req.user.role === 'admin') {
      const adminStores = await Store.findAll({
        where: { adminId: req.user.id },
        attributes: ['id']
      });
      where.storeId = { [Op.in]: adminStores.map(s => s.id) };
    } else if (req.user.role === 'store_manager') {
      const store = await Store.findOne({
        where: { managerId: req.user.id },
        attributes: ['id']
      });
      if (store) {
        where.storeId = store.id;
      } else {
        return res.json({ items: [], summary: {} });
      }
    }

    const inventory = await Inventory.findAll({
      where,
      include: [
        {
          model: Product,
          where: categoryId ? { categoryId } : {},
          include: [Category]
        },
        { model: Store },
        { model: Room },
        { model: Rack },
        { model: Freezer }
      ],
      order: [['quantity', 'ASC']]
    });

    // Calculate summary
    const summary = {
      totalLowStockItems: inventory.length,
      criticalItems: inventory.filter(item => item.quantity === 0).length,
      warningItems: inventory.filter(item =>
        item.quantity > 0 && item.quantity <= item.reorderLevel).length,
      estimatedReorderCost: inventory.reduce((sum, item) =>
        sum + ((item.reorderLevel - item.quantity) * item.Product.price), 0)
    };

    // Group by category
    const categoryGroups = {};
    inventory.forEach(item => {
      const category = item.Product.Category?.name || 'Uncategorized';
      if (!categoryGroups[category]) {
        categoryGroups[category] = [];
      }
      categoryGroups[category].push(item);
    });

    res.json({
      summary,
      categoryBreakdown: Object.keys(categoryGroups).map(category => ({
        category,
        count: categoryGroups[category].length,
        items: categoryGroups[category]
      })),
      items: inventory
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get expiry report (if you have expiry dates in your model)
exports.getExpiryReport = async (req, res) => {
  try {
    const { storeId, daysThreshold = 30 } = req.query;
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() + parseInt(daysThreshold));

    const where = {
      expiryDate: {
        [Op.lte]: thresholdDate,
        [Op.ne]: null
      }
    };

    if (storeId) where.storeId = storeId;

    // Role-based filtering
    if (req.user.role === 'admin') {
      const adminStores = await Store.findAll({
        where: { adminId: req.user.id },
        attributes: ['id']
      });
      where.storeId = { [Op.in]: adminStores.map(s => s.id) };
    } else if (req.user.role === 'store_manager') {
      const store = await Store.findOne({
        where: { managerId: req.user.id },
        attributes: ['id']
      });
      if (store) {
        where.storeId = store.id;
      } else {
        return res.json({ items: [], summary: {} });
      }
    }

    // Assuming you have expiryDate in Inventory model
    // If not, you can modify this or skip this function
    const expiringItems = await Inventory.findAll({
      where,
      include: [
        {
          model: Product,
          include: [Category]
        },
        { model: Store }
      ],
      order: [['expiryDate', 'ASC']]
    });

    // Group by expiry timeframe
    const today = new Date();
    const weekFromNow = new Date();
    weekFromNow.setDate(today.getDate() + 7);
    const monthFromNow = new Date();
    monthFromNow.setDate(today.getDate() + 30);

    const expiredItems = expiringItems.filter(item =>
      new Date(item.expiryDate) < today);
    const expiringThisWeek = expiringItems.filter(item => {
      const expiry = new Date(item.expiryDate);
      return expiry >= today && expiry <= weekFromNow;
    });
    const expiringThisMonth = expiringItems.filter(item => {
      const expiry = new Date(item.expiryDate);
      return expiry > weekFromNow && expiry <= monthFromNow;
    });

    const summary = {
      totalExpiringItems: expiringItems.length,
      expiredItems: expiredItems.length,
      expiringThisWeek: expiringThisWeek.length,
      expiringThisMonth: expiringThisMonth.length,
      totalValueAtRisk: expiringItems.reduce((sum, item) =>
        sum + (item.quantity * item.Product.price), 0)
    };

    res.json({
      summary,
      items: expiringItems,
      timeframeGroups: {
        expired: expiredItems,
        thisWeek: expiringThisWeek,
        thisMonth: expiringThisMonth
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get daily sales report
exports.getDailySalesReport = async (req, res) => {
  try {
    const { date, storeId } = req.query;
    const targetDate = date ? new Date(date) : new Date();

    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const where = {
      invoiceDate: {
        [Op.between]: [startOfDay, endOfDay]
      },
      type: 'outlet_sale'
    };

    if (storeId) where.storeId = storeId;

    // Role-based filtering
    if (req.user.role === 'admin') {
      const adminStores = await Store.findAll({
        where: { adminId: req.user.id },
        attributes: ['id']
      });
      where.storeId = { [Op.in]: adminStores.map(s => s.id) };
    } else if (req.user.role === 'store_manager') {
      const store = await Store.findOne({
        where: { managerId: req.user.id },
        attributes: ['id']
      });
      if (store) {
        where.storeId = store.id;
      } else {
        return res.json({ invoices: [], summary: {} });
      }
    }

    const invoices = await Invoice.findAll({
      where,
      include: [
        { model: Store },
        { model: Outlet },
        {
          model: InvoiceItem,
          include: [Product]
        }
      ],
      order: [['invoiceDate', 'ASC']]
    });

    // Hourly breakdown
    const hourlySales = await Invoice.findAll({
      where,
      attributes: [
        [sequelize.fn('HOUR', sequelize.col('invoiceDate')), 'hour'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'invoiceCount'],
        [sequelize.fn('SUM', sequelize.col('totalAmount')), 'totalSales'],
        [sequelize.fn('SUM', sequelize.col('creditAmount')), 'totalCredit'],
        [sequelize.fn('SUM', sequelize.col('paidAmount')), 'totalPaid']
      ],
      group: [sequelize.fn('HOUR', sequelize.col('invoiceDate'))],
      order: [[sequelize.fn('HOUR', sequelize.col('invoiceDate')), 'ASC']]
    });

    // Product breakdown for the day
    const topProducts = await InvoiceItem.findAll({
      include: [
        {
          model: Invoice,
          where: where
        },
        { model: Product }
      ],
      attributes: [
        'productId',
        [sequelize.fn('SUM', sequelize.col('quantity')), 'totalQuantity'],
        [sequelize.fn('SUM', sequelize.col('totalPrice')), 'totalRevenue']
      ],
      group: ['productId'],
      order: [[sequelize.fn('SUM', sequelize.col('totalPrice')), 'DESC']],
      limit: 10
    });

    const summary = {
      date: targetDate.toISOString().split('T')[0],
      totalInvoices: invoices.length,
      totalSales: invoices.reduce((sum, invoice) => sum + invoice.totalAmount, 0),
      totalCredit: invoices.reduce((sum, invoice) => sum + invoice.creditAmount, 0),
      totalPaid: invoices.reduce((sum, invoice) => sum + invoice.paidAmount, 0),
      avgInvoiceValue: invoices.length > 0 ?
        invoices.reduce((sum, invoice) => sum + invoice.totalAmount, 0) / invoices.length : 0,
      peakHour: hourlySales.reduce((max, hour) =>
        hour.dataValues.totalSales > max.totalSales ? hour : max,
        { dataValues: { hour: 0, totalSales: 0 } }
      ).dataValues.hour
    };

    res.json({
      summary,
      hourlySales,
      topProducts,
      invoices
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get monthly sales report
exports.getMonthlySalesReport = async (req, res) => {
  try {
    const { year, month, storeId } = req.query;
    const currentYear = year || new Date().getFullYear();
    const currentMonth = month || new Date().getMonth() + 1;

    const startDate = new Date(currentYear, currentMonth - 1, 1);
    const endDate = new Date(currentYear, currentMonth, 0, 23, 59, 59);

    const where = {
      invoiceDate: {
        [Op.between]: [startDate, endDate]
      },
      type: 'outlet_sale'
    };

    if (storeId) where.storeId = storeId;

    // Role-based filtering
    if (req.user.role === 'admin') {
      const adminStores = await Store.findAll({
        where: { adminId: req.user.id },
        attributes: ['id']
      });
      where.storeId = { [Op.in]: adminStores.map(s => s.id) };
    } else if (req.user.role === 'store_manager') {
      const store = await Store.findOne({
        where: { managerId: req.user.id },
        attributes: ['id']
      });
      if (store) {
        where.storeId = store.id;
      } else {
        return res.json({ dailySales: [], summary: {} });
      }
    }

    // Daily breakdown
    const dailySales = await Invoice.findAll({
      where,
      attributes: [
        [sequelize.fn('DATE', sequelize.col('invoiceDate')), 'date'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'invoiceCount'],
        [sequelize.fn('SUM', sequelize.col('totalAmount')), 'totalSales'],
        [sequelize.fn('SUM', sequelize.col('creditAmount')), 'totalCredit'],
        [sequelize.fn('SUM', sequelize.col('paidAmount')), 'totalPaid'],
        [sequelize.fn('AVG', sequelize.col('totalAmount')), 'avgSale']
      ],
      group: [sequelize.fn('DATE', sequelize.col('invoiceDate'))],
      order: [[sequelize.fn('DATE', sequelize.col('invoiceDate')), 'ASC']]
    });

    // Store performance if multiple stores
    const storePerformance = await Invoice.findAll({
      where,
      include: [{ model: Store, attributes: ['id', 'name'] }],
      attributes: [
        'storeId',
        [sequelize.fn('COUNT', sequelize.col('id')), 'invoiceCount'],
        [sequelize.fn('SUM', sequelize.col('totalAmount')), 'totalSales'],
        [sequelize.fn('AVG', sequelize.col('totalAmount')), 'avgSale']
      ],
      group: ['storeId'],
      order: [[sequelize.fn('SUM', sequelize.col('totalAmount')), 'DESC']]
    });

    // Category performance
    const categoryPerformance = await InvoiceItem.findAll({
      include: [
        {
          model: Invoice,
          where: where
        },
        {
          model: Product,
          include: [Category]
        }
      ],
      attributes: [
        [sequelize.col('Product.Category.name'), 'category'],
        [sequelize.fn('SUM', sequelize.col('quantity')), 'totalQuantity'],
        [sequelize.fn('SUM', sequelize.col('totalPrice')), 'totalRevenue'],
        [sequelize.fn('AVG', sequelize.col('price')), 'avgPrice']
      ],
      group: ['Product.Category.name'],
      order: [[sequelize.fn('SUM', sequelize.col('totalPrice')), 'DESC']]
    });

    // Monthly summary
    const monthlySummary = await Invoice.findOne({
      where,
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('id')), 'totalInvoices'],
        [sequelize.fn('SUM', sequelize.col('totalAmount')), 'totalSales'],
        [sequelize.fn('SUM', sequelize.col('creditAmount')), 'totalCredit'],
        [sequelize.fn('SUM', sequelize.col('paidAmount')), 'totalPaid'],
        [sequelize.fn('AVG', sequelize.col('totalAmount')), 'avgInvoice'],
        [sequelize.fn('MAX', sequelize.col('totalAmount')), 'maxInvoice'],
        [sequelize.fn('MIN', sequelize.col('totalAmount')), 'minInvoice']
      ]
    });

    const summary = {
      period: {
        year: currentYear,
        month: currentMonth,
        monthName: new Date(currentYear, currentMonth - 1).toLocaleString('default', { month: 'long' })
      },
      ...monthlySummary.dataValues,
      bestDay: dailySales.reduce((max, day) =>
        day.dataValues.totalSales > max.totalSales ? day : max,
        { dataValues: { date: null, totalSales: 0 } }
      ),
      daysWithSales: dailySales.length
    };

    res.json({
      summary,
      dailySales,
      storePerformance,
      categoryPerformance
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get store credit report
exports.getStoreCreditReport = async (req, res) => {
  try {
    const { storeId } = req.params;
    const { startDate, endDate } = req.query;

    const store = await Store.findByPk(storeId);
    if (!store) {
      return res.status(404).json({ error: 'Store not found' });
    }

    // Check access
    if (req.user.role === 'admin' && store.adminId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const where = {
      storeId,
      paymentMethod: { [Op.in]: ['credit', 'mixed'] },
      creditAmount: { [Op.gt]: 0 }
    };

    if (startDate && endDate) {
      where.invoiceDate = {
        [Op.between]: [new Date(startDate), new Date(endDate)]
      };
    }

    const creditInvoices = await Invoice.findAll({
      where,
      include: [
        { model: Outlet },
        {
          model: InvoiceItem,
          include: [Product]
        }
      ],
      order: [['invoiceDate', 'ASC']]
    });

    // Payment history
    const payments = await Payment.findAll({
      where: { storeId },
      include: [{
        model: User,
        as: 'PaidBy',
        attributes: ['id', 'name', 'email']
      }],
      order: [['paymentDate', 'DESC']]
    });

    // Aging analysis
    const currentDate = new Date();
    const agingAnalysis = {
      current: creditInvoices.filter(inv =>
        !inv.invoiceDate || new Date(inv.invoiceDate) >= currentDate
      ).reduce((sum, inv) => sum + inv.creditAmount, 0),
      overdue1to30: creditInvoices.filter(inv =>
        inv.invoiceDate &&
        new Date(inv.invoiceDate) < currentDate &&
        daysBetween(new Date(inv.invoiceDate), currentDate) <= 30
      ).reduce((sum, inv) => sum + inv.creditAmount, 0),
      overdue31to60: creditInvoices.filter(inv =>
        inv.invoiceDate &&
        daysBetween(new Date(inv.invoiceDate), currentDate) > 30 &&
        daysBetween(new Date(inv.invoiceDate), currentDate) <= 60
      ).reduce((sum, inv) => sum + inv.creditAmount, 0),
      overdue61plus: creditInvoices.filter(inv =>
        inv.invoiceDate &&
        daysBetween(new Date(inv.invoiceDate), currentDate) > 60
      ).reduce((sum, inv) => sum + inv.creditAmount, 0)
    };

    const summary = {
      store: {
        id: store.id,
        name: store.name,
        creditLimit: store.creditLimit,
        currentCredit: store.currentCredit,
        creditAvailable: store.creditLimit - store.currentCredit,
        utilization: store.creditLimit > 0 ?
          ((store.currentCredit / store.creditLimit) * 100).toFixed(2) : 0
      },
      creditSummary: {
        totalCreditGiven: creditInvoices.reduce((sum, inv) => sum + inv.creditAmount, 0),
        totalPaid: payments.reduce((sum, payment) => sum + payment.amount, 0),
        outstandingBalance: store.currentCredit,
        overdueInvoices: creditInvoices.filter(inv =>
          inv.invoiceDate && new Date(inv.invoiceDate) < currentDate
        ).length
      },
      agingAnalysis
    };

    res.json({
      summary,
      creditInvoices,
      payments,
      recentPayments: payments.slice(0, 10)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get performance report
exports.getPerformanceReport = async (req, res) => {
  try {
    const { storeId, startDate, endDate } = req.query;

    const where = {};
    if (storeId) where.storeId = storeId;

    if (startDate && endDate) {
      where.invoiceDate = {
        [Op.between]: [new Date(startDate), new Date(endDate)]
      };
    }

    // Role-based filtering
    if (req.user.role === 'admin') {
      const adminStores = await Store.findAll({
        where: { adminId: req.user.id },
        attributes: ['id']
      });
      where.storeId = { [Op.in]: adminStores.map(s => s.id) };
    } else if (req.user.role === 'store_manager') {
      const store = await Store.findOne({
        where: { managerId: req.user.id },
        attributes: ['id']
      });
      if (store) {
        where.storeId = store.id;
      } else {
        return res.json({ performance: {}, comparisons: {} });
      }
    }

    // Sales performance
    const salesData = await Invoice.findAll({
      where: { ...where, type: 'outlet_sale' },
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('id')), 'totalInvoices'],
        [sequelize.fn('SUM', sequelize.col('totalAmount')), 'totalSales'],
        [sequelize.fn('AVG', sequelize.col('totalAmount')), 'avgSale'],
        [sequelize.fn('MAX', sequelize.col('totalAmount')), 'maxSale']
      ]
    });

    // Inventory performance
    const inventoryData = await Inventory.findAll({
      where: storeId ? { storeId } : {},
      include: [{ model: Product }],
      attributes: [
        [sequelize.fn('SUM', sequelize.col('quantity')), 'totalStock'],
        [sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('productId'))), 'uniqueProducts']
      ]
    });

    // Turnover rate (simplified calculation)
    const totalSales = salesData[0]?.dataValues.totalSales || 0;
    const avgInventory = inventoryData[0]?.dataValues.totalStock || 0;
    const turnoverRate = avgInventory > 0 ? (totalSales / avgInventory).toFixed(2) : 0;

    // Outlet performance
    const outletPerformance = await Invoice.findAll({
      where: { ...where, type: 'outlet_sale' },
      include: [{ model: Outlet, attributes: ['id', 'name'] }],
      attributes: [
        'outletId',
        [sequelize.fn('COUNT', sequelize.col('id')), 'invoiceCount'],
        [sequelize.fn('SUM', sequelize.col('totalAmount')), 'totalSales'],
        [sequelize.fn('AVG', sequelize.col('totalAmount')), 'avgSale']
      ],
      group: ['outletId'],
      order: [[sequelize.fn('SUM', sequelize.col('totalAmount')), 'DESC']]
    });

    // Top performing products
    const topProducts = await InvoiceItem.findAll({
      include: [
        {
          model: Invoice,
          where: { ...where, type: 'outlet_sale' }
        },
        { model: Product }
      ],
      attributes: [
        'productId',
        [sequelize.fn('SUM', sequelize.col('quantity')), 'totalQuantity'],
        [sequelize.fn('SUM', sequelize.col('totalPrice')), 'totalRevenue'],
        [sequelize.fn('AVG', sequelize.col('price')), 'avgPrice']
      ],
      group: ['productId'],
      order: [[sequelize.fn('SUM', sequelize.col('totalPrice')), 'DESC']],
      limit: 10
    });

    // Customer metrics (using outlets as customers)
    const customerMetrics = {
      totalOutlets: await Outlet.count({ where: storeId ? { storeId } : {} }),
      activeOutlets: outletPerformance.length,
      repeatCustomers: outletPerformance.filter(outlet =>
        outlet.dataValues.invoiceCount > 1
      ).length,
      avgOrderValue: salesData[0]?.dataValues.avgSale || 0
    };

    const performance = {
      sales: {
        totalSales,
        totalInvoices: salesData[0]?.dataValues.totalInvoices || 0,
        avgSale: salesData[0]?.dataValues.avgSale || 0,
        maxSale: salesData[0]?.dataValues.maxSale || 0
      },
      inventory: {
        totalStock: inventoryData[0]?.dataValues.totalStock || 0,
        uniqueProducts: inventoryData[0]?.dataValues.uniqueProducts || 0,
        turnoverRate: parseFloat(turnoverRate),
        efficiency: turnoverRate > 2 ? 'High' : turnoverRate > 1 ? 'Medium' : 'Low'
      },
      outlets: outletPerformance.map(outlet => ({
        outletId: outlet.outletId,
        outletName: outlet.Outlet?.name || 'Unknown',
        invoiceCount: outlet.dataValues.invoiceCount,
        totalSales: outlet.dataValues.totalSales,
        avgSale: outlet.dataValues.avgSale
      })),
      topProducts: topProducts.map(product => ({
        productId: product.productId,
        productName: product.Product?.name || 'Unknown',
        totalQuantity: product.dataValues.totalQuantity,
        totalRevenue: product.dataValues.totalRevenue,
        avgPrice: product.dataValues.avgPrice
      })),
      customers: customerMetrics
    };

    res.json(performance);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get profit/loss report
exports.getProfitLossReport = async (req, res) => {
  try {
    const { startDate, endDate, storeId } = req.query;

    const salesWhere = { type: 'outlet_sale' };
    const expenditureWhere = {};

    if (storeId) {
      salesWhere.storeId = storeId;
      expenditureWhere.storeId = storeId;
    }

    if (startDate && endDate) {
      const dateRange = {
        [Op.between]: [new Date(startDate), new Date(endDate)]
      };
      salesWhere.invoiceDate = dateRange;
      expenditureWhere.date = dateRange;
    }

    // Role-based filtering
    if (req.user.role === 'admin') {
      const adminStores = await Store.findAll({
        where: { adminId: req.user.id },
        attributes: ['id']
      });
      salesWhere.storeId = { [Op.in]: adminStores.map(s => s.id) };
      expenditureWhere.storeId = { [Op.in]: adminStores.map(s => s.id) };
    } else if (req.user.role === 'store_manager') {
      const store = await Store.findOne({
        where: { managerId: req.user.id },
        attributes: ['id']
      });
      if (store) {
        salesWhere.storeId = store.id;
        expenditureWhere.storeId = store.id;
      } else {
        return res.json({ pnl: {}, breakdown: {} });
      }
    }

    // Get total sales revenue
    const salesRevenue = await Invoice.sum('totalAmount', {
      where: salesWhere
    }) || 0;

    // Get cost of goods sold (COGS)
    // Assuming you have costPrice in Product model
    const cogs = await InvoiceItem.sum(
      sequelize.literal('quantity * Product.costPrice'),
      {
        include: [
          {
            model: Invoice,
            where: salesWhere
          },
          { model: Product }
        ]
      }
    ) || 0;

    // Get expenditures
    const expenditures = await Expenditure.sum('amount', {
      where: expenditureWhere
    }) || 0;

    // Calculate gross profit
    const grossProfit = salesRevenue - cogs;
    const grossMargin = salesRevenue > 0 ? (grossProfit / salesRevenue * 100).toFixed(2) : 0;

    // Calculate net profit
    const netProfit = grossProfit - expenditures;
    const netMargin = salesRevenue > 0 ? (netProfit / salesRevenue * 100).toFixed(2) : 0;

    // Category breakdown of expenditures
    const expenditureBreakdown = await Expenditure.findAll({
      where: expenditureWhere,
      attributes: [
        'category',
        [sequelize.fn('SUM', sequelize.col('amount')), 'amount']
      ],
      group: ['category'],
      order: [[sequelize.fn('SUM', sequelize.col('amount')), 'DESC']]
    });

    // Product category profitability
    const categoryProfitability = await InvoiceItem.findAll({
      include: [
        {
          model: Invoice,
          where: salesWhere
        },
        {
          model: Product,
          include: [Category]
        }
      ],
      attributes: [
        [sequelize.col('Product.Category.name'), 'category'],
        [sequelize.fn('SUM', sequelize.col('InvoiceItem.quantity * InvoiceItem.price')), 'revenue'],
        [sequelize.fn('SUM', sequelize.literal('InvoiceItem.quantity * Product.costPrice')), 'cost'],
        [
          sequelize.literal('SUM(InvoiceItem.quantity * InvoiceItem.price) - SUM(InvoiceItem.quantity * Product.costPrice)'),
          'profit'
        ]
      ],
      group: ['Product.Category.name'],
      order: [[sequelize.literal('profit'), 'DESC']]
    });

    const pnlStatement = {
      period: {
        startDate: startDate || 'Beginning',
        endDate: endDate || 'Now'
      },
      revenue: {
        sales: salesRevenue,
        other: 0, // Add if you have other revenue streams
        total: salesRevenue
      },
      costOfGoodsSold: cogs,
      grossProfit: {
        amount: grossProfit,
        margin: parseFloat(grossMargin)
      },
      operatingExpenses: {
        expenditures: expenditures,
        total: expenditures
      },
      netProfit: {
        amount: netProfit,
        margin: parseFloat(netMargin)
      },
      keyMetrics: {
        salesToExpenseRatio: expenditures > 0 ? (salesRevenue / expenditures).toFixed(2) : 0,
        returnOnSales: netMargin,
        breakevenPoint: grossMargin > 0 ? (expenditures / (grossMargin / 100)).toFixed(2) : 0
      }
    };

    res.json({
      pnlStatement,
      expenditureBreakdown,
      categoryProfitability: categoryProfitability.map(cat => ({
        category: cat.dataValues.category,
        revenue: cat.dataValues.revenue,
        cost: cat.dataValues.cost,
        profit: cat.dataValues.profit,
        margin: cat.dataValues.revenue > 0 ?
          (cat.dataValues.profit / cat.dataValues.revenue * 100).toFixed(2) : 0
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Export reports
exports.exportReport = async (req, res) => {
  console.log("rrr::", reportType);

  try {
    const { reportType, format = 'excel', ...filters } = req.body;
    let report;
    switch (reportType) {
      case 'inventory':
        report = await generateInventoryReport(
          filters.startDate,
          filters.endDate,
          filters.storeId,
          filters.categoryId,
          filters.lowStock
        );
        break;
      case 'sales':
        report = await generateSalesReport(
          filters.startDate,
          filters.endDate,
          filters.storeId,
          filters.type
        );
        break;
      case 'credit':
        report = await generateCreditReport(
          filters.startDate,
          filters.endDate,
          filters.storeId
        );
        break;
      case 'expenditure':
        report = await generateExpenditureReport(
          filters.startDate,
          filters.endDate
        );
        break;
      case 'profit-loss':
        report = await generateProfitLossReport(
          filters.startDate,
          filters.endDate,
          filters.storeId
        );
        break;
      default:
        return res.status(400).json({ error: 'Invalid report type' });
    }

    if (format === 'pdf') {
      return generatePDF(res, report, reportType, filters.startDate, filters.endDate);
    } else {
      return generateExcel(res, report, reportType, filters.startDate, filters.endDate);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Generate custom report
exports.generateCustomReport = async (req, res) => {
  try {
    const {
      metrics,
      dimensions,
      filters,
      startDate,
      endDate,
      storeId,
      format = 'json'
    } = req.body;

    if (!metrics || !Array.isArray(metrics) || metrics.length === 0) {
      return res.status(400).json({ error: 'At least one metric is required' });
    }

    // Build query based on selected metrics and dimensions
    const reportData = await buildCustomReport({
      metrics,
      dimensions,
      filters,
      startDate,
      endDate,
      storeId,
      user: req.user
    });

    if (format === 'pdf') {
      return generateCustomPDF(res, reportData, metrics, dimensions, startDate, endDate);
    } else if (format === 'excel') {
      return generateCustomExcel(res, reportData, metrics, dimensions, startDate, endDate);
    }

    res.json(reportData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Helper function for custom reports
async function buildCustomReport(params) {
  const { metrics, dimensions, filters, startDate, endDate, storeId, user } = params;

  // This is a simplified version - you would expand this based on your needs
  const where = {};

  if (storeId) where.storeId = storeId;

  if (startDate && endDate) {
    where.invoiceDate = {
      [Op.between]: [new Date(startDate), new Date(endDate)]
    };
  }

  // Role-based filtering
  if (user.role === 'admin') {
    const adminStores = await Store.findAll({
      where: { adminId: user.id },
      attributes: ['id']
    });
    where.storeId = { [Op.in]: adminStores.map(s => s.id) };
  } else if (user.role === 'store_manager') {
    const store = await Store.findOne({
      where: { managerId: user.id },
      attributes: ['id']
    });
    if (store) {
      where.storeId = store.id;
    } else {
      return { data: [], summary: {} };
    }
  }

  // Add custom filters
  if (filters) {
    Object.assign(where, filters);
  }

  // Build attributes based on selected metrics
  const attributes = metrics.map(metric => {
    switch (metric) {
      case 'total_sales':
        return [sequelize.fn('SUM', sequelize.col('totalAmount')), 'totalSales'];
      case 'invoice_count':
        return [sequelize.fn('COUNT', sequelize.col('id')), 'invoiceCount'];
      case 'avg_sale':
        return [sequelize.fn('AVG', sequelize.col('totalAmount')), 'avgSale'];
      case 'total_quantity':
        return [sequelize.fn('SUM', sequelize.col('InvoiceItems.quantity')), 'totalQuantity'];
      default:
        return null;
    }
  }).filter(attr => attr !== null);

  // Add group by for dimensions
  const groupBy = [];
  if (dimensions && dimensions.includes('store')) {
    groupBy.push('storeId');
    attributes.push([sequelize.col('Store.name'), 'storeName']);
  }
  if (dimensions && dimensions.includes('category')) {
    groupBy.push('Product.Category.name');
    attributes.push([sequelize.col('Product.Category.name'), 'category']);
  }
  if (dimensions && dimensions.includes('outlet')) {
    groupBy.push('outletId');
    attributes.push([sequelize.col('Outlet.name'), 'outletName']);
  }

  const report = await Invoice.findAll({
    where,
    include: [
      { model: Store, attributes: [] },
      { model: Outlet, attributes: [] },
      {
        model: InvoiceItem,
        include: [{
          model: Product,
          include: [Category],
          attributes: []
        }],
        attributes: []
      }
    ],
    attributes,
    group: groupBy.length > 0 ? groupBy : null,
    raw: true
  });

  return {
    metrics,
    dimensions: dimensions || [],
    period: { startDate, endDate },
    data: report,
    summary: {
      totalRecords: report.length,
      generatedAt: new Date().toISOString()
    }
  };
}

// Helper function to calculate days between dates
function daysBetween(date1, date2) {
  const timeDiff = Math.abs(date2.getTime() - date1.getTime());
  return Math.ceil(timeDiff / (1000 * 3600 * 24));
}