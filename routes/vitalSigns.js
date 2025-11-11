// routes/vitalSigns.js - CORRECTED VERSION
const express = require('express');
const mongoose = require('mongoose'); // Add mongoose import
const router = express.Router();
const VitalSigns = require('../models/VitalSigns');
const VitalThresholds = require('../models/VitalThresholds');
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

    // Query for both ObjectId and string formats
    let query;
    try {
      const objectId = new mongoose.Types.ObjectId(patientId);
      query = { 
        $or: [
          { patient_id: objectId },
          { patient_id: patientId }
        ]
      };
    } catch (error) {
      // If not a valid ObjectId, just query as string
      query = { patient_id: patientId };
    }
    
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


module.exports = router;