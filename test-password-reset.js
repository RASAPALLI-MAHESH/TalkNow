/*
  Local helper to test the password reset flow end-to-end.

  Usage:
    node test-password-reset.js <email> <newPassword> [apiBase]

  Notes:
  - Calls POST /api/auth/forgot-password
  - Reads the generated reset OTP from MongoDB (User.resetOtp)
  - Calls POST /api/auth/reset-password
*/

require('dotenv').config();

const axios = require('axios');
const mongoose = require('mongoose');

const User = require('./backend/models/user');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const normalizeMongoUri = (raw) => {
  if (!raw) return 'mongodb://localhost:27017/productiv';
  // If URI ends with '/', add a default db name to avoid connecting to 'test' unintentionally.
  if (raw.endsWith('/')) return `${raw}productiv`;
  return raw;
};

const normalizeApiBase = (raw) => {
  if (!raw) return 'http://localhost:8080';
  return raw.replace(/\/$/, '');
};

async function main() {
  const email = process.argv[2];
  const newPassword = process.argv[3];
  const apiBase = normalizeApiBase(process.argv[4] || process.env.EXPO_PUBLIC_API_URL || process.env.API_BASE_URL);

  if (!email || !newPassword) {
    console.error('Usage: node test-password-reset.js <email> <newPassword> [apiBase]');
    process.exit(2);
  }

  const mongoUri = normalizeMongoUri(process.env.MONGO_URI);

  console.log(`API base: ${apiBase}`);
  console.log(`Target email: ${email}`);

  await mongoose.connect(mongoUri, {
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  });

  try {
    console.log('1) Requesting forgot-password OTP...');
    await axios.post(`${apiBase}/api/auth/forgot-password`, { email }, { timeout: 10000 });

    // Give Mongo a moment to persist.
    await sleep(300);

    const user = await User.findOne({ email }).lean();
    const otp = user?.resetOtp;

    if (!otp) {
      throw new Error('No resetOtp found for that user. Ensure the email exists and forgot-password succeeded.');
    }

    console.log(`2) OTP fetched from DB: ${otp}`);
    console.log('3) Resetting password...');

    const resetRes = await axios.post(
      `${apiBase}/api/auth/reset-password`,
      { email, otp, newPassword },
      { timeout: 10000 }
    );

    console.log('Success:', resetRes.data);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  const status = err?.response?.status;
  const data = err?.response?.data;

  if (status) console.error('HTTP Status:', status);
  if (data) console.error('HTTP Data:', data);
  console.error('Error:', err?.message || err);
  process.exit(1);
});
