// models/MedicationSchedule.js
const mongoose = require('mongoose');

const medicationScheduleSchema = new mongoose.Schema({
  medication_id: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'Medication'
  },
  scheduled_time: {
    type: String, // Store as "HH:MM" format
    required: true,
    match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/
  },
  days: {
    monday: { type: Boolean, default: true },
    tuesday: { type: Boolean, default: true },
    wednesday: { type: Boolean, default: true },
    thursday: { type: Boolean, default: true },
    friday: { type: Boolean, default: true },
    saturday: { type: Boolean, default: true },
    sunday: { type: Boolean, default: true }
  },
  is_active: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

medicationScheduleSchema.index({ medication_id: 1 });
medicationScheduleSchema.index({ is_active: 1 });

module.exports = mongoose.model('MedicationSchedule', medicationScheduleSchema);