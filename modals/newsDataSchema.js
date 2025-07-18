const mongoose = require('mongoose')

const dataSchema = {
    newsId: {
        type: Number,
        unique: [true, 'News already exists with this id. Please try again!']
    },
    title: {
        type: String,
        required: [true, 'Title Requried']
    },
    sub_title: {
        type: String,
        required: [false, 'Sub Title']
    },
    newsType: {
        type: String,
        default: "Regional",
        required: [true, 'News Type']
    },
    category: {
        type: String,
        requried: true,
        default: "General"
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
    description: {
        type: String,
        required: [false, 'Sub Title']
    },
    
    
    images: [{
        fileName: String,
        ContentType: String,
        externalURL:{
            type:String,
            default:null
        }
    }],
    source: {
        type: String,
        required: true,
        default: "Neti Charithra"
    },
    sourceLink: {
        type: String,
        required: false,
        default: null
    },
    reportedBy: {
        type: Object,
        default: {}
    },
    
    employeeId: {
        type: String,
        required: [true, 'Employee Id']
    },
   
    language: {
        type: String,
        default: 'te'
    },
   
    approved: {
        type: Boolean,
        default: false
    },
    approvedBy: {
        type: String,
        default: ''
    },
    approvedOn: {
        type: Number,
        default: null
    },
    createdDate: {
        type: Number,
        default: null
    },
    rejected: {
        type: Boolean,
        default: false
    },
    rejectedOn: {
        type: Number,
        default: null

    },
    rejectedReason: {
        type: String,
        default: ''

    },
    rejectedBy: {
        type: String,
        default: ''
    },
    lastUpdatedBy: {
        type: String
    },
    lastUpdatedOn: {
        type: Number
    },
    viewCount: {
        type: Number,
        default: 0
    },
    publicUserId: {
        type: String,
        default: ''
    },
    deleted: {
        type: Boolean,
        default: false,
    },
    deletedBy: {
        type: String,
    },
    deletedOn: {
        type: String,
    },
    deletedComments: {
        type: String,
    },
    priorityIndex: {
        type: Number,
        default: null
    }
}
const newsDataSchema = new mongoose.Schema(dataSchema)

module.exports = mongoose.model('newscollection', newsDataSchema)