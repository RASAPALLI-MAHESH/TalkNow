const mongoose = require('mongoose');

// Largest accepted envelope body (base64). A 4000-character message is well under it.
const MAX_ENVELOPE_BODY_CHARS = 48 * 1024;

/*
  The server only ever holds ciphertext: the envelope is opaque to it and is removed as
  soon as the recipient's phone acknowledges it. What stays is metadata (who, when,
  delivered, read). `content` exists only on plain-text messages from app versions
  before end-to-end encryption; `npm run purge:plaintext` deletes those.
*/
const envelopeSchema = new mongoose.Schema(
    {
        type: { type: String, enum: ['prekey', 'whisper'], required: true },
        body: { type: String, required: true, maxlength: MAX_ENVELOPE_BODY_CHARS },
        registrationId: { type: Number, required: true },
        recipientRegistrationId: { type: Number, required: true },
    },
    { _id: false }
);

const messageSchema = new mongoose.Schema(
    {
        conversationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Connection',
            index: true,
            required: true
        },
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
        encrypted: {
            type: Boolean,
            default: false,
        },
        envelope: {
            type: envelopeSchema,
            default: undefined,
        },
        // Legacy plain text (pre-encryption app versions only).
        content: {
            type: String,
            trim: true,
            maxlength: 4000,
        },
        // The sender's temporary id, so its phone can match a send whose ack was lost.
        clientId: {
            type: String,
            default: undefined,
            maxlength: 64,
        },
        // Set when this message re-sends one the recipient could not decrypt.
        resendOf: {
            type: mongoose.Schema.Types.ObjectId,
            default: null,
        },
        // When the recipient's phone confirmed it stored the message; the envelope is dropped then.
        ackedAt: {
            type: Date,
            default: null,
        },
        readAt: {
            type: Date,
            default: null,
        },
        deliveredAt: {
            type: Date,
            default: null,
        },
    },
    { timestamps: true }
);

messageSchema.index({ conversationId: 1, createdAt: -1 }, { background: true });
messageSchema.index({ receiverId: 1, createdAt: -1 }, { background: true });
messageSchema.index({ participants: 1, createdAt: -1 }, { background: true });
// The pending queue a phone drains after reconnecting.
messageSchema.index({ receiverId: 1, ackedAt: 1, createdAt: 1 }, { background: true });

module.exports = mongoose.model('Message', messageSchema);
module.exports.MAX_ENVELOPE_BODY_CHARS = MAX_ENVELOPE_BODY_CHARS;
