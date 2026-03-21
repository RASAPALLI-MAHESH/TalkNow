const mongoose = require("mongoose");

const participantSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    lastReadAt: {
      type: Date,
      default: null,
    },
    lastDeliveredAt: {           // ✅ fix: was "lastDevliveredAt"
      type: Date,
      default: null,
    },
    unreadCount: {
      type: Number,
      default: 0,
    },
    muted: {
      type: Boolean,             // ✅ fix: was "boolean" (lowercase crashes Mongoose)
      default: false,            // ✅ fix: was 0 — use false for booleans
    },
    status: {
      type: String,
      enum: ["sent", "delivered", "read"],  // ✅ fix: was "devlivered"
      default: "sent",
    },
  },
  { _id: false }
);

const lastMessageSchema = new mongoose.Schema(
  {
    messageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },
    content: {
      type: String,              // ✅ fix: was "Type" (capital T — Mongoose ignores it)
      default: "",
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    sentAt: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ["sent", "delivered", "read"],  // ✅ fix: was "delievered"
      default: "sent",
    },
  },
  { _id: false }
);

const conversationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["direct", "group"],
      default: "direct",
    },
    participants: [participantSchema],
    lastMessage: lastMessageSchema,  // ✅ fix: was "LastMessageSchema" (ReferenceError)
  },
  { timestamps: true }
);

// ✅ fix: indexes must be defined OUTSIDE the schema definition block
conversationSchema.index({ "participants.userId": 1, updatedAt: -1 });
conversationSchema.index({                           // ✅ fix: dot-notation key must be quoted
  "participants.userId": 1,
  "participants.unreadCount": 1,
});

// Find a participant entry by userId
conversationSchema.methods.getParticipant = function (userId) {
  return this.participants.find((p) => p.userId.equals(userId)) ?? null;
};

// Get just the status for a participant
conversationSchema.methods.getParticipantStatus = function (userId) {
  const participant = this.getParticipant(userId);
  return participant ? participant.status : null;
};

module.exports = mongoose.model("Conversation", conversationSchema);