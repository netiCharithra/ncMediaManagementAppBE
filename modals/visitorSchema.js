const mongoose = require('mongoose');

const visitorSchema = new mongoose.Schema({
  fcmTokensByDay: {
    type: Map,
    of: [{
      token: {
        type: String,
        required: true
      },
      visitedOn: {
        type: [Number], // Array of epoch timestamps
        default: []
      },
      location: {
        type: [Number], // [latitude, longitude]
        validate: {
          validator: function (val) {
            // Allow null/undefined or an array of exactly 2 numbers
            return val === null || 
                   val === undefined || 
                   (Array.isArray(val) && (val.length === 0 || val.length === 2));
          },
          message: 'Location must be either empty, null, or an array of [latitude, longitude]'
        },
        required: false,
        default: null
      }
    }],
    default: {}
  }
});

module.exports = mongoose.model('visitor', visitorSchema);
