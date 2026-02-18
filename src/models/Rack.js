const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Rack = sequelize.define('Rack', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  rackNumber: {
    type: DataTypes.STRING,
    allowNull: false
  },
  roomId: {
    type: DataTypes.INTEGER,
    references: {
      model: 'Rooms',
      key: 'id'
    },
    allowNull: false
  },
  capacity: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  currentOccupancy: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  }
});

module.exports = Rack;