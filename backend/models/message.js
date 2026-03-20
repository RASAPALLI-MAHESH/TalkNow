const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
    {
        conversationKey: {
            type: String,
            required: true,
            trim: true,
            index: true,
        },
        participants: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
                required: true,
            },
        ],
        senderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        receiverId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        content: {
            type: String,
            required: true,
            trim: true,
            maxlength: 4000,
        },
        readAt: {
            type: Date,
            default: null,
        },
    },
    { timestamps: true }
);

messageSchema.index({ conversationKey: 1, createdAt: -1 }, { background: true });
messageSchema.index({ receiverId: 1, createdAt: -1 }, { background: true });
messageSchema.index({ participants: 1, createdAt: -1 }, { background: true });

module.exports = mongoose.model('Message', messageSchema);
