const mongoose = require('mongoose');

/*
  `requesterId` could not decrypt messages from `targetId` and asks them to start a fresh
  encrypted session and re-send those messages. Kept until the target's phone handles it.
*/
const sessionResetSchema = new mongoose.Schema(
    {
        requesterId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        targetId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        messageIds: [{ type: mongoose.Schema.Types.ObjectId }],
    },
    { timestamps: true }
);

// Requests nobody picked up within two weeks are dropped.
sessionResetSchema.index({ createdAt: 1 }, { expireAfterSeconds: 14 * 24 * 60 * 60 });

module.exports = mongoose.model('SessionReset', sessionResetSchema);
