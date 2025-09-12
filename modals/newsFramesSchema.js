const mongoose = require('mongoose');

const newsFrameDataSchema = {
    frameId: {
        type: Number,
        required: true,
        unique: true
    },
    frameName: {
        type: String,
        required: [true, 'Name should be specified']
    },
    frameData: {
        type: Object, // <-- changed to object
        required: true,
        default: {}
    },
    validFrom: {
        type: Number,
        required: [true, 'please provide validFrom']
    },
    validTo: {
        type: Number,
        required: [true, 'please provide validTo']
    },
    frameLanguage: {
        type: String,
        default: "te"
    },
    createdDate: {
        type: Number,
        required: [true, 'please provide createdDate']
    },
    createdBy: {
        type: String,
        required: [true, 'please provide createdBy']
    },
    updatedDate: {
        type: Number,
        required: [true, 'please provide updatedDate']
    },
    updatedBy: {
        type: String,
        required: [true, 'please provide updatedBy']
    },
};

const newsFrameSchema = new mongoose.Schema(newsFrameDataSchema);

module.exports = mongoose.model('newsFrame', newsFrameSchema);
