// routes/notifications.js - COMPLETE TEMPORARY VERSION
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const MedicationIntakeLog = require('../models/MedicationIntakeLog');
const VitalSigns = require('../models/VitalSigns');
const VitalThresholds = require('../models/VitalThresholds');
const Patient = require('../models/Patient');
const Doctor = require('../models/Doctor');
const { auth } = require('../middleware/auth');

// Get all notifications for a patient
router.get('/patient/:patientId', auth, async (req, res) => {
  try {
    const { patientId } = req.params;
    const { type, page = 1, limit = 20, unreadOnly } = req.query;

    // Check access
    const hasAccess = await checkNotificationAccess(req.user, patientId);
    if (!hasAccess) {
      return res.status(403).json({ 
        message: 'Access denied. You do not have permission to view these notifications.' 
      });
    }

    // TEMPORARY: Return sample notifications
    const sampleNotifications = [
      {
        _id: '1',
        type: 'medication_reminder',
        title: 'Medication Due',
        message: 'Time to take Lisinopril 10mg',
        read: false,
        created_at: new Date()
      },
      {
        _id: '2', 
        type: 'vital_alert',
        title: 'Vital Sign Alert',
        message: 'Blood pressure reading is high',
        read: true,
        created_at: new Date(Date.now() - 2 * 60 * 60 * 1000) // 2 hours ago
      }
    ];

    // Filter by type if specified
    let filteredNotifications = sampleNotifications;
    if (type) {
      filteredNotifications = sampleNotifications.filter(notification => 
        notification.type === type
      );
    }

    // Filter by read status if specified
    if (unreadOnly === 'true') {
      filteredNotifications = filteredNotifications.filter(notification => 
        !notification.read
      );
    }

    // Simple pagination
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    const paginatedNotifications = filteredNotifications.slice(startIndex, endIndex);

    res.json({
      message: 'Notifications retrieved successfully',
      data: paginatedNotifications,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(filteredNotifications.length / limit),
        total: filteredNotifications.length,
        unread_count: filteredNotifications.filter(n => !n.read).length
      }
    });

  } catch (error) {
    console.error('Error getting notifications:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get due medication reminders
router.get('/medication-reminders/:patientId', auth, async (req, res) => {
  try {
    const { patientId } = req.params;
    const { hoursAhead = 24 } = req.query;

    // Check access
    const hasAccess = await checkNotificationAccess(req.user, patientId);
    if (!hasAccess) {
      return res.status(403).json({ 
        message: 'Access denied. You do not have permission to view these reminders.' 
      });
    }

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
    console.error('Error getting medication reminders:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get vital signs alerts
router.get('/vital-alerts/:patientId', auth, async (req, res) => {
  try {
    const { patientId } = req.params;
    const { days = 7 } = req.query;

    // Check access
    const hasAccess = await checkNotificationAccess(req.user, patientId);
    if (!hasAccess) {
      return res.status(403).json({ 
        message: 'Access denied. You do not have permission to view these alerts.' 
      });
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    // Get vital thresholds for patient
    const thresholds = await VitalThresholds.find({ patient_id: patientId });

    // Get recent vital signs
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

    // Remove duplicates and sort
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
    console.error('Error getting vital alerts:', error);
    res.status(500).json({ message: error.message });
  }
});

// Mark notification as read (temporary - just returns success)
router.patch('/:notificationId/read', auth, async (req, res) => {
  try {
    res.json({
      message: 'Notification marked as read (temporary implementation)',
      data: {
        _id: req.params.notificationId,
        read: true,
        read_at: new Date()
      }
    });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(400).json({ message: error.message });
  }
});

// Mark all notifications as read (temporary)
router.patch('/patient/:patientId/read-all', auth, async (req, res) => {
  try {
    // Check access
    const hasAccess = await checkNotificationAccess(req.user, req.params.patientId);
    if (!hasAccess) {
      return res.status(403).json({ 
        message: 'Access denied.' 
      });
    }

    res.json({
      message: 'All notifications marked as read (temporary implementation)',
      data: { modified_count: 0 }
    });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(400).json({ message: error.message });
  }
});

// Other endpoints with temporary implementations...
router.delete('/:notificationId', auth, async (req, res) => {
  res.json({ message: 'Notification deleted (temporary implementation)' });
});

router.delete('/patient/:patientId/clear-all', auth, async (req, res) => {
  // Check access
  const hasAccess = await checkNotificationAccess(req.user, req.params.patientId);
  if (!hasAccess) {
    return res.status(403).json({ message: 'Access denied.' });
  }
  res.json({ message: 'All notifications cleared (temporary implementation)', data: { deleted_count: 0 } });
});

// Get notification preferences
router.get('/preferences/:patientId', auth, async (req, res) => {
  try {
    // Check access
    const hasAccess = await checkNotificationAccess(req.user, req.params.patientId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied.' });
    }

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
    // Check access
    const hasAccess = await checkNotificationAccess(req.user, req.params.patientId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied.' });
    }

    res.json({
      message: 'Notification preferences updated successfully',
      data: req.body
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Get unread notification count
router.get('/patient/:patientId/unread-count', auth, async (req, res) => {
  try {
    // Check access
    const hasAccess = await checkNotificationAccess(req.user, req.params.patientId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied.' });
    }

    res.json({
      message: 'Unread count retrieved successfully',
      data: { unread_count: 0 }
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

    const log = await MedicationIntakeLog.findById(logId).populate('medication_schedule_id');
    if (!log) {
      return res.status(404).json({ message: 'Medication log not found' });
    }

    // Check access
    const hasAccess = await checkNotificationAccess(req.user, log.patient_id.toString());
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied.' });
    }

    const snoozedTime = new Date(log.scheduled_time);
    snoozedTime.setMinutes(snoozedTime.getMinutes() + parseInt(snooze_minutes));

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

// HELPER FUNCTIONS
async function checkNotificationAccess(user, patientId) {
  try {
    if (user.role === 'patient') {
      const patient = await Patient.findOne({ user_id: user.id });
      return patient && patient._id.toString() === patientId;
    } else if (user.role === 'doctor') {
      const patient = await Patient.findOne({
        _id: patientId,
        'doctors.doctor_id': user.id,
        'doctors.is_active': true
      });
      return !!patient;
    }
    return false;
  } catch (error) {
    console.error('Error checking notification access:', error);
    return false;
  }
}

function getReminderUrgency(scheduledTime) {
  const now = new Date();
  const timeDiff = scheduledTime - now;
  const minutesDiff = timeDiff / (1000 * 60);
  if (minutesDiff <= 0) return 'high';
  if (minutesDiff <= 15) return 'medium';
  return 'low';
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

module.exports = router;