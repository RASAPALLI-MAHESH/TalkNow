const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
    {
        toUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        type: { type: String, required: true },
        message: { type: String, required: true },
    },
    { timestamps: true }
);

// Prevent unbounded collection scans for the common query: "latest notifications for a user"
notificationSchema.index({ toUserId: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
