const mongoose = require('mongoose')

const otpTrackingSchema =  new mongoose.Schema({
    otp:{
        type:Number,
        required :[false,'OTP should be specified']
    },
    mobileNumber:{
        type:Number,
        required :[true,'Mobile Number should be specified']
    }, 
    expiry:{
        type: Number,
        default: new Date(Date.now() + 600000) // THIS IS FOR 10 Minutes
    },
    createdDate:{
        type: Number,
        default: new Date().getTime()    
    }
    
})


module.exports = mongoose.model('otpTracking',otpTrackingSchema)