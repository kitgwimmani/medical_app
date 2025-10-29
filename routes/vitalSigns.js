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

// Get vital signs trends for graphing - CORRECTED VERSION
router.get('/patient/:patientId/trends', auth, async (req, res) => {
  try {
    const { patientId } = req.params;
    const { parameter, days = 7 } = req.query;

    // Validate required parameters
    if (!parameter) {
      return res.status(400).json({ message: 'Parameter is required' });
    }

    // Validate parameter
    const validParameters = ['systolic_bp', 'diastolic_bp', 'heart_rate', 'respiratory_rate', 'temperature', 'oxygen_saturation', 'blood_glucose', 'weight_kg'];
    if (!validParameters.includes(parameter)) {
      return res.status(400).json({ 
        message: 'Invalid parameter. Valid parameters: ' + validParameters.join(', ')
      });
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    startDate.setHours(0, 0, 0, 0); // Start of day

    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999); // End of current day

    // FIXED: Use mongoose.Types.ObjectId for patient_id and proper date range
    const trends = await VitalSigns.aggregate([
      {
        $match: {
          patient_id: new mongoose.Types.ObjectId(patientId), // FIX: Convert to ObjectId
          recorded_at: { 
            $gte: startDate, 
            $lte: endDate 
          },
          [parameter]: { 
            $exists: true, 
            $ne: null,
            $type: 'number' // Ensure it's a number
          }
        }
      },
      {
        $addFields: {
          // Create a date-only field for grouping
          dateOnly: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$recorded_at"
            }
          }
        }
      },
      {
        $group: {
          _id: "$dateOnly",
          average: { $avg: `$${parameter}` },
          min: { $min: `$${parameter}` },
          max: { $max: `$${parameter}` },
          readings: { 
            $push: { 
              value: `$${parameter}`, 
              time: "$recorded_at",
              id: "$_id"
            } 
          },
          count: { $sum: 1 }
        }
      },
      { 
        $sort: { "_id": 1 } // Sort by date ascending
      },
      {
        $project: {
          _id: 0,
          date: "$_id",
          average: { $round: ["$average", 2] }, // Round to 2 decimal places
          min: 1,
          max: 1,
          readings: 1,
          count: 1
        }
      }
    ]);

    // If no trends found, provide helpful debug information
    if (trends.length === 0) {
      // Check if patient exists and has any vital signs
      const hasAnyVitals = await VitalSigns.findOne({ 
        patient_id: patientId 
      });
      
      const hasParameterVitals = await VitalSigns.findOne({
        patient_id: patientId,
        [parameter]: { $exists: true, $ne: null }
      });

      const hasRecentVitals = await VitalSigns.findOne({
        patient_id: patientId,
        recorded_at: { $gte: startDate }
      });

      return res.json({
        message: 'No trend data found for the specified criteria',
        data: [],
        parameter,
        days,
        debug: {
          patientExists: !!hasAnyVitals,
          hasParameterData: !!hasParameterVitals,
          hasRecentData: !!hasRecentVitals,
          dateRange: {
            start: startDate,
            end: endDate
          }
        }
      });
    }

    res.json({ 
      message: 'Vital signs trends retrieved successfully',
      data: trends, 
      parameter, 
      days 
    });
  } catch (error) {
    console.error('Error in trends endpoint:', error);
    res.status(500).json({ 
      message: 'Error retrieving trends',
      error: error.message 
    });
  }
});

// Alternative simple trends endpoint (if aggregation still has issues)
router.get('/patient/:patientId/trends-simple', auth, async (req, res) => {
  try {
    const { patientId } = req.params;
    const { parameter, days = 7 } = req.query;

    if (!parameter) {
      return res.status(400).json({ message: 'Parameter is required' });
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    // Get all vital signs data
    const vitalSigns = await VitalSigns.find({
      patient_id: patientId,
      recorded_at: { $gte: startDate },
      [parameter]: { $exists: true, $ne: null }
    })
    .select(`${parameter} recorded_at`)
    .sort({ recorded_at: 1 });

    // Process data manually in JavaScript
    const trendsMap = {};
    
    vitalSigns.forEach(vital => {
      const dateStr = vital.recorded_at.toISOString().split('T')[0]; // Get YYYY-MM-DD
      
      if (!trendsMap[dateStr]) {
        trendsMap[dateStr] = {
          values: [],
          readings: []
        };
      }
      
      trendsMap[dateStr].values.push(vital[parameter]);
      trendsMap[dateStr].readings.push({
        value: vital[parameter],
        time: vital.recorded_at,
        id: vital._id
      });
    });

    // Convert to array format
    const trends = Object.keys(trendsMap).map(date => {
      const values = trendsMap[date].values;
      const average = values.reduce((a, b) => a + b, 0) / values.length;
      
      return {
        date,
        average: Math.round(average * 100) / 100,
        min: Math.min(...values),
        max: Math.max(...values),
        readings: trendsMap[date].readings,
        count: values.length
      };
    }).sort((a, b) => a.date.localeCompare(b.date));

    res.json({
      message: 'Vital signs trends retrieved successfully',
      data: trends,
      parameter,
      days,
      totalReadings: vitalSigns.length
    });

  } catch (error) {
    console.error('Error in simple trends endpoint:', error);
    res.status(500).json({ 
      message: 'Error retrieving trends',
      error: error.message 
    });
  }
});

// Debug endpoint to check what data exists
router.get('/patient/:patientId/debug-data', auth, async (req, res) => {
  try {
    const { patientId } = req.params;
    const { days = 7 } = req.query;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    // Get sample of recent vital signs
    const recentVitals = await VitalSigns.find({
      patient_id: patientId,
      recorded_at: { $gte: startDate }
    })
    .sort({ recorded_at: -1 })
    .limit(10);

    // Check which parameters have data
    const validParameters = ['systolic_bp', 'diastolic_bp', 'heart_rate', 'respiratory_rate', 'temperature', 'oxygen_saturation', 'blood_glucose', 'weight_kg'];
    const parametersWithData = {};

    for (const param of validParameters) {
      const count = await VitalSigns.countDocuments({
        patient_id: patientId,
        recorded_at: { $gte: startDate },
        [param]: { $exists: true, $ne: null }
      });
      parametersWithData[param] = count;
    }

    res.json({
      message: 'Data debug information',
      data: {
        patientId,
        timeRange: {
          start: startDate,
          end: new Date(),
          days
        },
        recentVitalsSample: recentVitals,
        parametersWithData,
        totalRecords: await VitalSigns.countDocuments({
          patient_id: patientId,
          recorded_at: { $gte: startDate }
        })
      }
    });

  } catch (error) {
    console.error('Error in debug endpoint:', error);
    res.status(500).json({ 
      message: 'Error in debug endpoint',
      error: error.message 
    });
  }
});

// Helper function to check vital thresholds
async function checkVitalThresholds(vitalSigns) {
  try {
    const thresholds = await VitalThresholds.find({ patient_id: vitalSigns.patient_id });
    
    thresholds.forEach(threshold => {
      const value = vitalSigns[threshold.parameter];
      if (value && ((threshold.min_value && value < threshold.min_value) || 
                    (threshold.max_value && value > threshold.max_value))) {
        // Trigger alert (implement notification logic here)
        console.log(`ALERT: ${threshold.parameter} out of range for patient ${vitalSigns.patient_id}`);
        console.log(`Value: ${value}, Range: ${threshold.min_value}-${threshold.max_value}`);
        
        // Here you would typically create a notification or send an alert
        // For now, we'll just log it
      }
    });
  } catch (error) {
    console.error('Error checking vital thresholds:', error);
    // Don't throw error here as it shouldn't prevent vital signs from being saved
  }
}

module.exports = router;