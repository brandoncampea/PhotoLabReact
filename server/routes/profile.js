import express from 'express';
import mssql from '../mssql.cjs';
const { queryRow, query, tableExists, columnExists } = mssql;
import { authRequired } from '../middleware/auth.js';
import multer from 'multer';
import sharp from 'sharp';
import { uploadImageBufferToAzure, getSignedReadUrl } from '../services/azureStorage.js';
const router = express.Router();

const logoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const withResolvedLogoUrl = (profile) => {
  if (!profile) return profile;
  const rawLogo = profile.logoUrl || '';
  return {
    ...profile,
    logoUrl: rawLogo ? (getSignedReadUrl(rawLogo) || rawLogo) : '',
  };
};

const defaultProfile = {
  id: 1,
  ownerName: 'Photo Lab',
  businessName: 'PhotoLab Studio',
  email: 'admin@photolab.com',
  receiveOrderNotifications: true,
  logoUrl: '',
  instagramUrl: null,
  facebookUrl: null,
  timezone: 'UTC',
};

const normalizeTimezone = (value) => {
  const fallback = 'UTC';
  const zone = String(value || '').trim();
  if (!zone) return fallback;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone }).format(new Date());
    return zone;
  } catch {
    return fallback;
  }
};

const ensureProfileConfigTable = async () => {
  const exists = await tableExists('profile_config');
  if (exists) {
    // Ensure expected columns exist (safe to run each time)
    await query(`IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='profile_config' AND COLUMN_NAME='studio_id') ALTER TABLE profile_config ADD studio_id INT NULL`);
    await query(`IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='profile_config' AND COLUMN_NAME='instagram_url') ALTER TABLE profile_config ADD instagram_url NVARCHAR(500) NULL`);
    await query(`IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='profile_config' AND COLUMN_NAME='facebook_url') ALTER TABLE profile_config ADD facebook_url NVARCHAR(500) NULL`);
    await query(`IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='profile_config' AND COLUMN_NAME='timezone') ALTER TABLE profile_config ADD timezone NVARCHAR(100) NULL`);
    await query(`IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='profile_config' AND COLUMN_NAME='custom_domain') ALTER TABLE profile_config ADD custom_domain NVARCHAR(255) NULL`);

    // Legacy schema could have CHECK constraints forcing id=1. Drop all CHECK constraints on this table.
    await query(`
      DECLARE @sql NVARCHAR(MAX) = N'';
      SELECT @sql = @sql + N'ALTER TABLE profile_config DROP CONSTRAINT [' + cc.name + N'];'
      FROM sys.check_constraints cc
      WHERE cc.parent_object_id = OBJECT_ID('profile_config');
      IF LEN(@sql) > 0 EXEC sp_executesql @sql;
    `);

    // Backfill studio_id for legacy row if needed (best-effort for studio 1 data).
    await query(`UPDATE profile_config SET studio_id = 1 WHERE studio_id IS NULL AND id = 1`);

    // Ensure one profile per studio when studio_id exists.
    await query(`
      IF NOT EXISTS (
        SELECT 1
        FROM sys.indexes
        WHERE name = 'uq_profile_config_studio_id'
          AND object_id = OBJECT_ID('profile_config')
      )
      BEGIN
        CREATE UNIQUE INDEX uq_profile_config_studio_id
        ON profile_config(studio_id)
        WHERE studio_id IS NOT NULL
      END
    `);

    return true;
  }

  await query(`
    CREATE TABLE profile_config (
      id INT PRIMARY KEY,
      studio_id INT NULL,
      owner_name NVARCHAR(255) NULL,
      business_name NVARCHAR(255) NULL,
      email NVARCHAR(255) NULL,
      receive_order_notifications BIT DEFAULT 1,
      logo_url NVARCHAR(MAX) NULL,
      instagram_url NVARCHAR(500) NULL,
      facebook_url NVARCHAR(500) NULL,
      timezone NVARCHAR(100) NULL,
      updated_at DATETIME2 DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await query(`
    IF NOT EXISTS (
      SELECT 1
      FROM sys.indexes
      WHERE name = 'uq_profile_config_studio_id'
        AND object_id = OBJECT_ID('profile_config')
    )
    BEGIN
      CREATE UNIQUE INDEX uq_profile_config_studio_id
      ON profile_config(studio_id)
      WHERE studio_id IS NOT NULL
    END
  `);

  return true;
};

// Get profile config (studio-specific, super admin can specify studioId)
router.get('/', authRequired, async (req, res) => {
  try {
    const user = req.user;
    let studioId;
    if (user?.role === 'super_admin') {
      studioId = req.query.studioId || user?.acting_studio_id || null;
      // If no studioId specified, use global profile (id=1)
      if (!studioId) studioId = 1;
    } else {
      studioId = user?.studio_id;
      if (!studioId) {
        return res.status(403).json({ error: 'Studio ID required' });
      }
    }
    studioId = Number(studioId);

    let profile = await queryRow(`
        SELECT id, owner_name as ownerName, business_name as businessName,
               email, receive_order_notifications as receiveOrderNotifications,
               logo_url as logoUrl,
               instagram_url as instagramUrl, facebook_url as facebookUrl,
               timezone, custom_domain as customDomain
        FROM profile_config
        WHERE studio_id = $1
      `, [studioId]);

    // Initialize if doesn't exist
    if (!profile) {
      await query(`
        IF NOT EXISTS (SELECT 1 FROM profile_config WHERE studio_id = $1)
        BEGIN
          INSERT INTO profile_config (id, studio_id, owner_name, business_name, email, receive_order_notifications, logo_url)
          SELECT ISNULL(MAX(id), 0) + 1, $1, 'John Smith', 'PhotoLab Studio', 'admin@photolab.com', 1, ''
          FROM profile_config
        END
      `, [studioId]);

      profile = await queryRow(`
          SELECT id, owner_name as ownerName, business_name as businessName,
                 email, receive_order_notifications as receiveOrderNotifications,
                 logo_url as logoUrl,
                 instagram_url as instagramUrl, facebook_url as facebookUrl,
                 timezone, custom_domain as customDomain
          FROM profile_config
          WHERE studio_id = $1
        `, [studioId]);
    }
    res.json(withResolvedLogoUrl({
      ...(profile || defaultProfile),
      timezone: normalizeTimezone(profile?.timezone || defaultProfile.timezone),
    }));
  } catch (error) {
    console.error('Get profile config error:', error);
    res.status(500).json({ error: 'Failed to load profile config' });
  }
});

// Update profile config (studio-specific, super admin can specify studioId)
router.put('/', authRequired, async (req, res) => {
  try {
    const user = req.user;
    let studioId;
    if (user?.role === 'super_admin') {
      studioId = req.body.studioId || req.query.studioId || user?.acting_studio_id || 1;
    } else if (user?.role === 'admin') {
      studioId = user?.studio_id || 1;
    } else {
      studioId = user?.studio_id;
    }

    studioId = Number(studioId);
    if (!studioId) {
      return res.status(403).json({ error: 'Studio ID required' });
    }
    const { ownerName, businessName, email, receiveOrderNotifications, logoUrl, instagramUrl, facebookUrl, customDomain } = req.body;
    const timezone = normalizeTimezone(req.body?.timezone);
    
    // Validate custom domain if provided (basic validation)
    if (customDomain && typeof customDomain === 'string') {
      const customDomainTrimmed = customDomain.trim();
      const domainRegex = /^([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
      if (customDomainTrimmed && !domainRegex.test(customDomainTrimmed)) {
        return res.status(400).json({ error: 'Invalid domain format. Please enter a valid domain (e.g., labs.example.com)' });
      }
    }
    const finalCustomDomain = customDomain ? customDomain.trim() : null;

    await query(`
      IF EXISTS (SELECT 1 FROM profile_config WHERE studio_id = $1)
      BEGIN
        UPDATE profile_config
        SET owner_name = $2,
            business_name = $3,
            email = $4,
            receive_order_notifications = $5,
            logo_url = $6,
            instagram_url = $7,
            facebook_url = $8,
            timezone = $9,
            custom_domain = $10,
            updated_at = CURRENT_TIMESTAMP
        WHERE studio_id = $1
      END
      ELSE
      BEGIN
        INSERT INTO profile_config (id, studio_id, owner_name, business_name, email, receive_order_notifications, logo_url, instagram_url, facebook_url, timezone, custom_domain)
        SELECT ISNULL(MAX(id), 0) + 1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
        FROM profile_config
      END
    `, [studioId, ownerName, businessName, email, !!receiveOrderNotifications, logoUrl, instagramUrl || null, facebookUrl || null, timezone, finalCustomDomain]);

    const profile = await queryRow(`
        SELECT id, owner_name as ownerName, business_name as businessName,
               email, receive_order_notifications as receiveOrderNotifications,
               logo_url as logoUrl,
               instagram_url as instagramUrl, facebook_url as facebookUrl,
               timezone
        FROM profile_config
        WHERE studio_id = $1
      `, [studioId]);
    res.json(withResolvedLogoUrl({
      ...defaultProfile,
      ownerName,
      businessName,
      email,
      receiveOrderNotifications: !!receiveOrderNotifications,
      logoUrl: logoUrl || '',
      instagramUrl: instagramUrl || null,
      facebookUrl: facebookUrl || null,
      timezone,
      ...(profile || {}),
    }));
  } catch (error) {
    console.error('Update profile config error:', error);
    res.status(500).json({ error: error.message || 'Failed to update profile config' });
  }
});

// Upload studio logo
router.post('/upload-logo', authRequired, logoUpload.single('logo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const user = req.user;
    let studioId;
    if (user?.role === 'super_admin') {
      studioId = req.body.studioId || req.query.studioId || user?.acting_studio_id || 1;
    } else if (user?.role === 'admin') {
      studioId = user?.studio_id || 1;
    } else {
      studioId = user?.studio_id;
    }

    studioId = Number(studioId);
    if (!studioId) {
      return res.status(403).json({ error: 'Studio ID required' });
    }

    // Optimize image: resize to max 200px height, convert to PNG or WebP
    const optimized = await sharp(req.file.buffer)
      .resize(200, 200, { fit: 'inside', withoutEnlargement: true })
      .png({ quality: 90 })
      .toBuffer();

    // Upload to Azure
    const timestamp = Date.now();
    const blobName = `studio-logos/studio-${studioId}-${timestamp}.png`;
    const logoUrl = await uploadImageBufferToAzure(optimized, blobName, 'image/png');

    res.json({ logoUrl });
  } catch (error) {
    console.error('Logo upload error:', error);
    res.status(500).json({ error: error.message || 'Failed to upload logo' });
  }
});

export default router;
