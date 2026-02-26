const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const bcrypt = require('bcryptjs');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  BusinessImage: {
    type: DataTypes.STRING,
    allowNull: true
  },
  businessType: {
    type: DataTypes.STRING,
    allowNull: true
  },
  planType: {
    type: DataTypes.STRING,
    allowNull: true
  },
  maxStores: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  maxOutlet: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  BusinessLogo: {
    type: DataTypes.STRING,
    allowNull: true
  },
  email: {
    type: DataTypes.STRING,
    validate: {
      isEmail: true
    }
  },
  phoneNumber: {
    type: DataTypes.STRING,
    allowNull: false
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false
  },
  role: {
    type: DataTypes.ENUM('superadmin', 'admin', 'store_manager'),
    defaultValue: 'store_manager'
  },
  permissions: {
    type: DataTypes.JSON,
    defaultValue: {
      create_store: false,
      create_rooms: false,
      create_rack: false,
      create_freezers: false,
      create_invoices: false,
      expenditure_management: false,
      create_outlets: false
    }
  },
  startDate: {
    type: DataTypes.DATE,
    allowNull: true
  },
  expiryDate: {
    type: DataTypes.DATE,
    allowNull: true
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  createdBy: {
    type: DataTypes.INTEGER,
    references: {
      model: 'Users',
      key: 'id'
    }
  }
}, {
  indexes: [
    {
      unique: true,
      fields: ['email']
    }
  ],
  hooks: {
    beforeCreate: async (user) => {
      if (user.password) {
        user.password = await bcrypt.hash(user.password, 10);
      }
    },
    beforeUpdate: async (user) => {
      if (user.changed('password')) {
        user.password = await bcrypt.hash(user.password, 10);
      }
    }
  }
});

User.prototype.comparePassword = async function(password) {
  return await bcrypt.compare(password, this.password);
};

module.exports = User;