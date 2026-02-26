const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Inventory = sequelize.define('Inventory', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  productId: {
    type: DataTypes.INTEGER,
    references: {
      model: 'Products',
      key: 'id'
    },
    allowNull: false
  },
  storeId: {
    type: DataTypes.INTEGER,
    references: {
      model: 'Stores',
      key: 'id'
    },
    allowNull: true
  },
  roomId: {
    type: DataTypes.INTEGER,
    references: {
      model: 'Rooms',
      key: 'id'
    }
  },
  rackId: {
    type: DataTypes.INTEGER,
    references: {
      model: 'Racks',
      key: 'id'
    }
  },
  freezerId: {
    type: DataTypes.INTEGER,
    references: {
      model: 'Freezers',
      key: 'id'
    }
  },
  quantity: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  reorderLevel: {
    type: DataTypes.INTEGER,
    defaultValue: 10
  },
  lastUpdated: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
});

module.exports = Inventory;