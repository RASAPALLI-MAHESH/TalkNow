const axios = require('axios');

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';

const sendOtp = async (email, otp) => {
  const isProduction = String(process.env.NODE_ENV || '').toLowerCase() === 'production';

  const senderName = process.env.BREVO_SENDER_NAME || 'TalkNow';
  const senderEmail = process.env.BREVO_SENDER_EMAIL;

  // In production we require Brevo to be configured.
  // In development, allow OTP flow to work without email by logging the OTP.
  if (!process.env.BREVO_API_KEY || !senderEmail) {
    const msg = !process.env.BREVO_API_KEY
      ? 'BREVO_API_KEY is not set. Set it in your backend environment variables (Brevo API key required to send OTP emails).'
      : 'BREVO_SENDER_EMAIL is not set. Set it to a verified sender email address in your backend environment variables.';

    if (isProduction) {
      throw new Error(msg);
    }

    console.warn(`[otpService] ${msg} (dev fallback: logging OTP instead)`);
    console.warn(`[otpService] OTP for ${email}: ${otp}`);
    return { messageId: 'dev-fallback', dev: true };
  }

  const payload = {
    sender: {
      name: senderName,
      email: senderEmail,
    },
    to: [{ email }],
    subject: 'Your OTP Code',
    htmlContent: `<p>Your OTP code is: <strong>${otp}</strong></p>`,
  };

  const config = {
    headers: {
      'api-key': process.env.BREVO_API_KEY,
      'Content-Type': 'application/json',
    },
  };

  try {
    const response = await axios.post(BREVO_URL, payload, config);
    return response.data;
  } catch (err) {
    if (err && err.response) {
      const status = err.response.status;
      const data = err.response.data;
      const detail = typeof data === 'string' ? data : JSON.stringify(data);
      throw new Error(`Brevo email send failed (status ${status}): ${detail}`);
    }
    throw err;
  }
};

module.exports = sendOtp;