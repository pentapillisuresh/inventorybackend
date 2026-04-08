const { Store } = require("../models");

exports.checkPermission = (permission) => {
  return (req, res, next) => {

    if (req.user.role === 'superadmin') {
      return next();
    }

    let permissions = req.user.permissions;

    // 🔥 Fix: convert string → object
    if (typeof permissions === 'string') {
      try {
        permissions = JSON.parse(permissions);
      } catch (err) {
        return res.status(500).json({
          error: 'Invalid permissions format'
        });
      }
    }

    if (!permissions || !permissions[permission]) {
      return res.status(403).json({ 
        permission: permissions,
        error: `Permission denied: ${permission} required` 
      });
    }

    next();
  };
};
  
  exports.checkStoreAccess = async (req, res, next) => {
    try {
      const { storeId } = req.params;
      const user = req.user;
  
      if (user.role === 'superadmin') {
        return next();
      }
  
      if (user.role === 'admin') {
        const store = await Store.findByPk(storeId);
        if (!store || store.adminId !== user.id) {
          return res.status(403).json({ error: 'Access denied to this store' });
        }
      }
  
      if (user.role === 'store_manager') {
        const store = await Store.findByPk(storeId);
        if (!store || store.managerId !== user.id) {
          return res.status(403).json({ error: 'Access denied to this store' });
        }
      }
  
      next();
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };