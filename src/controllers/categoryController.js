const { Category, Product, Inventory, sequelize, Store } = require('../models');
const { Op } = require('sequelize');

// Create category
exports.createCategory = async (req, res) => {
  try {
    const { name, description } = req.body;

    // Check if category already exists
    const existingCategory = await Category.findOne({ 
      where: { 
        name: sequelize.where(
          sequelize.fn('LOWER', sequelize.col('name')),
          name.toLowerCase()
        ),
        adminId: req.user.id 
      }
    });

    if (existingCategory) {
      return res.status(400).json({ error: 'Category with this name already exists' });
    }

    const category = await Category.create({
      name,
      description,
      adminId: req.user.id
    });

    res.status(201).json({
      message: 'Category created successfully',
      category
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get all categories
exports.getAllCategories = async (req, res) => {
  try {
    const { search } = req.query;

    const where = {};
    
    // Superadmin sees all categories
    if (req.user.role === 'admin') {
      where.adminId = req.user.id;
    } else if (req.user.role === 'store_manager') {
      // Store manager sees categories from their store's admin
      const store = await Store.findOne({ 
        where: { managerId: req.user.id },
        attributes: ['adminId']
      });
      if (store) {
        where.adminId = store.adminId;
      } else {
        return res.json([]);
      }
    }

    if (search) {
      where.name = {
        [Op.like]: `%${search}%`
      };
    }

    const { count, rows: categories } = await Category.findAndCountAll({
      where,
      include: [
        {
          model: Product,
          attributes: ['id', 'name', 'sku'],
          required: false
        }
      ],
      order: [['name', 'ASC']],
    });

    res.json({
      total: count,
      categories
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get category by ID
exports.getCategoryById = async (req, res) => {
  try {
    const { id } = req.params;

    const category = await Category.findByPk(id, {
      include: [
        {
          model: Product,
          include: [
            {
              model: Inventory,
              attributes: ['id', 'quantity', 'storeId']
            }
          ]
        }
      ]
    });

    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    // Check access rights
    if (req.user.role === 'admin' && category.adminId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied to this category' });
    }

    res.json(category);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Update category
exports.updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    const category = await Category.findByPk(id);

    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    if (category.adminId !== req.user.id) {
      return res.status(403).json({ error: 'You can only update your own categories' });
    }

    // Check for duplicate name
    if (name && name !== category.name) {
      const existingCategory = await Category.findOne({ 
        where: { 
          name: sequelize.where(
            sequelize.fn('LOWER', sequelize.col('name')),
            name.toLowerCase()
          ),
          adminId: req.user.id,
          id: { [Op.ne]: id }
        }
      });

      if (existingCategory) {
        return res.status(400).json({ error: 'Category with this name already exists' });
      }
    }

    await category.update({
      name: name || category.name,
      description: description || category.description
    });

    res.json({
      message: 'Category updated successfully',
      category
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Delete category
exports.deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;

    const category = await Category.findByPk(id, {
      include: [{ model: Product }]
    });

    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    if (category.adminId !== req.user.id) {
      return res.status(403).json({ error: 'You can only delete your own categories' });
    }

    // Check if category has products
    if (category.Products && category.Products.length > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete category with existing products. Remove products first.' 
      });
    }

    await category.destroy();

    res.json({
      message: 'Category deleted successfully'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get products by category
exports.getProductsByCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { lowStock = false, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const category = await Category.findByPk(categoryId);
    
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    // Check access rights
    if (req.user.role === 'admin' && category.adminId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied to this category' });
    }

    const productWhere = { categoryId };
    const inventoryWhere = {};

    if (lowStock === 'true') {
      inventoryWhere.quantity = {
        [Op.lte]: sequelize.col('Product.thresholdQuantity')
      };
    }

    const { count, rows: products } = await Product.findAndCountAll({
      where: productWhere,
      include: [
        {
          model: Inventory,
          where: inventoryWhere,
          required: lowStock === 'true'
        }
      ],
      order: [['name', 'ASC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      total: count,
      totalPages: Math.ceil(count / limit),
      currentPage: parseInt(page),
      category,
      products
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Bulk create categories
exports.bulkCreateCategories = async (req, res) => {
  try {
    const { categories } = req.body;

    if (!Array.isArray(categories) || categories.length === 0) {
      return res.status(400).json({ error: 'Categories array is required' });
    }

    // Validate and format categories
    const formattedCategories = categories.map(cat => ({
      name: cat.name.trim(),
      description: cat.description || null,
      adminId: req.user.id
    }));

    // Remove duplicates
    const uniqueCategories = Array.from(
      new Map(
        formattedCategories.map(cat => [cat.name.toLowerCase(), cat])
      ).values()
    );

    // Check existing categories
    const existingCategories = await Category.findAll({
      where: {
        name: {
          [Op.in]: uniqueCategories.map(cat => cat.name)
        },
        adminId: req.user.id
      },
      attributes: ['name']
    });

    const existingNames = existingCategories.map(cat => cat.name.toLowerCase());
    const newCategories = uniqueCategories.filter(
      cat => !existingNames.includes(cat.name.toLowerCase())
    );

    if (newCategories.length === 0) {
      return res.status(400).json({ error: 'All categories already exist' });
    }

    const createdCategories = await Category.bulkCreate(newCategories, {
      validate: true,
      returning: true
    });

    res.status(201).json({
      message: `Created ${createdCategories.length} new categories`,
      createdCategories,
      skipped: existingCategories.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get category statistics
exports.getCategoryStats = async (req, res) => {
  try {
    const { id } = req.params;

    const category = await Category.findByPk(id, {
      include: [
        {
          model: Product,
          attributes: ['id', 'name'],
          include: [
            {
              model: Inventory,
              attributes: ['id', 'quantity', 'storeId']
            }
          ]
        }
      ]
    });

    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    // Calculate statistics
    const totalProducts = category.Products.length;
    
    const totalInventory = category.Products.reduce((sum, product) => {
      return sum + product.Inventories.reduce((invSum, inv) => invSum + inv.quantity, 0);
    }, 0);

    const lowStockProducts = category.Products.filter(product => {
      return product.Inventories.some(inv => 
        inv.quantity <= product.thresholdQuantity
      );
    }).length;

    const totalValue = category.Products.reduce((sum, product) => {
      return sum + (product.Inventories.reduce((invSum, inv) => 
        invSum + inv.quantity, 0) * product.price);
    }, 0);

    const stats = {
      totalProducts,
      totalInventory,
      lowStockProducts,
      outOfStockProducts: category.Products.filter(product => 
        product.Inventories.reduce((sum, inv) => sum + inv.quantity, 0) === 0
      ).length,
      totalValue: totalValue.toFixed(2),
      avgProductPrice: category.Products.length > 0 ? 
        (category.Products.reduce((sum, product) => sum + product.price, 0) / 
         category.Products.length).toFixed(2) : 0
    };

    res.json({
      category,
      stats
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};