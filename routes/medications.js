// routes/medications.js
const express = require('express');
const router = express.Router();
const Medication = require('../models/Medication');
const MedicationSchedule = require('../models/MedicationSchedule');
const MedicationIntakeLog = require('../models/MedicationIntakeLog');
const { auth } = require('../middleware/auth');
const { validateMedication } = require('../middleware/validation');

// Prescribe medication
router.post('/', auth, validateMedication, async (req, res) => {
  try {
    const medication = new Medication(req.body);
    await medication.save();

    // Create schedules if provided
    if (req.body.schedules && req.body.schedules.length > 0) {
      const schedules = req.body.schedules.map(schedule => ({
        ...schedule,
        medication_id: medication._id
      }));
      await MedicationSchedule.insertMany(schedules);
    }

    // Generate intake logs for the next 7 days
    await generateIntakeLogs(medication._id);

    res.status(201).json({
      message: 'Medication prescribed successfully',
      data: medication
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Get medications for a patient
router.get('/patient/:patientId', auth, async (req, res) => {
  try {
    const { patientId } = req.params;
    const { activeOnly = true } = req.query;

    const query = { patient_id: patientId };
    if (activeOnly === 'true') {
      query.is_active = true;
    }

    const medications = await Medication.find(query)
      .populate('prescribed_by', 'first_name last_name specialization')
      .populate({
        path: 'schedules',
        model: 'MedicationSchedule'
      });

    res.json({ data: medications });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get due medications for a patient
router.get('/patient/:patientId/due', auth, async (req, res) => {
  try {
    const { patientId } = req.params;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const dueMedications = await MedicationIntakeLog.find({
      patient_id: patientId,
      scheduled_time: { $gte: today, $lte: now },
      status: 'pending'
    })
    .populate({
      path: 'medication_schedule_id',
      populate: {
        path: 'medication_id',
        model: 'Medication'
      }
    })
    .sort({ scheduled_time: 1 });

    res.json({ data: dueMedications });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Record medication intake
router.post('/intake/:logId', auth, async (req, res) => {
  try {
    const { logId } = req.params;
    const { notes } = req.body;

    const intakeLog = await MedicationIntakeLog.findByIdAndUpdate(
      logId,
      {
        taken_at: new Date(),
        status: 'taken',
        notes
      },
      { new: true }
    ).populate({
      path: 'medication_schedule_id',
      populate: {
        path: 'medication_id',
        model: 'Medication'
      }
    });

    if (!intakeLog) {
      return res.status(404).json({ message: 'Intake log not found' });
    }

    res.json({
      message: 'Medication intake recorded successfully',
      data: intakeLog
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Helper function to generate intake logs
async function generateIntakeLogs(medicationId) {
  const medication = await Medication.findById(medicationId);
  const schedules = await MedicationSchedule.find({ medication_id: medicationId });

  const logs = [];
  const startDate = new Date();
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + 7); // Generate for next 7 days

  for (let schedule of schedules) {
    let currentDate = new Date(startDate);
    
    while (currentDate <= endDate) {
      const dayName = currentDate.toLocaleLowerCase().substring(0, 3);
      if (schedule.days[dayName]) {
        const [hours, minutes] = schedule.scheduled_time.split(':');
        const scheduledTime = new Date(currentDate);
        scheduledTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);

        logs.push({
          medication_schedule_id: schedule._id,
          patient_id: medication.patient_id,
          scheduled_time: scheduledTime,
          status: 'pending'
        });
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }
  }

  await MedicationIntakeLog.insertMany(logs);
}

module.exports = router;