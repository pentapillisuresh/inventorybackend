const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const outletController = require('../controllers/outletController');
const { authenticate, authorize } = require('../middleware/auth');
const { checkPermission, checkStoreAccess } = require('../middleware/role');

/* ========================================================
   1. STATIC ROUTES (Must go first)
======================================================== */

// Get outlets by phone number (For login / initial fetch)
router.get('/by-phone', /* authenticate, */ outletController.getOutletsByPhoneNumber);

// Get outlets by store
router.get('/store/:storeId',
  authenticate,
  checkStoreAccess,
  outletController.getOutletsByStore
);

// Bulk update outlets
router.post('/bulk-update',
  authenticate,
  authorize('admin'),
  outletController.bulkUpdateOutlets
);

// Create outlet
router.post('/',
  authenticate,
  authorize('admin', 'store_manager'),
  checkPermission('create_outlets'),
  outletController.createOutlet
);

// Get all outlets
router.get('/',
  authenticate,
  outletController.getAllOutlets
);

/* ========================================================
   2. PARAMETERIZED ROUTES (:id) (Must go last)
======================================================== */

// Get outlet by ID
router.get('/:id',
  authenticate,
  outletController.getOutletById
);

// Update outlet
router.put('/:id',
  authenticate,
  authorize('admin', 'store_manager'),
  outletController.updateOutlet
);

// Delete outlet
router.delete('/:id',
  authenticate,
  authorize('admin'),
  outletController.deleteOutlet
);

// Get outlet sales/invoices
router.get('/:id/invoices',
  authenticate,
  outletController.getOutletInvoices
);

// Get outlet statistics
router.get('/:id/stats',
  authenticate,
  outletController.getOutletStats
);

// Activate/deactivate outlet
router.patch('/:id/status',
  authenticate,
  authorize('admin'),
  outletController.toggleOutletStatus
);

module.exports = router;