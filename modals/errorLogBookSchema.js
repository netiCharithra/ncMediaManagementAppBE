const mongoose = require('mongoose');

const dataSchema = {
    stackTrace: {
        type: String,
        required:true
    },
    page:{
        type:String,
        required:true
    },
    functionality:{
        type: String,
        required: true
    },
    message:{
        type: String,
        required: true
    },
    errorMessage:{
        type: String,
        required: true
    },
    errorOn: {
        type: Number,
        default: new Date().getTime()
    },
    employeeId:{
        type:String,
        default:''
    }

}
const errorLogBookSchema = new mongoose.Schema(dataSchema)

module.exports = mongoose.model('error-logbook', errorLogBookSchema)