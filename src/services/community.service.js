'use strict';

const Comment = require('../models/Comment');
const Interaction = require('../models/Interaction');
const News = require('../models/News');
const mongoose = require('mongoose');
const { AppError } = require('../utils/AppError');
const { paginate } = require('../utils/helpers');

const toggleInteraction = async (userId, targetId, targetModel, type) => {
    if (!['News', 'Comment'].includes(targetModel)) {
        throw new AppError('Invalid target model', 400);
    }
    if (!['like', 'dislike'].includes(type)) {
        throw new AppError('Invalid interaction type', 400);
    }

    const Model = targetModel === 'News' ? News : Comment;
    const target = await Model.findById(targetId);
    if (!target) {
        throw new AppError(`${targetModel} not found`, 404);
    }

    const existing = await Interaction.findOne({ userId, targetId, targetModel });

    let action = '';

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        if (!existing) {
            // Add new interaction
            await Interaction.create([{ userId, targetId, targetModel, type }], { session });
            await Model.findByIdAndUpdate(targetId, { $inc: { [`${type}sCount`]: 1 } }, { session });
            action = 'added';
        } else if (existing.type === type) {
            // Remove interaction
            await Interaction.findByIdAndDelete(existing._id, { session });
            await Model.findByIdAndUpdate(targetId, { $inc: { [`${type}sCount`]: -1 } }, { session });
            action = 'removed';
        } else {
            // Change interaction
            existing.type = type;
            await existing.save({ session });

            const incQuery = {};
            if (type === 'like') {
                incQuery.likesCount = 1;
                incQuery.dislikesCount = -1;
            } else {
                incQuery.likesCount = -1;
                incQuery.dislikesCount = 1;
            }
            await Model.findByIdAndUpdate(targetId, { $inc: incQuery }, { session });
            action = 'changed';
        }

        await session.commitTransaction();
    } catch (err) {
        await session.abortTransaction();
        throw err;
    } finally {
        session.endSession();
    }

    return { message: `Interaction ${action} successfully`, action };
};

const addComment = async (userId, newsId, content, parentCommentId = null) => {
    const news = await News.findById(newsId);
    if (!news) throw new AppError('News not found', 404);

    if (parentCommentId) {
        const parent = await Comment.findById(parentCommentId);
        if (!parent || parent.newsId.toString() !== newsId) {
            throw new AppError('Invalid parent comment', 400);
        }
    }

    const comment = await Comment.create({
        userId,
        newsId,
        content,
        parentCommentId
    });

    // Increment comments count on news
    await News.findByIdAndUpdate(newsId, { $inc: { commentsCount: 1 } });

    return comment.populate('userId', 'name avatar');
};

const getComments = async (newsId, parentCommentId = null, { page = 1, limit = 20 } = {}) => {
    const { skip, limit: lim, page: pg } = paginate(page, limit);

    const filter = { newsId, isActive: true, parentCommentId };

    const [comments, total] = await Promise.all([
        Comment.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(lim)
            .populate('userId', 'name avatar')
            .lean(),
        Comment.countDocuments(filter)
    ]);

    // Attach reply counts for top level comments
    if (!parentCommentId && comments.length > 0) {
        const commentIds = comments.map(c => c._id);
        const repliesCounts = await Comment.aggregate([
            { $match: { parentCommentId: { $in: commentIds }, isActive: true } },
            { $group: { _id: '$parentCommentId', count: { $sum: 1 } } }
        ]);

        const countMap = {};
        repliesCounts.forEach(r => countMap[r._id.toString()] = r.count);

        comments.forEach(c => {
            c.repliesCount = countMap[c._id.toString()] || 0;
        });
    }

    return {
        comments,
        pagination: { total, page: pg, limit: lim, pages: Math.ceil(total / lim) }
    };
};

module.exports = {
    toggleInteraction,
    addComment,
    getComments
};
