const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const OutletExpenditure = sequelize.define('OutletExpenditure', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  outletId: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  ledgerType: {
    type: DataTypes.ENUM('credit', 'debit'),
    defaultValue: 'credit'
  },
  category: {
    type: DataTypes.STRING,
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  amount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false
  },
  date: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  receiptImage: {
    type: DataTypes.STRING,
    allowNull: true
  },
  verified: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  createdBy: {
    type: DataTypes.INTEGER,
    references: { model: 'Outlets', key: 'id' },  // ← 'Outlets' (plural)
    allowNull: true
  }
});

module.exports = OutletExpenditure;