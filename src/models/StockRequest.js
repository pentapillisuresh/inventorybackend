const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const StockRequest = sequelize.define('StockRequest', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  requestNumber: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  outletId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'Outlets', key: 'id' }
  },
  storeId: {
    type: DataTypes.INTEGER,
    allowNull: true, // If null, it goes to the default Admin
  },
  requestType: {
    type: DataTypes.ENUM('new_stock', 'refill', 'return'),
    defaultValue: 'refill'
  },
  status: {
    type: DataTypes.ENUM('pending', 'approved', 'partially_approved', 'rejected', 'fulfilled'),
    defaultValue: 'pending'
  },
  totalAmount: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
  paymentStatus: { type: DataTypes.ENUM('paid', 'credit', 'pending'), defaultValue: 'pending' },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  requestedBy: {
    type: DataTypes.INTEGER, // User ID of the outlet manager
    allowNull: false
  },
  approvedBy: {
    type: DataTypes.INTEGER, // User ID of the Admin/Store Manager
    allowNull: true
  },
  approvedAt: {
    type: DataTypes.DATE,
    allowNull: true
  }
});

module.exports = StockRequest;