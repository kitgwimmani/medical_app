// routes/notifications.js
const express = require('express');
const router = express.Router();
const MedicationIntakeLog = require('../models/MedicationIntakeLog');
const VitalSigns = require('../models/VitalSigns');
const VitalThresholds = require('../models/VitalThresholds');
const Patient = require('../models/Patient');
const { auth } = require('../middleware/auth');

// Get all notifications for a patient
router.get('/patient/:patientId', auth, async (req, res) => {
  try {
    const { patientId } = req.params;
    const { type, page = 1, limit = 20, unreadOnly } = req.query;

    // Verify access (patient can only see their own, doctors can see their patients')
    let hasAccess = false;
    
    if (req.user.role === 'patient' && req.user.id === patientId) {
      hasAccess = true;
    } else if (req.user.role === 'doctor') {
      const patient = await Patient.findOne({
        _id: patientId,
        'doctors.doctor_id': req.user.id,
        'doctors.is_active': true
      });
      hasAccess = !!patient;
    }

    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    let query = { patient_id: patientId };
    
    if (type) {
      query.type = type;
    }
    
    if (unreadOnly === 'true') {
      query.read = false;
    }

    const notifications = await Notification.find(query)
      .sort({ created_at: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Notification.countDocuments(query);
    const unreadCount = await Notification.countDocuments({
      ...query,
      read: false
    });

    res.json({
      message: 'Notifications retrieved successfully',
      data: notifications,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total,
        unread_count: unreadCount
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get due medication reminders
router.get('/medication-reminders/:patientId', auth, async (req, res) => {
  try {
    const { patientId } = req.params;
    const { hoursAhead = 24 } = req.query;

    const now = new Date();
    const futureTime = new Date(now.getTime() + (hoursAhead * 60 * 60 * 1000));

    const dueMedications = await MedicationIntakeLog.find({
      patient_id: patientId,
      scheduled_time: { $lte: futureTime, $gte: now },
      status: 'pending'
    })
    .populate({
      path: 'medication_schedule_id',
      populate: {
        path: 'medication_id',
        model: 'Medication',
        select: 'name dosage form instructions'
      }
    })
    .sort({ scheduled_time: 1 });

    const reminders = dueMedications.map(log => ({
      _id: log._id,
      type: 'medication_reminder',
      title: 'Medication Due',
      message: `Time to take ${log.medication_schedule_id.medication_id.name} ${log.medication_schedule_id.medication_id.dosage}`,
      medication_info: {
        name: log.medication_schedule_id.medication_id.name,
        dosage: log.medication_schedule_id.medication_id.dosage,
        form: log.medication_schedule_id.medication_id.form,
        instructions: log.medication_schedule_id.medication_id.instructions
      },
      scheduled_time: log.scheduled_time,
      urgency: getReminderUrgency(log.scheduled_time),
      actions: ['mark_taken', 'snooze', 'skip']
    }));

    res.json({
      message: 'Medication reminders retrieved successfully',
      data: reminders
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get vital signs alerts
router.get('/vital-alerts/:patientId', auth, async (req, res) => {
  try {
    const { patientId } = req.params;
    const { days = 7 } = req.query;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    // Get vital thresholds for patient
    const thresholds = await VitalThresholds.find({ patient_id: patientId });

    // Get recent vital signs that might have triggered alerts
    const recentVitals = await VitalSigns.find({
      patient_id: patientId,
      recorded_at: { $gte: startDate }
    })
    .sort({ recorded_at: -1 });

    const alerts = [];

    for (const vital of recentVitals) {
      for (const threshold of thresholds) {
        const value = vital[threshold.parameter];
        if (value !== undefined && value !== null) {
          const isOutOfRange = (threshold.min_value && value < threshold.min_value) ||
                              (threshold.max_value && value > threshold.max_value);
          
          if (isOutOfRange) {
            alerts.push({
              _id: `${vital._id}_${threshold.parameter}`,
              type: 'vital_alert',
              title: threshold.is_critical ? 'Critical Vital Alert' : 'Vital Sign Alert',
              message: `${formatParameterName(threshold.parameter)} is ${value} (normal range: ${threshold.min_value}-${threshold.max_value})`,
              vital_info: {
                parameter: threshold.parameter,
                value: value,
                min_threshold: threshold.min_value,
                max_threshold: threshold.max_value,
                recorded_at: vital.recorded_at,
                is_critical: threshold.is_critical
              },
              recorded_at: vital.recorded_at,
              urgency: threshold.is_critical ? 'high' : 'medium',
              actions: ['acknowledge', 'view_details', 'contact_doctor']
            });
          }
        }
      }
    }

    // Remove duplicates and sort by urgency and time
    const uniqueAlerts = alerts.filter((alert, index, self) =>
      index === self.findIndex(a => a._id === alert._id)
    ).sort((a, b) => {
      if (a.urgency === 'high' && b.urgency !== 'high') return -1;
      if (b.urgency === 'high' && a.urgency !== 'high') return 1;
      return new Date(b.recorded_at) - new Date(a.recorded_at);
    });

    res.json({
      message: 'Vital alerts retrieved successfully',
      data: uniqueAlerts
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Mark notification as read
router.patch('/:notificationId/read', auth, async (req, res) => {
  try {
    const { notificationId } = req.params;

    const notification = await Notification.findByIdAndUpdate(
      notificationId,
      { 
        read: true,
        read_at: new Date()
      },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    res.json({
      message: 'Notification marked as read',
      data: notification
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Mark all notifications as read
router.patch('/patient/:patientId/read-all', auth, async (req, res) => {
  try {
    const { patientId } = req.params;

    const result = await Notification.updateMany(
      { 
        patient_id: patientId,
        read: false
      },
      { 
        read: true,
        read_at: new Date()
      }
    );

    res.json({
      message: `Marked ${result.modifiedCount} notifications as read`,
      data: { modified_count: result.modifiedCount }
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Delete notification
router.delete('/:notificationId', auth, async (req, res) => {
  try {
    const { notificationId } = req.params;

    const notification = await Notification.findByIdAndDelete(notificationId);

    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    res.json({
      message: 'Notification deleted successfully'
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Clear all notifications for patient
router.delete('/patient/:patientId/clear-all', auth, async (req, res) => {
  try {
    const { patientId } = req.params;

    const result = await Notification.deleteMany({ patient_id: patientId });

    res.json({
      message: `Cleared ${result.deletedCount} notifications`,
      data: { deleted_count: result.deletedCount }
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Get notification preferences
router.get('/preferences/:patientId', auth, async (req, res) => {
  try {
    const { patientId } = req.params;

    // In a real app, this would come from a NotificationPreferences model
    const defaultPreferences = {
      medication_reminders: {
        enabled: true,
        push_notifications: true,
        email_notifications: false,
        sms_notifications: false,
        advance_notice_minutes: 30,
        snooze_duration_minutes: 15
      },
      vital_alerts: {
        enabled: true,
        push_notifications: true,
        email_notifications: true,
        sms_notifications: true,
        critical_alerts_only: false
      },
      appointment_reminders: {
        enabled: true,
        push_notifications: true,
        email_notifications: true,
        advance_notice_hours: 24
      },
      quiet_hours: {
        enabled: false,
        start_time: "22:00",
        end_time: "07:00"
      }
    };

    res.json({
      message: 'Notification preferences retrieved successfully',
      data: defaultPreferences
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update notification preferences
router.put('/preferences/:patientId', auth, async (req, res) => {
  try {
    const { patientId } = req.params;
    const preferences = req.body;

    // In a real app, this would save to a NotificationPreferences model
    // For now, we'll just validate and return the updated preferences

    const validPreferences = validateNotificationPreferences(preferences);
    
    res.json({
      message: 'Notification preferences updated successfully',
      data: validPreferences
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Get unread notification count
router.get('/patient/:patientId/unread-count', auth, async (req, res) => {
  try {
    const { patientId } = req.params;

    const unreadCount = await Notification.countDocuments({
      patient_id: patientId,
      read: false
    });

    res.json({
      message: 'Unread count retrieved successfully',
      data: { unread_count: unreadCount }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Snooze medication reminder
router.post('/medication-reminders/:logId/snooze', auth, async (req, res) => {
  try {
    const { logId } = req.params;
    const { snooze_minutes = 15 } = req.body;

    const log = await MedicationIntakeLog.findById(logId);
    if (!log) {
      return res.status(404).json({ message: 'Medication log not found' });
    }

    // Create a new reminder for the snoozed time
    const snoozedTime = new Date(log.scheduled_time);
    snoozedTime.setMinutes(snoozedTime.getMinutes() + parseInt(snooze_minutes));

    // In a real implementation, you might want to create a new notification
    // or update the existing one with snooze information

    res.json({
      message: `Medication reminder snoozed for ${snooze_minutes} minutes`,
      data: {
        original_time: log.scheduled_time,
        snoozed_until: snoozedTime
      }
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Helper functions
function getReminderUrgency(scheduledTime) {
  const now = new Date();
  const timeDiff = scheduledTime - now;
  const minutesDiff = timeDiff / (1000 * 60);

  if (minutesDiff <= 0) return 'high'; // Overdue
  if (minutesDiff <= 15) return 'medium'; // Due soon
  return 'low'; // Future
}

function formatParameterName(parameter) {
  const names = {
    systolic_bp: 'Systolic Blood Pressure',
    diastolic_bp: 'Diastolic Blood Pressure',
    heart_rate: 'Heart Rate',
    respiratory_rate: 'Respiratory Rate',
    temperature: 'Temperature',
    oxygen_saturation: 'Oxygen Saturation',
    blood_glucose: 'Blood Glucose'
  };
  return names[parameter] || parameter;
}

function validateNotificationPreferences(preferences) {
  // Basic validation - in real app, use Joi or similar
  const validTypes = ['medication_reminders', 'vital_alerts', 'appointment_reminders'];
  
  for (const type of validTypes) {
    if (preferences[type] && typeof preferences[type].enabled !== 'boolean') {
      throw new Error(`Invalid preferences for ${type}`);
    }
  }
  
  return preferences;
}

// Notification Model (add this to models/Notification.js)
const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  patient_id: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'Patient'
  },
  type: {
    type: String,
    required: true,
    enum: ['medication_reminder', 'vital_alert', 'appointment_reminder', 'general']
  },
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  data: {
    type: mongoose.Schema.Types.Mixed // Flexible data field for different notification types
  },
  read: {
    type: Boolean,
    default: false
  },
  read_at: Date,
  priority: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium'
  },
  expiration_date: Date
}, {
  timestamps: true
});

notificationSchema.index({ patient_id: 1, read: 1, created_at: -1 });
notificationSchema.index({ expiration_date: 1 }, { expireAfterSeconds: 0 }); // Auto-delete expired

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = router;