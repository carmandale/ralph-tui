/**
 * ABOUTME: Terminal reset helpers for the Ralph TUI.
 * Provides low-level escape sequences for terminal cleanup on exit.
 */

/**
 * Disable common mouse reporting modes to prevent stray SGR events after exit.
 */
export function disableMouseTracking(): void {
  if (!process.stdout.isTTY) {
    return;
  }

  // Disable X10, VT200, button-event, any-event, SGR, URXVT, UTF-8 mouse modes.
  process.stdout.write(
    '\u001b[?1000l\u001b[?1002l\u001b[?1003l\u001b[?1005l\u001b[?1006l\u001b[?1015l'
  );
}
