const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Freezer = sequelize.define('Freezer', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  freezerNumber: {
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
  temperature: {
    type: DataTypes.DECIMAL(5, 2)
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

module.exports = Freezer;