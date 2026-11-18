import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

/**
 * Encrypts small secrets (the platform admins' TOTP secrets) at rest with AES-256-GCM, so a copy of
 * the database alone does not let anyone generate their codes. The key comes from
 * PLATFORM_SECRET_KEY, or JWT_SECRET when that is not set; changing it makes stored secrets
 * unreadable and admins must enrol their authenticator again.
 */
function key(): Buffer {
  const source = process.env.PLATFORM_SECRET_KEY || process.env.JWT_SECRET;
  if (!source) throw new Error('PLATFORM_SECRET_KEY or JWT_SECRET must be set');
  return createHash('sha256').update(`medcloud-platform-secret:${source}`).digest();
}

export function sealSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join(':');
}

export function openSecret(sealed: string): string {
  const [version, iv, tag, data] = sealed.split(':');
  if (version !== 'v1' || !iv || !tag || !data) throw new Error('Unknown sealed secret format');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}
