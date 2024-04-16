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
    category:{
        type:String,
        requried:true,
        default:"General"
    },
    sub_title: {
        type: String,
        required: [false, 'Sub Title']
    },
    description: {
        type: String,
        required: [false, 'Sub Title']
    },
    images: [{
        fileName: String,
        ContentType: String
    }],
    employeeId: {
        type: String,
        required: [true, 'Employee Id']
    },
    newsType: {
        type: String,
        default:"Regional",
        required: [true, 'News Type']
    },
    language:{
        type:String,
        default:'te'
    },
    state: {
        type: String
    },
    district: {
        type: String
    },
    mandal: {
        type: String
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
    },
    viewCount:{
        type:Number,
        default:0
    }
}
const newsDataSchema = new mongoose.Schema(dataSchema)

module.exports = mongoose.model('newscollection', newsDataSchema)