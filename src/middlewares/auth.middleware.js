'use strict';

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { AppError } = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');

/**
 * Verify the JWT token from the Authorization header.
 * Attaches `req.user` with { id, role, model, permissions }.
 */
const authenticate = asyncHandler(async (req, _res, next) => {
    let token;
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
    }

    if (!token) {
        return next(new AppError('Authentication required. Please log in.', 401));
    }

    let decoded;
    try {
        decoded = jwt.verify(token, process.env.VIVA_DIGITAL_JWT_SECRET);
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return next(new AppError('Your session has expired. Please log in again.', 401));
        }
        return next(new AppError('Invalid token. Please log in again.', 401));
    }

    const { id, role } = decoded;

    // Find user in the single User collection
    const currentUser = await User.findById(id).select('+isActive +contributorStatus +permissions');

    if (!currentUser || !currentUser.isActive) {
        return next(new AppError('The account associated with this token no longer exists or is inactive.', 401));
    }

    // Role-specific checks
    if (currentUser.role === 'contributor' && currentUser.contributorStatus !== 'approved') {
        return next(new AppError('Your contributor account is not yet approved.', 403));
    }

    req.user = {
        id: currentUser._id,
        role: currentUser.role,
        model: 'User',
        permissions: currentUser.permissions || {},
    };
    next();
});

/**
 * Restrict access to specific roles.
 * Usage: authorize('admin', 'super_admin', 'editor')
 */
const authorize = (...roles) => {
    return (req, _res, next) => {
        if (!roles.includes(req.user.role)) {
            return next(new AppError(`Access denied. Requires one of roles: [${roles.join(', ')}]`, 403));
        }
        next();
    };
};

/**
 * Restrict access by permission flag on the admin account.
 * super_admin always bypasses permission checks.
 * Usage: authorizePermission('bulkPublish')
 */
const authorizePermission = (permission) => {
    return (req, _res, next) => {
        // super_admin has all permissions by default
        if (req.user.role === 'super_admin') return next();

        if (!req.user.permissions || !req.user.permissions[permission]) {
            return next(new AppError(`Access denied. You don't have the '${permission}' permission.`, 403));
        }
        next();
    };
};

module.exports = { authenticate, authorize, authorizePermission };
