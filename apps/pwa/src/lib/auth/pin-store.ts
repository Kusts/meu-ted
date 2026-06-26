const PIN_KEY = "pi-finance:pin-hash";
const SALT_KEY = "pi-finance:pin-salt";

function bytesToHex(bytes: Uint8Array<ArrayBuffer>): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(hex.length / 2) as Uint8Array<ArrayBuffer>;
  for (let i = 0; i < hex.length; i += 2)
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  return bytes;
}

function randomSalt(): Uint8Array<ArrayBuffer> {
  const arr = new Uint8Array(16) as Uint8Array<ArrayBuffer>;
  crypto.getRandomValues(arr);
  return arr;
}

export async function hashPin(pin: string): Promise<string> {
  const salt = randomSalt();
  const data = new TextEncoder().encode(pin);
  const key = await crypto.subtle.importKey(
    "raw",
    data,
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const hash = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100_000, hash: "SHA-256" },
    key,
    256
  );
  setStoredHash(bytesToHex(new Uint8Array(hash as ArrayBuffer)));
  setStoredSalt(bytesToHex(salt));
  return bytesToHex(new Uint8Array(hash as ArrayBuffer));
}

export async function verifyPin(pin: string): Promise<boolean> {
  const storedHash = getStoredHash();
  const storedSalt = getStoredSalt();
  if (!storedHash || !storedSalt) return false;
  const data = new TextEncoder().encode(pin);
  const key = await crypto.subtle.importKey(
    "raw",
    data,
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const hash = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: hexToBytes(storedSalt),
      iterations: 100_000,
      hash: "SHA-256",
    },
    key,
    256
  );
  return (
    bytesToHex(new Uint8Array(hash as ArrayBuffer)) === storedHash
  );
}

export function getStoredHash(): string | null {
  try {
    return localStorage.getItem(PIN_KEY);
  } catch {
    return null;
  }
}

export function getStoredSalt(): string | null {
  try {
    return localStorage.getItem(SALT_KEY);
  } catch {
    return null;
  }
}

function setStoredHash(h: string): void {
  try {
    localStorage.setItem(PIN_KEY, h);
  } catch {
    /* noop */
  }
}

function setStoredSalt(s: string): void {
  try {
    localStorage.setItem(SALT_KEY, s);
  } catch {
    /* noop */
  }
}

export function isPinSet(): boolean {
  return getStoredHash() !== null;
}

export function clearPin(): void {
  try {
    localStorage.removeItem(PIN_KEY);
    localStorage.removeItem(SALT_KEY);
  } catch {
    /* noop */
  }
}
