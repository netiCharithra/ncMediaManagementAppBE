'use strict';

const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema(
    {
        newsId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'News',
            required: true,
            index: true,
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        content: {
            type: String,
            required: [true, 'Comment content is required'],
            trim: true,
            maxlength: [1000, 'Comment cannot exceed 1000 characters'],
        },
        parentCommentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Comment',
            default: null,
            index: true,
        },
        likesCount: { type: Number, default: 0 },
        dislikesCount: { type: Number, default: 0 },
        isActive: { type: Boolean, default: true },
    },
    { timestamps: true }
);

commentSchema.index({ newsId: 1, parentCommentId: 1, createdAt: -1 });

module.exports = mongoose.model('Comment', commentSchema);
