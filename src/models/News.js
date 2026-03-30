'use strict';

const mongoose = require('mongoose');
const slugify = require('slugify');

const newsSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: [true, 'Title is required'],
            trim: true,
            maxlength: [300, 'Title cannot exceed 300 characters'],
        },
        slug: {
            type: String,
            unique: true,
            lowercase: true,
            index: true,
        },
        summary: {
            type: String,
            maxlength: [3000, 'Summary cannot exceed 3000 characters'],
        },
        content: {
            type: String,
            required: [true, 'Content is required'],
        },
        imageUrl: { type: String },
        imageCaption: { type: String },
        videoUrl: { type: String },

        // Source
        sourceUrl: { type: String },
        sourceName: { type: String },
        sourceType: {
            type: String,
            enum: ['rss', 'api', 'contributor', 'editorial'],
        },
        originalLanguage: { type: String, default: '-na-' },
        rawNewsId: { type: mongoose.Schema.Types.ObjectId, ref: 'RawNews' },
        parentNewsId: { type: mongoose.Schema.Types.ObjectId, ref: 'News' },
        translationSource: {
            type: String,
            enum: ['original', 'automatic', 'manual'],
            default: 'original',
        },

        // Classification
        category: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Category',
            required: true,
            index: true,
        },
        tags: [{ type: String, lowercase: true, trim: true }],

        // Location (Hyperlocal)
        location: {
            scope: {
                type: String,
                enum: ['district', 'state', 'national', 'international'],
                default: 'national',
                index: true,
            },
            district: { type: String, trim: true, index: true },
            state: { type: String, trim: true, default: 'Andhra Pradesh', index: true },
            country: { type: String, trim: true, default: 'India' },
        },

        // Status & Review
        status: {
            type: String,
            enum: ['draft', 'review', 'published', 'archived', 'rejected'],
            default: 'published',
            index: true,
        },
        isBreaking: { type: Boolean, default: false, index: true },
        isTrending: { type: Boolean, default: false, index: true },
        isFeatured: { type: Boolean, default: false },

        // Authorship
        author: {
            type: mongoose.Schema.Types.ObjectId,
            refPath: 'authorModel',
        },
        authorModel: {
            type: String,
            enum: ['Admin', 'Contributor'],
        },
        reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
        approvals: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Admin' }],
        publishedAt: { type: Date, index: true },

        // Engagement
        views: { type: Number, default: 0, index: true },
        shares: { type: Number, default: 0 },
        bookmarks: { type: Number, default: 0 },
        likesCount: { type: Number, default: 0 },
        dislikesCount: { type: Number, default: 0 },
        commentsCount: { type: Number, default: 0 },

        // Notification
        notificationSent: { type: Boolean, default: false },
    },
    { timestamps: true }
);

// Compound indexes for feed queries
newsSchema.index({ status: 1, publishedAt: -1 });
newsSchema.index({ status: 1, 'location.district': 1, publishedAt: -1 });
newsSchema.index({ status: 1, 'location.state': 1, publishedAt: -1 });
newsSchema.index({ status: 1, 'location.scope': 1, publishedAt: -1 });
newsSchema.index({ status: 1, isTrending: 1, publishedAt: -1 });
newsSchema.index({ status: 1, isBreaking: 1, publishedAt: -1 });
newsSchema.index({ tags: 1 });
newsSchema.index(
    { title: 'text', summary: 'text', content: 'text', tags: 'text' },
    { weights: { title: 10, summary: 5, content: 1, tags: 3 } }
);

// Auto-generate slug
newsSchema.pre('validate', function (next) {
    if (this.isNew || this.isModified('title')) {
        const base = slugify(this.title, { lower: true, strict: true });
        this.slug = `${base}-${Date.now()}`;
    }
    next();
});

// Auto-set publishedAt
newsSchema.pre('save', function (next) {
    if (this.isModified('status') && this.status === 'published' && !this.publishedAt) {
        this.publishedAt = new Date();
    }
    next();
});

module.exports = mongoose.model('News', newsSchema);
