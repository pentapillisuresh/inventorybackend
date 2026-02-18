const { Store, Room, Rack, Freezer, Outlet, User,sequelize, Invoice, Inventory, Product } = require('../models');
const { fn, col, literal,where} = require('sequelize');
// Create store
exports.createStore = async (req, res) => {
  try {
    const { name, address, phoneNumber, email, creditLimit } = req.body;

    const store = await Store.create({
      name,
      address,
      phoneNumber,
      email,
      creditLimit,
      adminId: req.user.id
    });

    // Create dummy outlet
    await Outlet.create({
      name: `${name} - Dummy Outlet`,
      type: 'dummy',
      storeId: store.id,
      address
    });

    res.status(201).json(store);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Create room in store
exports.createRoom = async (req, res) => {
  try {
    const { storeId } = req.params;
    const { name, roomNumber, capacity } = req.body;

    const room = await Room.create({
      name,
      roomNumber,
      storeId,
      capacity
    });

    res.status(201).json(room);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Create rack in room
exports.createRack = async (req, res) => {
  try {
    const { roomId } = req.params;
    const { name, rackNumber, capacity } = req.body;

    const rack = await Rack.create({
      name,
      rackNumber,
      roomId,
      capacity
    });

    res.status(201).json(rack);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Create freezer in room
exports.createFreezer = async (req, res) => {
  try {
    const { roomId } = req.params;
    const { name, freezerNumber, temperature, capacity } = req.body;

    const freezer = await Freezer.create({
      name,
      freezerNumber,
      roomId,
      temperature,
      capacity
    });

    res.status(201).json(freezer);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Create custom outlet
exports.createOutlet = async (req, res) => {
  try {
    const { storeId } = req.params;
    const { name, address, contactPerson, phoneNumber } = req.body;

    const outlet = await Outlet.create({
      name,
      type: 'custom',
      storeId,
      address,
      contactPerson,
      phoneNumber
    });

    res.status(201).json(outlet);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get store hierarchy
exports.getStoreHierarchy = async (req, res) => {
  try {
    const { storeId } = req.params;

    const store = await Store.findByPk(storeId, {
      include: [
        {
          model: Room,
          include: [
            { model: Rack },
            { model: Freezer }
          ]
        },
        { model: Outlet }
      ]
    });

    if (!store) {
      return res.status(404).json({ error: 'Store not found' });
    }

    res.json(store);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get all stores (Admin sees their stores, SuperAdmin sees all, StoreManager sees their assigned store)

exports.getAllStores = async (req, res) => {
  try {
    const where = {};

    // Role-based filtering
    if (req.user.role === 'admin') {
      where.adminId = req.user.id;
    } else if (req.user.role === 'store_manager') {
      where.managerId = req.user.id;
    }

    const stores = await Store.findAll({
      where,
      attributes: {
        include: [
          // ✅ total product quantity
          [
            sequelize.literal(`(
              SELECT COALESCE(SUM(i.quantity), 0)
              FROM Inventories i
              WHERE i.storeId = Store.id
            )`),
            'totalProductQuantity'
          ],

          // ✅ stock value (quantity * product price)
          [
            sequelize.literal(`(
              SELECT COALESCE(SUM(i.quantity * p.price), 0)
              FROM Inventories i
              JOIN Products p ON p.id = i.productId
              WHERE i.storeId = Store.id
            )`),
            'stockValue'
          ],

          // ✅ number of rooms
          [
            sequelize.literal(`(
              SELECT COUNT(*)
              FROM Rooms r
              WHERE r.storeId = Store.id
            )`),
            'roomCount'
          ],

          // ✅ number of racks
          [
            sequelize.literal(`(
              SELECT COUNT(*)
              FROM Racks rk
              JOIN Rooms r ON r.id = rk.roomId
              WHERE r.storeId = Store.id
            )`),
            'rackCount'
          ],

          // ✅ number of freezers
          [
            sequelize.literal(`(
              SELECT COUNT(*)
              FROM Freezers f
              JOIN Rooms r ON r.id = f.roomId
              WHERE r.storeId = Store.id
            )`),
            'freezerCount'
          ]
        ]
      },
      include: [
        {
          model: User,
          as: 'Admin',
          attributes: ['id', 'name', 'email']
        },
        {
          model: User,
          as: 'Manager',
          attributes: ['id', 'name', 'email', 'phoneNumber']
        }
      ],
      order: [['name', 'ASC']]
    });

    res.json({
      success: true,
      data: stores
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Get store by ID
exports.getStoreById = async (req, res) => {
  try {
    const { storeId } = req.params;

    const store = await Store.findByPk(storeId, {
      include: [
        {
          model: User,
          as: 'Admin',
          attributes: ['id', 'name', 'email']
        },
        {
          model: User,
          as: 'Manager',
          attributes: ['id', 'name', 'email']
        }
      ]
    });

    const summary = await Inventory.findOne({
      where: { storeId },
      attributes: [
        [fn('COUNT', literal('DISTINCT productId')), 'totalProducts'],
        [fn('SUM', col('Inventory.quantity')), 'totalItems'],
        [
          fn(
            'SUM',
            literal(
              'Inventory.quantity * COALESCE(Product.costPrice, Product.price)'
            )
          ),
          'stockValue'
        ]
      ],
      include: [
        {
          model: Product,
          attributes: []
        }
      ],
      raw: true
    });
// ---------------------------
    // Rooms list (store-level)
    // ---------------------------
    const rooms = await Room.findAll({
      where: { storeId },
      attributes: ['id', 'name', 'roomNumber', 'capacity', 'currentOccupancy'],
      order: [['name', 'ASC']]
    });

    // ---------------------------
    // Racks list (via rooms)
    // ---------------------------
    const racks = await Rack.findAll({
      include: [
        {
          model: Room,
          where: { storeId },
          attributes: []
        }
      ],
      attributes: ['id', 'name', 'rackNumber', 'capacity', 'currentOccupancy'],
      order: [['name', 'ASC']]
    });

    // ---------------------------
    // Freezers list (via rooms)
    // ---------------------------
    const freezers = await Freezer.findAll({
      include: [
        {
          model: Room,
          where: { storeId },
          attributes: []
        }
      ],
      attributes: [
        'id',
        'name',
        'freezerNumber',
        'temperature',
        'capacity',
        'currentOccupancy'
      ],
      order: [['name', 'ASC']]
    });

    const inventory = await Inventory.findAll({
      where: { storeId },
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

    const {count, rows: invoices } = await Invoice.findAndCountAll({
      where: { storeId },
      include: [
        { model: Store },
        { model: Outlet },
        { model: User, as: 'Admin', attributes: ['id', 'name', 'email'] },
        { model: User, as: 'StoreManager', attributes: ['id', 'name', 'email'] }
      ],
      order: [['invoiceDate', 'DESC']],
    });

    if (!store) {
      return res.status(404).json({ error: 'Store not found' });
    }

    res.json({      
      success: true,
      data: store,
      storeId,
      totalProducts: Number(summary.totalProducts || 0),
      totalItems: Number(summary.totalItems || 0),
      stockValue: Number(summary.stockValue || 0),
      rooms,
      racks,
      freezers,
      inventory,
      invoices
});
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// update store
exports.updateStore = async (req, res) => {
  console.log("rrr")
  try {
    const { storeId } = req.params;
    const {
      name,
      address,
      phoneNumber,
      email,
      creditLimit,
      currentCredit,
      managerId,
      isActive
    } = req.body;

    const store = await Store.findByPk(storeId);

    if (!store) {
      return res.status(404).json({ error: 'Store not found' });
    }

    if (req.user.role === 'admin' && store.adminId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const updates = {};
    if (name !== undefined) updates.name = name;
    if (address !== undefined) updates.address = address;
    if (phoneNumber !== undefined) updates.phoneNumber = phoneNumber;
    if (email !== undefined) updates.email = email;
    if (creditLimit !== undefined) updates.creditLimit = parseFloat(creditLimit);
    if (currentCredit !== undefined) updates.currentCredit = parseFloat(currentCredit);
    if (managerId !== undefined) updates.managerId = managerId;
    if (isActive !== undefined) updates.isActive = isActive;

    await store.update(updates);

    res.json({
      message: 'Store updated successfully',
      store
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get store rooms
exports.getStoreRooms = async (req, res) => {
  try {
    const { storeId } = req.params;

    const rooms = await Room.findAll({
      where: { storeId },
      include: [
        { model: Rack },
        { model: Freezer }
      ],
      order: [['roomNumber', 'ASC']]
    });

    res.json(rooms);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get store outlets
exports.getStoreOutlets = async (req, res) => {
  try {
    const { storeId } = req.params;

    const outlets = await Outlet.findAll({
      where: { storeId },
      order: [['name', 'ASC']]
    });

    res.json(outlets);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getStoreOutletsOrders = async (req, res) => {
  try {
    const { storeId,outletId } = req.params;
    const outletsOrders = await Invoice.findAll({
      where: { storeId,outletId,type:"outlet_sale" },
      order: [['invoiceDate', 'DESC']]
    });

    const outletsInvoice = await Invoice.findAll({
      where: { storeId,outletId },
      order: [['invoiceDate', 'DESC']]
    });

    res.json({
      success: true,
      message: 'orders  successfully',
      outletsOrders,
      outletsInvoice
    })
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.softDeleteStore = async (req, res) => {
  try {
    const { storeId } = req.params;

    const store = await Store.findByPk(storeId);

    if (!store) {
      return res.status(404).json({ success: false, message: 'Store not found' });
    }

    // Optional: check permission
    if (req.user.role === 'admin' && store.adminId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Soft delete
    await store.update({ isActive: false });

    res.json({
      success: true,
      message: 'Store deactivated successfully'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: error.message });
  }
};
