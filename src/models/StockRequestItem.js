const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const StockRequestItem = sequelize.define('StockRequestItem', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  requestId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'StockRequests', key: 'id' },
    onDelete: 'CASCADE'
  },
  outletProductId: {
    type: DataTypes.INTEGER,
    allowNull: true, // Can be null if requesting a product not yet in their outlet
    references: { model: 'OutletProducts', key: 'id' }
  },
  productName: {
    type: DataTypes.STRING,
    allowNull: false // Snapshot of the name
  },
  requestedQuantity: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  approvedQuantity: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  status: {
    type: DataTypes.ENUM('pending', 'approved', 'rejected'),
    defaultValue: 'pending'
  }
});

module.exports = StockRequestItem;