const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Expenditure = sequelize.define('Expenditure', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  adminId: {
    type: DataTypes.INTEGER,
    references: {
      model: 'Users',
      key: 'id'
    },
    allowNull: false
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
    type: DataTypes.STRING
  },
  verified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
});

module.exports = Expenditure;