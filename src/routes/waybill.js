const express = require('express');
const router = express.Router();
const waybillController = require('../controllers/waybillController');
const { authenticate, authorize } = require('../middleware/auth');

router.post('/create',
  authenticate,
  authorize('store_manager', 'admin','superadmin'),
  waybillController.createWaybill
);

// Get all inventory (admin/superadmin only)
router.get('/',
  authenticate,
  authorize('store_manager', 'admin'),
  waybillController.getAllWaybill
);

router.get('/:name',
  authenticate,
  authorize('store_manager', 'admin'),
  waybillController.getWaybillById
);

module.exports = router;