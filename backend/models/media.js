const mongoose = require('mongoose');

// Uploaded images (avatars, hero backgrounds). Profiles store only the URL.
const mediaSchema = new mongoose.Schema(
    {
        // Random 128-bit id, so image URLs can't be guessed or enumerated.
        _id: {
            type: String,
            required: true,
        },
        ownerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        contentType: {
            type: String,
            required: true,
        },
        size: {
            type: Number,
            required: true,
        },
        data: {
            type: Buffer,
            required: true,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model('Media', mediaSchema);
