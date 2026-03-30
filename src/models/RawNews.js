'use strict';

const mongoose = require('mongoose');

const rawNewsSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: [true, 'Title is required'],
            trim: true,
        },
        content: {
            type: String,
            required: [true, 'Content is required'],
        },
        sourceUrl: { type: String, trim: true },
        sourceName: { type: String, trim: true },
        sourceType: {
            type: String,
            enum: ['rss', 'api', 'contributor', 'editorial'],
            required: true,
        },
        language: { type: String, default: '-na-' },
        publishedAt: { type: Date },
        imageUrl: { type: String },
        contentHash: {
            type: String,
            unique: true,
            sparse: true,
            index: true,
        }, // For deduplication
        isDuplicate: { type: Boolean, default: false },
        processingStatus: {
            type: String,
            enum: ['pending', 'processing', 'processed', 'failed', 'duplicate'],
            default: 'pending',
            index: true,
        },
        processingError: { type: String },
        processedNewsId: { type: mongoose.Schema.Types.ObjectId, ref: 'News' },
        contributorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contributor' },
        category: { type: String },
        tags: [{ type: String }],
        location: {
            district: { type: String },
            state: { type: String },
            country: { type: String, default: 'India' },
        },
        retryCount: { type: Number, default: 0 },
    },
    { timestamps: true }
);

rawNewsSchema.index({ processingStatus: 1, createdAt: 1 });
rawNewsSchema.index({ sourceUrl: 1 });

module.exports = mongoose.model('RawNews', rawNewsSchema);
