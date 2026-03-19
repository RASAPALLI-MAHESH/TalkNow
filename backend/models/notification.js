const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
    {
        toUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        fromUsername: { type: String },
        fromProfilePicture: { type: String, default: '' },
        type: { type: String, required: true },
        message: { type: String, required: true },
    },
    { timestamps: true }
);

// Prevent unbounded collection scans for the common query: "latest notifications for a user"
notificationSchema.index({ toUserId: 1, createdAt: -1 });
notificationSchema.index({ toUserId: 1, type: 1, createdAt: -1 });

// Enforce one active pending follow request per user pair to avoid duplicate rows under concurrency.
notificationSchema.index(
    { toUserId: 1, fromUserId: 1, type: 1 },
    {
        unique: true,
        partialFilterExpression: { type: 'follow_request' },
        name: 'uniq_pending_follow_request_per_pair',
    }
);

module.exports = mongoose.model('Notification', notificationSchema);
