const mongoose = require('mongoose');

// Define the schema for mobile screen management
const mobileScreenManagementSchema = new mongoose.Schema({
    employeeId: {
        type: String,
        required: [true, 'Employee ID should be specified'],
        unique: true
    },
    screens: {
        dashboard: {
            type: Boolean,
            default: true
        },
        newsManagement: {
            type: Boolean,
            default: false
        },
        employeeManagement: {
            type: Boolean,
            default: false
        },
        employeeTracing: {
            type: Boolean,
            default: false
        },
        newsFrameManagement: {
            type: Boolean,
            default: false
        },
        userScreensPermissionManagement: {
            type: Boolean,
            default: false
        }
    },
    createdOn: {
        type: Number,
        required: [true, 'Please provide creation timestamp']
    },
    createdBy: {
        type: String,
        required: [true, 'Please provide creator information']
    },
    lastUpdatedOn: {
        type: Number
    },
    lastUpdatedBy: {
        type: String
    }
});

module.exports = mongoose.model('mobileScreenManagement', mobileScreenManagementSchema);
