// app.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const connectDB = require('./config/database');
const errorHandler = require('./middleware/errorHandler');
require('dotenv').config();

// Import routes
const patientRoutes = require('./routes/patients');
const vitalSignsRoutes = require('./routes/vitalSigns');
const medicationRoutes = require('./routes/medications');
const doctorRoutes = require('./routes/doctors');
const notificationRoutes = require('./routes/notifications');
const authRoutes = require('./routes/auth');

// Import services (they auto-initialize)
require('./services/notificationService');

const app = express();

// Connect to database
connectDB();

// Security middleware
app.use(helmet());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// CORS
app.use(cors());

// Compression
app.use(compression());

// Routes
app.use('/api/patients', patientRoutes);
app.use('/api/vital-signs', vitalSignsRoutes);
app.use('/api/medications', medicationRoutes);
app.use('/api/doctors', doctorRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/auth', authRoutes);

// Health check route
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV 
  });
});

// Error handling middleware
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

module.exports = app;