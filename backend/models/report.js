const mongoose = require('mongoose');

const REPORT_REASONS = ['spam', 'harassment', 'inappropriate', 'impersonation', 'other'];

// A user's report about another account, kept for moderation.
const reportSchema = new mongoose.Schema(
    {
        reporterId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        reportedUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        reason: {
            type: String,
            enum: REPORT_REASONS,
            required: true,
        },
        details: {
            type: String,
            default: '',
            maxlength: 1000,
        },
        status: {
            type: String,
            enum: ['open', 'reviewed'],
            default: 'open',
            index: true,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model('Report', reportSchema);
module.exports.REPORT_REASONS = REPORT_REASONS;
