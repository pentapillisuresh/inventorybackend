const { Invoice, InvoiceItem, Product, Store, Outlet, User, sequelize, Inventory, WayBill } = require('../models');
const { Op } = require('sequelize');
const PDFDocument = require('pdfkit');

// Generate invoice number
async function generateBatchNumber(type = 'BATH') {
  const now = new Date();

  // Format: dd/mm/yy
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = String(now.getFullYear()).slice(-2);

  const date = `${day}/${month}/${year}`;

  const count = await WayBill.count();

  return `${type}-${date}-${count + 1}`;
}
// Create invoice for store manager to outlet
exports.createWaybill = async (req, res) => {
  const t = await sequelize.transaction();
  const {description,items_qty,amount,adminId}=req.body
const name=await generateBatchNumber("BATH")
  try {
    // Create invoice
    const waybill = await WayBill.create({
      name,
      description,
      items_qty,
      amount,
      adminId,
      createdBy:req.user.id
    }, { transaction: t });

    res.status(201).json({
      message: 'Waybill created successfully',
      waybill,
    });
  } catch (error) {
    await t.rollback();
    res.status(500).json({ error: error.message });
  }
};

// Get all invoices
exports.getAllWaybill = async (req, res) => {
  try {
    const { status, startDate, endDate, page = 1, limit = 10 } = req.query;

    const where = {};
    if (status) where.status = status;

    if (startDate && endDate) {
      where.invoiceDate = {
        [Op.between]: [new Date(startDate), new Date(endDate)]
      };
    }

    const offset = (page - 1) * limit;

    const { count, rows: waybill } = await WayBill.findAndCountAll({
      where,
      include: [
        { model: User, as: 'user', attributes: ['id', 'name', 'email'] },
      ],
    });

    res.json({
      total: count,
      totalPages: Math.ceil(count / limit),
      currentPage: parseInt(page),
      waybill
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};


// Get invoice by ID
exports.getWaybillById = async (req, res) => {
  try {
    const { id } = req.params;

    const waybill = await WayBill.findByPk(id, {
      include: [
        { model: User, as: 'User', attributes: ['id', 'name', 'email'] },
        {
          model: InvoiceItem,
        }
      ]
    });

    res.json(waybill);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

