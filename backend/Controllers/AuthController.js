const User = require("../models/user");
const OtpModel = require("../models/otp");
const bcrypt = require('bcryptjs');
const { signAuthToken } = require("../config/Jwthandling");
const sendOtp = require("../services/otpService");
const mongoose = require('mongoose');

const generateToken = (userId) => {
    return signAuthToken({ id: userId }, { expiresIn: "30d" });
};

const OTP_TTL_MS = 10 * 60 * 1000;

const isOtpExpired = (createdAt) => {
    if (!createdAt) return true;
    const created = new Date(createdAt).getTime();
    if (Number.isNaN(created)) return true;
    return Date.now() - created > OTP_TTL_MS;
};

const normalizeEmail = (value) => String(value ?? '').trim().toLowerCase();
const normalizeUsername = (value) => String(value ?? '').trim();
const normalizeFirstname = (value) => String(value ?? '').trim();

const asMongoDuplicateKeyMessage = (err) => {
    // Mongoose wraps MongoServerError; prefer consistent checks.
    const code = err?.code;
    if (code !== 11000) return null;

    const keys = err?.keyPattern || err?.keyValue || {};
    if (keys.email) return 'Email already exists';
    if (keys.username) return 'Username already taken';
    return 'Duplicate value';
};

const isEmailProviderError = (err) => {
    const msg = String(err?.message || '');
    return msg.includes('BREVO_') || msg.startsWith('Brevo email send failed');
};

exports.sendSignupOtp = async (req, res) => {
    try {
        const email = normalizeEmail(req.body?.email);
        if (!email) {
            return res.status(400).json({ message: "Email is required" });
        }
        const userExists = await User.findOne({ email });
        if (userExists) {
            return res.status(400).json({ message: "User already exists with this email" });
        }
        
        const otp = Math.floor(100000 + Math.random()*900000).toString();
        await OtpModel.findOneAndUpdate(
            { email }, 
            { otp, createdAt: new Date() }, 
            { upsert: true, new: true }
        );
        
        const result = await sendOtp(email, otp);
        res.status(200).json({ message: "OTP sent successfully", messageId: result?.messageId });
    } catch(err) {
        const dup = asMongoDuplicateKeyMessage(err);
        if (dup) return res.status(400).json({ message: dup });
        if (isEmailProviderError(err)) {
            return res.status(502).json({ message: err.message });
        }
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

exports.verifySignupOtp = async (req, res) => {
    try {
        const email = normalizeEmail(req.body?.email);
        const otp = String(req.body?.otp ?? '').trim();
        if (!email || !otp) {
            return res.status(400).json({ message: "Email and OTP are required" });
        }
        const otpRecord = await OtpModel.findOne({ email });

        // TTL indexes are not guaranteed to delete instantly, so enforce expiry in app logic too.
        if (!otpRecord || isOtpExpired(otpRecord.createdAt) || otpRecord.otp !== otp) {
            if (otpRecord && isOtpExpired(otpRecord.createdAt)) {
                await OtpModel.deleteOne({ email });
            }
            return res.status(400).json({ message: "Invalid or expired OTP" });
        }
        
        res.status(200).json({ message: "OTP verified successfully", verified: true });
    } catch(err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
}

exports.signUp = async (req, res) => {
    try {
        const Firstname = normalizeFirstname(req.body?.Firstname);
        const username = normalizeUsername(req.body?.username);
        const email = normalizeEmail(req.body?.email);
        const password = String(req.body?.password ?? '');
        const otp = String(req.body?.otp ?? '').trim();

        if (!Firstname || !username || !password || !email || !otp) {
            return res.status(400).json({ message: "Firstname, username, password, email and otp are required" });
        }
        
        // Final OTP check at creation
        const otpRecord = await OtpModel.findOne({ email });
        if (!otpRecord || isOtpExpired(otpRecord.createdAt) || otpRecord.otp !== otp) {
            if (otpRecord && isOtpExpired(otpRecord.createdAt)) {
                await OtpModel.deleteOne({ email });
            }
            return res.status(400).json({ message: "Email not verified or OTP expired" });
        }
        
        // Check if username already taken
        const usernameExists = await User.findOne({ username });
        if (usernameExists) {
            return res.status(400).json({ message: "Username already taken" });
        }

        const hashedPassword = await bcrypt.hash(password , 10);
        const newUser = new User({
            Firstname,
            username,
            password: hashedPassword,
            email
        });
        await newUser.save();
        
        // Clean up OTP
        await OtpModel.deleteOne({ email });
        
        const token = generateToken(newUser._id);
        res.status(201).json({
            message: "User created successfully", 
            token, 
            user: { id: newUser._id, username: newUser.username, email: newUser.email }
        });
    } catch(err) {
        const dup = asMongoDuplicateKeyMessage(err);
        if (dup) return res.status(400).json({ message: dup });
        res.status(500).json({message: "Server error", error: err.message});
    }
}

exports.login = async (req, res) => {
    try {
        const {username , password} = req.body;
        if (!username || !password) {
            return res.status(400).json({ message: "Username and password are required" });
        }
        const existingUser = await User.findOne({username});
        if(!existingUser){
            return res.status(404).json({message: "User not found"});
        }
        const isPasswordValid = await bcrypt.compare(password , existingUser.password);
        if(!isPasswordValid){
            return res.status(401).json({message: "Invalid credentials"});
        }
        
        const token = generateToken(existingUser._id);
        res.status(200).json({
            message: "Login successful", 
            token, 
            user: { id: existingUser._id, username: existingUser.username, email: existingUser.email }
        });
    } catch(err) {
        res.status(500).json({message: "Server error", error: err.message});
    }
}

exports.forgotPassword = async (req, res) => {
    try {
        const {email} = req.body;
        if (!email) {
            return res.status(400).json({ message: "Email is required" });
        }
        const existingUser = await User.findOne({email});
        if(!existingUser){
            return res.status(404).json({message: "User not found"});
        }
        const otp = Math.floor(100000 + Math.random()*900000).toString();
        existingUser.resetOtp = otp;
        existingUser.otpExpiry = Date.now() + 10*60*1000;
        await existingUser.save();
        const result = await sendOtp(email, otp);
        res.status(200).json({message: "OTP sent to email", messageId: result?.messageId});
    } catch(err) {
        if (isEmailProviderError(err)) {
            return res.status(502).json({ message: err.message });
        }
        res.status(500).json({message: "Server error", error: err.message});
    }
}

exports.resetPassword = async (req, res) => {
    try {
        const { email, otp, newpassword, newPassword } = req.body;
        const finalNewPassword = newpassword || newPassword;
        if (!email || !otp || !finalNewPassword) {
            return res.status(400).json({ message: "email, otp and newPassword are required" });
        }
        const existingUser = await User.findOne({email});
        if(!existingUser) {
            return res.status(404).json({message: "User not found"});
        }
        if(existingUser.resetOtp !== otp || existingUser.otpExpiry < Date.now()){
            return res.status(400).json({message: "Invalid or expired OTP"});
        }
        const hashedPassword = await bcrypt.hash(finalNewPassword , 10);
        existingUser.password = hashedPassword;
        existingUser.resetOtp = null;
        existingUser.otpExpiry = null;
        await existingUser.save();
        res.status(200).json({message: "Password reset successful"});
    } catch(err) {
        res.status(500).json({message: "Server error", error: err.message});
    }
}

exports.logout = async (req, res) => {
    res.status(200).json({message: "Logout successful"});
}

exports.userProfile = async (req, res) => {
    try {
        if(!req.user) return res.status(401).json({message: "Unauthorized"});
        const userId = req.user.id;
        const existingUser = await User.findById(userId);
        if(!existingUser){
            return res.status(404).json({message: "User not found"});
        }
        res.status(200).json({
            id: existingUser._id,
            username: existingUser.username,
            email: existingUser.email,
            profilePicture: existingUser.profilePicture
        });
    } catch(err) {
         res.status(500).json({message: "Server error", error: err.message});
    }
}

exports.followUser = async (req, res) => {
    try {
        if (!req.user?.id) return res.status(401).json({ message: 'Unauthorized' });

        const userId = String(req.user.id);
        const targetUserId = String(req.body?.targetUserId ?? req.body?.userId ?? '').trim();

        if (!targetUserId) {
            return res.status(400).json({ message: 'targetUserId is required' });
        }
        if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
            return res.status(400).json({ message: 'Invalid targetUserId' });
        }
        if (userId === targetUserId) {
            return res.status(400).json({ message: 'You cannot follow yourself' });
        }

        const target = await User.findById(targetUserId).select('_id');
        if (!target) return res.status(404).json({ message: 'Target user not found' });

        await User.findByIdAndUpdate(userId, { $addToSet: { following: targetUserId } }, { new: false });
        await User.findByIdAndUpdate(targetUserId, { $addToSet: { followers: userId } }, { new: false });

        return res.status(200).json({ message: 'Followed successfully' });
    } catch (err) {
        return res.status(500).json({ message: 'Server error', error: err.message });
    }
};

exports.unfollowUser = async (req, res) => {
    try {
        if (!req.user?.id) return res.status(401).json({ message: 'Unauthorized' });

        const userId = String(req.user.id);
        const targetUserId = String(req.body?.targetUserId ?? req.body?.userId ?? '').trim();

        if (!targetUserId) {
            return res.status(400).json({ message: 'targetUserId is required' });
        }
        if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
            return res.status(400).json({ message: 'Invalid targetUserId' });
        }
        if (userId === targetUserId) {
            return res.status(400).json({ message: 'You cannot unfollow yourself' });
        }

        await User.findByIdAndUpdate(userId, { $pull: { following: targetUserId } }, { new: false });
        await User.findByIdAndUpdate(targetUserId, { $pull: { followers: userId } }, { new: false });

        return res.status(200).json({ message: 'Unfollowed successfully' });
    } catch (err) {
        return res.status(500).json({ message: 'Server error', error: err.message });
    }
};