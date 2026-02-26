const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { syncDatabase } = require('./src/models');

const app = express();

/* ---------------- CORS ---------------- */
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);

    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:5000',
      'http://localhost:5001'
    ];

    if (
      allowedOrigins.includes(origin) ||
      process.env.NODE_ENV === 'development'
    ) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
// app.options('/*', cors(corsOptions)); // ✅ FIXED

/* ---------------- Middleware ---------------- */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ---------------- Static ---------------- */
app.use('/uploads', express.static('src/uploads'));

/* ---------------- Routes ---------------- */
app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/users', require('./src/routes/users'));
app.use('/api/stores', require('./src/routes/stores'));
app.use('/api/products', require('./src/routes/products'));
app.use('/api/categories', require('./src/routes/categories'));
app.use('/api/outlets', require('./src/routes/outlets'));
app.use('/api/tickets', require('./src/routes/tickets'));
app.use('/api/expenditures', require('./src/routes/expenditures'));
app.use('/api/inventory', require('./src/routes/inventory'));
app.use('/api/invoice', require('./src/routes/invoice'));
app.use('/api/reports', require('./src/routes/reports'));
app.use('/api/upload', require('./src/routes/uploadImage'));

/* ---------------- Error Handler ---------------- */
app.use((err, req, res, next) => {
  console.error(err.stack);

  if (err.name === 'MulterError') {
    return res.status(400).json({ error: err.message });
  }

  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'CORS Error: Origin not allowed' });
  }

  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error'
  });
});

/* ---------------- 404 ---------------- */
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});
/* ---------------- Super Admin Seed ---------------- */
createInitialSuperAdmin();

const PORT = process.env.PORT || 5000;

/* ---------------- Start Server ---------------- */
syncDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV}`);
    });
  })
  .catch(error => {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  });

/* ---------------- Seeder ---------------- */
async function createInitialSuperAdmin() {
  try {
    const { User } = require('./src/models');
    const bcrypt = require('bcryptjs');

    const superAdminExists = await User.findOne({
      where: { email: 'superadmin@gmail.com' }
    });

    if (!superAdminExists) {
      // const hashedPassword = await bcrypt.hash('Admin@123', 10);

      await User.create({
        name: 'Super Admin',
        email: 'superadmin@gmail.com',
        phoneNumber: '123456',
        password: 'Admin@123',
        role: 'superadmin',
        permissions: {
          create_store: true,
          create_rooms: true,
          create_rack: true,
          create_freezers: true,
          create_invoices: true,
          expenditure_management: true,
          create_outlets: true
        },
        isActive: true
      });

      console.log('✅ Initial superadmin created');
    }
  } catch (error) {
    console.error('❌ Error creating initial superadmin:', error);
  }
}
