const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const categoryController = require('../controllers/categoryController');
const { authenticate, authorize } = require('../middleware/auth');

// Create category (Admin only)
router.post('/',
  authenticate,
  authorize('admin'),
  [
    body('name').notEmpty().trim().withMessage('Category name is required'),
    body('description').optional().trim()
  ],
  categoryController.createCategory
);

// Get all categories (All authenticated users)
router.get('/',
  authenticate,
  categoryController.getAllCategories
);

// Get category by ID
router.get('/:id',
  authenticate,
  categoryController.getCategoryById
);

// Update category (Admin only)
router.put('/:id',
  authenticate,
  authorize('admin'),
  [
    body('name').optional().trim(),
    body('description').optional().trim()
  ],
  categoryController.updateCategory
);

// Delete category (Admin only)
router.delete('/:id',
  authenticate,
  authorize('admin'),
  categoryController.deleteCategory
);

// Get products by category
router.get('/:categoryId/products',
  authenticate,
  categoryController.getProductsByCategory
);

// Bulk create categories (Admin only)
router.post('/bulk',
  authenticate,
  authorize('admin'),
  categoryController.bulkCreateCategories
);

// Get category statistics
router.get('/:id/stats',
  authenticate,
  authorize('admin'),
  categoryController.getCategoryStats
);

module.exports = router;