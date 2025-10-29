// models/Notification.js
const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  patient_id: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'Patient'
  },
  type: {
    type: String,
    required: true,
    enum: ['medication_reminder', 'vital_alert', 'appointment_reminder', 'general']
  },
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  data: {
    type: mongoose.Schema.Types.Mixed
  },
  read: {
    type: Boolean,
    default: false
  },
  read_at: Date,
  priority: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium'
  },
  expiration_date: Date
}, {
  timestamps: true
});

notificationSchema.index({ patient_id: 1, read: 1, created_at: -1 });
notificationSchema.index({ expiration_date: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Notification', notificationSchema);