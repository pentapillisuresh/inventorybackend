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
    allowNull: false
  },
  totalPrice: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false
  },
  locationType: {
    type: DataTypes.ENUM('room', 'rack', 'freezer'),
    allowNull: false
  },
  locationId: {
    type: DataTypes.INTEGER,
    allowNull: false
  }
});

module.exports = InvoiceItem;