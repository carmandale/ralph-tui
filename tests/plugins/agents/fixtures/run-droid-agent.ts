/**
 * ABOUTME: Runs DroidAgentPlugin against the process lifecycle fixture.
 * This subprocess keeps the test independent from other tests' module mocks.
 */

import { DroidAgentPlugin } from '../../../../src/plugins/agents/droid/index.js';
import { dirname } from 'node:path';
import * as os from 'node:os';
import { spyOn } from 'bun:test';

const mode = process.argv[2] ?? 'clean';
const fixturePath = process.env.AGENT_FIXTURE_PATH;
const scriptFixturePath = process.env.DROID_SCRIPT_FIXTURE_PATH;

if (!fixturePath) {
  throw new Error('AGENT_FIXTURE_PATH is required');
}

const agent = new DroidAgentPlugin();
await agent.initialize({ command: fixturePath, defaultFlags: ['--default-flag'] });
// Emulate direct Windows construction without claiming native Windows execution.
if (process.env.DROID_DIRECT_LAUNCH === '1') {
  spyOn(os, 'platform').mockReturnValue('win32');
}
let starts = 0;
let ends = 0;
let streamedStdout = '';
let streamedStderr = '';
let runningAtStart = false;
const handle = agent.execute(process.env.DROID_PROMPT ?? 'test prompt', [], {
  cwd: process.env.DROID_CWD,
  flags: ['--runtime-flag'],
  timeout: mode === 'timeout' ? 100 : 0,
  onStart: () => { starts++; runningAtStart = handle.isRunning(); },
  onEnd: () => { ends++; if (mode === 'throw-on-end') throw new Error('test callback'); },
  onStdout: (text) => {
    streamedStdout += text;
    if (mode === 'interrupt') handle.interrupt();
    if (mode === 'interrupt-all') agent.interruptAll();
  },
  onStderr: (text) => { streamedStderr += text; },
  env: {
    SHELL: '/bin/bash',
    DROID_EXPLICIT_VALUE: 'explicit',
    CI: 'false',
    DROID_FIXTURE_MODE: mode,
    DROID_FIXTURE_PATH: fixturePath,
    ...(scriptFixturePath
      ? {
          PATH: `${dirname(scriptFixturePath)}:${process.env.PATH ?? ''}`,
        }
      : {}),
    ...(process.env.AGENT_CHILD_PID_FILE
      ? { AGENT_CHILD_PID_FILE: process.env.AGENT_CHILD_PID_FILE }
      : {}),
  },
});
if (mode === 'early-interrupt') handle.interrupt();
const result = await handle.promise;

console.log(JSON.stringify({ ...result, starts, ends, runningAtStart,
  runningAfterEnd: handle.isRunning(), streamedStdout, streamedStderr,
  currentAfterEnd: agent.getCurrentExecution() !== undefined,
}));
