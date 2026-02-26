const express = require('express');
const router = express.Router();
const inventoryController = require('../controllers/inventoryController');
const invoiceController = require('../controllers/invoiceController');
const productController = require('../controllers/productController');
const { authenticate, authorize } = require('../middleware/auth');
const { checkStoreAccess, checkPermission } = require('../middleware/role');

router.post('/distribute/:storeId',
  authenticate,
  authorize('admin'),
  checkPermission('create_invoices'),
  productController.distributeToStore
);

// Get all inventory (admin/superadmin only)
router.get('/',
  authenticate,
  authorize('superadmin', 'admin'),
  invoiceController.getAllInvoices
);

router.get('/storeManager',
  authenticate,
  authorize('store_manager'),
  invoiceController.getAllInvoicesByStoreManager
);

// Get inventory by store
router.get('/allInvoices/admin',
  authenticate,
  invoiceController.getAllInvoicesByAdmin
);

router.get('/allDistributed/Invoices/admin',
  authenticate,
  invoiceController.getAllDistributedInvoicesByAdmin
);
router.get('/allNonDistributed/Invoices/admin',
  authenticate,
  invoiceController.getAllNonDistributionInvoicesByAdmin
);

// Move inventory to different location
router.post('/:id/move',
  authenticate,
  authorize('store_manager'),
  inventoryController.moveInventory
);

// Get inventory summary
router.get('/summary',
  authenticate,
  inventoryController.getOverallSummary
);


module.exports = router;