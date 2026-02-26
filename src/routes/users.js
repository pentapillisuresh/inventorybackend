const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authenticate, authorize } = require('../middleware/auth');
const { checkPermission } = require('../middleware/role');

// SuperAdmin routes
router.post('/createUser',
  authenticate,
  authorize('superadmin'),
  userController.createAdmin
);

router.put('/admins/:id/expiry',
  authenticate,
  authorize('superadmin'),
  userController.updateAdminExpiry
);

router.put('/resetPassword',
  authenticate,
  userController.updateResetPassword
);

router.put('/admins/:id',
  authenticate,
  userController.updateAdminAccount
);
router.put('/admins/:id/renew',
  authenticate,
  authorize('superadmin'),
  userController.renewUserAccount
);

router.get('/admins',
  authenticate,
  authorize('superadmin'),
  userController.getAllAdmins
);

router.get('/allUser/:createdBy',
  authenticate,
  authorize('superadmin'),
  userController.getAllUserByCreatedby
);

router.get('/admin/all/store-managers',
  authenticate,
  authorize('admin'),
  userController.getManagersByAdmin
);

router.get('/:createdBy/store-managers/',
  authenticate,
  authorize('admin','superadmin'),
  userController.getManagersByCreatedby
);

router.get('/admin/store-managers',
  authenticate,
  authorize('admin'),
  userController.getStoresWithManagersByAdmin
);

router.get('/all/admins/summery',
  authenticate,
  authorize('admin'),
  userController.getAllAdminSummery
);

router.get('/admin/summery',
  authenticate,
  authorize('admin'),
  userController.getAdminSummary
);

router.get('/admin/store/summery',
  authenticate,
  authorize('admin'),
  userController.getAdminSummaryWithManagers
);

// Admin routes
router.post('/store-managers',
  authenticate,
  authorize('admin'),
  checkPermission('create_store'),
  userController.createStoreManager
);

router.put('/store-managers/:id',
  authenticate,
  authorize('admin','superadmin'),
  checkPermission('create_store'),
  userController.updateStoreManager
);

router.get('/UnassignedStores',
  authenticate,
  authorize('admin'),
  userController.getUnassignedStoresByAdmin
);

router.delete('/:id/:isActive',
  authenticate,
  authorize('admin','superadmin'),
  userController.deleteUser
);


module.exports = router;