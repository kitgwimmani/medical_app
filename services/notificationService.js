// services/notificationService.js
const cron = require('node-cron');
const MedicationIntakeLog = require('../models/MedicationIntakeLog');

class NotificationService {
  constructor() {
    this.init();
  }

  init() {
    // Check for due medications every minute
    cron.schedule('* * * * *', () => {
      this.checkDueMedications();
    });

    // Generate intake logs for tomorrow at midnight
    cron.schedule('0 0 * * *', () => {
      this.generateTomorrowIntakeLogs();
    });
  }

  async checkDueMedications() {
    try {
      const now = new Date();
      const thirtyMinutesFromNow = new Date(now.getTime() + 30 * 60000);

      const dueMedications = await MedicationIntakeLog.find({
        scheduled_time: { $lte: thirtyMinutesFromNow, $gte: now },
        status: 'pending'
      }).populate({
        path: 'medication_schedule_id',
        populate: {
          path: 'medication_id',
          model: 'Medication',
          populate: {
            path: 'patient_id',
            model: 'Patient'
          }
        }
      });

      for (let log of dueMedications) {
        // Here you would integrate with your notification system
        // (push notifications, SMS, email, etc.)
        console.log(`REMINDER: ${log.medication_schedule_id.medication_id.name} due for ${log.medication_schedule_id.medication_id.patient_id.first_name}`);
        
        // Mark as notified (you might want to add a notified_at field)
      }
    } catch (error) {
      console.error('Error checking due medications:', error);
    }
  }

  async generateTomorrowIntakeLogs() {
    try {
      // Implementation similar to the one in medications route
      // This would generate intake logs for the next day
      console.log('Generating intake logs for tomorrow...');
    } catch (error) {
      console.error('Error generating intake logs:', error);
    }
  }
}

module.exports = new NotificationService();