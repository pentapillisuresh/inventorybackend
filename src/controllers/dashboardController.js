const { Sale, OutletProduct, sequelize, Store, Outlet, Invoice, User } = require('../models');
const upload = require('../config/multer');
const { Op, fn, col, literal } = require('sequelize');
const { uploadSingle } = require('../middleware/upload');

exports.superAdmin = async (req, res) => {
  try {

    const adminCount = await User.count({
      where: {
        createdBy: req.user.id
      }
    });

    const activeCount = await Store.count({
      where: {
        adminId: req.user.id
      }
    });

    const outletsCount = await Outlet.count({
      where: {
        adminId: req.user.id
      }
    });

    const invoiceCount = await Invoice.count({
      where: {
        adminId: req.user.id
      }
    });

    const superAdminCounts = {
      activeCount,
      outletsCount,
      invoiceCount
    }
    res.status(201).json(superAdminCounts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.admin = async (req, res) => {
  try {

    const activeCount = await Store.count({
      where: {
        adminId: req.user.id
      }
    });

    const outletsCount = await Outlet.count({
      where: {
        adminId: req.user.id
      }
    });

    const invoiceCount = await Invoice.count({
      where: {
        adminId: req.user.id
      }
    });

    const adminCounts = {
      activeCount,
      outletsCount,
      invoiceCount
    }
    res.status(201).json(adminCounts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.storeManager = async (req, res) => {
  try {

    const outletsCount = await Outlet.count({
      where: {
        adminId: req.user.id
      }
    });

    const invoiceCount = await Invoice.count({
      where: {
        adminId: req.user.id
      }
    });

    const storeManager = {
      outletsCount,
      invoiceCount
    }
    res.status(201).json(storeManager);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getHomeDashboard = async (req, res) => {
  try {
    // Support both /home/:outletId and /home?outletId=3
    const outletId = req.params.outletId || req.query.outletId;

    if (!outletId) {
      return res.status(400).json({
        success: false,
        message: 'outletId is required'
      });
    }

    /* =========================================================
       1. TODAY'S SALES & TOTAL BILLS
       ========================================================= */
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const todaySalesData = await Sale.findOne({
      where: {
        outletId,
        status: 'approved',
        saleDate: { [Op.between]: [startOfDay, endOfDay] }
      },
      attributes: [
        [fn('SUM', col('totalAmount')), 'totalRevenue'],
        [fn('COUNT', col('id')), 'totalBills']
      ],
      raw: true
    });

    const sales = {
      totalRevenue: Number(todaySalesData?.totalRevenue || 0),
      totalBills: Number(todaySalesData?.totalBills || 0)
    };

    /* =========================================================
       2, 3 & 4. INVENTORY & RAW MATERIAL METRICS
       ========================================================= */

    // Helper function to get stats for a specific product type
    const getProductStats = async (type) => {
      const baseWhere = { outletId, productType: type, isActive: true };

      const [totalItems, liveStockCount, lowStock, outOfStock, inStock] = await Promise.all([
        // Total active items of this type
        OutletProduct.count({ where: baseWhere }),

        // Live stock count (has liveStock > 0)
        OutletProduct.count({ where: { ...baseWhere, liveStock: { [Op.gt]: 0 } } }),

        // Low stock (liveStock > 0 but <= thresholdQuantity)
        OutletProduct.count({
          where: {
            ...baseWhere,
            liveStock: { [Op.gt]: 0, [Op.lte]: col('thresholdQuantity') }
          }
        }),

        // Out of stock (liveStock == 0)
        OutletProduct.count({ where: { ...baseWhere, liveStock: 0 } }),

        // In stock (liveStock > thresholdQuantity)
        OutletProduct.count({
          where: {
            ...baseWhere,
            liveStock: { [Op.gt]: col('thresholdQuantity') }
          }
        })
      ]);

      return { totalItems, liveStockCount, lowStock, outOfStock, inStock };
    };

    const inventoryStats = await getProductStats('inventory');
    const rawMaterialStats = await getProductStats('raw_material');

    /* =========================================================
       5. RECENT ITEMS (Last 30 days, updated or added)
       ========================================================= */
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentItemsRaw = await OutletProduct.findAll({
      where: {
        outletId,
        updatedAt: { [Op.gte]: thirtyDaysAgo }
      },
      order: [['updatedAt', 'DESC']], // Most recently updated first
      limit: 5, // Show top 5 in the preview
      attributes: ['id', 'name', 'categoryName', 'liveStock', 'units', 'thresholdQuantity', 'productType']
    });

    // Format recent items to match the UI (e.g., "In Stock", "Low Stock")
    const recentItems = recentItemsRaw.map(item => {
      let status = 'In Stock';
      if (item.liveStock === 0) status = 'Out of Stock';
      else if (item.liveStock <= item.thresholdQuantity) status = 'Low Stock';

      return {
        id: item.id,
        name: item.name,
        category: item.productType === 'raw_material' ? 'Raw Material' : 'Food', // Or map via categoryName if you have a Category table
        units: item.units || 'Piece',
        liveQty: item.liveStock, // Using the new liveStock column
        status: status
      };
    });

    /* =========================================================
       6. LOW STOCK ALERTS COUNT
       ========================================================= */
    const totalLowStockAlerts = inventoryStats.lowStock + rawMaterialStats.lowStock;

    /* =========================================================
       FINAL RESPONSE
       ========================================================= */
    return res.status(200).json({
      success: true,
      data: {
        sales,
        inventory: {
          totalItems: inventoryStats.totalItems,
          liveStock: inventoryStats.liveStockCount,
          lowStock: inventoryStats.lowStock,
          // For the Doughnut Chart
          chart: {
            inStock: inventoryStats.inStock,
            lowStock: inventoryStats.lowStock,
            outOfStock: inventoryStats.outOfStock,
            total: inventoryStats.totalItems
          }
        },
        rawMaterials: {
          totalItems: rawMaterialStats.totalItems,
          liveStock: rawMaterialStats.liveStockCount,
          lowStock: rawMaterialStats.lowStock
        },
        recentItems,
        lowStockAlertsCount: totalLowStockAlerts
      }
    });

  } catch (error) {
    console.error('getHomeDashboard error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to load dashboard data',
      error: error.message
    });
  }
};