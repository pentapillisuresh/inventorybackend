const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const RawMaterialUsage = sequelize.define('RawMaterialUsage', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  outletProductId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'OutletProducts', // The table name for OutletProduct
      key: 'id'
    },
    onDelete: 'CASCADE'
  },
  outletId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  quantityUsed: {
    type: DataTypes.DECIMAL(10, 2), // Using decimal to allow for fractional units (e.g., 1.5 Kg)
    allowNull: false
  },
  unit: {
    type: DataTypes.STRING,
    allowNull: true
  },
  usageType: {
    type: DataTypes.ENUM('Given to Cook', 'Damage / Waste', 'Other'),
    defaultValue: 'Given to Cook'
  },
  remarks: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  date: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  costAtTimeOfUsage: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true,
    comment: "Unit cost * quantity used, for historical expense tracking"
  },
  createdBy: {
    type: DataTypes.INTEGER,
    allowNull: true
  }
});

module.exports = RawMaterialUsage;