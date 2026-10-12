/*
  Local helper to test the password reset flow end-to-end.

  Usage:
    node test-password-reset.js <email> <newPassword> [apiBase]

  Notes:
  - Calls POST /api/auth/forgot-password
  - Asks for the code. Codes are stored hashed, so read it from the email, or from the
    backend logs when BREVO_API_KEY is not set (development fallback).
  - Calls POST /api/auth/reset-password
*/

require('dotenv').config();

const axios = require('axios');
const readline = require('readline/promises');

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

  console.log(`API base: ${apiBase}`);
  console.log(`Target email: ${email}`);

  console.log('1) Requesting forgot-password OTP...');
  await axios.post(`${apiBase}/api/auth/forgot-password`, { email }, { timeout: 10000 });

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const otp = (await rl.question('2) Enter the code from the email or backend log: ')).trim();
  rl.close();

  console.log('3) Resetting password...');
  const resetRes = await axios.post(
    `${apiBase}/api/auth/reset-password`,
    { email, otp, newPassword },
    { timeout: 10000 }
  );

  console.log('Success:', resetRes.data);
}

main().catch((err) => {
  const status = err?.response?.status;
  const data = err?.response?.data;

  if (status) console.error('HTTP Status:', status);
  if (data) console.error('HTTP Data:', data);
  console.error('Error:', err?.message || err);
  process.exit(1);
});
