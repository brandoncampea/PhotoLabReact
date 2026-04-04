import 'dotenv/config';
// Minimal Mailtrap API test script (ESM)
// Usage: node mailtrapTest.mjs

import { MailtrapClient } from 'mailtrap';

const mailtrap = new MailtrapClient({
  token: process.env.MAILTRAP_API_KEY,
});

mailtrap
  .send({
    from: { name: 'Mailtrap Test', email: process.env.MAILTRAP_SENDER_EMAIL || 'no-reply@labs.campeaphotography.com' },
    to: [{ email: 'bcampea@gmail.com' }],
    subject: 'Hello from Mailtrap Node.js',
    text: 'Plain text body',
  })
  .then(console.log)
  .catch(console.error);
