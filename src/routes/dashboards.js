const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const productController = require('../controllers/productController');
const dashboardController = require('../controllers/dashboardController');
const { authenticate, authorize } = require('../middleware/auth');
const { checkPermission } = require('../middleware/role');

// superAdmin routes
router.post('/superadmin',
  authenticate,
  authorize('superadmin'),
  dashboardController.superAdmin
);

// admin routes
router.post('/admin',
  authenticate,
  authorize('admin'),
  dashboardController.admin
);

// storeManager routes
router.post('/store_manager',
  authenticate,
  authorize('store_manager'),
  dashboardController.storeManager
);


module.exports = router;