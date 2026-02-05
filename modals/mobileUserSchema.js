const mongoose = require('mongoose');

const mobileUserSchema = new mongoose.Schema({
  fcmToken: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  location: {
    latitude: {
      type: Number,
      required: false,
      default: null,
      min: -90,
      max: 90
    },
    longitude: {
      type: Number,
      required: false,
      default: null,
      min: -180,
      max: 180
    }
  },
  preferredLanguage: {
    type: String,
    required: false,
    default: 'en',
    enum: ['en', 'te', 'hi', 'ta', 'kn', 'ml', 'mr', 'bn', 'gu', 'or', 'pa']
  },
  deviceInfo: {
    platform: {
      type: String,
      enum: ['android', 'ios', 'web'],
      required: false
    },
    deviceId: {
      type: String,
      required: false
    },
    appVersion: {
      type: String,
      required: false
    }
  },
  accessTimestamps: {
    type: [Number],
    default: []
  },
  platform:{
    type: String,
    enum: ['android', 'ios', 'web'],
    required: false
  }
}, {
  timestamps: true
});

// Index for faster queries
mobileUserSchema.index({ fcmToken: 1 });
mobileUserSchema.index({ 'location.latitude': 1, 'location.longitude': 1 });
mobileUserSchema.index({ preferredLanguage: 1 });

module.exports = mongoose.model('mobileUser', mobileUserSchema);
