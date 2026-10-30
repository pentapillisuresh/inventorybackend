const express = require('express');
const router = express.Router();
const stockRequestController = require('../controllers/stockRequestController');

// Optional: add your authentication middleware
// const { authenticate } = require('../middleware/auth');

// Create a request (Outlet side)
router.post('/', /* authenticate, */ stockRequestController.createRequest);

// Get all requests (Admin sees all, Outlet sees theirs based on req.user/query)
router.get('/', /* authenticate, */ stockRequestController.getAllRequests);

// Get a specific request
router.get('/admin-dashboard', stockRequestController.getAdminDashboardData);

router.get('/:id', /* authenticate, */ stockRequestController.getRequestById);

router.get('/:id/details', stockRequestController.getRequestDetails);

// Approve / Reject a request (Admin side)
router.patch('/:id/approve', /* authenticate, */ stockRequestController.approveRequest);

// Add this route
router.patch('/:id/approveAll', stockRequestController.approveRequestItems);
module.exports = router;