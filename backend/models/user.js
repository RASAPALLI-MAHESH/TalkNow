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

module.exports = mongoose.model("User", userSchema);