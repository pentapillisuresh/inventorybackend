const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Store = sequelize.define('Store', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  address: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  phoneNumber: {
    type: DataTypes.STRING,
    allowNull: false

  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      isEmail: true
    }
  },
  creditLimit: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0
  },
  currentCredit: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0
  },
  managerId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'Users',
      key: 'id'
    }
  },
  adminId: {
    type: DataTypes.INTEGER,
    references: {
      model: 'Users',
      key: 'id'
    },
    allowNull: false
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
});

module.exports = Store;