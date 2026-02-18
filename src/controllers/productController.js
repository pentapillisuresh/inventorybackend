const { Product, Category, Inventory, sequelize, Invoice, InvoiceItem, Store } = require('../models');
const upload = require('../config/multer');
const { uploadSingle } = require('../middleware/upload');
const { Op, col, where } = require('sequelize');

// Create category
exports.createCategory = async (req, res) => {
  try {
    const { name, description } = req.body;

    const category = await Category.create({
      name,
      description,
      adminId: req.user.id
    });

    res.status(201).json(category);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Create product with image upload
exports.createProduct = [
  upload.single('image'),
  uploadSingle('image'),
  async (req, res) => {
    try {
      const {
        name,
        sku,
        description,
        categoryId,
        price,quantity,
        costPrice,
        thresholdQuantity
      } = req.body;

      const product = await Product.create({
        name,
        sku,
        description,
        categoryId,
        price: Number(price),
        quantity,
        costPrice: costPrice ? Number(costPrice) : null,
        thresholdQuantity: thresholdQuantity ? Number(thresholdQuantity) : 10,
        image: req.file ? req.file.path : null,
        adminId: req.user.id
      });

      res.status(201).json(product);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
];
// Distribute products to store
exports.distributeToStore = async (req, res) => {
  const t = await sequelize.transaction();
  
  try {
    const { storeId } = req.params;
    const { 
      items, 
      paymentMethod, 
      creditAmount, 
      paidAmount 
    } = req.body;

    // Generate invoice number
    const invoiceNumber = `INV-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    // Create invoice
    const invoice = await Invoice.create({
      invoiceNumber,
      storeId,
      adminId: req.user.id,
      type: 'distribution',
      paymentMethod,
      totalAmount: 0, // Will be calculated
      creditAmount: creditAmount || 0,
      paidAmount: paidAmount || 0,
      status: 'pending'
    }, { transaction: t });

    let totalAmount = 0;
    const invoiceItems = [];

    // Process each item
    for (const item of items) {
      const { productId, quantity, price,roomId, locationType, locationId } = item;
      
      const product = await Product.findByPk(productId, { transaction: t });
      if (!product) {
        await t.rollback();
        return res.status(404).json({ error: `Product ${productId} not found` });
      }

      const itemTotal = quantity * price;
      totalAmount += itemTotal;

      // Create invoice item
      const invoiceItem = await InvoiceItem.create({
        invoiceId: invoice.id,
        productId,
        quantity,
        price,
        totalPrice: itemTotal,
        locationType,
        locationId
      }, { transaction: t });

      invoiceItems.push(invoiceItem);

      // Update or create inventory
      const [inventory] = await Inventory.findOrCreate({
        where: { 
          productId, 
          storeId,
          roomId,
          [locationType + 'Id']: locationId 
        },
        defaults: {
          productId,
          storeId,
          roomId,
          [locationType + 'Id']: locationId,
          quantity: 0,
          reorderLevel: product.thresholdQuantity
        },
        transaction: t
      });

      inventory.quantity += quantity;
      await inventory.save({ transaction: t });

      // Check threshold alert
      if (inventory.quantity <= inventory.reorderLevel) {
        // Create alert notification (implement notification system)
        console.log(`Alert: Product ${productId} is below threshold`);
      }
    }

    // Update invoice total
    invoice.totalAmount = totalAmount;
    await invoice.save({ transaction: t });

    // Update store credit
    if (paymentMethod === 'credit' || paymentMethod === 'mixed') {
      const store = await Store.findByPk(storeId, { transaction: t });
      store.currentCredit += creditAmount;
      await store.save({ transaction: t });
    }

    await t.commit();

    res.status(201).json({
      message: 'Products distributed successfully',
      invoice,
      invoiceItems
    });
  } catch (error) {
    await t.rollback();
    res.status(500).json({ error: error.message });
  }
};

// Get all categories
exports.getAllCategories = async (req, res) => {
  try {
    const categories = await Category.findAll({
      where: req.user.role === 'admin' ? { adminId: req.user.id } : {},
      include: [{
        model: Product,
        attributes: ['id']
      }],
      order: [['name', 'ASC']]
    });

    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get products by category
exports.getProductsByCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;

    const products = await Product.findAll({
      where: { categoryId },
      include: [
        { model: Category },
        {
          model: Inventory,
          attributes: ['id', 'quantity', 'storeId']
        }
      ],
      order: [['name', 'ASC']]
    });

    res.json(products);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get all products
exports.getAllProducts = async (req, res) => {
  try {
    const { categoryId, lowStock, search, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const where = {};
    
    if (categoryId) where.categoryId = categoryId;
    
    if (search) {
      where[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { sku: { [Op.like]: `%${search}%` } },
        { description: { [Op.like]: `%${search}%` } }
      ];
    }

    // Role-based filtering for admin
    if (req.user.role === 'admin') {
      where.adminId = req.user.id;
    }

    const { count, rows: products } = await Product.findAndCountAll({
      where,
      include: [
        { model: Category },
        {
          model: Inventory,
          attributes: ['id', 'quantity', 'storeId']
        }
      ],
      order: [['name', 'ASC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    // Filter for low stock if requested
    if (lowStock === 'true') {
      const lowStockProducts = products.filter(product => {
        const totalInventory = product.Inventories.reduce((sum, inv) => sum + inv.quantity, 0);
        return totalInventory <= product.thresholdQuantity;
      });
      
      return res.json({
        total: lowStockProducts.length,
        totalPages: 1,
        currentPage: 1,
        products: lowStockProducts
      });
    }

    res.json({
      total: count,
      totalPages: Math.ceil(count / limit),
      currentPage: parseInt(page),
      products
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get product by ID
exports.getProductById = async (req, res) => {
  try {
    const { id } = req.params;

    const product = await Product.findByPk(id, {
      include: [
        { model: Category },
        {
          model: Inventory,
          include: [{ model: Store }]
        }
      ]
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Check access for admin
    if (req.user.role === 'admin' && product.adminId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied to this product' });
    }

    res.json(product);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getProductCounts = async (req, res) => {
  try {
    const whereClause = {};
    // Admin sees only their own products
    if (req.user.role === 'admin') {
      whereClause.adminId = req.user.id;
    }

    const totalProducts = await Product.count({
      where: whereClause
    });

    const inStockProducts = await Product.count({
      where: {
        ...whereClause,
        quantity: {
          [Op.gt]: 0
        }
      }
    });

    const outOfStockProducts = await Product.count({
      where: {
        ...whereClause,
        quantity: 0
      }
    });

    const lowStockProducts = await Product.count({
      where: {
        ...whereClause,
        quantity: {
          [Op.gt]: 0
        },
        [Op.and]: where(
          col('quantity'),
          '<=',
          col('thresholdQuantity')
        )
      }
    });

    res.status(200).json({
      totalProducts,
      inStockProducts,
      outOfStockProducts,
      lowStockProducts
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Update product
exports.updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, sku, description,quantity, categoryId, price, costPrice, thresholdQuantity, isActive } = req.body;
    const product = await Product.findByPk(id);

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Check access for admin
    if (req.user.role === 'admin' && product.adminId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied to update this product' });
    }

    const updates = {};
    if (name !== undefined) updates.name = name;
    if (sku !== undefined) updates.sku = sku;
    if (description !== undefined) updates.description = description;
    if (categoryId !== undefined) updates.categoryId = categoryId;
    if (price !== undefined) updates.price = parseFloat(price);
    if (quantity !== undefined) updates.quantity = parseFloat(quantity);
    if (costPrice !== undefined) updates.costPrice = costPrice ? parseFloat(costPrice) : null;
    if (thresholdQuantity !== undefined) updates.thresholdQuantity = parseInt(thresholdQuantity);
    if (isActive !== undefined) updates.isActive = isActive;

    await product.update(updates);

    res.json({
      message: 'Product updated successfully',
      product
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Delete product
exports.deleteProduct = async (req, res) => {
  const t = await sequelize.transaction();
  
  try {
    const { id } = req.params;

    const product = await Product.findByPk(id, {
      include: [{ model: Inventory }],
      transaction: t
    });

    if (!product) {
      await t.rollback();
      return res.status(404).json({ error: 'Product not found' });
    }

    // Check access for admin
    if (req.user.role === 'admin' && product.adminId !== req.user.id) {
      await t.rollback();
      return res.status(403).json({ error: 'Access denied to delete this product' });
    }

    // Check if product has inventory
    if (product.Inventories && product.Inventories.length > 0) {
      await t.rollback();
      return res.status(400).json({ 
        error: 'Cannot delete product with existing inventory. Remove inventory first.' 
      });
    }

    await product.destroy({ transaction: t });
    await t.commit();

    res.json({
      message: 'Product deleted successfully'
    });
  } catch (error) {
    await t.rollback();
    res.status(500).json({ error: error.message });
  }
};

// Bulk upload products from CSV/Excel
exports.bulkUploadProducts = [
  upload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      // Check file type
      const fileExtension = req.file.originalname.split('.').pop().toLowerCase();
      
      if (!['csv', 'xlsx', 'xls'].includes(fileExtension)) {
        return res.status(400).json({ error: 'Only CSV and Excel files are allowed' });
      }

      // Process the file based on type
      let products = [];
      
      if (fileExtension === 'csv') {
        // Parse CSV
        const csv = require('csv-parser');
        const fs = require('fs');
        const results = [];
        
        await new Promise((resolve, reject) => {
          fs.createReadStream(req.file.path)
            .pipe(csv())
            .on('data', (data) => results.push(data))
            .on('end', resolve)
            .on('error', reject);
        });
        
        products = results.map(row => ({
          name: row.name,
          sku: row.sku || `SKU-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          description: row.description || '',
          categoryId: parseInt(row.categoryId),
          price: parseFloat(row.price),
          costPrice: row.costPrice ? parseFloat(row.costPrice) : null,
          thresholdQuantity: parseInt(row.thresholdQuantity) || 10,
          adminId: req.user.id
        }));
      } else {
        // Parse Excel
        const XLSX = require('xlsx');
        const workbook = XLSX.readFile(req.file.path);
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(worksheet);
        
        products = data.map(row => ({
          name: row.Name || row.name,
          sku: row.SKU || row.sku || `SKU-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          description: row.Description || row.description || '',
          categoryId: parseInt(row.CategoryID || row.categoryId),
          price: parseFloat(row.Price || row.price),
          costPrice: row.CostPrice || row.costPrice ? parseFloat(row.CostPrice || row.costPrice) : null,
          thresholdQuantity: parseInt(row.ThresholdQuantity || row.thresholdQuantity) || 10,
          adminId: req.user.id
        }));
      }

      // Validate products
      const validProducts = [];
      const errors = [];

      for (const product of products) {
        try {
          // Check for required fields
          if (!product.name || !product.categoryId || !product.price) {
            errors.push(`Missing required fields for product: ${product.name || 'Unknown'}`);
            continue;
          }

          // Check if category exists and belongs to admin
          const category = await Category.findOne({
            where: { 
              id: product.categoryId,
              adminId: req.user.id 
            }
          });

          if (!category) {
            errors.push(`Invalid category ID ${product.categoryId} for product: ${product.name}`);
            continue;
          }

          // Check if SKU already exists
          const existingProduct = await Product.findOne({
            where: { sku: product.sku }
          });

          if (existingProduct) {
            // Generate unique SKU
            product.sku = `${product.sku}-${Date.now()}`;
          }

          validProducts.push(product);
        } catch (error) {
          errors.push(`Error processing product ${product.name}: ${error.message}`);
        }
      }

      if (validProducts.length === 0) {
        return res.status(400).json({ 
          error: 'No valid products found', 
          errors 
        });
      }

      // Create products
      const createdProducts = await Product.bulkCreate(validProducts, {
        validate: true,
        returning: true
      });

      // Clean up uploaded file
      const fs = require('fs').promises;
      await fs.unlink(req.file.path).catch(() => {});

      res.status(201).json({
        message: `Successfully created ${createdProducts.length} products`,
        created: createdProducts.length,
        failed: products.length - createdProducts.length,
        errors: errors.length > 0 ? errors : null,
        products: createdProducts
      });

    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
];

// Get products by threshold (low stock)
exports.getLowThresholdProducts = async (req, res) => {
  try {
    const { storeId } = req.query;

    const where = {};
    if (req.user.role === 'admin') {
      where.adminId = req.user.id;
    }

    const products = await Product.findAll({
      where,
      include: [
        { model: Category },
        {
          model: Inventory,
          where: storeId ? { storeId } : undefined,
          required: !!storeId
        }
      ]
    });

    // Filter products that are below threshold
    const lowThresholdProducts = products.filter(product => {
      const totalInventory = product.Inventories.reduce((sum, inv) => sum + inv.quantity, 0);
      return totalInventory <= product.thresholdQuantity;
    });

    // Add inventory summary for each product
    const productsWithSummary = lowThresholdProducts.map(product => {
      const inventorySummary = product.Inventories.reduce((summary, inv) => {
        summary.totalQuantity += inv.quantity;
        summary.lowStockStores = inv.quantity <= product.thresholdQuantity ? 
          (summary.lowStockStores || 0) + 1 : summary.lowStockStores || 0;
        return summary;
      }, { totalQuantity: 0, lowStockStores: 0 });

      return {
        ...product.toJSON(),
        inventorySummary,
        needsReorder: inventorySummary.totalQuantity <= product.thresholdQuantity
      };
    });

    res.json({
      count: productsWithSummary.length,
      products: productsWithSummary
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};