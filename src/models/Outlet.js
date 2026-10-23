
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const bcrypt = require('bcryptjs');

const Outlet = sequelize.define('Outlet', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  type: {
    type: DataTypes.ENUM('dummy', 'custom'),
    defaultValue: 'custom'
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false
  },
  FSSAI_No: {
    type: DataTypes.STRING,
    allowNull: true
  },
  GST_No: {
    type: DataTypes.STRING,
    allowNull: true
  },
  CIN_No: {
    type: DataTypes.STRING,
    allowNull: true
  },
  storeId: {
    type: DataTypes.INTEGER,
    references: {
      model: 'Stores',
      key: 'id'
    },
    allowNull: true
  },
  managerId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'Users',
      key: 'id'
    }
  },
  address: {
    type: DataTypes.TEXT
  },
  contactPerson: {
    type: DataTypes.STRING
  },
  email: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      isEmail: true
    }
  },
  phoneNumber: {
    type: DataTypes.STRING
  },
  creditLimit: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0
  },
  currentCredit: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0
  },
  createdBy: {
    type: DataTypes.INTEGER,
    references: {
      model: 'Users',
      key: 'id'
    },
    allowNull: true
  },
  permissions: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: {
      create_products: false,
      create_expanditure: false
    }
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  hooks: {
    beforeCreate: async (outlet) => {
      if (outlet.password) {
        outlet.password = await bcrypt.hash(outlet.password, 10);
      }
    },
    beforeUpdate: async (outlet) => {
      if (outlet.changed('password')) {
        outlet.password = await bcrypt.hash(outlet.password, 10);
      }
    }
  }
});

Outlet.prototype.comparePassword = async function(password) {
  return bcrypt.compare(password, this.password);
};

module.exports = Outlet;
