const axios = require('axios');

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';

const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Sends an email through Brevo. In development without Brevo configured, logs it instead.
 * `devLog` is the line printed in that case.
 */
const sendEmail = async ({ to, subject, html, devLog }) => {
  const isProduction = String(process.env.NODE_ENV || '').toLowerCase() === 'production';

  const senderName = process.env.BREVO_SENDER_NAME || 'TalkNow';
  const senderEmail = process.env.BREVO_SENDER_EMAIL;

  // In production we require Brevo to be configured.
  // In development, allow email flows to work by logging instead.
  if (!process.env.BREVO_API_KEY || !senderEmail) {
    const msg = !process.env.BREVO_API_KEY
      ? 'BREVO_API_KEY is not set. Set it in your backend environment variables (Brevo API key required to send emails).'
      : 'BREVO_SENDER_EMAIL is not set. Set it to a verified sender email address in your backend environment variables.';

    if (isProduction) {
      throw new Error(msg);
    }

    console.warn(`[otpService] ${msg} (dev fallback: logging instead)`);
    console.warn(`[otpService] ${devLog || `Email to ${to}: ${subject}`}`);
    return { messageId: 'dev-fallback', dev: true };
  }

  const payload = {
    sender: {
      name: senderName,
      email: senderEmail,
    },
    to: [{ email: to }],
    subject,
    htmlContent: html,
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

const sendOtp = (email, otp) =>
  sendEmail({
    to: email,
    subject: 'Your OTP Code',
    html: `<p>Your OTP code is: <strong>${escapeHtml(otp)}</strong></p>`,
    devLog: `OTP for ${email}: ${otp}`,
  });

// Sent instead of a signup code when the email already has an account, so the signup
// form can't be used to find out which emails are registered.
const sendAccountExistsNotice = (email) =>
  sendEmail({
    to: email,
    subject: 'Someone tried to sign up with your email',
    html:
      '<p>Someone tried to create a TalkNow account with this email address, but you already have one.</p>' +
      '<p>If this was you, log in instead, or use "Forgot password" to reset your password. ' +
      'If it wasn\'t you, you can ignore this email.</p>',
    devLog: `Account-exists notice for ${email}`,
  });

module.exports = sendOtp;
module.exports.sendEmail = sendEmail;
module.exports.sendAccountExistsNotice = sendAccountExistsNotice;
module.exports.escapeHtml = escapeHtml;
