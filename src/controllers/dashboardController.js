const { Product, Category, Inventory, sequelize, Store, Outlet, Invoice, User } = require('../models');
const upload = require('../config/multer');
const { Op } = require('sequelize'); // Add this
const { uploadSingle } = require('../middleware/upload');

exports.superAdmin = async (req, res) => {
  try {

    const adminCount = await User.count({where:{
      createdBy: req.user.id}
    });

    const activeCount = await Store.count({where:{
            adminId: req.user.id}
    });

    const outletsCount = await Outlet.count({where:{
            adminId: req.user.id}
    });

    const invoiceCount = await Invoice.count({where:{
            adminId: req.user.id}
    });

    const superAdminCounts={
      activeCount,
      outletsCount,
      invoiceCount
    }
    res.status(201).json(superAdminCounts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.admin = async (req, res) => {
  try {

    const activeCount = await Store.count({where:{
            adminId: req.user.id}
    });

    const outletsCount = await Outlet.count({where:{
            adminId: req.user.id}
    });

    const invoiceCount = await Invoice.count({where:{
            adminId: req.user.id}
    });

    const adminCounts={
      activeCount,
      outletsCount,
      invoiceCount
    }
    res.status(201).json(adminCounts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.storeManager = async (req, res) => {
  try {

    const outletsCount = await Outlet.count({where:{
            adminId: req.user.id}
    });

    const invoiceCount = await Invoice.count({where:{
            adminId: req.user.id}
    });

    const storeManager={
      outletsCount,
      invoiceCount
    }
    res.status(201).json(storeManager);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
