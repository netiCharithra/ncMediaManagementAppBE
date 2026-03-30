'use strict';

const User = require('../models/User');
const Admin = require('../models/Admin');
const Contributor = require('../models/Contributor');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../utils/jwt');
const { AppError } = require('../utils/AppError');

// ─── User Auth ─────────────────────────────────────────────────────────────────

const registerUser = async ({ name, email, phone, password, district, state, language }) => {
    const existing = await User.findOne({ $or: [{ email }, ...(phone ? [{ phone }] : [])] });
    if (existing) throw new AppError('Email or phone already registered', 409);

    const user = await User.create({
        name,
        email,
        phone,
        password,
        preferredLanguage: language || 'te',
        location: { district, state: state || 'Andhra Pradesh' },
    });

    return _issueTokens(user, 'user');
};

const { getFirebaseAuth } = require('../config/firebase');

const loginUser = async ({ email, password }) => {
    const user = await User.findOne({ email }).select('+password');
    if (!user || !(await user.comparePassword(password))) {
        throw new AppError('Invalid email or password', 401);
    }
    if (!user.isActive) throw new AppError('Account is disabled. Contact support.', 403);

    user.lastLogin = new Date();
    const tokens = _issueTokens(user, 'user');
    user.refreshToken = tokens.refreshToken;
    await user.save({ validateBeforeSave: false });

    return { ...tokens, user: user.toSafeObject() };
};

const loginGoogle = async ({ idToken }) => {
    try {
        const decodedToken = await getFirebaseAuth().verifyIdToken(idToken);
        const { email, name, picture, uid } = decodedToken;

        let user = await User.findOne({ $or: [{ googleId: uid }, { email }] });

        if (!user) {
            user = await User.create({
                name: name || 'Google User',
                email,
                googleId: uid,
                avatar: picture,
                isEmailVerified: true
            });
        } else if (!user.googleId) {
            user.googleId = uid;
            user.avatar = user.avatar || picture;
            user.isEmailVerified = true;
            await user.save();
        }

        if (!user.isActive) throw new AppError('Account is disabled. Contact support.', 403);

        user.lastLogin = new Date();
        const tokens = _issueTokens(user, 'user');
        user.refreshToken = tokens.refreshToken;
        await user.save({ validateBeforeSave: false });

        return { ...tokens, user: user.toSafeObject() };
    } catch (error) {
        throw new AppError('Invalid Google token', 401);
    }
};

// ─── Admin Auth ────────────────────────────────────────────────────────────────

const loginAdmin = async ({ email, password }) => {
    const admin = await Admin.findOne({ email }).select('+password');
    if (!admin || !(await admin.comparePassword(password))) {
        throw new AppError('Invalid admin credentials', 401);
    }
    if (!admin.isActive) throw new AppError('Admin account disabled', 403);

    admin.lastLogin = new Date();
    const tokens = _issueTokens(admin, admin.role);
    admin.refreshToken = tokens.refreshToken;
    await admin.save({ validateBeforeSave: false });

    return {
        ...tokens,
        admin: { id: admin._id, name: admin.name, email: admin.email, role: admin.role, permissions: admin.permissions },
    };
};

// ─── Contributor Auth ──────────────────────────────────────────────────────────

const registerContributor = async ({ name, email, phone, password, bio, coveringDistricts }) => {
    const existing = await Contributor.findOne({ email });
    if (existing) throw new AppError('Email already registered', 409);

    const contributor = await Contributor.create({
        name,
        email,
        phone,
        password,
        bio,
        coveringDistricts: coveringDistricts || [],
        status: 'pending',
    });

    return { message: 'Contributor registered. Awaiting admin approval.', id: contributor._id };
};

const loginContributor = async ({ email, password }) => {
    const contributor = await Contributor.findOne({ email }).select('+password');
    if (!contributor || !(await contributor.comparePassword(password))) {
        throw new AppError('Invalid credentials', 401);
    }
    if (contributor.status !== 'approved') {
        throw new AppError(`Your account status is "${contributor.status}". Please wait for admin approval.`, 403);
    }

    contributor.lastLogin = new Date();
    const tokens = _issueTokens(contributor, 'contributor');
    contributor.refreshToken = tokens.refreshToken;
    await contributor.save({ validateBeforeSave: false });

    return {
        ...tokens,
        contributor: {
            id: contributor._id,
            name: contributor.name,
            email: contributor.email,
            coveringDistricts: contributor.coveringDistricts,
        },
    };
};

// ─── Refresh Token ─────────────────────────────────────────────────────────────

const refreshAccessToken = async (refreshToken, role) => {
    let decoded;
    try {
        decoded = verifyRefreshToken(refreshToken);
    } catch {
        throw new AppError('Invalid or expired refresh token', 401);
    }

    let entity;
    if (role === 'admin' || role === 'super_admin') {
        entity = await Admin.findById(decoded.id).select('+refreshToken');
    } else if (role === 'contributor') {
        entity = await Contributor.findById(decoded.id).select('+refreshToken');
    } else {
        entity = await User.findById(decoded.id).select('+refreshToken');
    }

    if (!entity || entity.refreshToken !== refreshToken) {
        throw new AppError('Refresh token mismatch or revoked', 401);
    }

    const tokens = _issueTokens(entity, decoded.role);
    entity.refreshToken = tokens.refreshToken;
    await entity.save({ validateBeforeSave: false });
    return tokens;
};

// ─── Private ───────────────────────────────────────────────────────────────────

const _issueTokens = (entity, role) => {
    const payload = { id: entity._id, role };
    return {
        accessToken: generateAccessToken(payload),
        refreshToken: generateRefreshToken(payload),
    };
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
