const mongoose = require('mongoose');
const Connection = require('../models/connection');
// ─── Mark as read (user opened the conversation) (Stage 7) ───────────────────
async function markAsRead({ conversationId, userId }) {
  const now = new Date();
  
  await Connection.findOneAndUpdate(
      { 
          _id: conversationId,
          "participants.userId": userId
      },
      {
          $set: {
              "participants.$.unreadCount": 0,
              "participants.$.lastReadAt": now
          }
      }
  );
}

// ─── Total unread badge (the number on the app icon) ─────────────────────────
async function getTotalUnread(userId) {
  // Aggregations don't cast types, so the id must be an ObjectId to match anything.
  const me = new mongoose.Types.ObjectId(String(userId));
  const result = await Connection.aggregate([
    { $match: { 'participants.userId': me, 'status': 'accepted', 'hasMessages': true } },
    { $unwind: '$participants' },
    { $match: { 'participants.userId': me } },
    {
      $group: {
        _id: null,
        total: { $sum: '$participants.unreadCount' },
      },
    },
  ]);
  return result[0]?.total ?? 0;
}
module.exports = { markAsRead, getTotalUnread };

