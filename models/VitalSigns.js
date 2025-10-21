// models/VitalSigns.js
const mongoose = require('mongoose');

const vitalSignsSchema = new mongoose.Schema({
  patient_id: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'Patient'
  },
  recorded_by: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  recorded_by_type: {
    type: String,
    required: true,
    enum: ['doctor', 'patient']
  },
  // Core vital signs
  systolic_bp: {
    type: Number,
    min: 0,
    max: 300
  },
  diastolic_bp: {
    type: Number,
    min: 0,
    max: 200
  },
  heart_rate: {
    type: Number,
    min: 0,
    max: 300
  },
  respiratory_rate: {
    type: Number,
    min: 0,
    max: 100
  },
  temperature: {
    type: Number,
    min: 30,
    max: 45
  },
  oxygen_saturation: {
    type: Number,
    min: 0,
    max: 100
  },
  blood_glucose: {
    type: Number,
    min: 0
  },
  weight_kg: {
    type: Number,
    min: 0
  },
  pain_level: {
    type: Number,
    min: 0,
    max: 10
  },
  notes: String,
  recorded_at: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Compound index for efficient queries
vitalSignsSchema.index({ patient_id: 1, recorded_at: -1 });
vitalSignsSchema.index({ recorded_at: 1 });

// Virtual for BMI calculation
vitalSignsSchema.virtual('bmi').get(function() {
  if (this.weight_kg && this.patient_id?.height_cm) {
    const heightInMeters = this.patient_id.height_cm / 100;
    return this.weight_kg / (heightInMeters * heightInMeters);
  }
  return null;
});

module.exports = mongoose.model('VitalSigns', vitalSignsSchema);