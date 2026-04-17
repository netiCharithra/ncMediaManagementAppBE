'use strict';

const mongoose = require('mongoose');

/**
 * ColabSession
 * Tracks the latest active Google Colab → ngrok public URL.
 * We use a single-document pattern (keepAliveKey = 'singleton') so that
 * the backend always queries exactly one record for the current URL.
 */
const colabSessionSchema = new mongoose.Schema(
    {
        // The ngrok HTTPS tunnel URL exposed by the Colab notebook
        url: {
            type: String,
            required: [true, 'ngrok URL is required'],
            trim: true,
        },

        // Upsert key — only one active session is ever stored
        keepAliveKey: {
            type: String,
            default: 'singleton',
            unique: true,
            index: true,
        },

        // ISO timestamp of the last URL update (explicit, for easy querying)
        lastSeenAt: {
            type: Date,
            default: Date.now,
        },

        // Optional: caller can tag the session with a Colab notebook name
        notebookName: {
            type: String,
            trim: true,
            default: null,
        },
    },
    {
        timestamps: true, // adds createdAt / updatedAt automatically
    }
);

module.exports = mongoose.model('ColabSession', colabSessionSchema);
