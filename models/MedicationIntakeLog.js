// models/MedicationIntakeLog.js
const mongoose = require('mongoose');

const medicationIntakeLogSchema = new mongoose.Schema({
  medication_schedule_id: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'MedicationSchedule'
  },
  patient_id: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'Patient'
  },
  scheduled_time: {
    type: Date,
    required: true
  },
  taken_at: Date,
  status: {
    type: String,
    enum: ['pending', 'taken', 'missed', 'skipped'],
    default: 'pending'
  },
  notes: String
}, {
  timestamps: true
});

medicationIntakeLogSchema.index({ patient_id: 1, scheduled_time: -1 });
medicationIntakeLogSchema.index({ medication_schedule_id: 1 });
medicationIntakeLogSchema.index({ status: 1, scheduled_time: 1 });

module.exports = mongoose.model('MedicationIntakeLog', medicationIntakeLogSchema);