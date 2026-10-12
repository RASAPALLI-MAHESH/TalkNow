const mongoose = require('mongoose');

// `blockerId` blocked `blockedId`: no follow requests, connection or messages between them.
const blockSchema = new mongoose.Schema(
    {
        blockerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        blockedId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
    },
    { timestamps: true }
);

blockSchema.index({ blockerId: 1, blockedId: 1 }, { unique: true });

module.exports = mongoose.model('Block', blockSchema);
