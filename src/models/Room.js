const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Room = sequelize.define('Room', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  roomNumber: {
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
  capacity: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  currentOccupancy: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  }
});

module.exports = Room;