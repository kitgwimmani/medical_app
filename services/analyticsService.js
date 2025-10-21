// services/analyticsService.js
const VitalSigns = require('../models/VitalSigns');
const MedicationIntakeLog = require('../models/MedicationIntakeLog');

class AnalyticsService {
  async getPatientHealthSummary(patientId, days = 30) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Get vital signs statistics
      const vitalStats = await VitalSigns.aggregate([
        {
          $match: {
            patient_id: new mongoose.Types.ObjectId(patientId),
            recorded_at: { $gte: startDate }
          }
        },
        {
          $group: {
            _id: null,
            avgSystolicBP: { $avg: "$systolic_bp" },
            avgDiastolicBP: { $avg: "$diastolic_bp" },
            avgHeartRate: { $avg: "$heart_rate" },
            avgTemperature: { $avg: "$temperature" },
            lastRecorded: { $max: "$recorded_at" }
          }
        }
      ]);

      // Get medication adherence
      const adherenceStats = await MedicationIntakeLog.aggregate([
        {
          $match: {
            patient_id: new mongoose.Types.ObjectId(patientId),
            scheduled_time: { $gte: startDate }
          }
        },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 }
          }
        }
      ]);

      return {
        vitalStats: vitalStats[0] || {},
        adherenceStats
      };
    } catch (error) {
      throw error;
    }
  }

  async getVitalSignsTrend(patientId, parameter, days = 7) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      return await VitalSigns.aggregate([
        {
          $match: {
            patient_id: new mongoose.Types.ObjectId(patientId),
            recorded_at: { $gte: startDate },
            [parameter]: { $exists: true, $ne: null }
          }
        },
        {
          $group: {
            _id: {
              date: { $dateToString: { format: "%Y-%m-%d", date: "$recorded_at" } }
            },
            average: { $avg: `$${parameter}` },
            min: { $min: `$${parameter}` },
            max: { $max: `$${parameter}` },
            readings: { 
              $push: { 
                value: `$${parameter}`, 
                time: "$recorded_at",
                id: "$_id"
              } 
            }
          }
        },
        { $sort: { "_id.date": 1 } }
      ]);
    } catch (error) {
      throw error;
    }
  }
}

module.exports = new AnalyticsService();