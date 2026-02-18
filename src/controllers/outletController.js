const { Outlet, Store, Invoice, sequelize } = require('../models');
const { Op, fn, col } = require('sequelize');

// Create outlet
exports.createOutlet = async (req, res) => {
  try {
    const { name, storeId, address, contactPerson, phoneNumber,creditLimit } = req.body;

    // Check if user has access to the store
    const store = await Store.findByPk(storeId);
    
    if (!store) {
      return res.status(404).json({ error: 'Store not found' });
    }

    // Check access rights
    if (req.user.role === 'admin' && store.adminId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied to this store' });
    }

    if (req.user.role === 'store_manager' && store.managerId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied to this store' });
    }

    // Check if outlet with same name exists in store
    const existingOutlet = await Outlet.findOne({
      where: {
        name: sequelize.where(
          sequelize.fn('LOWER', sequelize.col('name')),
          name.toLowerCase()
        ),
        storeId
      }
    });

    if (existingOutlet) {
      return res.status(400).json({ error: 'Outlet with this name already exists in this store' });
    }

    const outlet = await Outlet.create({
      name,
      storeId,
      address,
      contactPerson,
      phoneNumber,
      creditLimit,
      type: 'custom'
    });

    res.status(201).json({
      message: 'Outlet created successfully',
      outlet
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get all outlets

exports.getAllOutlets = async (req, res) => {
  try {
    const { storeId, type, active, search, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const where = {};

    // --------------------
    // Basic filters
    // --------------------
    if (storeId) where.storeId = storeId;
    if (type) where.type = type;
    if (active !== undefined) where.isActive = active === 'true';

    if (search) {
      where[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { contactPerson: { [Op.like]: `%${search}%` } },
        { phoneNumber: { [Op.like]: `%${search}%` } }
      ];
    }

    // --------------------
    // Role-based filtering
    // --------------------
    if (req.user.role === 'admin') {
      const stores = await Store.findAll({
        where: { adminId: req.user.id },
        attributes: ['id'],
        raw: true
      });

      const storeIds = stores.map(s => s.id);
      if (!storeIds.length) {
        return res.json({
          totalOutlets: 0,
          totalCreditLimit: 0,
          totalCurrentCredit: 0,
          totalPages: 0,
          currentPage: Number(page),
          outlets: []
        });
      }

      where.storeId = { [Op.in]: storeIds };
    }

    if (req.user.role === 'store_manager') {
      const store = await Store.findOne({
        where: { managerId: req.user.id },
        attributes: ['id'],
        raw: true
      });

      if (!store) {
        return res.json({
          totalOutlets: 0,
          totalCreditLimit: 0,
          totalCurrentCredit: 0,
          totalPages: 0,
          currentPage: Number(page),
          outlets: []
        });
      }

      where.storeId = store.id;
    }

    // --------------------
    // Fetch outlets
    // --------------------
    const { count, rows: outlets } = await Outlet.findAndCountAll({
      where,
      include: [
        {
          model: Store,
          attributes: ['id', 'name', 'address']
        }
      ],
      order: [['name', 'ASC']],
      limit: Number(limit),
      offset: Number(offset)
    });

    // --------------------
    // Credit totals (single query, same filters)
    // --------------------
    const totals = await Outlet.findOne({
      where,
      attributes: [
        [fn('SUM', col('creditLimit')), 'totalCreditLimit'],
        [fn('SUM', col('currentCredit')), 'totalCurrentCredit']
      ],
      raw: true
    });

    res.json({
      totalOutlets: count,
      totalCreditLimit: Number(totals.totalCreditLimit || 0),
      totalCurrentCredit: Number(totals.totalCurrentCredit || 0),
      totalPages: Math.ceil(count / limit),
      currentPage: Number(page),
      outlets
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get outlet by ID
exports.getOutletById = async (req, res) => {
  try {
    const { id } = req.params;

    const outlet = await Outlet.findByPk(id, {
      include: [
        {
          model: Store,
          attributes: ['id', 'name', 'address', 'adminId', 'managerId']
        },
        {
          model: Invoice,
          limit: 10,
          order: [['invoiceDate', 'DESC']]
        }
      ]
    });

    if (!outlet) {
      return res.status(404).json({ error: 'Outlet not found' });
    }

    // Check access rights
    const hasAccess = await checkOutletAccess(req.user, outlet.Store);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this outlet' });
    }

    res.json(outlet);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Update outlet
exports.updateOutlet = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, address, contactPerson, phoneNumber,creditLimit,currentCredit, isActive } = req.body;

    const outlet = await Outlet.findByPk(id, {
      include: [{ model: Store }]
    });

    if (!outlet) {
      return res.status(404).json({ error: 'Outlet not found' });
    }

    // Check access rights
    const hasAccess = await checkOutletAccess(req.user, outlet.Store);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this outlet' });
    }

    // Check for duplicate name if name is being changed
    if (name && name !== outlet.name) {
      const existingOutlet = await Outlet.findOne({
        where: {
          name: sequelize.where(
            sequelize.fn('LOWER', sequelize.col('name')),
            name.toLowerCase()
          ),
          storeId: outlet.storeId,
          id: { [Op.ne]: id }
        }
      });

      if (existingOutlet) {
        return res.status(400).json({ 
          error: 'Outlet with this name already exists in this store' 
        });
      }
    }

    await outlet.update({
      name: name || outlet.name,
      address: address !== undefined ? address : outlet.address,
      contactPerson: contactPerson !== undefined ? contactPerson : outlet.contactPerson,
      phoneNumber: phoneNumber !== undefined ? phoneNumber : outlet.phoneNumber,
      creditLimit: creditLimit !== undefined ? creditLimit : outlet.creditLimit,
      currentCredit: currentCredit !== undefined ? Number(currentCredit)+Number(outlet?.currentCredit) : outlet.currentCredit,
      isActive: isActive !== undefined ? isActive : outlet.isActive
    });

    res.json({
      message: 'Outlet updated successfully',
      outlet
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Delete outlet
exports.deleteOutlet = async (req, res) => {
  try {
    const { id } = req.params;

    const outlet = await Outlet.findByPk(id, {
      include: [
        { model: Store },
        { model: Invoice }
      ]
    });

    if (!outlet) {
      return res.status(404).json({ error: 'Outlet not found' });
    }

    // Only admin can delete outlets
    if (req.user.role !== 'admin' || outlet.Store.adminId !== req.user.id) {
      return res.status(403).json({ error: 'Only store admin can delete outlets' });
    }

    // Check if outlet has invoices
    if (outlet.Invoices && outlet.Invoices.length > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete outlet with existing invoices. Delete invoices first.' 
      });
    }

    await outlet.destroy();

    res.json({
      message: 'Outlet deleted successfully'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get outlet invoices
exports.getOutletInvoices = async (req, res) => {
  try {
    const { id } = req.params;
    const { startDate, endDate, status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const outlet = await Outlet.findByPk(id, {
      include: [{ model: Store }]
    });

    if (!outlet) {
      return res.status(404).json({ error: 'Outlet not found' });
    }

    // Check access rights
    const hasAccess = await checkOutletAccess(req.user, outlet.Store);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this outlet' });
    }

    const where = { outletId: id };
    
    if (status) where.status = status;
    
    if (startDate && endDate) {
      where.invoiceDate = {
        [Op.between]: [new Date(startDate), new Date(endDate)]
      };
    }

    const { count, rows: invoices } = await Invoice.findAndCountAll({
      where,
      include: [
        {
          model: Store,
          attributes: ['id', 'name']
        }
      ],
      order: [['invoiceDate', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    // Calculate summary
    const totalSales = await Invoice.sum('totalAmount', { where });
    const totalCredit = await Invoice.sum('creditAmount', { where });
    const totalPaid = await Invoice.sum('paidAmount', { where });

    const summary = {
      totalInvoices: count,
      totalSales: totalSales || 0,
      totalCredit: totalCredit || 0,
      totalPaid: totalPaid || 0,
      outstanding: (totalCredit || 0) - (totalPaid || 0)
    };

    res.json({
      outlet,
      summary,
      total: count,
      totalPages: Math.ceil(count / limit),
      currentPage: parseInt(page),
      invoices
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get outlet statistics
exports.getOutletStats = async (req, res) => {
  try {
    const { id } = req.params;
    const { year } = req.query;

    const outlet = await Outlet.findByPk(id, {
      include: [{ model: Store }]
    });

    if (!outlet) {
      return res.status(404).json({ error: 'Outlet not found' });
    }

    // Check access rights
    const hasAccess = await checkOutletAccess(req.user, outlet.Store);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this outlet' });
    }

    const currentYear = year || new Date().getFullYear();
    const startDate = new Date(`${currentYear}-01-01`);
    const endDate = new Date(`${currentYear}-12-31`);

    // Monthly sales data
    const monthlySales = await Invoice.findAll({
      where: {
        outletId: id,
        invoiceDate: {
          [Op.between]: [startDate, endDate]
        }
      },
      attributes: [
        [sequelize.fn('MONTH', sequelize.col('invoiceDate')), 'month'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'invoiceCount'],
        [sequelize.fn('SUM', sequelize.col('totalAmount')), 'totalSales'],
        [sequelize.fn('SUM', sequelize.col('creditAmount')), 'totalCredit'],
        [sequelize.fn('SUM', sequelize.col('paidAmount')), 'totalPaid']
      ],
      group: [sequelize.fn('MONTH', sequelize.col('invoiceDate'))],
      order: [[sequelize.fn('MONTH', sequelize.col('invoiceDate')), 'ASC']]
    });

    // Yearly comparison
    const lastYear = currentYear - 1;
    const lastYearStart = new Date(`${lastYear}-01-01`);
    const lastYearEnd = new Date(`${lastYear}-12-31`);

    const currentYearSales = await Invoice.sum('totalAmount', {
      where: {
        outletId: id,
        invoiceDate: { [Op.between]: [startDate, endDate] }
      }
    });

    const lastYearSales = await Invoice.sum('totalAmount', {
      where: {
        outletId: id,
        invoiceDate: { [Op.between]: [lastYearStart, lastYearEnd] }
      }
    });

    // Top products
    const topProducts = await InvoiceItem.findAll({
      include: [
        {
          model: Invoice,
          where: { outletId: id },
          attributes: []
        },
        {
          model: Product,
          attributes: ['id', 'name', 'sku']
        }
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

    const stats = {
      monthlySales,
      currentYearSales: currentYearSales || 0,
      lastYearSales: lastYearSales || 0,
      growthPercentage: lastYearSales > 0 ? 
        ((currentYearSales - lastYearSales) / lastYearSales * 100).toFixed(2) : 0,
      topProducts,
      averageInvoiceValue: monthlySales.length > 0 ?
        monthlySales.reduce((sum, month) => sum + month.dataValues.totalSales, 0) / 
        monthlySales.reduce((sum, month) => sum + month.dataValues.invoiceCount, 0) : 0
    };

    res.json({
      outlet,
      stats
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get outlets by store
exports.getOutletsByStore = async (req, res) => {
  try {
    const { storeId } = req.params;
    const { type, active } = req.query;

    const where = { storeId };
    
    if (type) where.type = type;
    if (active !== undefined) where.isActive = active === 'true';

    const outlets = await Outlet.findAll({
      where,
      include: [
        {
          model: Store,
          attributes: ['id', 'name']
        }
      ],
      order: [['name', 'ASC']]
    });

    res.json(outlets);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Toggle outlet status
exports.toggleOutletStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    const outlet = await Outlet.findByPk(id, {
      include: [{ model: Store }]
    });

    if (!outlet) {
      return res.status(404).json({ error: 'Outlet not found' });
    }

    // Only admin can toggle status
    if (req.user.role !== 'admin' || outlet.Store.adminId !== req.user.id) {
      return res.status(403).json({ error: 'Only store admin can change outlet status' });
    }

    await outlet.update({ isActive });

    res.json({
      message: `Outlet ${isActive ? 'activated' : 'deactivated'} successfully`,
      outlet
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Bulk update outlets
exports.bulkUpdateOutlets = async (req, res) => {
  try {
    const { outletIds, updates } = req.body;

    if (!Array.isArray(outletIds) || outletIds.length === 0) {
      return res.status(400).json({ error: 'Outlet IDs array is required' });
    }

    // Get outlets with store info
    const outlets = await Outlet.findAll({
      where: { id: { [Op.in]: outletIds } },
      include: [{ model: Store }]
    });

    // Filter outlets that user has access to
    const accessibleOutlets = outlets.filter(outlet => {
      if (req.user.role === 'admin' && outlet.Store.adminId === req.user.id) {
        return true;
      }
      return false;
    });

    if (accessibleOutlets.length === 0) {
      return res.status(403).json({ error: 'No accessible outlets found' });
    }

    // Update accessible outlets
    const updatePromises = accessibleOutlets.map(outlet => 
      outlet.update(updates)
    );

    await Promise.all(updatePromises);

    res.json({
      message: `Updated ${accessibleOutlets.length} outlets`,
      updatedCount: accessibleOutlets.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Helper function to check outlet access
async function checkOutletAccess(user, store) {
  if (user.role === 'superadmin') return true;
  if (user.role === 'admin' && store.adminId === user.id) return true;
  if (user.role === 'store_manager' && store.managerId === user.id) return true;
  return false;
}