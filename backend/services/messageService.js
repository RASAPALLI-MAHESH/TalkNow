const Message = require('../models/message');
const Connection = require('../models/connection');
// No longer using this sendMessage since chatFunctions handles it natively.
async function sendMessage() {
    throw new Error('Deprecated, use chatFunctions.sendMessage instead');
}
// ─── Mark as delivered (device received it, not opened) ───────────────────────
async function markAsDelivered({ conversationId, userId }) {
  // Ignored for now.
}
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
async function getInbox(userId) {
  // Ignored. chatFunctions.getInbox is heavily preferred right now.
  return [];
}

// ─── Total unread badge (the number on the app icon) ─────────────────────────
async function getTotalUnread(userId) {
  const result = await Connection.aggregate([
    { $match: { 'participants.userId': userId, 'status': 'accepted', 'hasMessages': true } },
    { $unwind: '$participants' },
    { $match: { 'participants.userId': userId } },
    {
      $group: {
        _id: null,
        total: { $sum: '$participants.unreadCount' },
      },
    },
  ]);
  return result[0]?.total ?? 0;
}
// ─── Recompute unread from messages (Stage 8) ─────────────
async function recomputeUnread({ conversationId, userId }) {
  const conn = await Connection.findById(conversationId).lean();
  if (!conn) return 0;
  
  const me = conn.participants.find(p => p.userId.equals(userId));
  if (!me) return 0;
  
  const lastReadAt = me.lastReadAt || new Date(0);

  const count = await Message.countDocuments({
    conversationId,
    senderId: { $ne: userId },
    createdAt: { $gt: lastReadAt }
  });

  if (me.unreadCount !== count) {
      await Connection.updateOne(
          { _id: conversationId, "participants.userId": userId },
          { $set: { "participants.$.unreadCount": count } }
      );
  }

  return count;
}
module.exports = { sendMessage, markAsDelivered, markAsRead, getInbox, getTotalUnread, recomputeUnread };

