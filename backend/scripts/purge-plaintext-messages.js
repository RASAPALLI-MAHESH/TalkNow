/*
  End of the end-to-end encryption transition: deletes every message stored as plain text
  by app versions before encryption, and the old plain-text previews on conversations.

  Usage (from the repo root):
    MONGO_URI=<uri> node backend/scripts/purge-plaintext-messages.js            (dry run: counts only)
    MONGO_URI=<uri> node backend/scripts/purge-plaintext-messages.js --confirm  (deletes)

  Run it once every active user is on an encrypted app version (MIN_APP_VERSION), since
  phones import legacy messages into their encrypted store when a chat is opened.
  Safe to run more than once.
*/

require('dotenv').config();

const mongoose = require('mongoose');
const Message = require('../models/message');

async function main() {
    const confirm = process.argv.includes('--confirm');
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/productiv');

    const plaintext = { encrypted: { $ne: true } };
    const messages = await Message.countDocuments(plaintext);
    const connections = mongoose.connection.db.collection('connections');
    const previews = await connections.countDocuments({ lastMessagePreview: { $exists: true } });

    if (!confirm) {
        console.log(`Dry run: ${messages} plain-text message(s) and ${previews} stored preview(s) would be deleted. Re-run with --confirm.`);
    } else {
        const deleted = await Message.deleteMany(plaintext);
        const cleared = await connections.updateMany({ lastMessagePreview: { $exists: true } }, { $unset: { lastMessagePreview: '' } });
        console.log(`Deleted ${deleted.deletedCount} plain-text message(s); cleared ${cleared.modifiedCount} preview(s).`);
    }
    await mongoose.disconnect();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
