const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const outletExpenditureController = require('../controllers/outletExpenditureController');
const { authenticate, authorize } = require('../middleware/auth');
const upload = require('../config/multer');
const { uploadSingle } = require('../middleware/upload');
const reportController = require('../controllers/reportController');

// Create expenditure (Admin only with expenditure_management permission)
router.post('/',
  authenticate,
  upload.single('receiptImage'),
  uploadSingle('receiptImage'),
  [
    body('category').notEmpty().trim().withMessage('Category is required'),
    body('description').notEmpty().trim().withMessage('Description is required'),
    body('amount').isFloat({ min: 0.01 }).withMessage('Valid amount is required'),
    body('date').optional().isISO8601().withMessage('Valid date is required')
  ],
  outletExpenditureController.createOutletExpenditure
);

// Get all expenditures
router.get('/',
  authenticate,
  outletExpenditureController.getAllOutletExpenditures
);

router.get('/getByOutletUser',
  authenticate,
  outletExpenditureController.getByUser
);

// Get expenditure by ID
router.get('/:id',
  authenticate,
  outletExpenditureController.getOutletExpenditureById
);

router.get('/incomes/:outletId',
  authenticate,
  outletExpenditureController.getIncomesById
);

// Update expenditure (Admin only)
router.put('/:id',
  authenticate,
  upload.single('receiptImage'),
  uploadSingle('receiptImage'),
  outletExpenditureController.updateOutletExpenditure
);

// Delete expenditure (Admin only)
router.delete('/:id',
  authenticate,
  outletExpenditureController.deleteExpenditure
);

// Verify expenditure (SuperAdmin only)
router.patch('/:id/verify',
  authenticate,
  outletExpenditureController.verifyExpenditure
);

// Get expenditure summary for dashboard
router.get('/summary/dashboard',
  authenticate,
  outletExpenditureController.getDashboardSummary
);

// Export expenditures
router.get('/export/excel',
  authenticate,
  outletExpenditureController.exportOutletExpendituresToExcel
);

// In src/routes/reports.js - Add expenditure report route

router.get('/expenditure',
    authenticate,
    reportController.getExpenditureReport
  );

module.exports = router;