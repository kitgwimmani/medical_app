const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  role: {
    type: String,
    required: true,
    enum: ['patient', 'doctor', 'admin'],
    default: 'patient'
  },
  is_active: {
    type: Boolean,
    default: true
  },
  profile_completed: {
    type: Boolean,
    default: false
  },
  patient_profile_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient'
  },
  doctor_profile_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Doctor'
  }
}, {
  timestamps: true
});

userSchema.virtual('profile_id').get(function() {
  return this.role === 'patient' ? this.patient_profile_id : this.doctor_profile_id;
});

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.generateAuthToken = function() {
  const payload = {
    id: this._id,
    email: this.email,
    role: this.role,
    profile_id: this.profile_id
  };
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '30d' });
};

userSchema.methods.toJSON = function() {
  const user = this.toObject();
  delete user.password;
  user.profile_id = this.profile_id;
  return user;
};

module.exports = mongoose.model('User', userSchema);