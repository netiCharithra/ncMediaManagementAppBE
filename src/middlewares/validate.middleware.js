'use strict';

const { validationResult } = require('express-validator');
const { AppError } = require('../utils/AppError');

/**
 * Middleware to check express-validator results and forward errors.
 */
const validate = (req, _res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        const messages = errors.array().map((e) => e.msg).join(', ');
        return next(new AppError(messages, 422));
    }
    next();
};

module.exports = { validate };
