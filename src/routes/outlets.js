const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const outletController = require('../controllers/outletController');
const { authenticate, authorize } = require('../middleware/auth');
const { checkPermission, checkStoreAccess } = require('../middleware/role');

// Create outlet (Admin or Store Manager with permission)
router.post('/',
  authenticate,
  authorize('admin', 'store_manager'),
  checkPermission('create_outlets'),
  [
    body('name').notEmpty().trim().withMessage('Outlet name is required'),
    body('storeId').isInt().withMessage('Valid store ID is required'),
    body('address').optional().trim(),
    body('contactPerson').optional().trim(),
    body('phoneNumber').optional().trim(),
    body('creditLimit').optional().trim()
  ],
  outletController.createOutlet
);

// Get all outlets (Filtered by role)
router.get('/',
  authenticate,
  outletController.getAllOutlets
);

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

// Delete outlet (Admin only)
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

// Get outlets by store
router.get('/store/:storeId',
  authenticate,
  checkStoreAccess,
  outletController.getOutletsByStore
);

// Activate/deactivate outlet
router.patch('/:id/status',
  authenticate,
  authorize('admin'),
  outletController.toggleOutletStatus
);

// Bulk update outlets
router.post('/bulk-update',
  authenticate,
  authorize('admin'),
  outletController.bulkUpdateOutlets
);

module.exports = router;