'use strict';

const multer = require('multer');
const path = require('path');
const { AppError } = require('../utils/AppError');

// Storage configuration - keeping file in memory for buffer upload to cloud
const storage = multer.memoryStorage();

// File filter (images only)
const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new AppError('Only image files are allowed', 400), false);
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB max
    }
});

module.exports = upload;
