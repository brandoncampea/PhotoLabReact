// server/services/errorLogger.js
import mssql from '../mssql.cjs';
import { sendEmail } from './emailService.js';

const { query } = mssql;

// List of super admin emails (could be loaded from config/db)
const SUPER_ADMIN_EMAILS = [
  process.env.SUPER_ADMIN_EMAIL || 'admin@labs.campeaphotography.com'
];

export async function logAndNotifyError({
  error,
  req,
  customerId = null,
  customerEmail = null,
}) {
  try {
    const errorMessage = error?.message || String(error);
    const errorStack = error?.stack || '';
    const requestUrl = req?.originalUrl || req?.url || '';
    const requestMethod = req?.method || '';
    const requestHeaders = req ? JSON.stringify(req.headers) : '';
    const requestBody = req?.body ? JSON.stringify(req.body) : '';
    const userAgent = req?.headers?.['user-agent'] || '';
    // Save to DB
    await query(
      `INSERT INTO error_logs (error_message, error_stack, request_url, request_method, request_headers, request_body, user_agent, customer_id, customer_email)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        errorMessage,
        errorStack,
        requestUrl,
        requestMethod,
        requestHeaders,
        requestBody,
        userAgent,
        customerId,
        customerEmail,
      ]
    );
    // Email super admins
    const subject = `[PhotoLab ERROR] ${errorMessage}`;
    const html = `<pre style="color:#b00;font-size:15px"><b>Error:</b> ${errorMessage}
<b>Stack:</b> ${errorStack}
<b>URL:</b> ${requestUrl}
<b>Method:</b> ${requestMethod}
<b>User Agent:</b> ${userAgent}
<b>Customer ID:</b> ${customerId || ''}
<b>Customer Email:</b> ${customerEmail || ''}
</pre>`;
    await sendEmail({
      to: SUPER_ADMIN_EMAILS,
      subject,
      html,
      text: `${errorMessage}\n${errorStack}\nURL: ${requestUrl}\nMethod: ${requestMethod}\nUser Agent: ${userAgent}\nCustomer ID: ${customerId}\nCustomer Email: ${customerEmail}`,
    });
  } catch (err) {
    console.error('[ERROR LOGGER FAILED]', err);
  }
}
