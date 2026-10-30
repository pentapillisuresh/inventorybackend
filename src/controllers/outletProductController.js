const { Op } = require('sequelize');
const ProductOutlet = require('../models/OutletProduct');

/**
 * @desc    Create a new product
 * @route   POST /api/outlet-products
 */
exports.createProduct = async (req, res) => {
  try {
    const {
      name, sku, HSN_No, description, categoryName, quantity, productType,
      units, price, IGST, SGST, CGST, costPrice, reservedStock,
      thresholdQuantity, image, outletId, createdBy, isActive
    } = req.body;

    if (!name || !categoryName || price === undefined) {
      return res.status(400).json({
        success: false,
        message: 'name, categoryName and price are required fields'
      });
    }

    const product = await ProductOutlet.create({
      name,
      sku,
      HSN_No,
      description,
      categoryName,
      quantity: quantity ?? 0,
      reservedStock: quantity ?? 0,
      units,
      price,
      IGST,
      SGST,
      CGST,
      costPrice,
      thresholdQuantity: thresholdQuantity ?? 10,
      image,
      productType,
      outletId,
      createdBy,
      isActive: isActive ?? true
    });

    return res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: product
    });
  } catch (error) {
    console.error('createProduct error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create product',
      error: error.message
    });
  }
};

/**
 * @desc    Get all products (with filters, pagination)
 * @route   GET /api/outlet-products
 */
exports.getAllProducts = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      outletId,
      categoryName,
      search,
      isActive,
      lowStock
    } = req.query;

    const where = {};

    if (outletId) where.outletId = outletId;
    if (categoryName) where.categoryName = categoryName;
    if (isActive !== undefined) where.isActive = isActive === 'true';

    if (search) {
      where[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { sku: { [Op.like]: `%${search}%` } },
        { HSN_No: { [Op.like]: `%${search}%` } }
      ];
    }

    // Low stock: quantity <= thresholdQuantity
    if (lowStock === 'true') {
      where.quantity = { [Op.lte]: sequelize.col('thresholdQuantity') };
    }

    const offset = (Number(page) - 1) * Number(limit);

    const { count, rows } = await ProductOutlet.findAndCountAll({
      where,
      offset,
      limit: Number(limit),
      order: [['id', 'DESC']]
    });

    return res.status(200).json({
      success: true,
      total: count,
      page: Number(page),
      totalPages: Math.ceil(count / limit),
      data: rows
    });
  } catch (error) {
    console.error('getAllProducts error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch products',
      error: error.message
    });
  }
};

/**
 * @desc    Get single product by ID
 * @route   GET /api/outlet-products/:id
 */
exports.getProductById = async (req, res) => {
  try {
    const product = await ProductOutlet.findByPk(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    return res.status(200).json({ success: true, data: product });
  } catch (error) {
    console.error('getProductById error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch product',
      error: error.message
    });
  }
};

/**
 * @desc    Update a product
 * @route   PUT /api/outlet-products/:id
 */
exports.updateProduct = async (req, res) => {
  try {
    const product = await ProductOutlet.findByPk(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    const updatable = [
      'name', 'sku', 'HSN_No', 'description', 'categoryName', 'quantity',
      'units', 'price', 'IGST', 'SGST', 'CGST', 'costPrice', 'productType',
      'thresholdQuantity', 'image', 'outletId', 'isActive'
    ];

    const updates = {};
    updatable.forEach((field) => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    await product.update(updates);

    return res.status(200).json({
      success: true,
      message: 'Product updated successfully',
      data: product
    });
  } catch (error) {
    console.error('updateProduct error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update product',
      error: error.message
    });
  }
};

/**
 * @desc    Soft-delete (deactivate) a product
 * @route   DELETE /api/outlet-products/:id
 */
exports.deleteProduct = async (req, res) => {
  try {
    const product = await ProductOutlet.findByPk(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    await product.update({ isActive: false });

    return res.status(200).json({
      success: true,
      message: 'Product deactivated successfully'
    });
  } catch (error) {
    console.error('deleteProduct error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete product',
      error: error.message
    });
  }
};

/**
 * @desc    Permanently delete a product
 * @route   DELETE /api/outlet-products/:id/hard
 */
exports.hardDeleteProduct = async (req, res) => {
  try {
    const product = await ProductOutlet.findByPk(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    await product.destroy();

    return res.status(200).json({
      success: true,
      message: 'Product permanently deleted'
    });
  } catch (error) {
    console.error('hardDeleteProduct error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete product',
      error: error.message
    });
  }
};

/**
 * @desc    Update stock quantity (increment/decrement or set)
 * @route   PATCH /api/outlet-products/:id/stock
 */
exports.updateStock = async (req, res) => {
  try {
    const { quantity, operation = 'set' } = req.body;

    if (quantity === undefined || isNaN(quantity)) {
      return res.status(400).json({
        success: false,
        message: 'quantity is required and must be a number'
      });
    }

    const product = await ProductOutlet.findByPk(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    let newQuantity = product.quantity;
    let newReservedStockQuantity = product.reservedStock;
    let newLiveStockQuantity = product.liveStock;

    if (operation === 'set') {
       newQuantity = Number(quantity); 
      }
    else if (operation === 'increment') {
      
      newReservedStockQuantity += Number(quantity);
      newQuantity=Number(newReservedStockQuantity)+ Number(newLiveStockQuantity)
    }

    else if (operation === 'decrement') {
      newLiveStockQuantity -= Number(quantity);
      newQuantity=Number(newReservedStockQuantity)+ Number(newLiveStockQuantity)
    }
    else {
      return res.status(400).json({
        success: false,
        message: 'operation must be one of: set, increment, decrement'
      });
    }

    if (newLiveStockQuantity < 0) {
      return res.status(400).json({
        success: false,
        message: 'Stock live quantity cannot be negative'
      });
    }

    await product.update({ quantity: newQuantity,liveStock:newLiveStockQuantity,reservedStock:newReservedStockQuantity });

    return res.status(200).json({
      success: true,
      message: 'Stock updated successfully',
      data: product
    });
  } catch (error) {
    console.error('updateStock error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update stock',
      error: error.message
    });
  }
};

exports.updateStockTransfer = async (req, res) => {
  try {
    const { liveStock, reservedStock } = req.body;

    if (liveStock === undefined || isNaN(liveStock)) {
      return res.status(400).json({
        success: false,
        message: 'liveStock quantity is required and must be a number'
      });
    }

    if (reservedStock === undefined || isNaN(reservedStock)) {
      return res.status(400).json({
        success: false,
        message: 'reservedStock quantity is required and must be a number'
      });
    }

    const product = await ProductOutlet.findByPk(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    await product.update({ liveStock, reservedStock, quantity: Number(liveStock) + Number(reservedStock) });

    return res.status(200).json({
      success: true,
      message: 'Stock updated successfully',
      data: product
    });
  } catch (error) {
    console.error('updateStock error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update stock',
      error: error.message
    });
  }
};

/**
 * @desc    Get low-stock products for an outlet
 * @route   GET /api/outlet-products/low-stock/:outletId
 */
exports.getLowStockProducts = async (req, res) => {
  try {
    const { outletId } = req.params;

    const products = await ProductOutlet.findAll({
      where: {
        outletId,
        isActive: true,
        quantity: { [Op.lte]: sequelize.col('thresholdQuantity') }
      }
    });

    return res.status(200).json({
      success: true,
      count: products.length,
      data: products
    });
  } catch (error) {
    console.error('getLowStockProducts error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch low-stock products',
      error: error.message
    });
  }
};