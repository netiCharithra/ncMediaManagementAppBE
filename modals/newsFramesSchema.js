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
    containerHeight: {
        type: Number,
        default: 535
    },
    frameHeight: {
        type: Number,
        default: 515
    },
    textPosition: {
        type: Object,
        default: {
            topPercent: 23, // 23% from the top
            leftPercent: 3, // 3% from the left
            frameReductionWidthPercent: 6, // 6% reduction in width
            contentHeight: 75 // 75% of the frame height
        }
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
        default: 0
    },
    updatedBy: {
        type: String,
        default: ''
    },
};

const newsFrameSchema = new mongoose.Schema(newsFrameDataSchema);

module.exports = mongoose.model('newsFrame', newsFrameSchema);
