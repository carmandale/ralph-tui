/**
 * ABOUTME: Terminal reset helpers for the Ralph TUI.
 * Provides low-level escape sequences for terminal cleanup on exit,
 * and initialization sequences for features like bracketed paste mode.
 */

import fs from 'node:fs';

const MOUSE_DISABLE_SEQUENCE =
  '\u001b[?1000l\u001b[?1002l\u001b[?1003l\u001b[?1005l\u001b[?1006l\u001b[?1015l';
const EXIT_ALT_SCREEN = '\u001b[?1049l';
const SHOW_CURSOR = '\u001b[?25h';

// Bracketed paste mode - allows terminal to signal paste start/end
// so we can distinguish pasted text from typed text
const BRACKETED_PASTE_ENABLE = '\u001b[?2004h';
const BRACKETED_PASTE_DISABLE = '\u001b[?2004l';

function writeToTty(sequence: string): void {
  try {
    const fd = fs.openSync('/dev/tty', 'w');
    fs.writeSync(fd, sequence);
    fs.closeSync(fd);
    return;
  } catch {
    // Fall back to stdout when /dev/tty isn't available.
  }

  if (process.stdout.isTTY) {
    process.stdout.write(sequence);
  }
}

/**
 * Initialize terminal features for TUI mode.
 * Call this when starting the TUI to enable features like bracketed paste.
 */
export function initTerminal(): void {
  // Write directly to stdout to ensure it goes through after renderer init
  if (process.stdout.isTTY) {
    process.stdout.write(BRACKETED_PASTE_ENABLE);
  }
}

/**
 * Disable common mouse reporting modes to prevent stray SGR events after exit.
 */
export function disableMouseTracking(): void {
  writeToTty(MOUSE_DISABLE_SEQUENCE);
}

/**
 * Restore terminal to a sane state after TUI exit.
 */
export function restoreTerminal(): void {
  if (process.stdin.isTTY && process.stdin.setRawMode) {
    try {
      process.stdin.setRawMode(false);
    } catch {
      // Ignore failures when stdin isn't a TTY.
    }
  }

  writeToTty(MOUSE_DISABLE_SEQUENCE + EXIT_ALT_SCREEN + SHOW_CURSOR + BRACKETED_PASTE_DISABLE);
}
