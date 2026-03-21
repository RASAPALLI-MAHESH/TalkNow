const mongoose = require('mongoose');

const connectionSchema = new mongoose.Schema(
    {
        pairKey: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },
        participants: [
            {
                userId: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'User',
                    required: true,
                },
                unreadCount: {
                    type: Number,
                    default: 0,
                },
                lastReadAt: {
                    type: Date,
                    default: null,
                }
            }
        ],
        requestedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        requestedTo: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        status: {
            type: String,
            enum: ['pending', 'accepted', 'rejected'],
            default: 'pending',
            index: true,
        },
        requestedAt: {
            type: Date,
            default: Date.now,
        },
        acceptedAt: {
            type: Date,
            default: null,
        },
        respondedAt: {
            type: Date,
            default: null,
        },
        hasMessages: {
            type: Boolean,
            default: false,
        },
        lastMessageAt: {
            type: Date,
            default: null,
        },
        lastMessagePreview: {
            type: String,
            default: '',
            maxlength: 500,
            trim: true,
        },
    },
    { timestamps: true }
);

connectionSchema.index({ pairKey: 1 }, { unique: true, background: true });
connectionSchema.index({ "participants.userId": 1, status: 1, updatedAt: -1 }, { background: true });
connectionSchema.index({ "participants.userId": 1, hasMessages: 1, lastMessageAt: -1 }, { background: true });

module.exports = mongoose.model('Connection', connectionSchema);
