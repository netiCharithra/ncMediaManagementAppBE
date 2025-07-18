const mongoose = require('mongoose')
const crypto = require('crypto')

const otpTrackingSchema = new mongoose.Schema({
    otp: {
        type: String,
        required: [true, 'OTP is required']
    },
    identifier: {
        type: String,
        required: [true, 'Identifier (email/mobile) is required'],
        index: true
    },
    identifierType: {
        type: String,
        enum: ['email', 'mobile'],
        required: [true, 'Identifier type (email/mobile) is required']
    },
    purpose: {
        type: String,
        enum: ['login', 'password_reset', 'verification'],
        default: 'login'
    },
    expiry: {
        type: Date,
        default: () => new Date(Date.now() + 120 * 1000) // 120 seconds (2 minutes) from now
    },
    isVerified: {
        type: Boolean,
        default: false
    },
    attempts: {
        type: Number,
        default: 0,
        max: 5 // Maximum number of OTP attempts
    },
    createdDate: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true })

// Generate a 6-digit OTP
const generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString()
}

// OTP is now stored in plain text

// Static method to create OTP record
const createOTP = async function (identifier, identifierType, purpose = 'login') {
    // Invalidate any existing OTPs for this identifier
    await this.updateMany(
        { identifier, identifierType, isVerified: false },
        { $set: { isVerified: true } } // Mark as verified to prevent reuse
    )
    
    // Create new OTP
    return this.create({
        identifier,
        identifierType,
        purpose
    })
}

// Add static method to schema
otpTrackingSchema.statics.createOTP = createOTP

module.exports = mongoose.model('otpTracking', otpTrackingSchema)