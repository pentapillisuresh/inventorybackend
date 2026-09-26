const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Product = sequelize.define('Product', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  sku: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  HSN_No: { 
    type: DataTypes.STRING,
    allowNull: true
  },
  description: {
    type: DataTypes.TEXT
  },
  categoryId: {
    type: DataTypes.INTEGER,
    references: {
      model: 'Categories',
      key: 'id'
    },
    allowNull: false
  },
  quantity: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  units: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  price: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false
  },
  IGST: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true
  },
  SGST: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true
  },
  CGST: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true
  },
  costPrice: {
    type: DataTypes.DECIMAL(15, 2)
  },
  thresholdQuantity: {
    type: DataTypes.INTEGER,
    defaultValue: 10
  },
  image: {
    type: DataTypes.STRING
  },
  adminId: {
    type: DataTypes.INTEGER,
    references: {
      model: 'Users',
      key: 'id'
    },
    allowNull: true
  },
  createdBy: {
    type: DataTypes.INTEGER,
    references: {
      model: 'Users',
      key: 'id'
    },
    allowNull: true
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
});

module.exports = Product;