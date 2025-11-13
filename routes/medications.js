// routes/medications.js - Complete version with imports
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Medication = require('../models/Medication');
const Patient = require('../models/Patient'); // Add this import
const MedicationIntakeLog = require('../models/MedicationIntakeLog');
const { auth } = require('../middleware/auth');

// Add new medication
router.post('/', auth, async (req, res) => {
  try {
    const {
      patient_id,
      doctor_id,
      name,
      dosage,
      form,
      frequency,
      instructions,
      start_date,
      end_date
    } = req.body;

    // Validate required fields
    if (!patient_id || !name || !dosage || !form || !frequency || !start_date) {
      return res.status(400).json({
        message: 'Missing required fields: patient_id, name, dosage, form, frequency, and start_date are required'
      });
    }

    // Validate patient_id format
    if (!mongoose.Types.ObjectId.isValid(patient_id)) {
      return res.status(400).json({
        message: 'Invalid patient_id format'
      });
    }

    // Validate doctor_id format if provided
    if (doctor_id && !mongoose.Types.ObjectId.isValid(doctor_id)) {
      return res.status(400).json({
        message: 'Invalid doctor_id format'
      });
    }

    // Create medication
    const medication = new Medication({
      patient_id: new mongoose.Types.ObjectId(patient_id),
      prescribed_by: doctor_id ? new mongoose.Types.ObjectId(doctor_id) : null,
      name,
      dosage,
      form,
      frequency,
      instructions: instructions || '',
      start_date: new Date(start_date),
      end_date: end_date ? new Date(end_date) : null,
      is_active: true,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const savedMedication = await medication.save();

    // Populate the response with medication details
    const populatedMedication = await Medication.findById(savedMedication._id)
      .populate('patient_id', 'name email')
      .populate('prescribed_by', 'name specialty');

    res.status(201).json({
      message: 'Medication added successfully',
      data: populatedMedication
    });

  } catch (error) {
    console.error('Error adding medication:', error);
    res.status(500).json({ 
      message: 'Failed to add medication',
      error: error.message 
    });
  }
});

// Get due medications (public access)
router.get('/due/:patientId', async (req, res) => {
  try {
    const { patientId } = req.params;
    const { hoursAhead = 24, date } = req.query;

    // Calculate time range
    const now = new Date();
    const targetDate = date ? new Date(date) : now;
    const futureTime = new Date(targetDate.getTime() + (hoursAhead * 60 * 60 * 1000));

    // Get active medications for the patient
    const activeMedications = await Medication.find({
      patient_id: patientId,
      is_active: true,
      start_date: { $lte: futureTime },
      $or: [
        { end_date: null },
        { end_date: { $gte: now } }
      ]
    });

    if (!activeMedications.length) {
      return res.json({
        message: 'No active medications found',
        data: []
      });
    }

    // Calculate due medications based on frequency
    const dueMedications = [];
    
    for (const medication of activeMedications) {
      const medicationSchedule = calculateMedicationSchedule(medication, targetDate, parseInt(hoursAhead));
      
      if (medicationSchedule.length > 0) {
        dueMedications.push({
          medication_id: medication._id,
          name: medication.name,
          dosage: medication.dosage,
          form: medication.form,
          instructions: medication.instructions,
          frequency: medication.frequency,
          due_times: medicationSchedule,
          urgency: getMedicationUrgency(medicationSchedule[0]?.nextDoseTime),
          total_doses: medicationSchedule.length
        });
      }
    }

    // Sort by urgency and next dose time
    dueMedications.sort((a, b) => {
      const urgencyOrder = { high: 0, medium: 1, low: 2 };
      if (urgencyOrder[a.urgency] !== urgencyOrder[b.urgency]) {
        return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
      }
      return new Date(a.due_times[0].nextDoseTime) - new Date(b.due_times[0].nextDoseTime);
    });

    res.json({
      message: 'Due medications retrieved successfully',
      data: dueMedications,
      summary: {
        total_due: dueMedications.length,
        total_doses: dueMedications.reduce((sum, med) => sum + med.total_doses, 0),
        time_range: {
          from: targetDate.toISOString(),
          to: futureTime.toISOString(),
          hours_ahead: parseInt(hoursAhead)
        }
      }
    });

  } catch (error) {
    console.error('Error getting due medications:', error);
    res.status(500).json({ message: error.message });
  }
});


// Helper function to calculate medication schedule based on frequency
function calculateMedicationSchedule(medication, startDate, hoursAhead) {
  const schedule = [];
  const now = new Date();
  const endTime = new Date(startDate.getTime() + (hoursAhead * 60 * 60 * 1000));
  
  const frequency = medication.frequency.toLowerCase();
  let timesPerDay = 1;
  let intervals = [];

  // Parse frequency to determine dosing times
  if (frequency.includes('once daily') || frequency.includes('once a day')) {
    timesPerDay = 1;
    intervals = ['08:00']; // Default morning dose
  } else if (frequency.includes('twice daily') || frequency.includes('two times daily')) {
    timesPerDay = 2;
    intervals = ['08:00', '20:00']; // Morning and evening
  } else if (frequency.includes('three times daily') || frequency.includes('three times a day')) {
    timesPerDay = 3;
    intervals = ['08:00', '14:00', '20:00']; // Morning, afternoon, evening
  } else if (frequency.includes('four times daily')) {
    timesPerDay = 4;
    intervals = ['06:00', '12:00', '18:00', '22:00'];
  } else if (frequency.includes('every') && frequency.includes('hours')) {
    // Parse "every X hours" frequency
    const hoursMatch = frequency.match(/every\s+(\d+)\s+hours?/);
    if (hoursMatch) {
      const hourInterval = parseInt(hoursMatch[1]);
      timesPerDay = Math.floor(24 / hourInterval);
      intervals = [];
      for (let i = 0; i < timesPerDay; i++) {
        const hour = (i * hourInterval) % 24;
        intervals.push(`${hour.toString().padStart(2, '0')}:00`);
      }
    }
  } else {
    // Default to once daily
    timesPerDay = 1;
    intervals = ['08:00'];
  }

  // Generate due times for the next 24 hours (or specified hoursAhead)
  for (const timeStr of intervals) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const doseTime = new Date(startDate);
    doseTime.setHours(hours, minutes, 0, 0);

    // If the dose time is in the past for today, schedule for tomorrow
    if (doseTime < now) {
      doseTime.setDate(doseTime.getDate() + 1);
    }

    // Check if dose time is within the requested time range
    if (doseTime <= endTime && doseTime >= startDate) {
      schedule.push({
        nextDoseTime: doseTime.toISOString(),
        scheduledTime: timeStr,
        status: 'pending',
        isOverdue: doseTime < now
      });
    }
  }

  return schedule;
}

// Helper function to determine medication urgency
function getMedicationUrgency(nextDoseTime) {
  if (!nextDoseTime) return 'low';
  
  const now = new Date();
  const doseTime = new Date(nextDoseTime);
  const timeDiff = doseTime - now;
  const minutesDiff = timeDiff / (1000 * 60);

  if (minutesDiff <= 0) return 'high'; // Overdue
  if (minutesDiff <= 30) return 'medium'; // Due within 30 minutes
  return 'low'; // Due later
}

// Helper function to check medication access
async function checkMedicationAccess(user, patientId) {
  try {
    if (user.role === 'patient') {
      const patient = await Patient.findOne({ user_id: user.id });
      return patient && patient._id.toString() === patientId;
    } else if (user.role === 'doctor') {
      const patient = await Patient.findOne({
        _id: patientId,
        'doctors.doctor_id': user.id,
        'doctors.is_active': true
      });
      return !!patient;
    } else if (user.role === 'caregiver') {
      // Add caregiver logic if needed
      const patient = await Patient.findOne({
        _id: patientId,
        'caregivers.caregiver_id': user.id,
        'caregivers.is_active': true
      });
      return !!patient;
    }
    return false;
  } catch (error) {
    console.error('Error checking medication access:', error);
    return false;
  }
}

router.post('/:medicationId/intake', auth, async (req, res) => {
  try {
    const { medicationId } = req.params;
    const {
      taken_at,
      status = 'taken',
      notes = '',
      dosage_taken,
      side_effects = []
    } = req.body;

    // Validate required fields
    if (!taken_at) {
      return res.status(400).json({
        message: 'Missing required field: taken_at'
      });
    }

    // Validate status
    const validStatuses = ['taken', 'missed', 'skipped', 'partial'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    // Find the medication
    const medication = await Medication.findById(medicationId);
    if (!medication) {
      return res.status(404).json({
        message: 'Medication not found'
      });
    }

    // Check access to this medication
    const hasAccess = await checkMedicationAccess(req.user, medication.patient_id.toString());
    if (!hasAccess) {
      return res.status(403).json({ 
        message: 'Access denied. You do not have permission to record intake for this medication.' 
      });
    }

    // Create intake log
    const intakeLog = new MedicationIntakeLog({
      medication_id: medicationId,
      patient_id: medication.patient_id,
      taken_at: new Date(taken_at),
      status,
      notes,
      dosage_taken: dosage_taken || medication.dosage,
      side_effects,
      recorded_by: req.user.id,
      recorded_at: new Date()
    });

    const savedLog = await intakeLog.save();

    // Populate the response
    const populatedLog = await MedicationIntakeLog.findById(savedLog._id)
      .populate('medication_id', 'name dosage form instructions')
      .populate('patient_id', 'name email')
      .populate('recorded_by', 'name role');

    res.status(201).json({
      message: `Medication intake recorded as ${status}`,
      data: populatedLog
    });

  } catch (error) {
    console.error('Error recording medication intake:', error);
    res.status(500).json({ 
      message: 'Failed to record medication intake',
      error: error.message 
    });
  }
});

// Get medication intake history
router.get('/:medicationId/intake', auth, async (req, res) => {
  try {
    const { medicationId } = req.params;
    const { 
      startDate, 
      endDate, 
      status,
      page = 1, 
      limit = 20 
    } = req.query;

    // Find the medication to check access
    const medication = await Medication.findById(medicationId);
    if (!medication) {
      return res.status(404).json({
        message: 'Medication not found'
      });
    }

    // Check access
    const hasAccess = await checkMedicationAccess(req.user, medication.patient_id.toString());
    if (!hasAccess) {
      return res.status(403).json({ 
        message: 'Access denied.' 
      });
    }

    // Build query
    const query = { medication_id: medicationId };
    
    // Date range filter
    if (startDate || endDate) {
      query.taken_at = {};
      if (startDate) query.taken_at.$gte = new Date(startDate);
      if (endDate) query.taken_at.$lte = new Date(endDate);
    }

    // Status filter
    if (status) {
      query.status = status;
    }

    // Pagination
    const skip = (page - 1) * limit;

    const intakeLogs = await MedicationIntakeLog.find(query)
      .populate('medication_id', 'name dosage form instructions')
      .populate('patient_id', 'name email')
      .populate('recorded_by', 'name role')
      .sort({ taken_at: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await MedicationIntakeLog.countDocuments(query);

    res.json({
      message: 'Medication intake history retrieved successfully',
      data: intakeLogs,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total,
        limit: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Error getting medication intake history:', error);
    res.status(500).json({ message: error.message });
  }
});

// Update medication intake record
router.patch('/intake/:logId', auth, async (req, res) => {
  try {
    const { logId } = req.params;
    const {
      taken_at,
      status,
      notes,
      dosage_taken,
      side_effects
    } = req.body;

    // Find the intake log
    const intakeLog = await MedicationIntakeLog.findById(logId)
      .populate('medication_id');
    
    if (!intakeLog) {
      return res.status(404).json({
        message: 'Intake log not found'
      });
    }

    // Check access
    const hasAccess = await checkMedicationAccess(req.user, intakeLog.patient_id.toString());
    if (!hasAccess) {
      return res.status(403).json({ 
        message: 'Access denied.' 
      });
    }

    // Update fields
    const updateFields = {};
    if (taken_at) updateFields.taken_at = new Date(taken_at);
    if (status) updateFields.status = status;
    if (notes !== undefined) updateFields.notes = notes;
    if (dosage_taken) updateFields.dosage_taken = dosage_taken;
    if (side_effects) updateFields.side_effects = side_effects;
    
    updateFields.updated_at = new Date();

    const updatedLog = await MedicationIntakeLog.findByIdAndUpdate(
      logId,
      updateFields,
      { new: true, runValidators: true }
    ).populate('medication_id', 'name dosage form instructions')
     .populate('patient_id', 'name email')
     .populate('recorded_by', 'name role');

    res.json({
      message: 'Medication intake record updated successfully',
      data: updatedLog
    });

  } catch (error) {
    console.error('Error updating medication intake:', error);
    res.status(500).json({ 
      message: 'Failed to update medication intake record',
      error: error.message 
    });
  }
});

// Delete medication intake record
router.delete('/intake/:logId', auth, async (req, res) => {
  try {
    const { logId } = req.params;

    // Find the intake log
    const intakeLog = await MedicationIntakeLog.findById(logId);
    
    if (!intakeLog) {
      return res.status(404).json({
        message: 'Intake log not found'
      });
    }

    // Check access
    const hasAccess = await checkMedicationAccess(req.user, intakeLog.patient_id.toString());
    if (!hasAccess) {
      return res.status(403).json({ 
        message: 'Access denied.' 
      });
    }

    await MedicationIntakeLog.findByIdAndDelete(logId);

    res.json({
      message: 'Medication intake record deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting medication intake:', error);
    res.status(500).json({ 
      message: 'Failed to delete medication intake record',
      error: error.message 
    });
  }
});

module.exports = router;