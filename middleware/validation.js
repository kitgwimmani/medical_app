// middleware/validation.js
const Joi = require('joi');

const validateVitalSigns = (req, res, next) => {
  const schema = Joi.object({
    patient_id: Joi.string().required(),
    systolic_bp: Joi.number().min(0).max(300),
    diastolic_bp: Joi.number().min(0).max(200),
    heart_rate: Joi.number().min(0).max(300),
    respiratory_rate: Joi.number().min(0).max(100),
    temperature: Joi.number().min(30).max(45),
    oxygen_saturation: Joi.number().min(0).max(100),
    blood_glucose: Joi.number().min(0),
    weight_kg: Joi.number().min(0),
    pain_level: Joi.number().min(0).max(10),
    notes: Joi.string().allow(''),
    recorded_at: Joi.date()
  });

  const { error } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({ message: error.details[0].message });
  }
  next();
};

const validateMedication = (req, res, next) => {
  const schema = Joi.object({
    patient_id: Joi.string().required(),
    name: Joi.string().required(),
    dosage: Joi.string().required(),
    form: Joi.string().valid('tablet', 'capsule', 'liquid', 'injection', 'cream', 'inhaler').required(),
    frequency: Joi.string().required(),
    instructions: Joi.string().allow(''),
    start_date: Joi.date().required(),
    end_date: Joi.date().allow(null),
    schedules: Joi.array().items(Joi.object({
      scheduled_time: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).required(),
      days: Joi.object({
        monday: Joi.boolean().default(true),
        tuesday: Joi.boolean().default(true),
        wednesday: Joi.boolean().default(true),
        thursday: Joi.boolean().default(true),
        friday: Joi.boolean().default(true),
        saturday: Joi.boolean().default(true),
        sunday: Joi.boolean().default(true)
      })
    }))
  });

  const { error } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({ message: error.details[0].message });
  }
  next();
};

module.exports = { validateVitalSigns, validateMedication };