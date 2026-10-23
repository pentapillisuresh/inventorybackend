const express = require('express');
const router = express.Router();
const controller = require('../controllers/outletProductController');

// Optional: add your auth middleware here
// const { authenticate, authorize } = require('../middleware/auth');

// Create
router.post('/', /* authenticate, */ controller.createProduct);

// Read
router.get('/', /* authenticate, */ controller.getAllProducts);
router.get('/low-stock/:outletId', /* authenticate, */ controller.getLowStockProducts);
router.get('/:id', /* authenticate, */ controller.getProductById);

// Update
router.put('/:id', /* authenticate, */ controller.updateProduct);
router.patch('/:id/stock', /* authenticate, */ controller.updateStock);

// Delete
router.delete('/:id', /* authenticate, */ controller.deleteProduct);         // soft delete
router.delete('/:id/hard', /* authenticate, */ controller.hardDeleteProduct); // hard delete

module.exports = router;