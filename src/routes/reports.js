const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController.js');
const { authenticate, authorize } = require('../middleware/auth');

// Generate reports
router.post('/',
  authenticate,
  reportController.generateReport
);

// Inventory reports
router.get('/inventory',
  authenticate,
  reportController.getInventoryReport
);

router.get('/inventory/low-stock',
  authenticate,
  reportController.getLowStockReport
);

router.get('/inventory/expiry',
  authenticate,
  reportController.getExpiryReport
);

// Sales/Invoice reports
router.get('/sales',
  authenticate,
  reportController.getSalesReport
);

router.get('/sales/daily',
  authenticate,
  reportController.getDailySalesReport
);

router.get('/sales/monthly',
  authenticate,
  reportController.getMonthlySalesReport
);

// Credit reports
router.get('/credit',
  authenticate,
  authorize('superadmin', 'admin'),
  reportController.getCreditReport
);

router.get('/credit/store/:storeId',
  authenticate,
  authorize('superadmin', 'admin'),
  reportController.getStoreCreditReport
);

// Expenditure reports
router.get('/expenditure',
  authenticate,
  authorize('superadmin', 'admin'),
  reportController.getExpenditureReport
);

// Performance reports
router.get('/performance',
  authenticate,
  authorize('superadmin', 'admin'),
  reportController.getPerformanceReport
);

// Profit/Loss report
router.get('/profit-loss',
  authenticate,
  authorize('superadmin', 'admin'),
  reportController.getProfitLossReport
);

// Export reports
router.post('/export',
  authenticate,
  reportController.exportReport
);

// Dashboard statistics
router.get('/dashboard/stats',
  authenticate,
  reportController.getDashboardStats
);

// Custom report generation
router.post('/custom',
  authenticate,
  authorize('superadmin', 'admin'),
  reportController.generateCustomReport
);

module.exports = router;