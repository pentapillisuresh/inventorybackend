const sequelize = require('../config/database');

// Import models
const User = require('./User');
const Store = require('./Store');
const Room = require('./Room');
const Rack = require('./Rack');
const Freezer = require('./Freezer');
const Category = require('./Category');
const Product = require('./Product');
const Inventory = require('./Inventory');
const Invoice = require('./Invoice');
const InvoiceItem = require('./InvoiceItem');
const Outlet = require('./Outlet');
const Ticket = require('./Ticket');
const Expenditure = require('./Expenditure');

// Define associations

// User associations
User.hasMany(User, { as: 'CreatedUsers', foreignKey: 'createdBy' });
User.belongsTo(User, { as: 'CreatedBy', foreignKey: 'createdBy' });

User.hasMany(Store, { foreignKey: 'adminId', as: 'stores' });
Store.belongsTo(User, { as: 'Admin', foreignKey: 'adminId' });
Store.belongsTo(User, { as: 'Manager', foreignKey: 'managerId' });

User.hasMany(Category, { foreignKey: 'adminId' });
Category.belongsTo(User, { as: 'Admin', foreignKey: 'adminId' });

User.hasMany(Product, { foreignKey: 'adminId' });
Product.belongsTo(User, { as: 'Admin', foreignKey: 'adminId' });

User.hasMany(Invoice, { foreignKey: 'adminId' });
Invoice.belongsTo(User, { as: 'Admin', foreignKey: 'adminId' });

User.hasMany(Invoice, { foreignKey: 'storeManagerId' });
Invoice.belongsTo(User, { as: 'StoreManager', foreignKey: 'storeManagerId' });

User.hasMany(Ticket, { foreignKey: 'raisedById' });
Ticket.belongsTo(User, { as: 'RaisedBy', foreignKey: 'raisedById' });

User.hasMany(Ticket, { foreignKey: 'resolvedById' });
Ticket.belongsTo(User, { as: 'ResolvedBy', foreignKey: 'resolvedById' });

User.hasMany(Expenditure, { foreignKey: 'adminId' });
Expenditure.belongsTo(User, { as: 'Admin', foreignKey: 'adminId' });

// Store associations
Store.hasMany(Room, { foreignKey: 'storeId' });
Room.belongsTo(Store, { foreignKey: 'storeId' });

Store.hasMany(Inventory, { foreignKey: 'storeId' });
Inventory.belongsTo(Store, { foreignKey: 'storeId' });

Store.hasMany(Invoice, { foreignKey: 'storeId' });
Invoice.belongsTo(Store, { foreignKey: 'storeId' });

Store.hasMany(Outlet, { foreignKey: 'storeId' });
Outlet.belongsTo(Store, { foreignKey: 'storeId' });

User.hasMany(Outlet, { foreignKey: 'managerId' });
Outlet.belongsTo(User, { foreignKey: 'managerId' });

Store.hasMany(Ticket, { foreignKey: 'storeId' });
Ticket.belongsTo(Store, { foreignKey: 'storeId' });

// Room associations
Room.hasMany(Rack, { foreignKey: 'roomId' });
Rack.belongsTo(Room, { foreignKey: 'roomId' });

Room.hasMany(Freezer, { foreignKey: 'roomId' });
Freezer.belongsTo(Room, { foreignKey: 'roomId' });

Room.hasMany(Inventory, { foreignKey: 'roomId' });
Inventory.belongsTo(Room, { foreignKey: 'roomId' });

// Rack associations
Rack.hasMany(Inventory, { foreignKey: 'rackId' });
Inventory.belongsTo(Rack, { foreignKey: 'rackId' });

// Freezer associations
Freezer.hasMany(Inventory, { foreignKey: 'freezerId' });
Inventory.belongsTo(Freezer, { foreignKey: 'freezerId' });

// Category associations
Category.hasMany(Product, { foreignKey: 'categoryId' });
Product.belongsTo(Category, { foreignKey: 'categoryId' });

// Product associations
Product.hasMany(Inventory, { foreignKey: 'productId' });
Inventory.belongsTo(Product, { foreignKey: 'productId' });

Product.hasMany(InvoiceItem, { foreignKey: 'productId' });
InvoiceItem.belongsTo(Product, { foreignKey: 'productId' });

Product.hasMany(Ticket, { foreignKey: 'productId' });
Ticket.belongsTo(Product, { foreignKey: 'productId' });

// Invoice associations
Invoice.hasMany(InvoiceItem, { foreignKey: 'invoiceId',as: 'items' });
InvoiceItem.belongsTo(Invoice, { foreignKey: 'invoiceId',as: 'invoice' });

Outlet.hasMany(Invoice, { foreignKey: 'storeId' });
Invoice.belongsTo(Outlet, { foreignKey: 'outletId' });

// Sync database
const syncDatabase = async () => {
  try {
    await sequelize.sync({ alter: true });
    console.log('Database synced successfully');
  } catch (error) {
    console.error('Error syncing database:', error);
  }
};

module.exports = {
  sequelize,
  User,
  Store,
  Room,
  Rack,
  Freezer,
  Category,
  Product,
  Inventory,
  Invoice,
  InvoiceItem,
  Outlet,
  Ticket,
  Expenditure,
  syncDatabase
};