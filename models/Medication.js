// models/Medication.js
const mongoose = require('mongoose');

const medicationSchema = new mongoose.Schema({
  patient_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true
  },
  prescribed_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Doctor',
    default: null
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  dosage: {
    type: String,
    required: true
  },
  form: {
    type: String,
    required: true,
    enum: ['tablet', 'capsule', 'liquid', 'injection', 'cream', 'inhaler']
  },
  frequency: {
    type: String,
    required: true
  },
  instructions: {
    type: String,
    default: ''
  },
  start_date: {
    type: Date,
    required: true
  },
  end_date: {
    type: Date,
    default: null
  },
  is_active: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

medicationSchema.index({ patient_id: 1, is_active: 1, start_date: 1, end_date: 1 });

module.exports = mongoose.model('Medication', medicationSchema);