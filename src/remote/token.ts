/**
 * ABOUTME: Token management for remote listener authentication.
 * Implements two-tier token system:
 * - Server token: Long-lived (90 days), stored in config, used for initial auth
 * - Connection token: Short-lived (24 hours), issued on auth, auto-refreshed
 * Tokens are stored in ~/.config/ralph-tui/remote.json
 */

import { homedir } from 'node:os';
import { join } from 'node:path';
import { readFile, writeFile, mkdir, access, constants } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import type { RemoteConfig, ServerToken, ConnectionToken } from './types.js';
import { TOKEN_LIFETIMES } from './types.js';

/**
 * Path to the remote config file
 */
const REMOTE_CONFIG_DIR = join(homedir(), '.config', 'ralph-tui');
const REMOTE_CONFIG_PATH = join(REMOTE_CONFIG_DIR, 'remote.json');

/**
 * Token length in bytes (32 bytes = 256 bits)
 */
const TOKEN_BYTES = 32;

/**
 * Generate a cryptographically secure token.
 * Returns a URL-safe base64 string.
 */
export function generateToken(): string {
  const bytes = randomBytes(TOKEN_BYTES);
  return bytes.toString('base64url');
}

/**
 * Create a server token with the specified lifetime.
 * Default lifetime is 90 days.
 */
export function createServerToken(lifetimeDays: number = TOKEN_LIFETIMES.SERVER_TOKEN_DAYS): ServerToken {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + lifetimeDays * 24 * 60 * 60 * 1000);

  return {
    value: generateToken(),
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    version: 1,
  };
}

/**
 * Create a connection token with the specified lifetime.
 * Default lifetime is 24 hours.
 */
export function createConnectionToken(
  clientId: string,
  lifetimeHours: number = TOKEN_LIFETIMES.CONNECTION_TOKEN_HOURS
): ConnectionToken {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + lifetimeHours * 60 * 60 * 1000);

  return {
    value: generateToken(),
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    clientId,
  };
}

/**
 * Check if a token is expired.
 */
export function isTokenExpired(expiresAt: string): boolean {
  return new Date(expiresAt) < new Date();
}

/**
 * Check if a token needs refresh (within refresh threshold of expiration).
 * Default threshold is 1 hour before expiration.
 */
export function needsRefresh(
  expiresAt: string,
  thresholdHours: number = TOKEN_LIFETIMES.REFRESH_THRESHOLD_HOURS
): boolean {
  const expirationTime = new Date(expiresAt).getTime();
  const thresholdTime = thresholdHours * 60 * 60 * 1000;
  return Date.now() >= expirationTime - thresholdTime;
}

/**
 * Load the remote configuration from disk.
 * Handles migration from legacy format if needed.
 * Returns null if no config exists.
 */
export async function loadRemoteConfig(): Promise<RemoteConfig | null> {
  try {
    await access(REMOTE_CONFIG_PATH, constants.R_OK);
    const content = await readFile(REMOTE_CONFIG_PATH, 'utf-8');
    const config = JSON.parse(content) as RemoteConfig;

    // Migrate legacy config if needed
    if (config.token && !config.serverToken) {
      const migratedConfig = migrateFromLegacy(config);
      await saveRemoteConfig(migratedConfig);
      return migratedConfig;
    }

    return config;
  } catch {
    return null;
  }
}

/**
 * Migrate legacy single-token config to new server token format.
 */
function migrateFromLegacy(legacyConfig: RemoteConfig): RemoteConfig {
  // Create a server token from the legacy token
  // Preserve the creation date but set a new expiration date
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TOKEN_LIFETIMES.SERVER_TOKEN_DAYS * 24 * 60 * 60 * 1000);

  return {
    serverToken: {
      value: legacyConfig.token!,
      createdAt: legacyConfig.tokenCreatedAt ?? now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      version: legacyConfig.tokenVersion ?? 1,
    },
  };
}

/**
 * Save the remote configuration to disk.
 * Creates the directory if it doesn't exist.
 */
export async function saveRemoteConfig(config: RemoteConfig): Promise<void> {
  await mkdir(REMOTE_CONFIG_DIR, { recursive: true });
  await writeFile(REMOTE_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

/**
 * Get or create the server authentication token.
 * On first run, generates a new token and saves it.
 * Returns the token and whether it was newly created.
 */
export async function getOrCreateServerToken(): Promise<{ token: ServerToken; isNew: boolean }> {
  const config = await loadRemoteConfig();

  if (config?.serverToken) {
    // Check if server token is expired
    if (isTokenExpired(config.serverToken.expiresAt)) {
      // Token expired - generate new one
      const newToken = createServerToken();
      const newConfig: RemoteConfig = {
        serverToken: {
          ...newToken,
          version: config.serverToken.version + 1,
        },
      };
      await saveRemoteConfig(newConfig);
      return { token: newConfig.serverToken, isNew: true };
    }
    return { token: config.serverToken, isNew: false };
  }

  // No config or legacy config without serverToken - create new
  const newToken = createServerToken();
  const newConfig: RemoteConfig = {
    serverToken: newToken,
  };

  await saveRemoteConfig(newConfig);
  return { token: newToken, isNew: true };
}

/**
 * Legacy compatibility wrapper for getOrCreateServerToken.
 * @deprecated Use getOrCreateServerToken instead.
 */
export async function getOrCreateToken(): Promise<{ token: string; isNew: boolean }> {
  const result = await getOrCreateServerToken();
  return {
    token: result.token.value,
    isNew: result.isNew,
  };
}

/**
 * Rotate the server authentication token.
 * Generates a new token and invalidates the old one.
 * Returns the new token.
 */
export async function rotateServerToken(): Promise<ServerToken> {
  const existingConfig = await loadRemoteConfig();
  const newToken = createServerToken();

  const newConfig: RemoteConfig = {
    serverToken: {
      ...newToken,
      version: (existingConfig?.serverToken?.version ?? 0) + 1,
    },
  };

  await saveRemoteConfig(newConfig);
  return newConfig.serverToken;
}

/**
 * Legacy compatibility wrapper for rotateServerToken.
 * @deprecated Use rotateServerToken instead.
 */
export async function rotateToken(): Promise<string> {
  const token = await rotateServerToken();
  return token.value;
}

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still do a comparison to maintain constant time
    // The _unused variable prevents timing attacks by doing work even when lengths differ
    let _unused = 0;
    for (let i = 0; i < b.length; i++) {
      _unused |= b.charCodeAt(i) ^ (a.charCodeAt(i % a.length) || 0);
    }
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Validate a server token against the stored token.
 * Uses constant-time comparison to prevent timing attacks.
 * Also checks expiration.
 */
export async function validateServerToken(providedToken: string): Promise<{
  valid: boolean;
  expired: boolean;
  error?: string;
}> {
  const config = await loadRemoteConfig();

  if (!config?.serverToken) {
    return { valid: false, expired: false, error: 'No server token configured' };
  }

  // Check expiration first
  if (isTokenExpired(config.serverToken.expiresAt)) {
    return { valid: false, expired: true, error: 'Server token expired' };
  }

  // Constant-time comparison
  const isValid = constantTimeCompare(providedToken, config.serverToken.value);

  return {
    valid: isValid,
    expired: false,
    error: isValid ? undefined : 'Invalid token',
  };
}

/**
 * Legacy compatibility wrapper for validateServerToken.
 * @deprecated Use validateServerToken instead.
 */
export async function validateToken(providedToken: string): Promise<boolean> {
  const result = await validateServerToken(providedToken);
  return result.valid;
}

/**
 * In-memory store for active connection tokens.
 * Maps connection token value to ConnectionToken object.
 * Server-side only - not persisted to disk.
 */
const activeConnectionTokens = new Map<string, ConnectionToken>();

/**
 * Issue a new connection token for an authenticated client.
 * Stores the token in memory for validation.
 */
export function issueConnectionToken(clientId: string): ConnectionToken {
  // Clean up any existing tokens for this client
  for (const [tokenValue, token] of activeConnectionTokens) {
    if (token.clientId === clientId) {
      activeConnectionTokens.delete(tokenValue);
    }
  }

  const token = createConnectionToken(clientId);
  activeConnectionTokens.set(token.value, token);
  return token;
}

/**
 * Validate a connection token.
 * Returns the client ID if valid, null otherwise.
 */
export function validateConnectionToken(tokenValue: string): {
  valid: boolean;
  clientId?: string;
  needsRefresh: boolean;
  error?: string;
} {
  const token = activeConnectionTokens.get(tokenValue);

  if (!token) {
    return { valid: false, needsRefresh: false, error: 'Unknown connection token' };
  }

  if (isTokenExpired(token.expiresAt)) {
    // Remove expired token
    activeConnectionTokens.delete(tokenValue);
    return { valid: false, needsRefresh: false, error: 'Connection token expired' };
  }

  const shouldRefresh = needsRefresh(token.expiresAt);

  return {
    valid: true,
    clientId: token.clientId,
    needsRefresh: shouldRefresh,
  };
}

/**
 * Refresh a connection token if it's still valid.
 * Returns a new token, or null if the current token is invalid.
 */
export function refreshConnectionToken(currentTokenValue: string): ConnectionToken | null {
  const validation = validateConnectionToken(currentTokenValue);

  if (!validation.valid || !validation.clientId) {
    return null;
  }

  // Remove the old token and issue a new one
  activeConnectionTokens.delete(currentTokenValue);
  return issueConnectionToken(validation.clientId);
}

/**
 * Revoke a connection token (e.g., on disconnect).
 */
export function revokeConnectionToken(tokenValue: string): void {
  activeConnectionTokens.delete(tokenValue);
}

/**
 * Revoke all connection tokens for a client (e.g., on client disconnect).
 */
export function revokeClientTokens(clientId: string): void {
  for (const [tokenValue, token] of activeConnectionTokens) {
    if (token.clientId === clientId) {
      activeConnectionTokens.delete(tokenValue);
    }
  }
}

/**
 * Clean up expired connection tokens.
 * Should be called periodically.
 */
export function cleanupExpiredTokens(): void {
  for (const [tokenValue, token] of activeConnectionTokens) {
    if (isTokenExpired(token.expiresAt)) {
      activeConnectionTokens.delete(tokenValue);
    }
  }
}

/**
 * Get information about the current server token (without exposing the full token).
 */
export async function getServerTokenInfo(): Promise<{
  exists: boolean;
  createdAt?: string;
  expiresAt?: string;
  version?: number;
  preview?: string;
  expired?: boolean;
  daysRemaining?: number;
}> {
  const config = await loadRemoteConfig();

  if (!config?.serverToken) {
    return { exists: false };
  }

  const token = config.serverToken;
  const expired = isTokenExpired(token.expiresAt);
  const expiresAtDate = new Date(token.expiresAt);
  const daysRemaining = expired ? 0 : Math.ceil((expiresAtDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000));

  return {
    exists: true,
    createdAt: token.createdAt,
    expiresAt: token.expiresAt,
    version: token.version,
    preview: token.value.slice(0, 8) + '...',
    expired,
    daysRemaining,
  };
}

/**
 * Legacy compatibility wrapper for getServerTokenInfo.
 * @deprecated Use getServerTokenInfo instead.
 */
export async function getTokenInfo(): Promise<{
  exists: boolean;
  createdAt?: string;
  version?: number;
  preview?: string;
}> {
  const info = await getServerTokenInfo();
  return {
    exists: info.exists,
    createdAt: info.createdAt,
    version: info.version,
    preview: info.preview,
  };
}

// Export paths for testing
export const CONFIG_PATHS = {
  dir: REMOTE_CONFIG_DIR,
  file: REMOTE_CONFIG_PATH,
} as const;
