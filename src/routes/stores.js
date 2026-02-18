const express = require('express');
const router = express.Router();
const storeController = require('../controllers/storeController');
const inventoryController = require('../controllers/inventoryController');
const invoiceController = require('../controllers/invoiceController');
const ticketController = require('../controllers/ticketController');
const { authenticate, authorize } = require('../middleware/auth');
const { checkPermission, checkStoreAccess } = require('../middleware/role');
const userController = require('../controllers/userController');

// Store CRUD operations
router.post('/', 
  authenticate, 
  authorize('admin'), 
  checkPermission('create_store'),
  storeController.createStore
);

router.get('/', 
  authenticate, 
  storeController.getAllStores
);

router.get('/:storeId', 
  authenticate, 
  checkStoreAccess,
  storeController.getStoreById
);

router.put('/:storeId', 
  authenticate, 
  authorize('admin'), 
  checkStoreAccess,
  storeController.updateStore
);

// Room management
router.post('/:storeId/rooms',
  authenticate,
  authorize('admin', 'store_manager'),
  checkStoreAccess,
  checkPermission('create_store'),
  storeController.createRoom
);

router.get('/:storeId/rooms',
  authenticate,
  checkStoreAccess,
  storeController.getStoreRooms
);

// Rack management
router.post('/rooms/:roomId/racks',
  authenticate,
  authorize('admin', 'store_manager'),
  checkPermission('create_store'),
  storeController.createRack
);

// Freezer management
router.post('/rooms/:roomId/freezers',
  authenticate,
  authorize('admin', 'store_manager'),
  checkPermission('create_store'),
  storeController.createFreezer
);

// Outlet management
router.post('/:storeId/outlets',
  authenticate,
  authorize('admin', 'store_manager'),
  checkStoreAccess,
  checkPermission('create_outlets'),
  storeController.createOutlet
);

router.get('/:storeId/outlets',
  authenticate,
  checkStoreAccess,
  storeController.getStoreOutlets
);

router.get('/:storeId/outlets/:outletId/orders',
  authenticate,
  checkStoreAccess,
  storeController.getStoreOutletsOrders
);

// Store hierarchy
router.get('/:storeId/hierarchy',
  authenticate,
  checkStoreAccess,
  storeController.getStoreHierarchy
);

// Inventory routes for store
router.get('/:storeId/inventory',
  authenticate,
  checkStoreAccess,
  inventoryController.getStoreInventory
);

router.get('/:storeId/inventory/summary',
  authenticate,
  checkStoreAccess,
  inventoryController.getInventorySummary
);

router.get('/:storeId/inventory/low-stock',
  authenticate,
  checkStoreAccess,
  inventoryController.getLowStockAlerts
);

// Invoice routes for store
router.post('/:storeId/outlets/:outletId/invoices',
  authenticate,
  authorize('admin', 'store_manager'),
  checkStoreAccess,
  checkPermission('create_invoices'),
  invoiceController.createOutletInvoiceWithItem
);

router.post('/:storeId/invoices/payment/:outletId',
  authenticate,
  authorize('admin', 'store_manager'),
  checkStoreAccess,
  checkPermission('create_invoices'),
  invoiceController.createOutletInvoice
);

router.get('/:storeId/invoices',
  authenticate,
  checkStoreAccess,
  invoiceController.getAllInvoices
);

// Ticket/Dishonour ticket routes
router.post('/:storeId/tickets',
  authenticate,
  authorize('admin', 'store_manager'),
  checkStoreAccess,
  ticketController.createTicket
);

router.get('/:storeId/tickets',
  authenticate,
  checkStoreAccess,
  ticketController.getStoreTickets
);

router.put('/:storeId/tickets/:ticketId/resolve',
  authenticate,
  authorize('admin'),
  checkStoreAccess,
  ticketController.resolveTicket
);

// DELETE /api/stores/:storeId
router.delete('/:storeId', 
  authenticate, 
  authorize('admin'), 
  checkStoreAccess, 
  storeController.softDeleteStore);

  router.get('/UnassignedStores',
    authenticate,
    authorize('admin'),
    checkStoreAccess, 
    userController.getUnassignedStoresByAdmin
  );
  

module.exports = router;