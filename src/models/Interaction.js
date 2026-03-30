'use strict';

const mongoose = require('mongoose');

const interactionSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        targetId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            index: true,
        },
        targetModel: {
            type: String,
            enum: ['News', 'Comment'],
            required: true,
        },
        type: {
            type: String,
            enum: ['like', 'dislike'],
            required: true,
        },
    },
    { timestamps: true }
);

// A user can only have one interaction (like OR dislike) per target
interactionSchema.index({ userId: 1, targetId: 1, targetModel: 1 }, { unique: true });
interactionSchema.index({ targetId: 1, targetModel: 1, type: 1 });

module.exports = mongoose.model('Interaction', interactionSchema);
