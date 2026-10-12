const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true
    },
    // SHA-256 hash of the code; the plain code is only ever sent by email.
    otpHash: {
        type: String,
        required: true
    },
    // Wrong guesses against the current code. The code is discarded at the limit.
    attempts: {
        type: Number,
        default: 0
    },
    createdAt: {
        type: Date,
        default: Date.now,
        expires: 600 // The document will be automatically deleted after 10 minutes
    }
});

module.exports = mongoose.model('Otp', otpSchema);
