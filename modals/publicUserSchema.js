const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    publicUserId: {
        type: String,
        required: true
    },
    name: {
        type: String,
        required: false,
        default: ''
    },
    countryCode: {
        type: String,
        required: true,
        default: "+91"
    },
    mobileNumber: {
        type: Number,
        unique: true,
        required: true
    },
    mail: {
        type: String,
        required: false
    },
    address: {
        type: String,
        required: false
    },
    createdDate: {
        type: Number,
        default: Date.now()
    }
});

module.exports = mongoose.model('publicUserData', userSchema);
