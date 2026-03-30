'use strict';

const mongoose = require('mongoose');
const slugify = require('slugify');

const categorySchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, 'Category name is required'],
            unique: true,
            trim: true,
        },
        nameInTelugu: { type: String, trim: true },
        slug: { type: String, unique: true, lowercase: true, index: true },
        description: { type: String, maxlength: 300 },
        icon: { type: String },
        color: { type: String, default: '#E53935' },
        parentCategory: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Category',
            default: null,
        },
        isActive: { type: Boolean, default: true },
        order: { type: Number, default: 0 },
        newsCount: { type: Number, default: 0 },
    },
    { timestamps: true }
);

categorySchema.pre('validate', function (next) {
    if (this.isNew || this.isModified('name')) {
        this.slug = slugify(this.name, { lower: true, strict: true });
    }
    next();
});

module.exports = mongoose.model('Category', categorySchema);
