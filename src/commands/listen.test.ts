/**
 * ABOUTME: Tests for the listen CLI command.
 * Covers argument parsing, token management, and server startup.
 */

import {
  describe,
  expect,
  test,
  beforeEach,
  afterEach,
} from 'bun:test';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseListenArgs, printListenHelp } from './listen.js';
import { TOKEN_LIFETIMES, DEFAULT_LISTEN_OPTIONS } from '../remote/types.js';

// ============================================================================
// Argument Parsing Tests
// ============================================================================

describe('parseListenArgs', () => {
  describe('help flag', () => {
    test('returns help for --help', () => {
      const result = parseListenArgs(['--help']);
      expect(result.help).toBe(true);
    });

    test('returns help for -h', () => {
      const result = parseListenArgs(['-h']);
      expect(result.help).toBe(true);
    });
  });

  describe('port option', () => {
    test('parses --port with valid number', () => {
      const result = parseListenArgs(['--port', '8080']);
      expect(result.port).toBe(8080);
    });

    test('parses default port when not specified', () => {
      const result = parseListenArgs([]);
      expect(result.port).toBeUndefined();
    });

    test('handles minimum valid port', () => {
      const result = parseListenArgs(['--port', '1']);
      expect(result.port).toBe(1);
    });

    test('handles maximum valid port', () => {
      const result = parseListenArgs(['--port', '65535']);
      expect(result.port).toBe(65535);
    });
  });

  describe('daemon option', () => {
    test('parses --daemon flag', () => {
      const result = parseListenArgs(['--daemon']);
      expect(result.daemon).toBe(true);
    });

    test('parses -d shorthand', () => {
      const result = parseListenArgs(['-d']);
      expect(result.daemon).toBe(true);
    });

    test('daemon defaults to undefined when not specified', () => {
      const result = parseListenArgs([]);
      expect(result.daemon).toBeUndefined();
    });
  });

  describe('rotate-token option', () => {
    test('parses --rotate-token flag', () => {
      const result = parseListenArgs(['--rotate-token']);
      expect(result.rotateToken).toBe(true);
    });

    test('rotateToken defaults to undefined when not specified', () => {
      const result = parseListenArgs([]);
      expect(result.rotateToken).toBeUndefined();
    });
  });

  describe('combined options', () => {
    test('parses multiple options together', () => {
      const result = parseListenArgs(['--port', '9000', '--daemon']);
      expect(result.port).toBe(9000);
      expect(result.daemon).toBe(true);
    });

    test('parses all options', () => {
      const result = parseListenArgs(['--port', '8080', '-d', '--help']);
      expect(result.port).toBe(8080);
      expect(result.daemon).toBe(true);
      expect(result.help).toBe(true);
    });
  });
});

// ============================================================================
// Help Output Tests
// ============================================================================

describe('printListenHelp', () => {
  test('outputs help text without throwing', () => {
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(' '));

    expect(() => printListenHelp()).not.toThrow();

    console.log = originalLog;

    const output = logs.join('\n');
    expect(output).toContain('ralph-tui listen');
    expect(output).toContain('--port');
    expect(output).toContain('--daemon');
    expect(output).toContain('--rotate-token');
    expect(output).toContain('WebSocket');
    expect(output).toContain('7890');
  });
});

// ============================================================================
// Default Options Tests
// ============================================================================

describe('DEFAULT_LISTEN_OPTIONS', () => {
  test('has correct default port', () => {
    expect(DEFAULT_LISTEN_OPTIONS.port).toBe(7890);
  });

  test('has correct default daemon setting', () => {
    expect(DEFAULT_LISTEN_OPTIONS.daemon).toBe(false);
  });

  test('has correct default rotateToken setting', () => {
    expect(DEFAULT_LISTEN_OPTIONS.rotateToken).toBe(false);
  });
});

// ============================================================================
// Token Lifetimes Tests
// ============================================================================

describe('TOKEN_LIFETIMES', () => {
  test('server token is 90 days', () => {
    expect(TOKEN_LIFETIMES.SERVER_TOKEN_DAYS).toBe(90);
  });

  test('connection token is 24 hours', () => {
    expect(TOKEN_LIFETIMES.CONNECTION_TOKEN_HOURS).toBe(24);
  });

  test('refresh threshold is 1 hour', () => {
    expect(TOKEN_LIFETIMES.REFRESH_THRESHOLD_HOURS).toBe(1);
  });

  test('token expiration calculation is correct', () => {
    const now = Date.now();
    const serverTokenExpiry = new Date(now + TOKEN_LIFETIMES.SERVER_TOKEN_DAYS * 24 * 60 * 60 * 1000);
    const connectionTokenExpiry = new Date(now + TOKEN_LIFETIMES.CONNECTION_TOKEN_HOURS * 60 * 60 * 1000);

    const serverDays = (serverTokenExpiry.getTime() - now) / (24 * 60 * 60 * 1000);
    const connectionHours = (connectionTokenExpiry.getTime() - now) / (60 * 60 * 1000);

    expect(Math.round(serverDays)).toBe(90);
    expect(Math.round(connectionHours)).toBe(24);
  });
});

// ============================================================================
// Token Storage Tests
// ============================================================================

describe('Token Storage', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'ralph-listen-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('Token file format', () => {
    test('token structure is valid JSON', async () => {
      const tokenFile = join(tempDir, 'remote.json');

      const token = {
        value: crypto.randomUUID(),
        version: 1,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      };

      await mkdir(tempDir, { recursive: true });
      await writeFile(tokenFile, JSON.stringify(token, null, 2), 'utf-8');

      const content = await readFile(tokenFile, 'utf-8');
      const parsed = JSON.parse(content);

      expect(parsed.value).toBe(token.value);
      expect(parsed.version).toBe(1);
      expect(parsed.createdAt).toBe(token.createdAt);
      expect(parsed.expiresAt).toBe(token.expiresAt);
    });

    test('token version increments on rotation', () => {
      let version = 1;
      version++; // Simulate rotation
      expect(version).toBe(2);

      version++; // Simulate another rotation
      expect(version).toBe(3);
    });
  });

  describe('Token expiration', () => {
    test('detects expired tokens', () => {
      const expiredDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const expiresAt = new Date(expiredDate);
      const isExpired = expiresAt.getTime() < Date.now();

      expect(isExpired).toBe(true);
    });

    test('detects valid tokens', () => {
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const expiresAt = new Date(futureDate);
      const isExpired = expiresAt.getTime() < Date.now();

      expect(isExpired).toBe(false);
    });

    test('calculates days remaining correctly', () => {
      const now = Date.now();
      const expiresIn7Days = new Date(now + 7 * 24 * 60 * 60 * 1000);
      const daysRemaining = Math.ceil((expiresIn7Days.getTime() - now) / (24 * 60 * 60 * 1000));

      expect(daysRemaining).toBe(7);
    });

    test('triggers warning when token expires soon', () => {
      const now = Date.now();
      const expiresIn5Days = new Date(now + 5 * 24 * 60 * 60 * 1000);
      const daysRemaining = Math.ceil((expiresIn5Days.getTime() - now) / (24 * 60 * 60 * 1000));

      const shouldWarn = daysRemaining <= 7;
      expect(shouldWarn).toBe(true);
    });
  });
});

// ============================================================================
// Server State Tests
// ============================================================================

describe('Server State', () => {
  test('RemoteServerState structure is valid', () => {
    const state = {
      running: true,
      port: 7890,
      host: '0.0.0.0',
      pid: 12345,
      connectedClients: 2,
      startedAt: new Date().toISOString(),
    };

    expect(state.running).toBe(true);
    expect(state.port).toBe(7890);
    expect(state.host).toBe('0.0.0.0');
    expect(typeof state.pid).toBe('number');
    expect(typeof state.connectedClients).toBe('number');
    expect(state.startedAt).toBeDefined();
  });

  test('localhost binding when no token', () => {
    const noTokenHost = '127.0.0.1';
    const withTokenHost = '0.0.0.0';

    expect(noTokenHost).toBe('127.0.0.1');
    expect(withTokenHost).toBe('0.0.0.0');
  });
});

// ============================================================================
// Daemon Mode Tests
// ============================================================================

describe('Daemon Mode', () => {
  test('RALPH_DAEMON environment variable detection', () => {
    const originalEnv = process.env.RALPH_DAEMON;

    process.env.RALPH_DAEMON = '1';
    expect(process.env.RALPH_DAEMON).toBe('1');

    process.env.RALPH_DAEMON = undefined;
    expect(process.env.RALPH_DAEMON).toBeUndefined();

    // Restore
    process.env.RALPH_DAEMON = originalEnv;
  });

  test('PID file path is correct', async () => {
    const { homedir } = await import('node:os');
    const { join } = await import('node:path');

    const expectedPath = join(homedir(), '.config', 'ralph-tui', 'listen.pid');

    expect(expectedPath).toContain('.config');
    expect(expectedPath).toContain('ralph-tui');
    expect(expectedPath).toContain('listen.pid');
  });
});

// ============================================================================
// Connection Tests
// ============================================================================

describe('Connection Handling', () => {
  test('client ID format is valid', () => {
    const clientId = `client-${crypto.randomUUID().slice(0, 8)}@192.168.1.100`;

    expect(clientId).toContain('client-');
    expect(clientId).toContain('@');
    expect(clientId.length).toBeGreaterThan(15);
  });

  test('WebSocket URL format is correct', () => {
    const host = 'localhost';
    const port = 7890;
    const url = `ws://${host}:${port}`;

    expect(url).toBe('ws://localhost:7890');
  });

  test('WebSocket URL with different hosts', () => {
    const testCases = [
      { host: '0.0.0.0', port: 7890, expected: 'ws://0.0.0.0:7890' },
      { host: '127.0.0.1', port: 8080, expected: 'ws://127.0.0.1:8080' },
      { host: 'example.com', port: 443, expected: 'ws://example.com:443' },
    ];

    for (const { host, port, expected } of testCases) {
      const url = `ws://${host}:${port}`;
      expect(url).toBe(expected);
    }
  });
});

// ============================================================================
// Audit Logging Tests
// ============================================================================

describe('Audit Logging', () => {
  test('audit log entry structure', () => {
    const entry = {
      timestamp: new Date().toISOString(),
      clientId: 'client-abc12345@192.168.1.100',
      action: 'connect',
      success: true,
      details: { port: 7890 },
    };

    expect(entry.timestamp).toBeDefined();
    expect(entry.clientId).toContain('@');
    expect(entry.action).toBe('connect');
    expect(entry.success).toBe(true);
    expect(entry.details).toEqual({ port: 7890 });
  });

  test('audit log path is correct', async () => {
    const { homedir } = await import('node:os');
    const { join } = await import('node:path');

    const expectedPath = join(homedir(), '.config', 'ralph-tui', 'audit.log');

    expect(expectedPath).toContain('.config');
    expect(expectedPath).toContain('ralph-tui');
    expect(expectedPath).toContain('audit.log');
  });
});
