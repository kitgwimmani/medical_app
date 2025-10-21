// routes/patients.js
const express = require('express');
const router = express.Router();
const Patient = require('../models/Patient');
const { auth } = require('../middleware/auth');

// Get patient profile
router.get('/:id', auth, async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.id)
      .populate('doctors.doctor_id', 'first_name last_name specialization');

    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    res.json({ data: patient });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update patient profile
router.put('/:id', auth, async (req, res) => {
  try {
    const patient = await Patient.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    res.json({
      message: 'Patient profile updated successfully',
      data: patient
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Get patients for a doctor
router.get('/doctor/:doctorId', auth, async (req, res) => {
  try {
    const { doctorId } = req.params;
    const patients = await Patient.find({
      'doctors.doctor_id': doctorId,
      'doctors.is_active': true
    });

    res.json({ data: patients });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;