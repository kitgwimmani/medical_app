// models/VitalThresholds.js
const mongoose = require('mongoose');

const vitalThresholdsSchema = new mongoose.Schema({
  patient_id: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'Patient'
  },
  set_by: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'Doctor'
  },
  parameter: {
    type: String,
    required: true,
    enum: ['systolic_bp', 'diastolic_bp', 'heart_rate', 'respiratory_rate', 'temperature', 'oxygen_saturation', 'blood_glucose']
  },
  min_value: Number,
  max_value: Number,
  is_critical: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

vitalThresholdsSchema.index({ patient_id: 1, parameter: 1 }, { unique: true });

module.exports = mongoose.model('VitalThresholds', vitalThresholdsSchema);