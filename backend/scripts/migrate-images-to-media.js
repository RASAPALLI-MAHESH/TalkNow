/*
  One-off migration: move images stored inside user documents into the media collection.

  Usage (from the repo root):
    PUBLIC_BASE_URL=https://<your-api-host> MONGO_URI=<uri> node backend/scripts/migrate-images-to-media.js

  - Inline images (data:image/...;base64) in profilePicture and heroData.customImageUri are
    saved as media and replaced by their URL.
  - file:// paths (only valid on the uploader's phone) are cleared.
  - Notifications that copied an old avatar get the new URL.
  Safe to run more than once: already-migrated users are skipped.
*/

require('dotenv').config();

const mongoose = require('mongoose');
const User = require('../models/user');
const Notification = require('../models/notification');
const { InvalidImageError, isImageDataUri, prepareImageInput, commitImageInput } = require('../services/mediaStore');

const migrateValue = async (value, ownerId, baseUrl) => {
    const raw = String(value ?? '').trim();
    if (/^file:\/\//i.test(raw)) return '';
    if (!isImageDataUri(raw)) return null; // nothing to do
    try {
        return await commitImageInput(await prepareImageInput(raw, { ownerId }), { ownerId, baseUrl });
    } catch (err) {
        if (err instanceof InvalidImageError) return '';
        throw err;
    }
};

async function main() {
    const baseUrl = String(process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
    if (!/^https?:\/\//.test(baseUrl)) {
        console.error('Set PUBLIC_BASE_URL to the public API origin, e.g. https://talknow.example.com');
        process.exit(2);
    }
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/productiv');

    const cursor = User.find({
        $or: [
            { profilePicture: { $regex: '^(data:|file:)', $options: 'i' } },
            { 'heroData.customImageUri': { $regex: '^(data:|file:)', $options: 'i' } },
        ],
    })
        .select('_id profilePicture heroData')
        .cursor();

    let users = 0;
    for await (const user of cursor) {
        const set = {};
        const picture = await migrateValue(user.profilePicture, user._id, baseUrl);
        if (picture !== null) set.profilePicture = picture;
        const hero = await migrateValue(user.heroData?.customImageUri, user._id, baseUrl);
        if (hero !== null) set['heroData.customImageUri'] = hero;
        if (Object.keys(set).length === 0) continue;

        await User.updateOne({ _id: user._id }, { $set: set });
        if (set.profilePicture !== undefined) {
            await Notification.updateMany(
                { fromUserId: user._id, fromProfilePicture: { $regex: '^(data:|file:)', $options: 'i' } },
                { $set: { fromProfilePicture: set.profilePicture } }
            );
        }
        users += 1;
    }

    console.log(`Migrated ${users} user(s).`);
    await mongoose.disconnect();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
