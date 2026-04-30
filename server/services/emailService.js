// server/services/emailService.js
// Simple email sending service using Mailtrap
import nodemailer from 'nodemailer';

const SMTP_HOST = process.env.SMTP_HOST || 'smtp.mailtrap.io';
const SMTP_PORT = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 2525;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASSWORD;
const SENDER = process.env.MAILTRAP_SENDER_EMAIL || 'no-reply@labs.campeaphotography.com';
const SENDER_NAME = process.env.MAILTRAP_SENDER_NAME || 'PhotoLab Support';

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
});

export async function sendEmail({ to, subject, text, html }) {
  const recipients = Array.isArray(to) ? to.join(',') : to;
  return transporter.sendMail({
    from: `${SENDER_NAME} <${SENDER}>`,
    to: recipients,
    subject,
    text,
    html,
  });
}
