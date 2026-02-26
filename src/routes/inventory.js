const express = require('express');
const router = express.Router();
const inventoryController = require('../controllers/inventoryController');
const { authenticate, authorize } = require('../middleware/auth');
const { checkStoreAccess } = require('../middleware/role');

// Get all inventory (admin/superadmin only)
router.get('/',
  authenticate,
  authorize('superadmin', 'admin'),
  inventoryController.getAllInventory
);

// Get inventory by store
router.get('/store/:storeId',
  authenticate,
  checkStoreAccess,
  inventoryController.getStoreInventory
);

// Update inventory quantity
router.put('/:id',
  authenticate,
  authorize('admin', 'store_manager'),
  inventoryController.updateInventory
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

// Get low stock alerts
router.get('/alerts/low-stock/:storeId',
  authenticate,
  inventoryController.getLowStockAlerts
);

// Get inventory transactions/history
router.get('/:id/transactions',
  authenticate,
  inventoryController.getInventoryTransactions
);

// Search inventory
router.get('/search',
  authenticate,
  inventoryController.searchInventory
);

// Bulk update inventory
router.post('/bulk-update',
  authenticate,
  authorize('admin'),
  inventoryController.bulkUpdateInventory
);

// Inventory audit
router.post('/audit',
  authenticate,
  authorize('admin'),
  inventoryController.performInventoryAudit
);

module.exports = router;