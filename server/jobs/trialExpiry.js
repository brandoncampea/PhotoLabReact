import mssql from '../mssql.cjs';
const { query } = mssql;

export async function expireTrials() {
  // Expire trials that ended with no Stripe subscription (abandoned checkout)
  await query(`
    UPDATE studios
    SET subscription_status = 'inactive'
    WHERE subscription_status = 'active'
      AND trial_end IS NOT NULL
      AND trial_end < CURRENT_TIMESTAMP
      AND (stripe_subscription_id IS NULL OR stripe_subscription_id = '')
  `);
  console.log('[trialExpiry] Expired trials processed');
}
