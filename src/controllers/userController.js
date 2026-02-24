const { User, Store, Inventory, Expenditure,sequelize } = require('../models');
const { fn, col, literal,Op } = require('sequelize');

// SuperAdmin creates admin

exports.createAdmin = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const {
      name,
      email,
      phoneNumber,
      password,
      expiryDate,role,
      BusinessImage,
      BusinessLogo,
      maxStores,
      maxOutlet,
      amount
    } = req.body;

    // Check existing email
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Email already exists' });
    }

    // Create admin user
    const admin = await User.create(
      req.body,
      { transaction }
    );

    // Create expenditure if amount exists
    if (amount && Number(amount) > 0) {
      await exports.createUserExpenditure(
        req.user.id,
        Number(amount),
        "credit",
        "Create User",
        transaction
      );
    }

    await transaction.commit();

    res.status(201).json({
      success: true,
      data: admin,
      message: 'Admin created successfully'
    });

  } catch (error) {
    await transaction.rollback();
    res.status(500).json({ error: error.message });
  }
};


// ==============================
// Create Expenditure Function
// ==============================
exports.createUserExpenditure = async (
  adminId,
  amount,
  ledgerType,
  category,
  transaction = null
) => {
  console.log("adminId:::",adminId);

  return await Expenditure.create(
    {
      adminId,
      category,
      description: `${category} account`,
      amount: parseFloat(amount),
      ledgerType,
      date: new Date(),
      verified: true
    },
    { transaction }
  );
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

exports.updateResetPassword = async (req, res) => {
  try {
    const { id } = req.user;
    const { password } = req.body;

    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    user.password = password;
    await user.save();

    res.json({ success:true,message: 'PASSWORD updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.renewUserAccount = async (req, res) => {
  try {
    const { id } = req.params;
    const { startDate, expiryDate, planType,amount } = req.body;

    const currentUser = req.user;

    const user = await User.findByPk(id);
    // 1️⃣ Check user exists
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // 2️⃣ Authorization rules
    if (user.createdBy !== currentUser.id) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to renew this user"
      });
    }

    // 3️⃣ Update renewal fields
    user.startDate = startDate || new Date();
    user.expiryDate = expiryDate;
    user.isActive = true; // Reactivate account
    user.planType = planType; // Reactivate account

    await user.save();

    if (amount && Number(amount) > 0) {
      await Expenditure.create(
        {
          adminId: req.user.id,
          category: "Renewal User",
          description: "User account renewal",
          amount: parseFloat(amount),
          ledgerType:"credit",
          date: new Date(),
          verified: true
        }
      );
    }

    res.status(200).json({
      success: true,
      message: "User renewed successfully",
      data: user
    });

  } catch (error) {
    console.error("Renew User Error:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};


exports.updateAdminAccount = async (req, res) => {
  try {
    const { id } = req.params;

    const admin = await User.findByPk(id);

    if (!admin || admin.role !== "admin") {
      return res.status(404).json({ error: "Admin not found" });
    }

    const {
      name,
      email,
      phoneNumber,
      maxStores,
      maxOutlet,
      expiryDate,
      isActive,
      permissions,
      password
    } = req.body;

    // ===== Update allowed basic fields =====
    if (name !== undefined) admin.name = name;
    if (email !== undefined) admin.email = email;
    if (phoneNumber !== undefined) admin.phoneNumber = phoneNumber;
    if (maxStores !== undefined) admin.maxStores = maxStores;
    if (maxOutlet !== undefined) admin.maxOutlet = maxOutlet;
    if (expiryDate !== undefined) admin.expiryDate = expiryDate;
    if (isActive !== undefined) admin.isActive = isActive;

    // ===== Update password (auto hashed by hook) =====
    if (password) {
      admin.password = password; // will hash automatically via beforeUpdate hook
    }

    // ===== Update permissions safely (merge existing + new) =====
    if (permissions) {
      admin.permissions = {
        ...admin.permissions,
        ...permissions
      };
    }

    await admin.save();

    res.status(200).json({
      message: "Admin updated successfully",
      admin
    });

  } catch (error) {
    console.error("Update Admin Error:", error);
    res.status(500).json({ error: error.message });
  }
};


exports.deleteUser = async (req, res) => {
  try {
    const { id, isActive } = req.params;
    const currentUserId = req.user.id;

    const user = await User.findByPk(id);

    // 1️⃣ Check if user exists
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // 2️⃣ Prevent deleting yourself (optional but recommended)
    if (user.id === currentUserId) {
      return res.status(400).json({ error: "You cannot delete yourself" });
    }

    // 3️⃣ Check ownership
    if (user.createdBy !== currentUserId) {
      return res.status(403).json({ error: "Not authorized to delete this user" });
    }

    // 4️⃣ Soft delete
    user.isActive = isActive;
    await user.save();

    res.status(200).json({
      success: true,
      message: "User deactivated successfully",
      data: user
    });

  } catch (error) {
    console.error("Delete User Error:", error);
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

    const storeManager = await User.findByPk(id);
    if (!storeManager || storeManager.role !== 'store_manager') {
      return res.status(404).json({ error: 'Store manager not found' });
    }

    const {
      name,
      email,
      phoneNumber,
      maxStores,
      maxOutlet,
      expiryDate,
      isActive,
      permissions,
      password
    } = req.body;

    // ===== Update allowed basic fields =====
    if (name !== undefined) storeManager.name = name;
    if (email !== undefined) storeManager.email = email;
    if (phoneNumber !== undefined) storeManager.phoneNumber = phoneNumber;
    if (maxStores !== undefined) storeManager.maxStores = maxStores;
    if (maxOutlet !== undefined) storeManager.maxOutlet = maxOutlet;
    if (expiryDate !== undefined) storeManager.expiryDate = expiryDate;
    if (isActive !== undefined) storeManager.isActive = isActive;

    // ===== Update password (auto hashed by hook) =====
    if (password) {
      storeManager.password = password; // will hash automatically via beforeUpdate hook
    }

    // ===== Update permissions safely (merge existing + new) =====
    if (permissions) {
      storeManager.permissions = {
        ...storeManager.permissions,
        ...permissions
      };
    }
    await storeManager.save();


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

exports.getManagersByCreatedby = async (req, res) => {
  try {
    const { createdBy } = req.params;
    const managers = await User.findAll({
      where: { createdBy, role: "store_manager" },
      include: [
        {
          model: User,
          as: 'CreatedUsers',
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

exports.getAllUserByCreatedby = async (req, res) => {
  const { createdBy } = req.params;

  try {
    const today = new Date();

    // Define "about to expire" range (next 7 days)
    const sevenDaysLater = new Date();
    sevenDaysLater.setDate(today.getDate() + 7);

    // Helper function
    const getCounts = async (role) => {
      const active = await User.count({
        where: { role, createdBy, isActive: true }
      });

      const inactive = await User.count({
        where: { role, createdBy, isActive: false }
      });

      const aboutToExpire = await User.count({
        where: {
          role, createdBy,
          expiryDate: {
            [Op.between]: [today, sevenDaysLater]
          }
        }
      });

      const expired = await User.count({
        where: {
          role, createdBy,
          expiryDate: {
            [Op.lt]: today
          }
        }
      });

      return { active, inactive, aboutToExpire, expired };
    };

    const adminStats = await getCounts('admin');
    const managerStats = await getCounts('store_manager');

    res.json({
      success: true,
      data: {
        admin: adminStats,
        store_manager: managerStats
      }
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
