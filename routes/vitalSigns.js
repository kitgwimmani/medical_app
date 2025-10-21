// routes/vitalSigns.js
const express = require('express');
const router = express.Router();
const VitalSigns = require('../models/VitalSigns');
const { auth } = require('../middleware/auth');
const { validateVitalSigns } = require('../middleware/validation');

// Record vital signs
router.post('/', auth, validateVitalSigns, async (req, res) => {
  try {
    const vitalSigns = new VitalSigns({
      ...req.body,
      recorded_by: req.user.id,
      recorded_by_type: req.user.role
    });

    await vitalSigns.save();
    
    // Check thresholds and trigger alerts if needed
    await checkVitalThresholds(vitalSigns);

    res.status(201).json({
      message: 'Vital signs recorded successfully',
      data: vitalSigns
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Get vital signs for a patient with pagination and filtering
router.get('/patient/:patientId', auth, async (req, res) => {
  try {
    const { patientId } = req.params;
    const { page = 1, limit = 10, startDate, endDate } = req.query;

    const query = { patient_id: patientId };
    
    // Date range filter
    if (startDate || endDate) {
      query.recorded_at = {};
      if (startDate) query.recorded_at.$gte = new Date(startDate);
      if (endDate) query.recorded_at.$lte = new Date(endDate);
    }

    const vitalSigns = await VitalSigns.find(query)
      .sort({ recorded_at: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('patient_id', 'first_name last_name');

    const total = await VitalSigns.countDocuments(query);

    res.json({
      data: vitalSigns,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get vital signs trends for graphing
router.get('/patient/:patientId/trends', auth, async (req, res) => {
  try {
    const { patientId } = req.params;
    const { parameter, days = 7 } = req.query;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const trends = await VitalSigns.aggregate([
      {
        $match: {
          patient_id: new mongoose.Types.ObjectId(patientId),
          recorded_at: { $gte: startDate },
          [parameter]: { $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: "%Y-%m-%d", date: "$recorded_at" } }
          },
          average: { $avg: `$${parameter}` },
          min: { $min: `$${parameter}` },
          max: { $max: `$${parameter}` },
          readings: { $push: { value: `$${parameter}`, time: "$recorded_at" } }
        }
      },
      { $sort: { "_id.date": 1 } }
    ]);

    res.json({ data: trends, parameter, days });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Helper function to check vital thresholds
async function checkVitalThresholds(vitalSigns) {
  const thresholds = await VitalThresholds.find({ patient_id: vitalSigns.patient_id });
  
  thresholds.forEach(threshold => {
    const value = vitalSigns[threshold.parameter];
    if (value && ((threshold.min_value && value < threshold.min_value) || 
                  (threshold.max_value && value > threshold.max_value))) {
      // Trigger alert (implement notification logic here)
      console.log(`ALERT: ${threshold.parameter} out of range for patient ${vitalSigns.patient_id}`);
    }
  });
}

module.exports = router;