'use strict';

const communityService = require('../services/community.service');
const asyncHandler = require('../utils/asyncHandler');
const { apiResponse } = require('../utils/helpers');

// POST /api/community/interaction
const toggleInteraction = asyncHandler(async (req, res) => {
    const { targetId, targetModel, type } = req.body;
    const result = await communityService.toggleInteraction(req.user.id, targetId, targetModel, type);
    apiResponse(res, 200, result, 'Interaction processed');
});

// POST /api/community/comments
const addComment = asyncHandler(async (req, res) => {
    const { newsId, content, parentCommentId } = req.body;
    const comment = await communityService.addComment(req.user.id, newsId, content, parentCommentId);
    apiResponse(res, 201, { comment }, 'Comment added successfully');
});

// GET /api/community/comments/:newsId
const getComments = asyncHandler(async (req, res) => {
    const { newsId } = req.params;
    const { parentCommentId, page, limit } = req.query;
    const result = await communityService.getComments(newsId, parentCommentId || null, { page, limit });
    apiResponse(res, 200, result, 'Comments fetched successfully');
});

module.exports = {
    toggleInteraction,
    addComment,
    getComments
};
