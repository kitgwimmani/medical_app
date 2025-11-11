// models/MedicationIntakeLog.js
const mongoose = require('mongoose');

const medicationIntakeLogSchema = new mongoose.Schema({
  medication_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Medication',
    required: true
  },
  patient_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true
  },
  taken_at: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    required: true,
    enum: ['taken', 'missed', 'skipped', 'partial'],
    default: 'taken'
  },
  dosage_taken: {
    type: String,
    required: true
  },
  notes: {
    type: String,
    default: ''
  },
  side_effects: [{
    type: String,
    trim: true
  }],
  recorded_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  recorded_at: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for better query performance
medicationIntakeLogSchema.index({ medication_id: 1, taken_at: -1 });
medicationIntakeLogSchema.index({ patient_id: 1, taken_at: -1 });
medicationIntakeLogSchema.index({ taken_at: -1 });

module.exports = mongoose.model('MedicationIntakeLog', medicationIntakeLogSchema);