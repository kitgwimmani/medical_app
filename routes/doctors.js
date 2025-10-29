// routes/doctors.js
const express = require('express');
const mongoose = require('mongoose'); // Add this import
const router = express.Router();
const Doctor = require('../models/Doctor');
const Patient = require('../models/Patient');
const VitalSigns = require('../models/VitalSigns');
const Medication = require('../models/Medication');
const { auth } = require('../middleware/auth');

// Get doctor profile
router.get('/profile', auth, async (req, res) => {
  try {
    const doctor = await Doctor.findOne({ user_id: req.user.id })
      .select('-__v');

    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found' });
    }

    res.json({ 
      message: 'Doctor profile retrieved successfully',
      data: doctor 
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update doctor profile
router.put('/profile', auth, async (req, res) => {
  try {
    const doctor = await Doctor.findOneAndUpdate(
      { user_id: req.user.id },
      req.body,
      { new: true, runValidators: true }
    ).select('-__v');

    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found' });
    }

    res.json({
      message: 'Doctor profile updated successfully',
      data: doctor
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Get all doctors (for patient selection)
router.get('/', auth, async (req, res) => {
  try {
    const { specialization, search } = req.query;
    
    let query = { is_active: true };
    
    if (specialization) {
      query.specialization = new RegExp(specialization, 'i');
    }
    
    if (search) {
      query.$or = [
        { first_name: new RegExp(search, 'i') },
        { last_name: new RegExp(search, 'i') },
        { specialization: new RegExp(search, 'i') }
      ];
    }

    const doctors = await Doctor.find(query)
      .select('first_name last_name specialization license_number contact_number hospital_affiliation')
      .sort({ first_name: 1 });

    res.json({
      message: 'Doctors retrieved successfully',
      data: doctors
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get doctor's patients with recent activity
router.get('/my-patients', auth, async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    
    const patients = await Patient.find({
      'doctors.doctor_id': req.user.id,
      'doctors.is_active': true
    })
    .select('first_name last_name date_of_birth gender blood_type height_cm weight_kg')
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .sort({ first_name: 1 });

    // Get recent activity for each patient
    const patientsWithActivity = await Promise.all(
      patients.map(async (patient) => {
        const recentVitals = await VitalSigns.findOne(
          { patient_id: patient._id }
        )
        .sort({ recorded_at: -1 })
        .select('recorded_at systolic_bp heart_rate temperature')
        .limit(1);

        const activeMedications = await Medication.countDocuments({
          patient_id: patient._id,
          is_active: true
        });

        return {
          ...patient.toObject(),
          last_checkup: recentVitals?.recorded_at || null,
          recent_vitals: recentVitals ? {
            systolic_bp: recentVitals.systolic_bp,
            heart_rate: recentVitals.heart_rate,
            temperature: recentVitals.temperature
          } : null,
          active_medications: activeMedications
        };
      })
    );

    const total = await Patient.countDocuments({
      'doctors.doctor_id': req.user.id,
      'doctors.is_active': true
    });

    res.json({
      message: 'Patients retrieved successfully',
      data: patientsWithActivity,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Add patient to doctor's care
router.post('/patients/:patientId', auth, async (req, res) => {
  try {
    const { patientId } = req.params;
    const { relationship_type = 'primary' } = req.body;

    const patient = await Patient.findById(patientId);
    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    // Check if relationship already exists
    const existingRelationship = patient.doctors.find(
      doc => doc.doctor_id.toString() === req.user.id
    );

    if (existingRelationship) {
      return res.status(400).json({ message: 'Patient is already under your care' });
    }

    // Add doctor to patient's doctors array
    patient.doctors.push({
      doctor_id: req.user.id,
      relationship_type,
      is_active: true
    });

    await patient.save();

    res.status(201).json({
      message: 'Patient added to your care successfully',
      data: {
        patient_id: patient._id,
        patient_name: `${patient.first_name} ${patient.last_name}`,
        relationship_type
      }
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Remove patient from doctor's care
router.delete('/patients/:patientId', auth, async (req, res) => {
  try {
    const { patientId } = req.params;

    const patient = await Patient.findById(patientId);
    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    // Find and update the relationship
    const doctorIndex = patient.doctors.findIndex(
      doc => doc.doctor_id.toString() === req.user.id
    );

    if (doctorIndex === -1) {
      return res.status(404).json({ message: 'Patient is not under your care' });
    }

    // Soft delete by setting is_active to false
    patient.doctors[doctorIndex].is_active = false;
    await patient.save();

    res.json({
      message: 'Patient removed from your care successfully'
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Get patient summary for doctor - FIXED VERSION
router.get('/patients/:patientId/summary', auth, async (req, res) => {
  try {
    const { patientId } = req.params;

    // Verify doctor has access to this patient
    const patient = await Patient.findOne({
      _id: patientId,
      'doctors.doctor_id': req.user.id,
      'doctors.is_active': true
    });

    if (!patient) {
      return res.status(404).json({ message: 'Patient not found or access denied' });
    }

    // Get recent vital signs (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentVitals = await VitalSigns.find({
      patient_id: patientId,
      recorded_at: { $gte: sevenDaysAgo }
    })
    .sort({ recorded_at: -1 })
    .limit(50);

    // Get active medications
    const activeMedications = await Medication.find({
      patient_id: patientId,
      is_active: true
    })
    .populate('prescribed_by', 'first_name last_name')
    .sort({ start_date: -1 });

    // Get medication adherence stats
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Fixed aggregation query
    const adherenceStats = await Medication.aggregate([
      {
        $match: {
          patient_id: new mongoose.Types.ObjectId(patientId),
          is_active: true
        }
      },
      {
        $lookup: {
          from: 'medicationintakelogs',
          localField: '_id',
          foreignField: 'medication_id',
          as: 'intake_logs'
        }
      },
      {
        $project: {
          name: 1,
          dosage: 1,
          frequency: 1,
          total_doses: { $size: '$intake_logs' },
          taken_doses: {
            $size: {
              $filter: {
                input: '$intake_logs',
                as: 'log',
                cond: { $eq: ['$$log.status', 'taken'] }
              }
            }
          }
        }
      }
    ]);

    res.json({
      message: 'Patient summary retrieved successfully',
      data: {
        patient_info: {
          _id: patient._id,
          first_name: patient.first_name,
          last_name: patient.last_name,
          date_of_birth: patient.date_of_birth,
          gender: patient.gender,
          blood_type: patient.blood_type,
          height_cm: patient.height_cm,
          weight_kg: patient.weight_kg
        },
        recent_vitals: recentVitals,
        active_medications: activeMedications,
        adherence_stats: adherenceStats
      }
    });
  } catch (error) {
    console.error('Error in patient summary:', error);
    res.status(500).json({ message: error.message });
  }
});

// Search patients by name or other criteria
router.get('/patients/search', auth, async (req, res) => {
  try {
    const { q, page = 1, limit = 10 } = req.query;

    if (!q) {
      return res.status(400).json({ message: 'Search query is required' });
    }

    const searchRegex = new RegExp(q, 'i');

    const patients = await Patient.find({
      'doctors.doctor_id': req.user.id,
      'doctors.is_active': true,
      $or: [
        { first_name: searchRegex },
        { last_name: searchRegex },
        { blood_type: searchRegex }
      ]
    })
    .select('first_name last_name date_of_birth gender blood_type')
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .sort({ first_name: 1 });

    const total = await Patient.countDocuments({
      'doctors.doctor_id': req.user.id,
      'doctors.is_active': true,
      $or: [
        { first_name: searchRegex },
        { last_name: searchRegex },
        { blood_type: searchRegex }
      ]
    });

    res.json({
      message: 'Patients search completed successfully',
      data: patients,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get doctor's dashboard statistics - FIXED VERSION
router.get('/dashboard', auth, async (req, res) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Get total patients
    const totalPatients = await Patient.countDocuments({
      'doctors.doctor_id': req.user.id,
      'doctors.is_active': true
    });

    // Get recent vital signs recordings
    const recentRecordings = await VitalSigns.countDocuments({
      recorded_at: { $gte: thirtyDaysAgo },
      patient_id: {
        $in: await Patient.find({
          'doctors.doctor_id': req.user.id,
          'doctors.is_active': true
        }).distinct('_id')
      }
    });

    // Get active prescriptions
    const activePrescriptions = await Medication.countDocuments({
      is_active: true,
      patient_id: {
        $in: await Patient.find({
          'doctors.doctor_id': req.user.id,
          'doctors.is_active': true
        }).distinct('_id')
      }
    });

    // Get patients needing attention (based on vital thresholds)
    const patientsNeedingAttention = await Patient.aggregate([
      {
        $match: {
          'doctors.doctor_id': new mongoose.Types.ObjectId(req.user.id),
          'doctors.is_active': true
        }
      },
      {
        $lookup: {
          from: 'vitalsigns',
          localField: '_id',
          foreignField: 'patient_id',
          as: 'vitals'
        }
      },
      {
        $project: {
          first_name: 1,
          last_name: 1,
          latest_vitals: { $arrayElemAt: ['$vitals', -1] }
        }
      },
      {
        $match: {
          $or: [
            { 'latest_vitals.systolic_bp': { $gt: 140 } },
            { 'latest_vitals.systolic_bp': { $lt: 90 } },
            { 'latest_vitals.heart_rate': { $gt: 100 } },
            { 'latest_vitals.heart_rate': { $lt: 50 } },
            { 'latest_vitals.temperature': { $gt: 38 } }
          ]
        }
      }
    ]);

    res.json({
      message: 'Dashboard statistics retrieved successfully',
      data: {
        total_patients: totalPatients,
        recent_recordings: recentRecordings,
        active_prescriptions: activePrescriptions,
        patients_needing_attention: patientsNeedingAttention.length,
        alerts: patientsNeedingAttention.map(p => ({
          patient_id: p._id,
          patient_name: `${p.first_name} ${p.last_name}`,
          vital_issues: p.latest_vitals ? Object.entries(p.latest_vitals)
            .filter(([key, value]) => 
              (key === 'systolic_bp' && (value > 140 || value < 90)) ||
              (key === 'heart_rate' && (value > 100 || value < 50)) ||
              (key === 'temperature' && value > 38)
            )
            .map(([key, value]) => ({ parameter: key, value }))
            : []
        }))
      }
    });
  } catch (error) {
    console.error('Error in dashboard:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;