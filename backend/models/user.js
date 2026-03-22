const mongoose = require("mongoose");
const userSchema = new mongoose.Schema(
    {
        Firstname: {
            type: String,
            default: "",
            trim: true,
        },
        username: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },
        password: {
            type: String,
            required: true
        },
        email :{
            type: String,
            required: true,
            unique: true,
            trim: true,
            lowercase: true,
        },
        profilePicture: {
            type: String,
            default: ""
        },
        resetOtp: {
            type: String,
            default: null
        },
        otpExpiry: {
            type: Date,
            default: null
        },

        // Profile fields
        bio: { type: String, default: "" },
        heroData: {
            text: { type: String, default: "" },
            themeId: { type: String, default: "t1" },
            customImageUri: { type: String, default: "" }
        },
        socialUrls: {
            whatsapp: { type: String, default: "" },
            instagram: { type: String, default: "" },
            linkedin: { type: String, default: "" },
            twitter: { type: String, default: "" }
        },
        customLinks: [
            {
                id: { type: String },
                label: { type: String },
                url: { type: String }
            }
        ],

        // Social graph (minimal v1): store relationships as user ids.
        following: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
            },
        ],
        followers: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
            },
        ],
    },
    { timestamps: true }
);

// Explicit indexes for predictable performance at scale.
userSchema.index({ email: 1 }, { unique: true, background: true });
userSchema.index({ username: 1 }, { unique: true, background: true });
userSchema.index({ createdAt: -1 }, { background: true });

module.exports = mongoose.model("User", userSchema);