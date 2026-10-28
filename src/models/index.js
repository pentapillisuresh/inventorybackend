const sequelize = require('../config/database');

// Import models
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
const OutletProduct = require('./OutletProduct');
const Ticket = require('./Ticket');
const Expenditure = require('./Expenditure');
const User = require('./User');
const WayBill = require('./WayBill');
const Sale = require('./Sale');
const SaleItem = require('./SaleItem');
const OutletExpenditure = require('./OutletExpenditure');
const StockRequest = require('./StockRequest');
const StockRequestItem = require('./StockRequestItem');

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

User.hasMany(Product, { foreignKey: 'createdBy' });
Product.belongsTo(User, { as: 'createdUser', foreignKey: 'createdBy' });

User.hasMany(Invoice, { foreignKey: 'createdBy' });
Invoice.belongsTo(User, { as: 'createdUser', foreignKey: 'createdBy' });

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

User.hasMany(Expenditure, { foreignKey: 'createdBy' });
Expenditure.belongsTo(User, { as: 'createdUser', foreignKey: 'createdBy' });

Outlet.hasMany(Expenditure, { foreignKey: 'outletId' });
Expenditure.belongsTo(Outlet, { as: 'Outlet', foreignKey: 'outletId' });

Outlet.hasMany(Expenditure, { foreignKey: 'createdBy' });
Expenditure.belongsTo(Outlet, { as: 'createdByOutlet', foreignKey: 'createdBy' });

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

User.hasMany(Outlet, { foreignKey: 'createdBy' });
Outlet.belongsTo(User, { as: 'createdUser', foreignKey: 'createdBy' });

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

Outlet.hasMany(Invoice, {
  foreignKey: 'outletId',
  as: 'invoices'
});

Invoice.belongsTo(Outlet, {
  foreignKey: 'outletId',
  as: 'outlet'
});

// Register associations before syncing
Outlet.hasMany(OutletProduct, {
  foreignKey: 'outletId',
  as: 'products'
});

OutletProduct.belongsTo(Outlet, {
  foreignKey: 'outletId',
  as: 'outlet'
});


// Associations
StockRequest.hasMany(StockRequestItem, { foreignKey: 'requestId', as: 'items', onDelete: 'CASCADE' });
StockRequestItem.belongsTo(StockRequest, { foreignKey: 'requestId', as: 'request' });

OutletProduct.hasMany(StockRequestItem, { foreignKey: 'outletProductId', as: 'requestItems' });
StockRequestItem.belongsTo(OutletProduct, { foreignKey: 'outletProductId', as: 'product' });

// Sale <-> SaleItem
Sale.hasMany(SaleItem, {
  foreignKey: 'saleId',
  as: 'items',
  onDelete: 'CASCADE'
});
SaleItem.belongsTo(Sale, {
  foreignKey: 'saleId',
  as: 'sale'
});

// SaleItem <-> OutletProduct
SaleItem.belongsTo(OutletProduct, {
  foreignKey: 'outletProductId',
  as: 'product'
});
OutletProduct.hasMany(SaleItem, {
  foreignKey: 'outletProductId',
  as: 'saleItems'
});
Sale.belongsTo(Outlet, {
  foreignKey: 'outletId',
});
Outlet.hasMany(Sale, {
  foreignKey: 'approvedBy',
  as: 'approver'
});

Sale.belongsTo(Outlet, {
  foreignKey: 'approvedBy',
  as: 'approver',
});

Sale.belongsTo(Outlet, {
  foreignKey: 'createdBy',
  as: 'creator',
});

Outlet.hasMany(Sale, {
  foreignKey: 'createdBy',
  as: 'creator'
});

// Outlet <-> OutletExpenditure
Outlet.hasMany(OutletExpenditure, {
  foreignKey: 'outletId',
  as: 'expenditures'
});

OutletExpenditure.belongsTo(Outlet, {
  foreignKey: 'outletId',
  as: 'outlet'
});

// Outlet creator
Outlet.hasMany(OutletExpenditure, {
  foreignKey: 'createdBy',
  as: 'createdOutletExpenditures'
});

OutletExpenditure.belongsTo(Outlet, {
  foreignKey: 'createdBy',
  as: 'createdByOutlet'
});

// Sync database
const syncDatabase = async () => {
  try {
    await sequelize.sync({ alter: true });
    console.log('Database synced successfully');
  } catch (error) {
    console.error('Error syncing database:', error);
  }
};

// Ensure these associations exist in your models/index.js
StockRequest.belongsTo(Outlet, { foreignKey: 'outletId', as: 'outlet' });

module.exports = {
  sequelize,
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
  OutletProduct,
  Ticket,
  Expenditure,
  User,
  Sale,
  StockRequest,
  StockRequestItem,
  OutletExpenditure,
  SaleItem,
  WayBill,
  syncDatabase
};