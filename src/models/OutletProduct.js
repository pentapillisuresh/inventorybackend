const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const OutletProduct = sequelize.define('OutletProduct', {
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
  categoryName: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  quantity: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  reservedStock: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  liveStock: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  productType: {
    type: DataTypes.ENUM('inventory', 'raw_material'),
    defaultValue: 'inventory',
    allowNull: true
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
  outletId: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  comeFromInventory: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
    createdBy: {
    type: DataTypes.STRING,
    allowNull: true,
    comment:"is this created by user or outlet amd concat with its respective ID ex: 'USER-1 / OUTLET-1' "
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
});

module.exports = OutletProduct;