const express = require('express');
const router = express.Router();
const controller = require('../controllers/rawMaterialUsageController');

// Add usage (deducts stock)
router.post('/', controller.createUsage);

// Get usage history
router.get('/', controller.getUsages);

module.exports = router;