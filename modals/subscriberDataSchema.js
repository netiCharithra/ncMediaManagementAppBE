
const mongoose = require('mongoose')

const dataSchema = {
    name: {
        type: String,
        required: [true, 'Name should be specified']
    },
    mobile: {
        type: Number,
        required: [true, 'Mobile Number should be specified'],
        unique:true
    },
    state: {
        type: String,
        required: [true, 'please provide state']
    },
    district: {
        type: String,
        required: [true, 'please provide district']
    },
    mandal: {
        type: String,
        required: [true, 'please provide district']
    },
    addedToGroup:{
        type:Boolean,
        default:false
    },
    addedBy:{
        type:String,
        required: [true, 'Added by should be specified']
    },
    createdDate: {
        type: Number,
        default:new Date().getTime()
    }
}
const subscriberDataSchema = new mongoose.Schema(dataSchema)

module.exports = mongoose.model('subscriber', subscriberDataSchema); 