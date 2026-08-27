import { readFileSync, writeFileSync, openSync, fsyncSync, closeSync, renameSync, statSync, chmodSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type AuthCacheData = {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  email?: string;
  reauthRequired?: boolean;
};

export type AuthStatusResult = {
  authenticated: boolean;
  reauthRequired: boolean;
  email?: string;
  expiresAt?: number;
  modeVerified: boolean;
  error?: string;
};

export class AuthCacheManager {
  constructor(private readonly cachePath: string) {}

  getCachePath(): string {
    return this.cachePath;
  }

  getAuthStatus(): AuthStatusResult {
    if (!existsSync(this.cachePath)) {
      return {
        authenticated: false,
        reauthRequired: true,
        modeVerified: true,
        error: 'auth_file_missing',
      };
    }

    try {
      const stats = statSync(this.cachePath);
      // On POSIX systems, verify mode is 0600 (read/write only by owner)
      const mode = stats.mode & 0o777;
      const isWindows = process.platform === 'win32';
      const modeVerified = isWindows || mode === 0o600;

      if (!modeVerified) {
        return {
          authenticated: false,
          reauthRequired: true,
          modeVerified: false,
          error: `insecure_file_permissions: mode is ${mode.toString(8)}, expected 0600`,
        };
      }

      const content = readFileSync(this.cachePath, 'utf8');
      const parsed = JSON.parse(content) as AuthCacheData;

      if (parsed.reauthRequired) {
        return {
          authenticated: false,
          reauthRequired: true,
          email: parsed.email,
          expiresAt: parsed.expiresAt,
          modeVerified: true,
          error: 'reauth_required',
        };
      }

      const hasToken = Boolean(parsed.accessToken && parsed.accessToken.trim() !== '');
      const isExpired = parsed.expiresAt ? Date.now() >= parsed.expiresAt : false;

      return {
        authenticated: hasToken && !isExpired,
        reauthRequired: isExpired || !hasToken,
        email: parsed.email,
        expiresAt: parsed.expiresAt,
        modeVerified: true,
      };
    } catch (e) {
      return {
        authenticated: false,
        reauthRequired: true,
        modeVerified: false,
        error: (e as Error).message,
      };
    }
  }

  saveAuthCacheAtomic(data: AuthCacheData): void {
    const dir = dirname(this.cachePath);
    const tmpPath = join(dir, `.auth.tmp.${Date.now()}.${Math.random().toString(36).slice(2)}`);

    const json = JSON.stringify(data, null, 2);
    const fd = openSync(tmpPath, 'w', 0o600);
    try {
      writeFileSync(fd, json, 'utf8');
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }

    if (process.platform !== 'win32') {
      chmodSync(tmpPath, 0o600);
    }

    renameSync(tmpPath, this.cachePath);

    if (process.platform !== 'win32') {
      chmodSync(this.cachePath, 0o600);
    }
  }
}
