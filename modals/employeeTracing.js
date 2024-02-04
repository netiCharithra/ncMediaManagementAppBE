const mongoose = require('mongoose');


const employeeTracing = new mongoose.Schema({
    activeTraceId: {
        type: String,
        required: [true, 'Trace ID is required'],
        unique: true
    },
    employeeId: {
        type: String,
        required: [true, 'Employee ID should be specified']
    },
    startDate: {
        type: String,
        required: [true, 'please provide Start Date']
    },
    endDate: {
        type: String,
        required: [true, 'please provide End Date']
    },
    createdOn: {
        type: String,
        required: [false, 'please provide End Date']
    },
    createdBy: {
        type: String,
        required: [false, 'please provide End Date']
    },
    UpdatedOn: {
        type: String,
        required: [false, 'please provide End Date']
    },
    UpdatedBy: {
        type: String,
        required: [false, 'please provide End Date']
    }
})



module.exports = mongoose.model('employeeTracing', employeeTracing)