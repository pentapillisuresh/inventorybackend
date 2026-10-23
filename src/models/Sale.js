const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Sale = sequelize.define('Sale', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    invoiceNumber: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
    },
    // ✅ correct — matches Sequelize's default pluralization
    outletId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'Outlets', key: 'id' }  // ← 'Outlets' (plural)
    },
    customerName: {
        type: DataTypes.STRING,
        allowNull: true
    },
    customerPhone: {
        type: DataTypes.STRING,
        allowNull: true
    },
    customerAddress: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    state: {
        type: DataTypes.STRING,
        allowNull: false            // used for reporting
    },
    saleDate: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    },
    subtotal: {
        type: DataTypes.DECIMAL(15, 2),
        defaultValue: 0
    },
    totalTax: {
        type: DataTypes.DECIMAL(15, 2),
        defaultValue: 0
    },
    discount: {
        type: DataTypes.DECIMAL(15, 2),
        defaultValue: 0
    },
    totalAmount: {
        type: DataTypes.DECIMAL(15, 2),
        defaultValue: 0
    },
    status: {
        type: DataTypes.ENUM('pending', 'approved', 'rejected', 'cancelled'),
        defaultValue: 'pending'
    },
    notes: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    approvedBy: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'Users', key: 'id' }
    },
    approvedAt: {
        type: DataTypes.DATE,
        allowNull: true
    },
    createdBy: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'Outlets', key: 'id' }
    }
}, {
    indexes: [
        { fields: ['outletId'] },
        { fields: ['state'] },
        { fields: ['status'] },
        { fields: ['saleDate'] }
    ]
});

module.exports = Sale;