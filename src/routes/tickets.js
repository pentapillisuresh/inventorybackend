const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const ticketController = require('../controllers/ticketController');
const { authenticate, authorize } = require('../middleware/auth');
const { checkStoreAccess } = require('../middleware/role');

// Create ticket (Admin or Store Manager)
router.post('/',
  authenticate,
  authorize('admin', 'store_manager'),
  [
    body('storeId').isInt().withMessage('Valid store ID is required'),
    body('productId').optional().isInt(),
    body('quantityMissing').optional().isInt({ min: 0 }),
    body('description').notEmpty().trim().withMessage('Description is required'),
    body('priority').optional().isIn(['low', 'medium', 'high', 'critical']),
    body('type').optional().isIn(['inventory_discrepancy', 'damage', 'theft', 'other'])
  ],
  ticketController.createTicket
);

// Get all tickets (Filtered by role)
router.get('/',
  authenticate,
  ticketController.getAllTickets
);

// Get ticket by ID
router.get('/:id',
  authenticate,
  ticketController.getTicketById
);

// Update ticket
router.put('/:id',
  authenticate,
  authorize('admin', 'store_manager'),
  ticketController.updateTicket
);

// Resolve ticket (Admin only)
router.patch('/:id/resolve',
  authenticate,
  authorize('admin'),
  [
    body('actionTaken').notEmpty().trim().withMessage('Action taken description is required'),
    body('resolutionType').optional().isIn(['adjusted', 'investigated', 'dismissed', 'resolved']),
    body('newQuantity').optional().isInt({ min: 0 })
  ],
  ticketController.resolveTicket
);

// Acknowledge ticket (Store Manager)
router.patch('/:id/acknowledge',
  authenticate,
  authorize('store_manager'),
  ticketController.acknowledgeTicket
);

// Reopen ticket
router.patch('/:id/reopen',
  authenticate,
  authorize('admin', 'store_manager'),
  ticketController.reopenTicket
);

// Add comment to ticket
router.post('/:id/comments',
  authenticate,
  authorize('admin', 'store_manager'),
  [
    body('comment').notEmpty().trim().withMessage('Comment is required')
  ],
  ticketController.addComment
);

// Get ticket comments
router.get('/:id/comments',
  authenticate,
  ticketController.getTicketComments
);

// Get tickets by store
router.get('/store/:storeId',
  authenticate,
  checkStoreAccess,
  ticketController.getTicketsByStore
);

// Get ticket statistics
router.get('/stats/overview',
  authenticate,
  ticketController.getTicketStats
);

// Get tickets by status
router.get('/status/:status',
  authenticate,
  ticketController.getTicketsByStatus
);

// Search tickets
router.get('/search',
  authenticate,
  ticketController.searchTickets
);

// Export tickets
router.get('/export',
  authenticate,
  authorize('admin'),
  ticketController.exportTickets
);

// Bulk update ticket status
router.post('/bulk-status',
  authenticate,
  authorize('admin'),
  ticketController.bulkUpdateTicketStatus
);

module.exports = router;