const { Op } = require('sequelize');
const { sequelize, RawMaterialUsage, OutletProduct } = require('../models');

/* =========================================================
   1. Add Raw Material Usage
   POST /api/raw-material-usages
========================================================= */
exports.createUsage = async (req, res) => {
  // Start a transaction to ensure atomicity (deduct stock + create record)
  const t = await sequelize.transaction();
  try {
    const { outletProductId, quantityUsed, usageType, remarks, date, outletId, createdBy } = req.body;

    // 1. Basic Validation
    if (!outletProductId || !quantityUsed || quantityUsed <= 0) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: 'Valid outletProductId and quantityUsed (> 0) are required.'
      });
    }

    // 2. Check if the Raw Material exists in OutletProduct (REQUIREMENT 3)
    const rawMaterial = await OutletProduct.findByPk(outletProductId, {
      transaction: t,
      lock: t.LOCK.UPDATE // Lock row to prevent race conditions
    });

    if (!rawMaterial) {
      await t.rollback();
      return res.status(404).json({
        success: false,
        message: 'Raw material not found in the outlet products inventory.'
      });
    }

    // Optional: Ensure it actually is a raw material
    if (rawMaterial.productType !== 'raw_material') {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: 'The specified product is not categorized as a raw material.'
      });
    }

    // 3. Check if there is enough stock available
    if (Number(rawMaterial.quantity) < Number(quantityUsed)) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: `Insufficient stock. Available: ${rawMaterial.quantity} ${rawMaterial.units}, Requested: ${quantityUsed}`
      });
    }

    // 4. Deduct stock from OutletProduct (REQUIREMENT 2)
    const newQuantity = Number(rawMaterial.quantity) - Number(quantityUsed);
    const newReservedStock = Number(rawMaterial.reservedStock) - Number(quantityUsed);

    rawMaterial.quantity = newQuantity;
    rawMaterial.reservedStock = newReservedStock >= 0 ? newReservedStock : 0; // Prevent negative live stock
    await rawMaterial.save({ transaction: t });

    // 5. Create the Usage record (REQUIREMENT 1)
    const cost = Number(rawMaterial.costPrice || rawMaterial.price || 0) * Number(quantityUsed);

    const usage = await RawMaterialUsage.create({
      outletProductId,
      outletId: outletId || rawMaterial.outletId,
      quantityUsed,
      unit: rawMaterial.units,
      usageType,
      remarks,
      date: date || new Date(),
      costAtTimeOfUsage: cost,
      createdBy
    }, { transaction: t });

    // Commit the transaction
    await t.commit();

    return res.status(201).json({
      success: true,
      message: 'Raw material usage recorded and stock updated successfully.',
      data: usage
    });

  } catch (error) {
    // Rollback everything if any error occurs
    await t.rollback();
    console.error('createUsage error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to record usage',
      error: error.message
    });
  }
};

/* =========================================================
   2. Get Usage History
   GET /api/raw-material-usages
========================================================= */
exports.getUsages = async (req, res) => {
  try {
    const { outletId, outletProductId, fromDate, toDate, page = 1, limit = 10 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const where = {};
    if (outletId) where.outletId = outletId;
    if (outletProductId) where.outletProductId = outletProductId;

    if (fromDate || toDate) {
      where.date = {};
      if (fromDate) where.date[Op.gte] = new Date(fromDate);
      if (toDate) {
        const end = new Date(toDate);
        end.setHours(23, 59, 59, 999);
        where.date[Op.lte] = end;
      }
    }

    const { count, rows } = await RawMaterialUsage.findAndCountAll({
      where,
      include: [
        {
          model: OutletProduct,
          as: 'rawMaterial',
          attributes: ['name', 'sku', 'categoryName', 'units']
        }
      ],
      order: [['date', 'DESC']],
      limit: Number(limit),
      offset: offset
    });

    return res.status(200).json({
      success: true,
      total: count,
      page: Number(page),
      totalPages: Math.ceil(count / limit),
      data: rows
    });

  } catch (error) {
    console.error('getUsages error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch usage history',
      error: error.message
    });
  }
};