export type VapidConfig = {
  subject: string;
  publicKey: string;
  privateKey: string;
};

type VapidEnv = {
  VAPID_SUBJECT?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
};

function decodeKey(value: string, name: string): Buffer {
  try {
    const decoded = Buffer.from(value, 'base64url');
    if (!decoded.length) throw new Error('empty');
    return decoded;
  } catch {
    throw new Error(`VAPID_${name} must be base64url`);
  }
}

export const loadVapidConfig = (env: VapidEnv = process.env): VapidConfig | null => {
  const subject = env.VAPID_SUBJECT?.trim() || '';
  const publicKey = env.VAPID_PUBLIC_KEY?.trim() || '';
  const privateKey = env.VAPID_PRIVATE_KEY?.trim() || '';
  if (!subject && !publicKey && !privateKey) return null;
  if (!subject) throw new Error('VAPID_SUBJECT is required when Web Push is configured');
  if (!publicKey) throw new Error('VAPID_PUBLIC_KEY is required when Web Push is configured');
  if (!privateKey) throw new Error('VAPID_PRIVATE_KEY is required when Web Push is configured');

  let parsedSubject: URL;
  try { parsedSubject = new URL(subject); } catch { throw new Error('VAPID_SUBJECT must be a valid mailto: or https: URL'); }
  if (!['mailto:', 'https:'].includes(parsedSubject.protocol)) {
    throw new Error('VAPID_SUBJECT must be a valid mailto: or https: URL');
  }
  const publicBytes = decodeKey(publicKey, 'PUBLIC_KEY');
  const privateBytes = decodeKey(privateKey, 'PRIVATE_KEY');
  if (publicBytes.length !== 65 || publicBytes[0] !== 4) throw new Error('VAPID_PUBLIC_KEY must be an uncompressed P-256 public key');
  if (privateBytes.length !== 32) throw new Error('VAPID_PRIVATE_KEY must be a 32-byte P-256 private key');
  return { subject, publicKey, privateKey };
};
