const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Invoice = sequelize.define('Invoice', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  invoiceNumber: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  storeId: {
    type: DataTypes.INTEGER,
    references: {
      model: 'Stores',
      key: 'id'
    },
    allowNull: false
  },
  outletId: {
    type: DataTypes.INTEGER,
    references: {
      model: 'Outlets',
      key: 'id'
    }
  },
  adminId: {
    type: DataTypes.INTEGER,
    references: {
      model: 'Users',
      key: 'id'
    }
  },
  storeManagerId: {
    type: DataTypes.INTEGER,
    references: {
      model: 'Users',
      key: 'id'
    }
  },
  type: {
    type: DataTypes.ENUM('distribution', 'outlet_sale', 'credit', 'paid'),
    allowNull: false
  },
  paymentMethod: {
    type: DataTypes.ENUM('credit', 'paid', 'mixed'),
    allowNull: false
  },
  totalAmount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false
  },
  creditAmount: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0
  },
  paidAmount: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0
  },
  status: {
    type: DataTypes.ENUM('pending', 'completed', 'cancelled'),
    defaultValue: 'pending'
  },
  invoiceDate: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
});

module.exports = Invoice;