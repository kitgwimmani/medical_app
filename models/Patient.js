// models/Patient.js
const mongoose = require('mongoose');

const patientSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'User'
  },
  first_name: {
    type: String,
    required: true,
    trim: true
  },
  last_name: {
    type: String,
    required: true,
    trim: true
  },
  date_of_birth: {
    type: Date,
    required: true
  },
  gender: {
    type: String,
    enum: ['male', 'female', 'other'],
    required: true
  },
  blood_type: {
    type: String,
    enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
  },
  height_cm: {
    type: Number,
    min: 0
  },
  weight_kg: {
    type: Number,
    min: 0
  },
  emergency_contact: {
    name: String,
    phone: String,
    relationship: String
  },
  doctors: [{
    doctor_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Doctor'
    },
    relationship_type: {
      type: String,
      default: 'primary'
    },
    is_active: {
      type: Boolean,
      default: true
    }
  }]
}, {
  timestamps: true
});

// Index for efficient queries
patientSchema.index({ user_id: 1 });
patientSchema.index({ 'doctors.doctor_id': 1 });

module.exports = mongoose.model('Patient', patientSchema);