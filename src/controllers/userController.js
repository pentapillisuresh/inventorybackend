const { User, Store, Inventory } = require('../models');
const { fn, col, literal } = require('sequelize');
const { Op } = require('sequelize');

// SuperAdmin creates admin
exports.createAdmin = async (req, res) => {
  try {
    const { name, email, phoneNumber, password, permissions, designation, expiryDate } = req.body;

    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    const admin = await User.create({
      name,
      email,
      phoneNumber,
      password,
      role: designation || 'store_manager',
      permissions: permissions || {},
      expiryDate,
      createdBy: req.user.id
    });

    res.status(201).json({
      id: admin.id,
      name: admin.name,
      email: admin.email,
      role: admin.role,
      permissions: admin.permissions,
      expiryDate: admin.expiryDate
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Update admin expiry date
exports.updateAdminExpiry = async (req, res) => {
  try {
    const { id } = req.params;
    const { expiryDate } = req.body;

    const admin = await User.findByPk(id);
    if (!admin || admin.role !== 'admin') {
      return res.status(404).json({ error: 'Admin not found' });
    }

    admin.expiryDate = expiryDate;
    await admin.save();

    res.json({ message: 'Expiry date updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Admin creates store manager
exports.createStoreManager = async (req, res) => {
  try {
    const { name, email, phoneNumber, password, storeId, permissions } = req.body;

    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    const storeManager = await User.create({
      name,
      email,
      phoneNumber,
      password,
      role: 'store_manager',
      permissions: permissions || {},
      createdBy: req.user.id
    });

    // Update store with manager ID
    const store = await Store.findByPk(storeId);
    if (store) {
      store.managerId = storeManager.id;
      await store.save();
    }

    res.status(201).json({
      id: storeManager.id,
      name: storeManager.name,
      email: storeManager.email,
      role: storeManager.role,
      permissions: storeManager.permissions
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.updateStoreManager = async (req, res) => {
  try {
    const { id } = req.params; // admin id
    const {
      name,
      email,
      phoneNumber,
      password,
      storeId,
      permissions
    } = req.body;

    // Find existing manager
    const storeManager = await User.findByPk(id);
    if (!storeManager || storeManager.role !== 'store_manager') {
      return res.status(404).json({ error: 'Store manager not found' });
    }

    // Update fields only if provided
    if (name) storeManager.name = name;
    if (email) storeManager.email = email;
    if (phoneNumber) storeManager.phoneNumber = phoneNumber;
    if (permissions) storeManager.permissions = permissions;
    if (password) storeManager.password = password; // make sure hashing is handled in model hook

    await storeManager.save();

    // Update store manager assignment if storeId provided
    if (storeId) {
      const store = await Store.findByPk(storeId);

      if (!store) {
        return res.status(404).json({ error: 'Store not found' });
      }

      store.managerId = storeManager.id;
      await store.save();
    }

    res.json({
      success: true,
      data: {
        id: storeManager.id,
        name: storeManager.name,
        email: storeManager.email,
        phoneNumber: storeManager.phoneNumber,
        role: storeManager.role,
        permissions: storeManager.permissions
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

// Get all admins (for superadmin)
exports.getAllAdmins = async (req, res) => {
  try {
    const admins = await User.findAll({
      where: { role: 'admin' },
      attributes: { exclude: ['password'] }
    });
    res.json(admins);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getStoresWithManagersByAdmin = async (req, res) => {
  try {
    const adminId = req.user.id;

    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Only admin can access this resource'
      });
    }

    const stores = await Store.findAll({
      where: {
        adminId,
        managerId: {
          [Op.ne]: null // 👈 exclude stores without manager
        }
      },
      attributes: [
        'id',
        'name',
        'address',
        'phoneNumber',
        'email',
        'isActive'
      ],
      include: [
        {
          model: User,
          as: 'Manager',
          // attributes: ['id', 'name', 'email', 'phoneNumber', 'isActive'],
          required: false // 👈 IMPORTANT (manager may be null)
        }
      ],
      order: [['name', 'ASC']]
    });

    res.json({
      success: true,
      count: stores.length,
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

exports.getManagersByAdmin = async (req, res) => {
  try {
    const adminId = req.user.id;

    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Only admin can access this resource'
      });
    }

    const stores = await Store.findAll({
      where: { adminId },
      attributes: [
        'id',
        'name',
        'address',
        'phoneNumber',
        'email',
        'isActive'
      ],
      include: [
        {
          model: User,
          as: 'Manager',
          attributes: [
            'id',
            'name',
            'email',
            'phoneNumber',
            'isActive',
            'permissions',
            'expiryDate',
            'createdBy'
          ],
          required: false
        }
      ],
      order: [['name', 'ASC']]
    });

    // 🔥 merge store info into manager
    const managers = stores
      .filter(store => store.Manager) // remove stores without manager
      .map(store => ({
        id: store.Manager.id,
        name: store.Manager.name,
        email: store.Manager.email,
        phoneNumber: store.Manager.phoneNumber,
        isActive: store.Manager.isActive,
        permissions: store.Manager.permissions,
        expiryDate: store.Manager.expiryDate,
        createdBy: store.Manager.createdBy,
        storeId: store.id,
        storeName: store.name
      }));

    res.json({
      success: true,
      count: managers.length,
      data: managers
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

exports.getUnassignedStoresByAdmin = async (req, res) => {
  try {
    const adminId = req.user.id;

    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Only admin can access this resource'
      });
    }

    const stores = await Store.findAll({
      where: {
        adminId,
        managerId: null // 👈 ONLY unassigned stores
      },
      attributes: [
        'id',
        'name',
        'address',
        'phoneNumber',
        'email',
        'isActive'
      ],
      order: [['name', 'ASC']]
    });

    res.json({
      success: true,
      count: stores.length,
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

exports.getAllAdminSummery = async (req, res) => {
  try {
    const admins = await User.findAll({
      where: {
        role: 'admin',
        isActive: true
      },
      attributes: [
        'id',
        'name',
        'email',
        'phoneNumber',
        [fn('COUNT', col('stores.id')), 'storeCount']
      ],
      include: [
        {
          model: Store,
          as: 'stores', // ✅ matches User.hasMany(Store, as: 'stores')
          attributes: [],
          include: [
            {
              model: User,
              as: 'Manager', // ✅ matches Store.belongsTo(User, as: 'Manager')
              attributes: ['id', 'name', 'email'],
              where: {
                role: 'store_manager',
                isActive: true
              }
            }
          ]
        }
      ],
      group: ['User.id', 'stores.Manager.id']
    });

    res.json({
      success: true,
      data: admins
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};


exports.getAdminSummary = async (req, res) => {
  try {
    const adminId = req.user.id; // ✅ from token

    // Optional safety check
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const admin = await User.findOne({
      where: {
        id: adminId,
        role: 'admin',
        isActive: true
      },
      attributes: [
        'id',
        'name',
        'email',
        'phoneNumber',
        [fn('COUNT', col('stores.id')), 'storeCount']
      ],
      include: [
        {
          model: Store,
          as: 'stores',
          attributes: ['id', 'name', 'isActive'],
          include: [
            {
              model: User,
              as: 'Manager',
              attributes: ['id', 'name', 'email'],
              where: {
                role: 'store_manager',
                isActive: true
              }
            }
          ]
        }
      ],
      group: ['User.id', 'stores.id', 'stores.Manager.id']
    });

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found'
      });
    }

    res.json({
      success: true,
      data: admin
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};


exports.getAdminSummaryWithManagers = async (req, res) => {
  try {
    const summary = await Store.findAll({
      attributes: [
        'adminId',
        [fn('COUNT', fn('DISTINCT', col('Store.id'))), 'storeCount'],
        [fn('COUNT', col('Inventories.id')), 'productItemCount'],
        // Count of active managers under this admin
        [
          fn('COUNT', fn('DISTINCT', col('Manager.id'))),
          'activeManagerCount'
        ]
      ],
      include: [
        {
          model: Inventory,
          attributes: [],
          required: false
        },
        {
          model: User,
          as: 'Manager',
          attributes: [],
          required: false,
          where: {
            role: 'store_manager',
            isActive: true
          }
        }
      ],
      group: ['Store.adminId'],
      raw: true
    });

    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
