const axios = require('axios');

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';

const sendOtp = async (email, otp) => {
  if (!process.env.BREVO_API_KEY) {
    throw new Error('BREVO_API_KEY is not set in environment variables.');
  }

  const senderName = process.env.BREVO_SENDER_NAME || 'TalkNow';
  const senderEmail = process.env.BREVO_SENDER_EMAIL || 'talknow@example.com';

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

  const response = await axios.post(BREVO_URL, payload, config);
  return response.data;
};

module.exports = sendOtp;