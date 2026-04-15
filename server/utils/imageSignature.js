// imageSignature.js - Computes a unique hash for an image buffer
// Uses Node.js crypto module to generate a SHA-256 hash

import { createHash } from 'crypto';

/**
 * Compute a SHA-256 hash signature for an image buffer
 * @param {Buffer} buffer - The image file buffer
 * @returns {Promise<string>} - The hex hash string
 */
export async function computeImageSignature(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new Error('Input must be a Buffer');
  }
  const hash = createHash('sha256');
  hash.update(buffer);
  return hash.digest('hex');
}
