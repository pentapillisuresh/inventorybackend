const { OutletExpenditure, User, sequelize } = require('../models');
const { Op } = require('sequelize');
const fs = require('fs').promises;
const path = require('path');
const XLSX = require('xlsx');
const moment = require('moment');

// Create outletExpenditure (Admin office expense)
exports.createOutletExpenditure = async (req, res) => {
  try {
    const { category, description, amount, date } = req.body;

    const outletExpenditure = await OutletExpenditure.create({
      adminId: req.user.id,
      category: category.trim(),
      description: description.trim(),
      amount: parseFloat(amount),
      date: date ? new Date(date) : new Date(),
      receiptImage: req.file ? req.file.path : null,
      verified: false,// Initially not verified
      createdBy: req.user.id
    });

    res.status(201).json({
      message: 'OutletExpenditure recorded successfully',
      outletExpenditure
    });
  } catch (error) {
    // Clean up uploaded file if error occurs
    if (req.file) {
      try {
        await fs.unlink(req.file.path);
      } catch (unlinkError) {
        console.error('Error deleting uploaded file:', unlinkError);
      }
    }
    res.status(500).json({ error: error.message });
  }
};

// Get all outletExpenditures with filters
exports.getAllOutletExpenditures = async (req, res) => {
  try {
    const { 
      startDate, 
      endDate, 
      category, 
      verified,
      page = 1, 
      limit = 20 
    } = req.query;
    
    const offset = (page - 1) * limit;

    const where = {};
    
    // Date filter
    if (startDate && endDate) {
      where.date = {
        [Op.between]: [new Date(startDate), new Date(endDate)]
      };
    }
    
    // Category filter
    if (category) {
      where.category = { [Op.like]: `%${category}%` };
    }
    
    // Verified filter
    if (verified !== undefined) {
      where.verified = verified === 'true';
    }

    // Role-based filtering
    if (req.user.role === 'admin') {
      where.adminId = req.user.id;
    }
    // Superadmin can see all, store manager can't see outletExpenditures

    const { count, rows: outletExpenditures } = await OutletExpenditure.findAndCountAll({
      where,
      include: [
        {
          model: User,
          as: 'Admin',
          attributes: ['id', 'name', 'email']
        }
      ],
      order: [['date', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    // Calculate totals
    const totalAmount = await OutletExpenditure.sum('amount', { where });
    const verifiedAmount = await OutletExpenditure.sum('amount', { 
      where: { ...where, verified: true } 
    });
    const pendingAmount = await OutletExpenditure.sum('amount', { 
      where: { ...where, verified: false } 
    });

    res.json({
      summary: {
        total: count,
        totalAmount: totalAmount || 0,
        verifiedAmount: verifiedAmount || 0,
        pendingAmount: pendingAmount || 0
      },
      outletExpenditures,
      pagination: {
        total: count,
        page: parseInt(page),
        pages: Math.ceil(count / limit),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getByUser = async (req, res) => {
  try {
    const { 
      startDate, 
      endDate, 
      category, 
      verified,
      page = 1, 
      limit = 20 
    } = req.query;
    
    const offset = (page - 1) * limit;

    const where = {};
    
    // Date filter
    if (startDate && endDate) {
      where.date = {
        [Op.between]: [new Date(startDate), new Date(endDate)]
      };
    }
    
    // Category filter
    if (category) {
      where.category = { [Op.like]: `%${category}%` };
    }
    
    // Verified filter
    if (verified !== undefined) {
      where.verified = verified === 'true';
    }

    // Role-based filtering
      where.adminId = req.user.id;

    const { count, rows: outletExpenditures } = await OutletExpenditure.findAndCountAll({
      where,
      include: [
        {
          model: User,
          as: 'Admin',
          attributes: ['id', 'name', 'email']
        }
      ],
      order: [['date', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    // Calculate totals
    const totalAmount = await OutletExpenditure.sum('amount', { where });
    const verifiedAmount = await OutletExpenditure.sum('amount', { 
      where: { ...where, verified: true } 
    });
    const pendingAmount = await OutletExpenditure.sum('amount', { 
      where: { ...where, verified: false } 
    });

    res.json({
      summary: {
        total: count,
        totalAmount: totalAmount || 0,
        verifiedAmount: verifiedAmount || 0,
        pendingAmount: pendingAmount || 0
      },
      outletExpenditures,
      pagination: {
        total: count,
        page: parseInt(page),
        pages: Math.ceil(count / limit),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get outletExpenditure by ID
exports.getOutletExpenditureById = async (req, res) => {
  try {
    const { id } = req.params;

    const outletExpenditure = await OutletExpenditure.findByPk(id, {
      include: [
        {
          model: User,
          as: 'Admin',
          attributes: ['id', 'name', 'email']
        }
      ]
    });

    if (!outletExpenditure) {
      return res.status(404).json({ error: 'OutletExpenditure not found' });
    }

    // Check access
    if (req.user.role === 'admin' && outletExpenditure.adminId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(outletExpenditure);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getIncomesById = async (req, res) => {
  try {
    const { adminId } = req.params;

    const totalIncome = await OutletExpenditure.sum('amount', {
      where: {
        adminId,
        ledgerType: 'credit', // Important: only income
        category: {
          [Op.in]: ["subscription", "renew"]
        }
      }
    });

    res.status(200).json({
      success: true,
      totalIncome: totalIncome || 0
    });

  } catch (error) {
    console.error("Income Error:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Update outletExpenditure
exports.updateOutletExpenditure = async (req, res) => {
  try {
    const { id } = req.params;
    const { category, description, amount, date } = req.body;

    const outletExpenditure = await OutletExpenditure.findByPk(id);

    if (!outletExpenditure) {
      return res.status(404).json({ error: 'OutletExpenditure not found' });
    }

    // Only admin who created it can update
    if (outletExpenditure.adminId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Store old receipt for cleanup
    let oldReceiptPath = null;
    if (req.file && outletExpenditure.receiptImage) {
      oldReceiptPath = outletExpenditure.receiptImage;
    }

    // Update fields
    const updates = {};
    if (category) updates.category = category;
    if (description) updates.description = description;
    if (amount) updates.amount = parseFloat(amount);
    if (date) updates.date = new Date(date);
    if (req.file) updates.receiptImage = req.file.path;

    await outletExpenditure.update(updates);

    // Delete old receipt
    if (oldReceiptPath) {
      try {
        await fs.unlink(oldReceiptPath);
      } catch (error) {
        console.error('Error deleting old receipt:', error);
      }
    }

    res.json({
      message: 'OutletExpenditure updated successfully',
      outletExpenditure
    });
  } catch (error) {
    // Clean up uploaded file if error
    if (req.file) {
      try {
        await fs.unlink(req.file.path);
      } catch (error) {
        console.error('Error deleting uploaded file:', error);
      }
    }
    res.status(500).json({ error: error.message });
  }
};

// Delete outletExpenditure
exports.deleteExpenditure = async (req, res) => {
  try {
    const { id } = req.params;

    const outletExpenditure = await OutletExpenditure.findByPk(id);

    if (!outletExpenditure) {
      return res.status(404).json({ error: 'OutletExpenditure not found' });
    }
    await outletExpenditure.destroy();

    res.json({
      message: 'OutletExpenditure deleted successfully'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Verify outletExpenditure (SuperAdmin only)
exports.verifyOutletExpenditure = async (req, res) => {
  try {
    const { id } = req.params;
    const { verified } = req.body;

    const outletExpenditure = await OutletExpenditure.findByPk(id);

    if (!outletExpenditure) {
      return res.status(404).json({ error: 'OutletExpenditure not found' });
    }

    // Only superadmin can verify
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    outletExpenditure.verified = verified === true || verified === 'true';
    await outletExpenditure.save();

    res.json({
      message: `OutletExpenditure ${outletExpenditure.verified ? 'verified' : 'unverified'} successfully`,
      outletExpenditure
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get dashboard summary
exports.getDashboardSummary = async (req, res) => {
  try {
    const currentDate = new Date();
    const currentMonthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const currentMonthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    
    const lastMonthStart = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
    const lastMonthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth(), 0);

    // Build where clause based on user role
    let where = {};
    if (req.user.role === 'admin') {
      where.adminId = req.user.id;
    }

    // Current month stats
    const currentMonthWhere = { 
      ...where, 
      date: { [Op.between]: [currentMonthStart, currentMonthEnd] } 
    };

    const currentMonthStats = await OutletExpenditure.findOne({
      where: currentMonthWhere,
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
        [sequelize.fn('SUM', sequelize.col('amount')), 'total']
      ]
    });

    // Last month stats
    const lastMonthWhere = { 
      ...where, 
      date: { [Op.between]: [lastMonthStart, lastMonthEnd] } 
    };

    const lastMonthStats = await OutletExpenditure.findOne({
      where: lastMonthWhere,
      attributes: [
        [sequelize.fn('SUM', sequelize.col('amount')), 'total']
      ]
    });

    // Category breakdown for current month
    const categoryBreakdown = await OutletExpenditure.findAll({
      where: currentMonthWhere,
      attributes: [
        'category',
        [sequelize.fn('SUM', sequelize.col('amount')), 'amount']
      ],
      group: ['category'],
      order: [[sequelize.fn('SUM', sequelize.col('amount')), 'DESC']],
      limit: 5
    });

    // Verification stats
    const verificationStats = await OutletExpenditure.findAll({
      where: currentMonthWhere,
      attributes: [
        'verified',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
        [sequelize.fn('SUM', sequelize.col('amount')), 'amount']
      ],
      group: ['verified']
    });

    const stats = {
      currentMonth: {
        count: currentMonthStats?.dataValues?.count || 0,
        total: currentMonthStats?.dataValues?.total || 0
      },
      lastMonth: {
        total: lastMonthStats?.dataValues?.total || 0
      },
      categoryBreakdown: categoryBreakdown.map(cat => ({
        category: cat.category,
        amount: cat.dataValues.amount
      })),
      verification: {
        verified: verificationStats.find(v => v.verified)?.dataValues?.count || 0,
        pending: verificationStats.find(v => !v.verified)?.dataValues?.count || 0
      }
    };

    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Export outletExpenditures to Excel
exports.exportOutletExpendituresToExcel = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const where = {};
    
    // Date filter
    if (startDate && endDate) {
      where.date = {
        [Op.between]: [new Date(startDate), new Date(endDate)]
      };
    }

    // Role-based filtering
    if (req.user.role === 'admin') {
      where.adminId = req.user.id;
    }

    const outletExpenditures = await OutletExpenditure.findAll({
      where,
      include: [
        {
          model: User,
          as: 'Admin',
          attributes: ['name', 'email']
        }
      ],
      order: [['date', 'DESC']]
    });

    // Prepare data for Excel
    const data = outletExpenditures.map(exp => ({
      'Date': moment(exp.date).format('YYYY-MM-DD'),
      'Category': exp.category,
      'Description': exp.description,
      'Amount': exp.amount,
      'Admin': exp.Admin?.name || 'N/A',
      'Verified': exp.verified ? 'Yes' : 'No',
      'Receipt': exp.receiptImage ? 'Yes' : 'No'
    }));

    // Create workbook
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    
    // Set column widths
    const wscols = [
      { wch: 12 }, // Date
      { wch: 20 }, // Category
      { wch: 40 }, // Description
      { wch: 15 }, // Amount
      { wch: 20 }, // Admin
      { wch: 10 }, // Verified
      { wch: 10 }  // Receipt
    ];
    ws['!cols'] = wscols;

    XLSX.utils.book_append_sheet(wb, ws, 'OutletExpenditures');

    // Generate buffer
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    
    // Set headers
    const filename = `outletExpenditures_${moment().format('YYYYMMDD_HHmmss')}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};