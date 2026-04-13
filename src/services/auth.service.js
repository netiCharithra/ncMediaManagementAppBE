'use strict';

const User = require('../models/User');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../utils/jwt');
const { AppError } = require('../utils/AppError');
const { getFirebaseAuth } = require('../config/firebase');

// ─── Shared Token Issuer ───────────────────────────────────────────────────────

const _issueTokens = (entity, role) => {
    const payload = { id: entity._id, role };
    return {
        accessToken: generateAccessToken(payload),
        refreshToken: generateRefreshToken(payload),
    };
};

// ─── User Auth ─────────────────────────────────────────────────────────────────

const registerUser = async ({ name, email, phone, password, district, state, language }) => {
    if (!phone) throw new AppError('Phone number is required', 400);

    const existingPhone = await User.findOne({ phone });
    if (existingPhone) throw new AppError('Phone number already registered', 409);

    if (email) {
        const existingEmail = await User.findOne({ email });
        if (existingEmail) throw new AppError('Email already registered', 409);
    }

    const user = await User.create({
        name,
        email,
        phone,
        password,
        role: 'user',
        preferredLanguage: language || 'te',
        location: { district, state: state || 'Andhra Pradesh' },
    });

    return _issueTokens(user, user.role);
};

const loginUser = async ({ phone, email, password }) => {
    if (!phone && !email) throw new AppError('Phone or email is required', 400);
    const query = phone ? { phone } : { email };

    const user = await User.findOne(query).select('+password');
    if (!user || !(await user.comparePassword(password))) {
        throw new AppError('Invalid credentials', 401);
    }
    if (!user.isActive) throw new AppError('Account is disabled. Contact support.', 403);

    user.lastLogin = new Date();
    const tokens = _issueTokens(user, user.role);
    user.refreshToken = tokens.refreshToken;
    await user.save({ validateBeforeSave: false });

    return { ...tokens, user: user.toSafeObject() };
};

const loginGoogle = async ({ idToken, phone }) => {
    try {
        const decodedToken = await getFirebaseAuth().verifyIdToken(idToken);
        const { email, name, picture, uid } = decodedToken;

        let user = await User.findOne({ $or: [{ googleId: uid }, { email }] });

        if (!user) {
            if (!phone) throw new AppError('Phone number is required for new registration', 400);
            
            user = await User.create({
                name: name || 'Google User',
                email,
                phone, // Now mandatory
                googleId: uid,
                avatar: picture,
                isEmailVerified: true,
                role: 'user'
            });
        } else {
            if (!user.googleId) user.googleId = uid;
            if (!user.avatar) user.avatar = picture;
            if (!user.phone && phone) user.phone = phone; // Handle legacy users missing phone
            user.isEmailVerified = true;
            await user.save();
        }

        if (!user.isActive) throw new AppError('Account is disabled. Contact support.', 403);

        user.lastLogin = new Date();
        const tokens = _issueTokens(user, user.role);
        user.refreshToken = tokens.refreshToken;
        await user.save({ validateBeforeSave: false });

        return { ...tokens, user: user.toSafeObject() };
    } catch (error) {
        if (error instanceof AppError) throw error;
        throw new AppError('Invalid Google token', 401);
    }
};

// ─── Admin Auth ────────────────────────────────────────────────────────────────

const loginAdmin = async ({ email, phone, password }) => {
    if (!phone && !email) throw new AppError('Phone or email is required', 400);
    const query = phone ? { phone } : { email };

    const admin = await User.findOne(query).select('+password');
    if (!admin || !(await admin.comparePassword(password))) {
        throw new AppError('Invalid admin credentials', 401);
    }
    
    if (!['admin', 'super_admin', 'editor'].includes(admin.role)) {
        throw new AppError('Access denied. Not an admin account.', 403);
    }
    if (!admin.isActive) throw new AppError('Admin account disabled', 403);

    admin.lastLogin = new Date();
    const tokens = _issueTokens(admin, admin.role);
    admin.refreshToken = tokens.refreshToken;
    await admin.save({ validateBeforeSave: false });

    return {
        ...tokens,
        admin: admin.toSafeObject(),
    };
};

// ─── Contributor Auth ──────────────────────────────────────────────────────────

const registerContributor = async ({ name, email, phone, password, bio, coveringDistricts }) => {
    if (!phone) throw new AppError('Phone number is required', 400);
    
    const existingPhone = await User.findOne({ phone });
    if (existingPhone) throw new AppError('Phone number already registered', 409);

    if (email) {
        const existingEmail = await User.findOne({ email });
        if (existingEmail) throw new AppError('Email already registered', 409);
    }

    const contributor = await User.create({
        name,
        email,
        phone,
        password,
        role: 'contributor',
        bio,
        coveringDistricts: coveringDistricts || [],
        contributorStatus: 'pending',
    });

    return { message: 'Contributor registered. Awaiting admin approval.', id: contributor._id };
};

const loginContributor = async ({ email, phone, password }) => {
    if (!phone && !email) throw new AppError('Phone or email is required', 400);
    const query = phone ? { phone } : { email };

    const contributor = await User.findOne(query).select('+password');
    if (!contributor || !(await contributor.comparePassword(password))) {
        throw new AppError('Invalid credentials', 401);
    }
    
    if (contributor.role !== 'contributor') {
        throw new AppError('Account is not a contributor account', 403);
    }
    
    if (contributor.contributorStatus !== 'approved') {
        throw new AppError(`Your account status is "${contributor.contributorStatus}". Please wait for admin approval.`, 403);
    }

    contributor.lastLogin = new Date();
    const tokens = _issueTokens(contributor, contributor.role);
    contributor.refreshToken = tokens.refreshToken;
    await contributor.save({ validateBeforeSave: false });

    return {
        ...tokens,
        contributor: contributor.toSafeObject(),
    };
};

// ─── Refresh Token ─────────────────────────────────────────────────────────────

const refreshAccessToken = async (refreshToken) => {
    let decoded;
    try {
        decoded = verifyRefreshToken(refreshToken);
    } catch {
        throw new AppError('Invalid or expired refresh token', 401);
    }

    const entity = await User.findById(decoded.id).select('+refreshToken');

    if (!entity || !(await entity.compareRefreshToken(refreshToken))) {
        throw new AppError('Refresh token mismatch or revoked', 401);
    }

    const tokens = _issueTokens(entity, entity.role);
    entity.refreshToken = tokens.refreshToken;
    await entity.save({ validateBeforeSave: false });
    return tokens;
};

module.exports = {
    registerUser,
    loginUser,
    loginGoogle,
    loginAdmin,
    registerContributor,
    loginContributor,
    refreshAccessToken,
};
