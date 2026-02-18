const { Inventory, Product, Store, Room, Rack, Freezer, sequelize, Category } = require('../models');
const { Op, fn, col, literal } = require('sequelize');
// const sequelize = require('../config/database');

// Get inventory for a store
exports.getStoreInventory = async (req, res) => {
  try {
    const { storeId } = req.params;
    const { lowStock = false, categoryId, locationType, locationId } = req.query;

    const where = { storeId };
    
    // Filter by low stock
    if (lowStock === 'true') {
      where.quantity = {
        [Op.lte]: sequelize.col('reorderLevel')
      };
    }
    
    // Filter by category
    if (categoryId) {
      where['$Product.categoryId$'] = categoryId;
    }
    
    // Filter by location
    if (locationType && locationId) {
      where[`${locationType}Id`] = locationId;
    }

    const inventory = await Inventory.findAll({
      where,
      include: [
        {
          model: Product,
          include: ['Category']
        },
        { model: Store },
        { model: Room },
        { model: Rack },
        { model: Freezer }
      ],
      order: [['lastUpdated', 'DESC']]
    });

    res.json(inventory);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Update inventory quantity
exports.updateInventory = async (req, res) => {
  const t = await sequelize.transaction();
  
  try {
    const { id } = req.params;
    const { quantity, action = 'adjust', reason } = req.body;

    const inventory = await Inventory.findByPk(id, {
      include: [Product],
      transaction: t
    });

    if (!inventory) {
      await t.rollback();
      return res.status(404).json({ error: 'Inventory item not found' });
    }

    let newQuantity = inventory.quantity;
    
    switch (action) {
      case 'add':
        newQuantity += parseInt(quantity);
        break;
      case 'subtract':
        newQuantity -= parseInt(quantity);
        if (newQuantity < 0) newQuantity = 0;
        break;
      case 'adjust':
        newQuantity = parseInt(quantity);
        break;
      default:
        await t.rollback();
        return res.status(400).json({ error: 'Invalid action' });
    }

    const oldQuantity = inventory.quantity;
    inventory.quantity = newQuantity;
    inventory.lastUpdated = new Date();
    await inventory.save({ transaction: t });

    // Log the transaction
    await sequelize.models.Transaction.create({
      inventoryId: inventory.id,
      productId: inventory.productId,
      storeId: inventory.storeId,
      oldQuantity,
      newQuantity,
      quantityChanged: newQuantity - oldQuantity,
      action,
      reason,
      performedById: req.user.id,
      transactionDate: new Date()
    }, { transaction: t });

    // Check for threshold alert
    if (newQuantity <= inventory.reorderLevel) {
      // Create low stock alert
      await sequelize.models.Alert.create({
        inventoryId: inventory.id,
        storeId: inventory.storeId,
        productId: inventory.productId,
        alertType: 'low_stock',
        currentQuantity: newQuantity,
        threshold: inventory.reorderLevel,
        status: 'active'
      }, { transaction: t });
    }

    await t.commit();

    res.json({
      message: 'Inventory updated successfully',
      inventory,
      oldQuantity,
      newQuantity
    });
  } catch (error) {
    await t.rollback();
    res.status(500).json({ error: error.message });
  }
};

// Move inventory to different location
exports.moveInventory = async (req, res) => {
  const t = await sequelize.transaction();
  
  try {
    const { id } = req.params;
    const { newRoomId, newRackId, newFreezerId, quantityToMove, reason } = req.body;

    const inventory = await Inventory.findByPk(id, {
      include: [Product],
      transaction: t
    });

    if (!inventory) {
      await t.rollback();
      return res.status(404).json({ error: 'Inventory item not found' });
    }

    if (quantityToMove > inventory.quantity) {
      await t.rollback();
      return res.status(400).json({ error: 'Not enough stock to move' });
    }

    // Create new inventory item at new location
    const newInventory = await Inventory.create({
      productId: inventory.productId,
      storeId: inventory.storeId,
      roomId: newRoomId,
      rackId: newRackId,
      freezerId: newFreezerId,
      quantity: quantityToMove,
      reorderLevel: inventory.reorderLevel
    }, { transaction: t });

    // Reduce quantity from old location
    inventory.quantity -= quantityToMove;
    await inventory.save({ transaction: t });

    // Log the movement
    await sequelize.models.Transaction.create({
      inventoryId: inventory.id,
      newInventoryId: newInventory.id,
      productId: inventory.productId,
      storeId: inventory.storeId,
      oldLocation: {
        roomId: inventory.roomId,
        rackId: inventory.rackId,
        freezerId: inventory.freezerId
      },
      newLocation: {
        roomId: newRoomId,
        rackId: newRackId,
        freezerId: newFreezerId
      },
      quantityMoved: quantityToMove,
      action: 'move',
      reason,
      performedById: req.user.id
    }, { transaction: t });

    await t.commit();

    res.json({
      message: 'Inventory moved successfully',
      fromInventory: inventory,
      toInventory: newInventory
    });
  } catch (error) {
    await t.rollback();
    res.status(500).json({ error: error.message });
  }
};

// Get low stock alerts
exports.getLowStockAlerts = async (req, res) => {
  try {
    const { storeId } = req.params;

    const where = {};
    if (storeId) where.storeId = storeId;

    const lowStockItems = await Inventory.findAll({
      where: {
        ...where,
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
        { model: Room },
        { model: Rack },
        { model: Freezer }
      ],
      order: [['quantity', 'ASC']]
    });

    res.json(lowStockItems);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get inventory summary
exports.getInventorySummary = async (req, res) => {
  try {
    const { storeId } = req.params;

    const where = {};
    if (storeId) where.storeId = storeId;

    const totalItems = await Inventory.count({ where });
    
    const summary = await Inventory.findOne({
      where,
      attributes: [
        [sequelize.fn('SUM', sequelize.col('quantity')), 'totalQuantity'],
        [sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('productId'))), 'uniqueProducts']
      ]
    });

    const lowStockCount = await Inventory.count({
      where: {
        ...where,
        quantity: {
          [Op.lte]: sequelize.col('reorderLevel')
        }
      }
    });

    const outOfStockCount = await Inventory.count({
      where: {
        ...where,
        quantity: 0
      }
    });

    res.json({
      totalItems,
      totalQuantity: summary.dataValues.totalQuantity || 0,
      uniqueProducts: summary.dataValues.uniqueProducts || 0,
      lowStockCount,
      outOfStockCount,
      healthPercentage: ((totalItems - lowStockCount) / totalItems * 100).toFixed(2)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get all inventory (admin/superadmin only)
exports.getAllInventory = async (req, res) => {
  try {
    const { 
      storeId, 
      productId, 
      lowStock, 
      outOfStock,
      categoryId,
      page = 1, 
      limit = 50 
    } = req.query;
    
    const offset = (page - 1) * limit;
    const where = {};

    // Filters
    if (storeId) where.storeId = storeId;
    if (productId) where.productId = productId;
    if (categoryId) where['$Product.categoryId$'] = categoryId;

    // Stock status filters
    if (lowStock === 'true') {
      where.quantity = {
        [Op.lte]: sequelize.col('reorderLevel')
      };
    }
    
    if (outOfStock === 'true') {
      where.quantity = 0;
    }

    // Role-based filtering for admin
    if (req.user.role === 'admin') {
      const adminStores = await Store.findAll({
        where: { adminId: req.user.id },
        attributes: ['id']
      });
      where.storeId = { [Op.in]: adminStores.map(s => s.id) };
    }

    const { count, rows: inventory } = await Inventory.findAndCountAll({
      where,
      include: [
        {
          model: Product,
          include: ['Category']
        },
        { model: Store },
        { model: Room },
        { model: Rack },
        { model: Freezer }
      ],
      order: [['lastUpdated', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    // Calculate summary statistics
    const totalQuantity = await Inventory.sum('quantity', { where });
    const totalValueResult = await Inventory.findOne({
      attributes: [
        [
          sequelize.fn(
            'SUM',
            sequelize.literal('`Inventory`.`quantity` * `Product`.`price`')
          ),
          'totalValue'
        ]
      ],
      where,
      include: [
        {
          model: Product,
          attributes: []
        }
      ],
      raw: true
    });
    
    const totalValue = totalValueResult?.totalValue || 0;
        
    const summary = {
      totalItems: count,
      totalQuantity: totalQuantity || 0,
      totalValue: totalValue || 0,
      uniqueProducts: await Inventory.count({
        where,
        distinct: true,
        col: 'productId'
      }),
      storesCovered: await Inventory.count({
        where,
        distinct: true,
        col: 'storeId'
      })
    };

    res.json({
      summary,
      total: count,
      totalPages: Math.ceil(count / limit),
      currentPage: parseInt(page),
      inventory
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get overall summary (for all stores user has access to)

exports.getOverallSummary = async (req, res) => {
  try {
    const where = {};

    /* ---------------- ROLE BASED FILTER ---------------- */
    if (req.user.role === 'admin') {
      const adminStores = await Store.findAll({
        where: { adminId: req.user.id },
        attributes: ['id'],
        raw: true
      });

      where.storeId = {
        [Op.in]: adminStores.map(s => s.id)
      };
    }

    if (req.user.role === 'store_manager') {
      const store = await Store.findOne({
        where: { managerId: req.user.id },
        attributes: ['id'],
        raw: true
      });

      if (!store) {
        return res.json({
          totalItems: 0,
          totalQuantity: 0,
          totalValue: 0,
          uniqueProducts: 0,
          lowStockItems: 0,
          outOfStockItems: 0,
          healthPercentage: 0,
          categoryBreakdown: [],
          storeBreakdown: []
        });
      }

      where.storeId = store.id;
    }

    /* ---------------- BASIC SUMMARY ---------------- */
    const totalItems = await Inventory.count({ where });

    const quantitySummary = await Inventory.findOne({
      where,
      attributes: [
        [fn('SUM', col('quantity')), 'totalQuantity'],
        [fn('COUNT', fn('DISTINCT', col('productId'))), 'uniqueProducts']
      ],
      raw: true
    });

    const lowStockItems = await Inventory.count({
      where: {
        ...where,
        quantity: {
          [Op.lte]: col('reorderLevel'),
          [Op.gt]: 0
        }
      }
    });

    const outOfStockItems = await Inventory.count({
      where: { ...where, quantity: 0 }
    });

    /* ---------------- TOTAL VALUE ---------------- */
    const totalValue = await Inventory.findOne({
      where,
      include: [{ model: Product, attributes: [] }],
      attributes: [
        [fn('SUM', literal('Inventory.quantity * Product.price')), 'totalValue']
      ],
      raw: true
    });

    /* ---------------- CATEGORY BREAKDOWN ---------------- */
    const categoryBreakdown = await Inventory.findAll({
      where,
      include: [
        {
          model: Product,
          attributes: [],
          include: [{ model: Category, attributes: [] }]
        }
      ],
      attributes: [
        [col('Product.Category.name'), 'category'],
        [fn('COUNT', col('Inventory.id')), 'itemCount'],
        [fn('SUM', col('Inventory.quantity')), 'totalQuantity'],
        [fn('SUM', literal('Inventory.quantity * Product.price')), 'totalValue']
      ],
      group: ['Product.Category.id'],
      order: [[fn('SUM', literal('Inventory.quantity * Product.price')), 'DESC']],
      raw: true
    });

    /* ---------------- STORE BREAKDOWN ---------------- */
    const storeBreakdown = await Inventory.findAll({
      where,
      include: [
        { model: Store, attributes: [] },
        { model: Product, attributes: [] }
      ],
      attributes: [
        [col('Store.name'), 'store'],
        [fn('COUNT', col('Inventory.id')), 'itemCount'],
        [fn('SUM', col('Inventory.quantity')), 'totalQuantity'],
        [fn('SUM', literal('Inventory.quantity * Product.price')), 'totalValue']
      ],
      group: ['Store.id'],
      order: [[fn('SUM', literal('Inventory.quantity * Product.price')), 'DESC']],
      raw: true
    });

    /* ---------------- RESPONSE ---------------- */
    const totalQty = Number(quantitySummary?.totalQuantity || 0);
    const totalVal = Number(totalValue?.totalValue || 0);

    res.json({
      totalItems,
      totalQuantity: totalQty,
      totalValue: totalVal,
      uniqueProducts: Number(quantitySummary?.uniqueProducts || 0),
      lowStockItems,
      outOfStockItems,
      healthPercentage:
        totalItems > 0
          ? (((totalItems - lowStockItems - outOfStockItems) / totalItems) * 100).toFixed(2)
          : 0,
      categoryBreakdown,
      storeBreakdown
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

// Get inventory transactions/history
exports.getInventoryTransactions = async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    // Check if inventory exists and user has access
    const inventory = await Inventory.findByPk(id, {
      include: [{ model: Store }]
    });

    if (!inventory) {
      return res.status(404).json({ error: 'Inventory item not found' });
    }

    // Check access
    if (!await checkInventoryAccess(req.user, inventory.Store)) {
      return res.status(403).json({ error: 'Access denied to this inventory' });
    }

    const { count, rows: transactions } = await sequelize.models.Transaction.findAndCountAll({
      where: { inventoryId: id },
      include: [{
        model: User,
        as: 'PerformedBy',
        attributes: ['id', 'name', 'email']
      }],
      order: [['transactionDate', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      inventory: {
        id: inventory.id,
        productId: inventory.productId,
        storeId: inventory.storeId
      },
      total: count,
      totalPages: Math.ceil(count / limit),
      currentPage: parseInt(page),
      transactions
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Search inventory
exports.searchInventory = async (req, res) => {
  try {
    const { 
      q, 
      storeId, 
      categoryId,
      minQuantity, 
      maxQuantity,
      limit = 50 
    } = req.query;

    if (!q || q.length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }

    const where = {};

    // Apply filters
    if (storeId) where.storeId = storeId;
    if (categoryId) where['$Product.categoryId$'] = categoryId;
    
    if (minQuantity !== undefined) {
      where.quantity = { ...where.quantity, [Op.gte]: parseInt(minQuantity) };
    }
    
    if (maxQuantity !== undefined) {
      where.quantity = { ...where.quantity, [Op.lte]: parseInt(maxQuantity) };
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
        return res.json([]);
      }
    }

    // Search conditions
    where[Op.or] = [
      { '$Product.name$': { [Op.like]: `%${q}%` } },
      { '$Product.sku$': { [Op.like]: `%${q}%` } },
      { '$Product.description$': { [Op.like]: `%${q}%` } },
      { '$Category.name$': { [Op.like]: `%${q}%` } }
    ];

    const inventory = await Inventory.findAll({
      where,
      include: [
        {
          model: Product,
          include: ['Category']
        },
        { model: Store },
        { model: Room },
        { model: Rack },
        { model: Freezer }
      ],
      order: [['lastUpdated', 'DESC']],
      limit: parseInt(limit)
    });

    res.json({
      query: q,
      count: inventory.length,
      inventory
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Bulk update inventory
exports.bulkUpdateInventory = async (req, res) => {
  const t = await sequelize.transaction();
  
  try {
    const { updates, reason } = req.body;

    if (!Array.isArray(updates) || updates.length === 0) {
      await t.rollback();
      return res.status(400).json({ error: 'Updates array is required' });
    }

    const results = [];
    const errors = [];

    for (const update of updates) {
      try {
        const { id, quantity, action = 'adjust' } = update;

        const inventory = await Inventory.findByPk(id, {
          include: [{ model: Store }, { model: Product }],
          transaction: t
        });

        if (!inventory) {
          errors.push(`Inventory item ${id} not found`);
          continue;
        }

        // Check access
        if (!await checkInventoryAccess(req.user, inventory.Store)) {
          errors.push(`Access denied to inventory ${id}`);
          continue;
        }

        let newQuantity = inventory.quantity;
        
        switch (action) {
          case 'add':
            newQuantity += parseInt(quantity);
            break;
          case 'subtract':
            newQuantity -= parseInt(quantity);
            if (newQuantity < 0) newQuantity = 0;
            break;
          case 'adjust':
            newQuantity = parseInt(quantity);
            break;
          default:
            errors.push(`Invalid action for inventory ${id}`);
            continue;
        }

        const oldQuantity = inventory.quantity;
        inventory.quantity = newQuantity;
        inventory.lastUpdated = new Date();
        await inventory.save({ transaction: t });

        // Log transaction
        await sequelize.models.Transaction.create({
          inventoryId: inventory.id,
          productId: inventory.productId,
          storeId: inventory.storeId,
          oldQuantity,
          newQuantity,
          quantityChanged: newQuantity - oldQuantity,
          action,
          reason: reason || 'Bulk update',
          performedById: req.user.id,
          transactionDate: new Date()
        }, { transaction: t });

        // Check for threshold alert
        if (newQuantity <= inventory.reorderLevel) {
          await sequelize.models.Alert.create({
            inventoryId: inventory.id,
            storeId: inventory.storeId,
            productId: inventory.productId,
            alertType: 'low_stock',
            currentQuantity: newQuantity,
            threshold: inventory.reorderLevel,
            status: 'active'
          }, { transaction: t });
        }

        results.push({
          id,
          success: true,
          oldQuantity,
          newQuantity,
          product: inventory.Product.name
        });

      } catch (error) {
        errors.push(`Error updating inventory ${update.id}: ${error.message}`);
      }
    }

    await t.commit();

    res.json({
      message: `Processed ${updates.length} updates`,
      successful: results.length,
      failed: errors.length,
      results,
      errors: errors.length > 0 ? errors : null
    });

  } catch (error) {
    await t.rollback();
    res.status(500).json({ error: error.message });
  }
};

// Perform inventory audit
exports.performInventoryAudit = async (req, res) => {
  const t = await sequelize.transaction();
  
  try {
    const { storeId, roomId, rackId, freezerId, auditItems } = req.body;

    // Check store access
    const store = await Store.findByPk(storeId);
    if (!store) {
      await t.rollback();
      return res.status(404).json({ error: 'Store not found' });
    }

    if (!await checkInventoryAccess(req.user, store)) {
      await t.rollback();
      return res.status(403).json({ error: 'Access denied to this store' });
    }

    const auditResults = [];
    const discrepancies = [];
    const locationWhere = { storeId };
    
    if (roomId) locationWhere.roomId = roomId;
    if (rackId) locationWhere.rackId = rackId;
    if (freezerId) locationWhere.freezerId = freezerId;

    // Get current inventory for the location
    const currentInventory = await Inventory.findAll({
      where: locationWhere,
      include: [{ model: Product }],
      transaction: t
    });

    // Process audit items
    for (const auditItem of auditItems) {
      const { productId, countedQuantity, notes } = auditItem;

      const inventory = currentInventory.find(inv => inv.productId === productId);
      
      if (!inventory) {
        discrepancies.push({
          productId,
          expected: 0,
          counted: countedQuantity,
          discrepancy: countedQuantity,
          notes: 'Item not in expected location'
        });
        continue;
      }

      const expectedQuantity = inventory.quantity;
      const discrepancy = countedQuantity - expectedQuantity;

      auditResults.push({
        productId,
        productName: inventory.Product.name,
        expectedQuantity,
        countedQuantity,
        discrepancy,
        notes
      });

      if (discrepancy !== 0) {
        discrepancies.push({
          productId,
          productName: inventory.Product.name,
          expected: expectedQuantity,
          counted: countedQuantity,
          discrepancy,
          notes
        });

        // Update inventory to match counted quantity
        inventory.quantity = countedQuantity;
        inventory.lastUpdated = new Date();
        await inventory.save({ transaction: t });

        // Log audit transaction
        await sequelize.models.Transaction.create({
          inventoryId: inventory.id,
          productId: inventory.productId,
          storeId: inventory.storeId,
          oldQuantity: expectedQuantity,
          newQuantity: countedQuantity,
          quantityChanged: discrepancy,
          action: 'audit_adjust',
          reason: `Audit: ${notes || 'Inventory count discrepancy'}`,
          performedById: req.user.id,
          transactionDate: new Date()
        }, { transaction: t });
      }
    }

    // Create audit record
    const audit = await sequelize.models.Audit.create({
      storeId,
      roomId,
      rackId,
      freezerId,
      performedById: req.user.id,
      totalItemsAudited: auditItems.length,
      discrepanciesFound: discrepancies.length,
      auditDate: new Date()
    }, { transaction: t });

    // Add discrepancy details
    for (const discrepancy of discrepancies) {
      await sequelize.models.AuditDiscrepancy.create({
        auditId: audit.id,
        productId: discrepancy.productId,
        expectedQuantity: discrepancy.expected,
        countedQuantity: discrepancy.counted,
        discrepancy: discrepancy.discrepancy,
        notes: discrepancy.notes
      }, { transaction: t });
    }

    await t.commit();

    res.json({
      message: 'Inventory audit completed',
      audit: {
        id: audit.id,
        storeId,
        auditDate: audit.auditDate,
        performedBy: req.user.name
      },
      summary: {
        totalItemsAudited: auditItems.length,
        discrepanciesFound: discrepancies.length,
        accuracyRate: auditItems.length > 0 ? 
          ((auditItems.length - discrepancies.length) / auditItems.length * 100).toFixed(2) : 100
      },
      auditResults,
      discrepancies: discrepancies.length > 0 ? discrepancies : null
    });

  } catch (error) {
    await t.rollback();
    res.status(500).json({ error: error.message });
  }
};

// Helper function to check inventory access
async function checkInventoryAccess(user, store) {
  if (user.role === 'superadmin') return true;
  if (user.role === 'admin' && store.adminId === user.id) return true;
  if (user.role === 'store_manager' && store.managerId === user.id) return true;
  return false;
}