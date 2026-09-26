const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const WayBill = sequelize.define('WayBill', {
  name: {
    type: DataTypes.STRING,
    primaryKey: true,
  },
  description: {
    type: DataTypes.TEXT
  },
  boxes: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: [],
    get() {
      const value = this.getDataValue('boxes');
  
      if (typeof value === 'string') {
        try {
          return JSON.parse(value);
        } catch {
          return [];
        }
      }
  
      return value || [];
    }
  },
    items_qty: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  amount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false
  },
  adminId: {
    type: DataTypes.INTEGER,
    references: {
      model: 'Users',
      key: 'id'
    },
    allowNull: true
  },
  createdBy: {
    type: DataTypes.INTEGER,
    references: {
      model: 'Users',
      key: 'id'
    },
    allowNull: true
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
});

module.exports = WayBill;