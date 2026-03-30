'use strict';

const mongoose = require('mongoose');

const languageSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, 'Language name is required'],
            unique: true,
            trim: true,
        },
        nativeName: {
            type: String,
            required: [true, 'Native name is required'],
            trim: true,
        },
        code: {
            type: String,
            required: [true, 'Language code is required'],
            unique: true,
            lowercase: true,
            trim: true,
            index: true,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        order: {
            type: Number,
            default: 0,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model('Language', languageSchema);
