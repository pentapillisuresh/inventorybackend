const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const productController = require('../controllers/productController');
const { authenticate, authorize } = require('../middleware/auth');
const { checkPermission } = require('../middleware/role');

// Category routes
router.post('/categories',
  authenticate,
  authorize('admin'),
  [
    body('name').notEmpty().trim(),
    body('description').optional()
  ],
  productController.createCategory
);

router.get('/categories',
  authenticate,
  productController.getAllCategories
);

router.get('/categories/:categoryId/products',
  authenticate,
  productController.getProductsByCategory
);

// Product routes
router.post('/',
  authenticate,
  authorize('admin'),
  checkPermission('create_invoices'), // Permission for product creation
  [
    body('name').notEmpty().trim(),
    body('sku').notEmpty().trim(),
    body('categoryId').isInt(),
    body('price').isFloat({ min: 0 }),
    body('costPrice').isFloat({ min: 0 }),
    body('quantity').isInt({ min: 1 }),
    body('thresholdQuantity').optional().isInt({ min: 1 })
  ],
  productController.createProduct
);

router.get('/',
  authenticate,
  productController.getAllProducts
);

router.get('/manager/product',
  authenticate,
  productController.getProductsUnified
);

router.get('/:id',
  authenticate,
  
  productController.getProductById
);

router.get('/admin/allcount',
  authenticate,
  productController.getProductCounts
);

router.put('/:id',
  authenticate,
  authorize('admin'),
  productController.updateProduct
);

router.delete('/:id',
  authenticate,
  authorize('admin'),
  productController.deleteProduct
);

// Product distribution
router.post('/distribute/:storeId',
  authenticate,
  authorize('admin'),
  checkPermission('create_invoices'),
  productController.distributeToStore
);

// Bulk upload products from CSV/Excel
router.post('/bulk-upload',
  authenticate,
  authorize('admin'),
  productController.bulkUploadProducts
);

// Get products by threshold
router.get('/low-threshold',
  authenticate,
  productController.getLowThresholdProducts
);

module.exports = router;