const { Expenditure, User, sequelize } = require('../models');
const { Op } = require('sequelize');
const fs = require('fs').promises;
const path = require('path');
const XLSX = require('xlsx');
const moment = require('moment');

// Create expenditure (Admin office expense)
exports.createExpenditure = async (req, res) => {
  try {
    const { category, description, amount, date } = req.body;

    const expenditure = await Expenditure.create({
      adminId: req.user.id,
      category: category.trim(),
      description: description.trim(),
      amount: parseFloat(amount),
      date: date ? new Date(date) : new Date(),
      receiptImage: req.file ? req.file.path : null,
      verified: false // Initially not verified
    });

    res.status(201).json({
      message: 'Expenditure recorded successfully',
      expenditure
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

// Get all expenditures with filters
exports.getAllExpenditures = async (req, res) => {
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
    // Superadmin can see all, store manager can't see expenditures

    const { count, rows: expenditures } = await Expenditure.findAndCountAll({
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
    const totalAmount = await Expenditure.sum('amount', { where });
    const verifiedAmount = await Expenditure.sum('amount', { 
      where: { ...where, verified: true } 
    });
    const pendingAmount = await Expenditure.sum('amount', { 
      where: { ...where, verified: false } 
    });

    res.json({
      summary: {
        total: count,
        totalAmount: totalAmount || 0,
        verifiedAmount: verifiedAmount || 0,
        pendingAmount: pendingAmount || 0
      },
      expenditures,
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

// Get expenditure by ID
exports.getExpenditureById = async (req, res) => {
  try {
    const { id } = req.params;

    const expenditure = await Expenditure.findByPk(id, {
      include: [
        {
          model: User,
          as: 'Admin',
          attributes: ['id', 'name', 'email']
        }
      ]
    });

    if (!expenditure) {
      return res.status(404).json({ error: 'Expenditure not found' });
    }

    // Check access
    if (req.user.role === 'admin' && expenditure.adminId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(expenditure);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Update expenditure
exports.updateExpenditure = async (req, res) => {
  try {
    const { id } = req.params;
    const { category, description, amount, date } = req.body;

    const expenditure = await Expenditure.findByPk(id);

    if (!expenditure) {
      return res.status(404).json({ error: 'Expenditure not found' });
    }

    // Only admin who created it can update
    if (expenditure.adminId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Store old receipt for cleanup
    let oldReceiptPath = null;
    if (req.file && expenditure.receiptImage) {
      oldReceiptPath = expenditure.receiptImage;
    }

    // Update fields
    const updates = {};
    if (category) updates.category = category;
    if (description) updates.description = description;
    if (amount) updates.amount = parseFloat(amount);
    if (date) updates.date = new Date(date);
    if (req.file) updates.receiptImage = req.file.path;

    await expenditure.update(updates);

    // Delete old receipt
    if (oldReceiptPath) {
      try {
        await fs.unlink(oldReceiptPath);
      } catch (error) {
        console.error('Error deleting old receipt:', error);
      }
    }

    res.json({
      message: 'Expenditure updated successfully',
      expenditure
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

// Delete expenditure
exports.deleteExpenditure = async (req, res) => {
  try {
    const { id } = req.params;

    const expenditure = await Expenditure.findByPk(id);

    if (!expenditure) {
      return res.status(404).json({ error: 'Expenditure not found' });
    }

    // Only admin who created it can delete
    if (expenditure.adminId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Delete receipt file
    if (expenditure.receiptImage) {
      try {
        await fs.unlink(expenditure.receiptImage);
      } catch (error) {
        console.error('Error deleting receipt:', error);
      }
    }

    await expenditure.destroy();

    res.json({
      message: 'Expenditure deleted successfully'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Verify expenditure (SuperAdmin only)
exports.verifyExpenditure = async (req, res) => {
  try {
    const { id } = req.params;
    const { verified } = req.body;

    const expenditure = await Expenditure.findByPk(id);

    if (!expenditure) {
      return res.status(404).json({ error: 'Expenditure not found' });
    }

    // Only superadmin can verify
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    expenditure.verified = verified === true || verified === 'true';
    await expenditure.save();

    res.json({
      message: `Expenditure ${expenditure.verified ? 'verified' : 'unverified'} successfully`,
      expenditure
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

    const currentMonthStats = await Expenditure.findOne({
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

    const lastMonthStats = await Expenditure.findOne({
      where: lastMonthWhere,
      attributes: [
        [sequelize.fn('SUM', sequelize.col('amount')), 'total']
      ]
    });

    // Category breakdown for current month
    const categoryBreakdown = await Expenditure.findAll({
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
    const verificationStats = await Expenditure.findAll({
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

// Export expenditures to Excel
exports.exportExpendituresToExcel = async (req, res) => {
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

    const expenditures = await Expenditure.findAll({
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
    const data = expenditures.map(exp => ({
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

    XLSX.utils.book_append_sheet(wb, ws, 'Expenditures');

    // Generate buffer
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    
    // Set headers
    const filename = `expenditures_${moment().format('YYYYMMDD_HHmmss')}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};