const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const SaleItem = sequelize.define('SaleItem', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  saleId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'Sales', key: 'id' },
    onDelete: 'CASCADE'
  },
  outletProductId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'OutletProducts', key: 'id' }
  },
  // Snapshot of product info at time of sale (so history is preserved)
  productName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  sku: {
    type: DataTypes.STRING,
    allowNull: true
  },
  HSN_No: {
    type: DataTypes.STRING,
    allowNull: true
  },
  quantity: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  units: {
    type: DataTypes.STRING,
    allowNull: true
  },
  unitPrice: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false
  },
  // Rates (percentages) — e.g. 5, 12, 18
  IGST: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0
  },
  SGST: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0
  },
  CGST: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0
  },
  taxAmount: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0
  },
  lineTotal: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false
  },
  costPrice: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true
  }
});

module.exports = SaleItem;