const { Ticket, Store, Product, User, sequelize } = require('../models');
const { Op } = require('sequelize'); // Add this import
const XLSX = require('xlsx'); // Add for export functionality
// Create dishonour ticket
exports.createTicket = async (req, res) => {
  try {
    const { storeId } = req.params;
    const { productId, quantityMissing, description } = req.body;

    // Generate ticket number
    const ticketNumber = `TICKET-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const ticket = await Ticket.create({
      ticketNumber,
      storeId,
      productId,
      quantityMissing,
      description,
      raisedById: req.user.id,
      status: 'open'
    });

    res.status(201).json({
      message: 'Ticket created successfully',
      ticket
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get all tickets for a store
exports.getStoreTickets = async (req, res) => {
  try {
    const { storeId } = req.params;
    const { status } = req.query;

    const where = { storeId };
    if (status) where.status = status;

    const tickets = await Ticket.findAll({
      where,
      include: [
        { model: Store },
        { model: Product },
        { model: User, as: 'RaisedBy', attributes: ['id', 'name', 'email'] },
        { model: User, as: 'ResolvedBy', attributes: ['id', 'name', 'email'] }
      ],
      order: [['createdAt', 'DESC']]
    });

    res.json(tickets);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Resolve ticket
exports.resolveTicket = async (req, res) => {
  try {
    const { storeId, ticketId } = req.params;
    const { actionTaken } = req.body;

    const ticket = await Ticket.findOne({
      where: { id: ticketId, storeId }
    });

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    ticket.status = 'closed';
    ticket.actionTaken = actionTaken;
    ticket.resolvedById = req.user.id;
    ticket.resolvedAt = new Date();

    await ticket.save();

    res.json({
      message: 'Ticket resolved successfully',
      ticket
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get ticket statistics
exports.getTicketStats = async (req, res) => {
  try {
    const { storeId } = req.params;

    const stats = await Ticket.findAll({
      where: { storeId },
      attributes: [
        'status',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['status']
    });

    const totalTickets = await Ticket.count({ where: { storeId } });
    const openTickets = await Ticket.count({ 
      where: { storeId, status: 'open' } 
    });
    const resolvedTickets = await Ticket.count({ 
      where: { storeId, status: 'closed' } 
    });

    res.json({
      totalTickets,
      openTickets,
      resolvedTickets,
      byStatus: stats
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};


// Get all tickets (Filtered by role)
exports.getAllTickets = async (req, res) => {
  try {
    const { 
      status, 
      priority, 
      type, 
      storeId, 
      page = 1, 
      limit = 20 
    } = req.query;
    
    const offset = (page - 1) * limit;
    const where = {};

    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (type) where.type = type;
    if (storeId) where.storeId = storeId;

    // Role-based filtering
    if (req.user.role === 'admin') {
      // Admin sees tickets from their stores
      const adminStores = await Store.findAll({
        where: { adminId: req.user.id },
        attributes: ['id']
      });
      where.storeId = { [Op.in]: adminStores.map(s => s.id) };
    } else if (req.user.role === 'store_manager') {
      // Store manager sees tickets from their store only
      const store = await Store.findOne({
        where: { managerId: req.user.id },
        attributes: ['id']
      });
      if (store) {
        where.storeId = store.id;
      } else {
        return res.json([]);
      }
    }
    // Superadmin sees all (no filter)

    const { count, rows: tickets } = await Ticket.findAndCountAll({
      where,
      include: [
        { model: Store, attributes: ['id', 'name'] },
        { model: Product, attributes: ['id', 'name', 'sku'] },
        { 
          model: User, 
          as: 'RaisedBy', 
          attributes: ['id', 'name', 'email'] 
        },
        { 
          model: User, 
          as: 'ResolvedBy', 
          attributes: ['id', 'name', 'email'] 
        }
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      total: count,
      totalPages: Math.ceil(count / limit),
      currentPage: parseInt(page),
      tickets
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get ticket by ID
exports.getTicketById = async (req, res) => {
  try {
    const { id } = req.params;

    const ticket = await Ticket.findByPk(id, {
      include: [
        { model: Store, attributes: ['id', 'name', 'adminId', 'managerId'] },
        { model: Product, attributes: ['id', 'name', 'sku'] },
        { 
          model: User, 
          as: 'RaisedBy', 
          attributes: ['id', 'name', 'email', 'role'] 
        },
        { 
          model: User, 
          as: 'ResolvedBy', 
          attributes: ['id', 'name', 'email'] 
        },
        {
          model: Comment,
          include: [{
            model: User,
            attributes: ['id', 'name', 'email']
          }],
          order: [['createdAt', 'ASC']]
        }
      ]
    });

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    // Check access rights
    if (!await checkTicketAccess(req.user, ticket.Store)) {
      return res.status(403).json({ error: 'Access denied to this ticket' });
    }

    res.json(ticket);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Update ticket
exports.updateTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const { description, priority, quantityMissing, type } = req.body;

    const ticket = await Ticket.findByPk(id, {
      include: [{ model: Store }]
    });

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    // Check access rights
    if (!await checkTicketAccess(req.user, ticket.Store)) {
      return res.status(403).json({ error: 'Access denied to update this ticket' });
    }

    // Only allow updates if ticket is open or in progress
    if (ticket.status === 'closed') {
      return res.status(400).json({ error: 'Cannot update a closed ticket' });
    }

    // Only the person who raised it or admin can update
    if (ticket.raisedById !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only ticket creator or admin can update' });
    }

    const updates = {};
    if (description) updates.description = description;
    if (priority) updates.priority = priority;
    if (quantityMissing !== undefined) updates.quantityMissing = quantityMissing;
    if (type) updates.type = type;

    await ticket.update(updates);

    res.json({
      message: 'Ticket updated successfully',
      ticket
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Acknowledge ticket (Store Manager)
exports.acknowledgeTicket = async (req, res) => {
  try {
    const { id } = req.params;

    const ticket = await Ticket.findByPk(id, {
      include: [{ model: Store }]
    });

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    // Only store manager can acknowledge tickets
    if (req.user.role !== 'store_manager') {
      return res.status(403).json({ error: 'Only store managers can acknowledge tickets' });
    }

    // Check if store manager belongs to this store
    if (!ticket.Store || ticket.Store.managerId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied to this ticket' });
    }

    ticket.status = 'in_progress';
    await ticket.save();

    res.json({
      message: 'Ticket acknowledged successfully',
      ticket
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Reopen ticket
exports.reopenTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const ticket = await Ticket.findByPk(id, {
      include: [{ model: Store }]
    });

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    // Check access rights
    if (!await checkTicketAccess(req.user, ticket.Store)) {
      return res.status(403).json({ error: 'Access denied to this ticket' });
    }

    ticket.status = 'open';
    await ticket.save();

    res.json({
      message: 'Ticket reopened successfully',
      ticket
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Add comment to ticket
exports.addComment = async (req, res) => {
  try {
    const { id } = req.params;
    const { comment } = req.body;

    const ticket = await Ticket.findByPk(id, {
      include: [{ model: Store }]
    });

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    // Check access rights
    if (!await checkTicketAccess(req.user, ticket.Store)) {
      return res.status(403).json({ error: 'Access denied to this ticket' });
    }

    const newComment = await Comment.create({
      ticketId: id,
      userId: req.user.id,
      comment,
      isSystem: false
    });

    res.status(201).json({
      message: 'Comment added successfully',
      comment: newComment
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get ticket comments
exports.getTicketComments = async (req, res) => {
  try {
    const { id } = req.params;

    const ticket = await Ticket.findByPk(id, {
      include: [{ model: Store }]
    });

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    // Check access rights
    if (!await checkTicketAccess(req.user, ticket.Store)) {
      return res.status(403).json({ error: 'Access denied to this ticket' });
    }

    const comments = await Comment.findAll({
      where: { ticketId: id },
      include: [{
        model: User,
        attributes: ['id', 'name', 'email', 'role']
      }],
      order: [['createdAt', 'ASC']]
    });

    res.json(comments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get tickets by status
exports.getTicketsByStatus = async (req, res) => {
  try {
    const { status } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const where = { status };

    // Role-based filtering
    if (req.user.role === 'admin') {
      const adminStores = await Store.findAll({
        where: { adminId: req.user.id },
        attributes: ['id']
      });
      where.storeId = { [Op.in]: adminStores.map(s => s.id) };
    } else if (req.user.role === 'store_manager') {
      const store = await Store.findOne({
        where: { managerId: req.user.id },
        attributes: ['id']
      });
      if (store) {
        where.storeId = store.id;
      } else {
        return res.json([]);
      }
    }

    const { count, rows: tickets } = await Ticket.findAndCountAll({
      where,
      include: [
        { model: Store, attributes: ['id', 'name'] },
        { model: Product, attributes: ['id', 'name', 'sku'] },
        { 
          model: User, 
          as: 'RaisedBy', 
          attributes: ['id', 'name', 'email'] 
        }
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      status,
      total: count,
      totalPages: Math.ceil(count / limit),
      currentPage: parseInt(page),
      tickets
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Search tickets
exports.searchTickets = async (req, res) => {
  try {
    const { q, field = 'all' } = req.query;

    if (!q || q.length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }

    const where = {};

    // Role-based filtering
    if (req.user.role === 'admin') {
      const adminStores = await Store.findAll({
        where: { adminId: req.user.id },
        attributes: ['id']
      });
      where.storeId = { [Op.in]: adminStores.map(s => s.id) };
    } else if (req.user.role === 'store_manager') {
      const store = await Store.findOne({
        where: { managerId: req.user.id },
        attributes: ['id']
      });
      if (store) {
        where.storeId = store.id;
      } else {
        return res.json([]);
      }
    }

    const searchConditions = [];

    if (field === 'all' || field === 'ticketNumber') {
      searchConditions.push({
        ticketNumber: { [Op.like]: `%${q}%` }
      });
    }

    if (field === 'all' || field === 'description') {
      searchConditions.push({
        description: { [Op.like]: `%${q}%` }
      });
    }

    if (field === 'all' || field === 'actionTaken') {
      searchConditions.push({
        actionTaken: { [Op.like]: `%${q}%` }
      });
    }

    where[Op.or] = searchConditions;

    const tickets = await Ticket.findAll({
      where,
      include: [
        { model: Store, attributes: ['id', 'name'] },
        { model: Product, attributes: ['id', 'name', 'sku'] },
        { 
          model: User, 
          as: 'RaisedBy', 
          attributes: ['id', 'name', 'email'] 
        }
      ],
      order: [['createdAt', 'DESC']],
      limit: 50
    });

    res.json({
      query: q,
      field,
      count: tickets.length,
      tickets
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Export tickets
exports.exportTickets = async (req, res) => {
  try {
    const { format = 'excel', startDate, endDate, storeId } = req.query;

    const where = {};

    if (startDate && endDate) {
      where.createdAt = {
        [Op.between]: [new Date(startDate), new Date(endDate)]
      };
    }

    if (storeId) {
      where.storeId = storeId;
    }

    // Role-based filtering
    if (req.user.role === 'admin') {
      const adminStores = await Store.findAll({
        where: { adminId: req.user.id },
        attributes: ['id']
      });
      where.storeId = { [Op.in]: adminStores.map(s => s.id) };
    } else if (req.user.role === 'store_manager') {
      const store = await Store.findOne({
        where: { managerId: req.user.id },
        attributes: ['id']
      });
      if (store) {
        where.storeId = store.id;
      } else {
        return res.json([]);
      }
    }

    const tickets = await Ticket.findAll({
      where,
      include: [
        { model: Store, attributes: ['id', 'name'] },
        { model: Product, attributes: ['id', 'name', 'sku'] },
        { 
          model: User, 
          as: 'RaisedBy', 
          attributes: ['id', 'name', 'email'] 
        },
        { 
          model: User, 
          as: 'ResolvedBy', 
          attributes: ['id', 'name', 'email'] 
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    if (format === 'excel') {
      // Prepare data for Excel
      const excelData = tickets.map(ticket => ({
        'Ticket Number': ticket.ticketNumber,
        'Store': ticket.Store?.name || '',
        'Product': ticket.Product?.name || '',
        'Description': ticket.description,
        'Status': ticket.status,
        'Priority': ticket.priority || 'medium',
        'Type': ticket.type || 'inventory_discrepancy',
        'Quantity Missing': ticket.quantityMissing || '',
        'Raised By': ticket.RaisedBy?.name || '',
        'Raised At': ticket.createdAt,
        'Resolved By': ticket.ResolvedBy?.name || '',
        'Resolved At': ticket.resolvedAt || '',
        'Action Taken': ticket.actionTaken || ''
      }));

      // Create workbook
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(excelData);
      
      // Set column widths
      const wscols = [
        { wch: 20 }, // Ticket Number
        { wch: 20 }, // Store
        { wch: 20 }, // Product
        { wch: 40 }, // Description
        { wch: 15 }, // Status
        { wch: 15 }, // Priority
        { wch: 20 }, // Type
        { wch: 15 }, // Quantity Missing
        { wch: 20 }, // Raised By
        { wch: 20 }, // Raised At
        { wch: 20 }, // Resolved By
        { wch: 20 }, // Resolved At
        { wch: 40 }  // Action Taken
      ];
      ws['!cols'] = wscols;

      XLSX.utils.book_append_sheet(wb, ws, 'Tickets');

      // Generate Excel file
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=tickets-${Date.now()}.xlsx`);
      res.send(buffer);

    } else if (format === 'csv') {
      // Generate CSV
      const csvData = tickets.map(ticket => ({
        'Ticket Number': ticket.ticketNumber,
        'Store': ticket.Store?.name || '',
        'Product': ticket.Product?.name || '',
        'Description': ticket.description,
        'Status': ticket.status,
        'Priority': ticket.priority || 'medium',
        'Type': ticket.type || 'inventory_discrepancy',
        'Quantity Missing': ticket.quantityMissing || '',
        'Raised By': ticket.RaisedBy?.name || '',
        'Raised At': ticket.createdAt,
        'Resolved By': ticket.ResolvedBy?.name || '',
        'Resolved At': ticket.resolvedAt || '',
        'Action Taken': ticket.actionTaken || ''
      }));

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=tickets-${Date.now()}.csv`);
      
      // Simple CSV generation
      if (csvData.length > 0) {
        const headers = Object.keys(csvData[0]).join(',');
        const rows = csvData.map(row => 
          Object.values(row).map(value => 
            `"${(value || '').toString().replace(/"/g, '""')}"`
          ).join(',')
        );
        
        res.send([headers, ...rows].join('\n'));
      } else {
        res.send('No data to export');
      }
    } else {
      res.json(tickets);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Bulk update ticket status
exports.bulkUpdateTicketStatus = async (req, res) => {
  try {
    const { ticketIds, status, actionTaken } = req.body;

    if (!Array.isArray(ticketIds) || ticketIds.length === 0) {
      return res.status(400).json({ error: 'Ticket IDs array is required' });
    }

    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    // Get tickets with store info
    const tickets = await Ticket.findAll({
      where: { id: { [Op.in]: ticketIds } },
      include: [{ model: Store }]
    });

    // Filter tickets that user has access to
    const accessibleTickets = tickets.filter(ticket => 
      checkTicketAccess(req.user, ticket.Store)
    );

    if (accessibleTickets.length === 0) {
      return res.status(403).json({ error: 'No accessible tickets found' });
    }

    // Update accessible tickets
    const updatePromises = accessibleTickets.map(ticket => {
      ticket.status = status;
      if (actionTaken) ticket.actionTaken = actionTaken;
      if (status === 'closed') {
        ticket.resolvedById = req.user.id;
        ticket.resolvedAt = new Date();
      }
      return ticket.save();
    });

    await Promise.all(updatePromises);

    res.json({
      message: `Updated ${accessibleTickets.length} tickets`,
      updatedCount: accessibleTickets.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Helper function to check ticket access
async function checkTicketAccess(user, store) {
  if (user.role === 'superadmin') return true;
  if (user.role === 'admin' && store.adminId === user.id) return true;
  if (user.role === 'store_manager' && store.managerId === user.id) return true;
  return false;
}

// Also need to update the getTicketStats function to work without storeId param
// (based on route: GET /stats/overview)
exports.getTicketStats = async (req, res) => {
  try {
    const where = {};

    // Role-based filtering
    if (req.user.role === 'admin') {
      const adminStores = await Store.findAll({
        where: { adminId: req.user.id },
        attributes: ['id']
      });
      where.storeId = { [Op.in]: adminStores.map(s => s.id) };
    } else if (req.user.role === 'store_manager') {
      const store = await Store.findOne({
        where: { managerId: req.user.id },
        attributes: ['id']
      });
      if (store) {
        where.storeId = store.id;
      } else {
        return res.json({
          totalTickets: 0,
          openTickets: 0,
          resolvedTickets: 0,
          byStatus: []
        });
      }
    }

    const stats = await Ticket.findAll({
      where,
      attributes: [
        'status',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['status']
    });

    const totalTickets = await Ticket.count({ where });
    const openTickets = await Ticket.count({ 
      where: { ...where, status: 'open' } 
    });
    const resolvedTickets = await Ticket.count({ 
      where: { ...where, status: 'closed' } 
    });

    res.json({
      totalTickets,
      openTickets,
      resolvedTickets,
      byStatus: stats
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get tickets by store
exports.getTicketsByStore = async (req, res) => {
  try {
    const { storeId } = req.params;
    const { status, priority, type, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    // Check if store exists and user has access
    const store = await Store.findByPk(storeId);
    if (!store) {
      return res.status(404).json({ error: 'Store not found' });
    }

    if (!await checkTicketAccess(req.user, store)) {
      return res.status(403).json({ error: 'Access denied to this store' });
    }

    const where = { storeId };
    
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (type) where.type = type;

    const { count, rows: tickets } = await Ticket.findAndCountAll({
      where,
      include: [
        { model: Product, attributes: ['id', 'name', 'sku'] },
        { 
          model: User, 
          as: 'RaisedBy', 
          attributes: ['id', 'name', 'email'] 
        },
        { 
          model: User, 
          as: 'ResolvedBy', 
          attributes: ['id', 'name', 'email'] 
        }
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    // Get store-specific statistics
    const stats = {
      total: count,
      open: await Ticket.count({ where: { ...where, status: 'open' } }),
      inProgress: await Ticket.count({ where: { ...where, status: 'in_progress' } }),
      closed: await Ticket.count({ where: { ...where, status: 'closed' } }),
      byPriority: {
        low: await Ticket.count({ where: { ...where, priority: 'low' } }),
        medium: await Ticket.count({ where: { ...where, priority: 'medium' } }),
        high: await Ticket.count({ where: { ...where, priority: 'high' } }),
        critical: await Ticket.count({ where: { ...where, priority: 'critical' } })
      },
      byType: {
        inventory_discrepancy: await Ticket.count({ where: { ...where, type: 'inventory_discrepancy' } }),
        damage: await Ticket.count({ where: { ...where, type: 'damage' } }),
        theft: await Ticket.count({ where: { ...where, type: 'theft' } }),
        other: await Ticket.count({ where: { ...where, type: 'other' } })
      }
    };

    res.json({
      store: {
        id: store.id,
        name: store.name,
        adminId: store.adminId,
        managerId: store.managerId
      },
      stats,
      total: count,
      totalPages: Math.ceil(count / limit),
      currentPage: parseInt(page),
      tickets
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};