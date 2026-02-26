const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Ticket = sequelize.define('Ticket', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  ticketNumber: {
    type: DataTypes.STRING,
    allowNull: false
  },
  storeId: {
    type: DataTypes.INTEGER,
    references: {
      model: 'Stores',
      key: 'id'
    },
    allowNull: false
  },
  productId: {
    type: DataTypes.INTEGER,
    references: {
      model: 'Products',
      key: 'id'
    }
  },
  quantityMissing: {
    type: DataTypes.INTEGER
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  raisedById: {
    type: DataTypes.INTEGER,
    references: {
      model: 'Users',
      key: 'id'
    },
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('open', 'in_progress', 'resolved', 'closed'),
    defaultValue: 'open'
  },
  actionTaken: {
    type: DataTypes.TEXT
  },
  resolvedById: {
    type: DataTypes.INTEGER,
    references: {
      model: 'Users',
      key: 'id'
    }
  },
  createdBy: {
    type: DataTypes.INTEGER,
    references: {
      model: 'Users',
      key: 'id'
    },
    allowNull: true
  },
  resolvedAt: {
    type: DataTypes.DATE
  }
});

module.exports = Ticket;