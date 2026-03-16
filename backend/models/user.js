const mongoose = require("mongoose");
const userSchema = new mongoose.Schema(
    {
        username: {
            type: String,
            required: true,
            unique: true
        },
        password: {
            type: String,
            required: true
        },
        email :{
            type: String,
            required: true,
            unique: true
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
        }
    }
)
module.exports = mongoose.model("User", userSchema);