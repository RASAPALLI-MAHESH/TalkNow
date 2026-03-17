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
    },
    { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);