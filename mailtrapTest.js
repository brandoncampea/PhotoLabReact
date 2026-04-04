// Minimal Mailtrap API test script
// Usage: node mailtrapTest.js

const { MailtrapClient } = require('mailtrap');

const TOKEN = process.env.MAILTRAP_API_TOKEN || '<YOUR_API_TOKEN>';
const SENDER = process.env.MAILTRAP_SENDER_EMAIL || 'no-reply@labs.campeaphotography.com';

const client = new MailtrapClient({ token: TOKEN });

const sender = {
  email: SENDER,
  name: 'Mailtrap Test',
};
const recipients = [
  { email: 'bcampea@gmail.com' },
];

client
  .send({
    from: sender,
    to: recipients,
    subject: 'Mailtrap API Test',
    text: 'This is a test email sent using the Mailtrap Email Sending API.',
    category: 'Integration Test',
  })
  .then(console.log, console.error);
