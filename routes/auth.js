// routes/auth.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Patient = require('../models/Patient');
const Doctor = require('../models/Doctor');
const { auth } = require('../middleware/auth');
const Joi = require('joi');

// Validation schemas
const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  role: Joi.string().valid('patient', 'doctor').required(),
  profile_data: Joi.object({
    first_name: Joi.string().required(),
    last_name: Joi.string().required()
  }).required().when('role', {
    is: 'patient',
    then: Joi.object({
      date_of_birth: Joi.date().required(),
      gender: Joi.string().valid('male', 'female', 'other').required(),
      blood_type: Joi.string().valid('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'),
      height_cm: Joi.number().min(0),
      weight_kg: Joi.number().min(0)
    }),
    otherwise: Joi.object({
      specialization: Joi.string().required(),
      license_number: Joi.string().required(),
      contact_number: Joi.string().required(),
      hospital_affiliation: Joi.string()
    })
  })
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required()
});

// Register new user
router.post('/register', async (req, res) => {
  try {
    // Validate input
    const { error } = registerSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    const { email, password, role, profile_data } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists with this email' });
    }

    // Create user first
    const user = new User({
      email,
      password,
      role
    });

    // Create profile based on role
    let profile;
    if (role === 'patient') {
      profile = new Patient({
        user_id: user._id,
        first_name: profile_data.first_name,
        last_name: profile_data.last_name,
        date_of_birth: profile_data.date_of_birth,
        gender: profile_data.gender,
        blood_type: profile_data.blood_type,
        height_cm: profile_data.height_cm,
        weight_kg: profile_data.weight_kg
      });
      await profile.save();
      user.patient_profile_id = profile._id;
    } else if (role === 'doctor') {
      profile = new Doctor({
        user_id: user._id,
        first_name: profile_data.first_name,
        last_name: profile_data.last_name,
        specialization: profile_data.specialization,
        license_number: profile_data.license_number,
        contact_number: profile_data.contact_number,
        hospital_affiliation: profile_data.hospital_affiliation
      });
      await profile.save();
      user.doctor_profile_id = profile._id;
    }

    user.profile_completed = true;
    await user.save();

    // Generate token
    const token = user.generateAuthToken();

    res.status(201).json({
      message: 'User registered successfully',
      data: {
        token,
        user: {
          id: user._id,
          email: user.email,
          role: user.role,
          profile_id: user.profile_id,
          profile_completed: user.profile_completed
        }
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error during registration' });
  }
});

// Login user
router.post('/login', async (req, res) => {
  try {
    // Validate input
    const { error } = loginSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Check if user is active
    if (!user.is_active) {
      return res.status(401).json({ message: 'Account is deactivated' });
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Generate token
    const token = user.generateAuthToken();

    res.json({
      message: 'Login successful',
      data: {
        token,
        user: {
          id: user._id,
          email: user.email,
          role: user.role,
          profile_id: user.profile_id,
          profile_completed: user.profile_completed
        }
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

// Get current user profile
// Enhanced version with profile data
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    let profileData = null;
    
    // Populate profile data based on role
    if (user.role === 'patient' && user.patient_profile_id) {
      profileData = await Patient.findById(user.patient_profile_id);
    } else if (user.role === 'doctor' && user.doctor_profile_id) {
      profileData = await Doctor.findById(user.doctor_profile_id);
    }

    res.json({
      message: 'User profile retrieved successfully',
      data: {
        user,
        profile: profileData
      }
    });
  } catch (error) {
    console.error('Error in /me endpoint:', error);
    res.status(500).json({ message: error.message });
  }
});

// Update user profile
router.put('/me', auth, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.user.id,
      req.body,
      { new: true, runValidators: true }
    ).select('-password');

    res.json({
      message: 'User profile updated successfully',
      data: user
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Change password
router.put('/change-password', auth, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      return res.status(400).json({ message: 'Current password and new password are required' });
    }

    if (new_password.length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters long' });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Verify current password
    const isCurrentPasswordValid = await user.comparePassword(current_password);
    if (!isCurrentPasswordValid) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    // Update password
    user.password = new_password;
    await user.save();

    res.json({
      message: 'Password changed successfully'
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Logout (client-side token removal)
router.post('/logout', auth, (req, res) => {
  res.json({
    message: 'Logout successful - please remove the token from client storage'
  });
});

module.exports = router;