// server/services/emailService.js
// Simple email sending service using Mailtrap

import { MailtrapClient } from 'mailtrap';

const mailtrapToken = String(process.env.MAILTRAP_API_KEY || '').trim();
const mailtrapSenderEmail = String(process.env.MAILTRAP_SENDER_EMAIL || '').trim() || 'no-reply@labs.campeaphotography.com';
const mailtrapSenderName = String(process.env.MAILTRAP_SENDER_NAME || '').trim() || 'PhotoLab Support';
const mailtrapClient = mailtrapToken ? new MailtrapClient({ token: mailtrapToken }) : null;

function isConfigured() {
  return Boolean(mailtrapClient && mailtrapSenderEmail);
}

export async function sendEmail({ to, cc, subject, text, html }) {
  if (!isConfigured() || !to) return false;
  const msg = {
    from: { email: mailtrapSenderEmail, name: mailtrapSenderName },
    to: Array.isArray(to) ? to.map(email => ({ email })) : [{ email: to }],
    subject,
    html,
    text,
  };
  if (cc?.length) msg.cc = Array.isArray(cc) ? cc.map(email => ({ email })) : [{ email: cc }];
  await mailtrapClient.send(msg);
  return true;
}
