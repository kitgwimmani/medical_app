// models/Medication.js
const mongoose = require('mongoose');

const medicationSchema = new mongoose.Schema({
  patient_id: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'Patient'
  },
  prescribed_by: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'Doctor'
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
    enum: ['tablet', 'capsule', 'liquid', 'injection', 'cream', 'inhaler'],
    required: true
  },
  frequency: {
    type: String,
    required: true
  },
  instructions: String,
  start_date: {
    type: Date,
    required: true
  },
  end_date: Date,
  is_active: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

medicationSchema.index({ patient_id: 1, is_active: 1 });
medicationSchema.index({ prescribed_by: 1 });

module.exports = mongoose.model('Medication', medicationSchema);