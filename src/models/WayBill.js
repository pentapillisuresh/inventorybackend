const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const WayBill = sequelize.define(
  'WayBill',
  {
    name: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
    },

    description: {
      type: DataTypes.TEXT,
      allowNull: true,
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
      },
    },

    items_qty: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },

    amount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
    },

    adminId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'Users',
        key: 'id',
      },
    },

    createdBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'Users',
        key: 'id',
      },
    },

    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
  },
  {
    tableName: 'waybills',
    freezeTableName: true,
  }
);

module.exports = WayBill;