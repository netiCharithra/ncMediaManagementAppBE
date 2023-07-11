const mongoose = require('mongoose')

const dataSchema = {
    newsId:{
        type:Number,
        unique:[true,'News already exists with this id. Please try again!']
    },
    title: {
        type: String,
        required: [true, 'Title Requried']
    },
    sub_title: {
        type: String,
        required: [false, 'Sub Title']
    },
    description: {
        type: String,
        required: [false, 'Sub Title']
    },
    images: [],
    employeeId: {
        type: String,
        required: [true, 'Employee Id']
    },
    state: {
        type: String,
        required: [false, 'State']
    },
    district: {
        type: String,
        required: [true, 'district']
    },
    mandal: {
        type: String,
        required: [true, 'please mandal']
    },
    approved:{
        type:Boolean,
        default : false
    },
    approvedBy:{
        type:String,
        default:''
    },
    approvedOn: {
        type: Number,
        default: null
    },
    createdDate: {
        type: Number,
        default: new Date().getTime()
    },
    rejected:{
        type:Boolean,
        default:false
    },
    rejectedOn:{
        type:Number
    },
    rejectedReason:{
        type: String
    },
    rejectedBy:{
        type: String,
        default:''
    },
    lastUpdatedBy:{
        type:String
    },
    lastUpdatedOn: {
        type: Number
    }
}
const newsDataSchema = new mongoose.Schema(dataSchema)

module.exports = mongoose.model('newscollection', newsDataSchema)