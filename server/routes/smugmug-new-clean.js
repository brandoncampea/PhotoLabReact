import express from 'express';
import fs from 'fs';
import dotenv from 'dotenv';
// ...existing code...

// GET /admin/vendor-integrations - Admin integrations status for SmugMug
router.get('/admin/vendor-integrations', async (req, res) => {
  await loadAuthRequired();
  authRequired(req, res, async () => {
    try {
      // For now, just return SmugMug integration status for the current studio
      const studioId = req.user.studio_id || req.user.studioId || req.user.id;
      await loadMssql();
      const config = await queryRow(
        `SELECT access_token, access_token_secret FROM studio_smugmug_config WHERE studio_id = $1`,
        [studioId]
      );
      const connected = !!(config && config.access_token && config.access_token_secret);
      res.json({
        integrations: [
          // ...integration objects...
        ]
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch integrations' });
    }
  });
});

// GET /config - Return SmugMug config for the current studio
router.get('/config', async (req, res) => {
  await loadAuthRequired();
  authRequired(req, res, async () => {
    try {
      if (req.user.role !== 'studio_admin' && req.user.role !== 'super_admin') {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      // Helper to get studioId from request (reuse from smugmug.js if available)
      const studioId = req.user.studio_id || req.user.studioId || req.user.id;
      if (!studioId) return res.status(400).json({ error: 'Studio context is required' });

      await loadMssql();
      await ensureSmugMugConfigTable();
      const config = await queryRow(
        `SELECT studio_id as studioId, nickname, api_key as apiKey, api_secret as apiSecret, access_token as accessToken, access_token_secret as accessTokenSecret
         FROM studio_smugmug_config
         WHERE studio_id = $1`,
        [studioId]
      );
      res.json({
        ...(config || { studioId, nickname: '', apiKey: '', apiSecret: '', accessToken: '', accessTokenSecret: '' }),
        storageMode: 'db', // or use a helper if needed
      });
    } catch (error) {
      console.error('SmugMug config get error:', error);
      res.status(500).json({ error: 'Failed to fetch SmugMug config' });
    }
  });
});

module.exports = router;
