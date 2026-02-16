import bcryptjs from 'bcryptjs';
import { transaction } from './mssql.js';

const main = async () => {
  const { studioId, userId } = await transaction(async (client) => {
    const studioResult = await client.query(`
      INSERT INTO studios (name, email, subscription_plan, subscription_status, subscription_start, subscription_end, is_free_subscription, created_at)
      VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, DATEADD(month, 1, CURRENT_TIMESTAMP), $5, CURRENT_TIMESTAMP)
      RETURNING id
    `, ['Test Studio', 'teststudio@example.com', 'pro', 'active', 1]);

    const createdStudioId = studioResult.rows[0].id;

    const hashedPassword = bcryptjs.hashSync('StudioPassword@123', 10);

    const userResult = await client.query(`
      INSERT INTO users (email, password, name, role, studio_id, is_active, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
      RETURNING id
    `, ['studioowner@example.com', hashedPassword, 'Studio Owner', 'studio_admin', createdStudioId, 1]);

    return { studioId: createdStudioId, userId: userResult.rows[0].id };
  });

  console.log('✅ Studio created with ID:', studioId);
  console.log('✅ User created with ID:', userId);
  console.log('📧 Email: studioowner@example.com');
  console.log('🔑 Password: StudioPassword@123');
  process.exit(0);
};

main().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
