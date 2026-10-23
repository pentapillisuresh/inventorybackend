const express = require('express');
const router = express.Router();
const saleController = require('../controllers/saleController');

// ⚠️ IMPORTANT: specific routes BEFORE parameterized routes
router.get('/reports', saleController.getSalesReport);
router.get('/reports/products', saleController.getProductReport);

// CRUD / lifecycle
router.post('/', saleController.createSale);
router.get('/', saleController.getAllSales);
router.get('/:id', saleController.getSaleById);

// Status transitions
router.patch('/:id/approve', saleController.approveSale);   // deducts stock
router.patch('/:id/reject', saleController.rejectSale);
router.patch('/:id/cancel', saleController.cancelSale);     // restores stock if approved

module.exports = router;