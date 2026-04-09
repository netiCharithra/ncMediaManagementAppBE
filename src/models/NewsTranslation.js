'use strict';

const mongoose = require('mongoose');

const newsTranslationSchema = new mongoose.Schema(
    {
        newsId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'News',
            required: true,
            index: true,
        },
        language: {
            type: String,
            enum: ['te', 'hi', 'en', 'ur', 'kn', 'ta'],
            required: true,
        },
        title: { type: String, required: true, trim: true },
        summary: { type: String },
        content: { type: String, required: true },
        imageUrl: { type: String },
        sourceUrl: { type: String },
        sourceName: { type: String },
        sourceType: {
            type: String,
            enum: ['rss', 'api', 'contributor', 'editorial'],
        },
        translationSource: {
            type: String,
            enum: ['api', 'manual', 'contributor'],
            default: 'api',
        },
        isReviewed: { type: Boolean, default: false },
        reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true }
);

newsTranslationSchema.index({ newsId: 1, language: 1 }, { unique: true });

module.exports = mongoose.model('NewsTranslation', newsTranslationSchema);
