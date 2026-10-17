const mongoose = require('mongoose');

/*
  Public keys of a user's current install (one per user while TalkNow is single-device).
  Private keys never leave the phone. One-time prekeys are handed out once each and
  removed in the same operation.
*/
const keyBundleSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            unique: true,
        },
        deviceId: { type: Number, default: 1 },
        registrationId: { type: Number, required: true },
        identityKey: { type: String, required: true }, // Ed25519 public key, base64
        identityDhKey: { type: String, required: true }, // X25519 public key, base64
        identityDhSignature: { type: String, required: true },
        signedPreKey: {
            keyId: { type: Number, required: true },
            publicKey: { type: String, required: true },
            signature: { type: String, required: true },
            createdAt: { type: Date, default: Date.now },
        },
        oneTimePreKeys: {
            type: [
                {
                    _id: false,
                    keyId: { type: Number, required: true },
                    publicKey: { type: String, required: true },
                },
            ],
            default: [],
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model('KeyBundle', keyBundleSchema);
