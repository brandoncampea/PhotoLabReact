// Album product listing for customers
import express from 'express';
const router = express.Router();

// GET available products/sizes for an album (with recommended/other split)
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


router.get('/:albumId', async (req, res) => {
  // TODO: Implement MSSQL logic for album products
  res.status(501).json({ error: 'Not implemented: album products endpoint (MSSQL only)' });
});

export default router;
