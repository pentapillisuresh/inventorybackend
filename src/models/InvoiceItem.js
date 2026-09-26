const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const InvoiceItem = sequelize.define('InvoiceItem', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  invoiceId: {
    type: DataTypes.INTEGER,
    references: {
      model: 'Invoices',
      key: 'id'
    },
    allowNull: false
  },
  boxName: {
    type: DataTypes.STRING,
    allowNull: true,
  },
    batchId: {
    type: DataTypes.STRING,
    allowNull: true,
  },
    productId: {
    type: DataTypes.INTEGER,
    references: {
      model: 'Products',
      key: 'id'
    },
    allowNull: false
  },
  quantity: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  price: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true
  },
  totalPrice: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true
  },
  netPrice: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true
  },
  IGSTAmount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true
  },
  SGSTAmount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true
  },
  CGSTAmount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true
  },

  locationType: {
    type: DataTypes.ENUM('room', 'rack', 'freezer'),
    allowNull: true
  },
  locationId: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  createdBy: {
    type: DataTypes.INTEGER,
    references: {
      model: 'Users',
      key: 'id'
    },
    allowNull: true
  }

}); 

module.exports = InvoiceItem;