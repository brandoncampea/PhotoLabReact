import mssql from '../mssql.cjs';

/**
 * Get notification recipient emails for a studio and super admins.
 * @param {number|string|null} studioId - Studio ID (nullable)
 * @returns {Promise<string[]>} Array of recipient emails
 */
export async function getOrderNotificationRecipients(studioId) {
  const recipients = [];
  // Lookup studio email if studioId is provided
  if (studioId) {
    try {
      const studio = await mssql.queryRow('SELECT email FROM studios WHERE id = $1', [studioId]);
      if (studio && studio.email) recipients.push(studio.email);
    } catch (err) {
      // Log and continue
      console.error('Failed to lookup studio email:', err);
    }
  }
  // Add super admin emails from env
  const superAdminEmails = (process.env.SUPER_ADMIN_NOTIFICATION_EMAILS || '')
    .split(',')
    .map(e => e.trim())
    .filter(Boolean);
  for (const email of superAdminEmails) {
    if (!recipients.includes(email)) recipients.push(email);
  }
  return recipients;
}
