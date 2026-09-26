const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const expenditureController = require('../controllers/expenditureController');
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
  expenditureController.createExpenditure
);

// Get all expenditures
router.get('/',
  authenticate,
  expenditureController.getAllExpenditures
);

router.get('/:UserId/getByUser',
  authenticate,
  expenditureController.getByUser
);

// Get expenditure by ID
router.get('/:id',
  authenticate,
  expenditureController.getExpenditureById
);

router.get('/incomes/:adminId',
  authenticate,
  expenditureController.getIncomesById
);

// Update expenditure (Admin only)
router.put('/:id',
  authenticate,
  upload.single('receiptImage'),
  uploadSingle('receiptImage'),
  expenditureController.updateExpenditure
);

// Delete expenditure (Admin only)
router.delete('/:id',
  authenticate,
  expenditureController.deleteExpenditure
);

// Verify expenditure (SuperAdmin only)
router.patch('/:id/verify',
  authenticate,
  authorize('superadmin'),
  expenditureController.verifyExpenditure
);

// Get expenditure summary for dashboard
router.get('/summary/dashboard',
  authenticate,
  expenditureController.getDashboardSummary
);

// Export expenditures
router.get('/export/excel',
  authenticate,
  expenditureController.exportExpendituresToExcel
);

// In src/routes/reports.js - Add expenditure report route

router.get('/expenditure',
    authenticate,
    reportController.getExpenditureReport
  );

module.exports = router;