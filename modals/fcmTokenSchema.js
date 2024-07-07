const mongoose = require('mongoose');

const dataSchema = {
 
    token:{
        type:String,
        required:[true, "FCM TOKEN REQUIRED"]
    },
    
    language:{
        type:String,
        required:[true, "LANGUAGE REQUIRED"]
    },
    device:{
        type:String,
        required:[true, "DEVICE REQUIRED"]
    }
 
}
const fcmTokenSchema = new mongoose.Schema(dataSchema)

module.exports = mongoose.model('fcmToken', fcmTokenSchema)