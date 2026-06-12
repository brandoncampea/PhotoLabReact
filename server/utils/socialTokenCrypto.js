import crypto from 'crypto';

const getRawKey = () => (
  String(
    process.env.SOCIAL_TOKEN_ENCRYPTION_KEY ||
    process.env.INSTAGRAM_TOKEN_ENCRYPTION_KEY ||
    process.env.JWT_SECRET ||
    ''
  ).trim()
);

const getKeyBytes = () => {
  const raw = getRawKey();
  if (!raw) {
    throw new Error('Missing SOCIAL_TOKEN_ENCRYPTION_KEY (or INSTAGRAM_TOKEN_ENCRYPTION_KEY) environment variable');
  }

  // Support base64-encoded 32-byte keys and fallback to deriving from passphrase.
  try {
    const decoded = Buffer.from(raw, 'base64');
    if (decoded.length === 32) {
      return decoded;
    }
  } catch {
    // no-op
  }

  return crypto.createHash('sha256').update(raw, 'utf8').digest();
};

export const encryptToken = (plainTextToken) => {
  const token = String(plainTextToken || '');
  if (!token) {
    throw new Error('Token is required for encryption');
  }

  const key = getKeyBytes();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    'v1',
    iv.toString('base64url'),
    authTag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
};

export const decryptToken = (encryptedToken) => {
  const raw = String(encryptedToken || '');
  const [version, ivPart, tagPart, cipherPart] = raw.split('.');

  if (version !== 'v1' || !ivPart || !tagPart || !cipherPart) {
    throw new Error('Invalid encrypted token format');
  }

  const key = getKeyBytes();
  const iv = Buffer.from(ivPart, 'base64url');
  const authTag = Buffer.from(tagPart, 'base64url');
  const cipherText = Buffer.from(cipherPart, 'base64url');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(cipherText), decipher.final()]);
  return decrypted.toString('utf8');
};
