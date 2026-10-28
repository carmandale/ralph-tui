/**
 * ABOUTME: Tests Droid launch construction independently of its inherited lifecycle.
 * Covers platform wrappers, flag ordering, shell escaping, and base launch defaults.
 */

import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import * as os from 'node:os';
import { BaseAgentPlugin } from '../base.js';
import type { AgentExecuteOptions } from '../types.js';
import { DroidAgentPlugin } from './index.js';

class LaunchProbe extends DroidAgentPlugin {
  launch(command: string, prompt: string, options?: AgentExecuteOptions) {
    return this.buildLaunchInvocation(command, this.buildArgs(prompt, [], options), options);
  }

  baseLaunch(command: string, args: string[], options?: AgentExecuteOptions) {
    return BaseAgentPlugin.prototype['buildLaunchInvocation'].call(this, command, args, options);
  }
}

let platform = spyOn(os, 'platform');
beforeEach(() => { platform = spyOn(os, 'platform'); });
afterEach(() => platform.mockRestore());

describe('Droid launch invocation', () => {
  test('inherits execution, interruption, and disposal from the base', () => {
    for (const method of ['execute', 'interrupt', 'interruptAll', 'getCurrentExecution', 'dispose'] as const) {
      expect(DroidAgentPlugin.prototype[method]).toBe(BaseAgentPlugin.prototype[method]);
      expect(Object.hasOwn(DroidAgentPlugin.prototype, method)).toBe(false);
    }
  });

  test('base launch preserves executable, arguments, and generic flag ordering', async () => {
    const agent = new LaunchProbe();
    await agent.initialize({ defaultFlags: ['--default'] });
    expect(agent.baseLaunch('/agent', ['run', 'prompt'], { flags: ['--extra'] })).toEqual({
      command: '/agent', args: ['--default', '--extra', 'run', 'prompt'],
    });
  });

  for (const currentPlatform of ['linux', 'darwin', 'win32'] as const) {
    test(`preserves ${currentPlatform} wrapper syntax, environment, and flag placement`, async () => {
      platform.mockReturnValue(currentPlatform);
      const agent = new LaunchProbe();
      await agent.initialize({ defaultFlags: ['--default', "it's"], model: 'model' });
      const invocation = agent.launch('/opt/agent path/droid', "line'\\\n\r\t$(touch sentinel)", {
        cwd: "/project's dir", flags: ['--extra', 'a b'],
      });
      expect(invocation.stdin).toBe('ignore');
      expect(invocation.env).toEqual({
        CI: 'true', TERM: 'dumb', NO_COLOR: '1', FORCE_COLOR: '0', INK_DISABLE_INPUT: '1',
      });
      if (currentPlatform === 'win32') {
        expect(invocation.command).toBe('/opt/agent path/droid');
        expect(invocation.shell).toBe(true);
        expect(invocation.args.slice(0, 5)).toEqual(['exec', '--default', "it's", '--extra', 'a b']);
        expect(invocation.args.at(-1)).toBe("line'\\\n\r\t$(touch sentinel)");
      } else {
        expect(invocation.command).toBe('script');
        expect(invocation.shell).toBeUndefined();
        const shellCommand = currentPlatform === 'darwin' ? invocation.args[4] : invocation.args[2];
        expect(invocation.args).toEqual(currentPlatform === 'darwin'
          ? ['-q', '/dev/null', 'sh', '-c', shellCommand]
          : ['-q', '-c', shellCommand, '/dev/null']);
        expect(shellCommand).toStartWith("stty -echo 2>/dev/null; cd '/project'\\''s dir' && '/opt/agent path/droid' 'exec' '--default' 'it'\\''s' '--extra' 'a b'");
        expect(shellCommand).toEndWith("$'line\\'\\\\\\n\\r\\t$(touch sentinel)'");
      }
    });
  }

  test('uses the effective process cwd when none is specified', () => {
    platform.mockReturnValue('linux');
    const invocation = new LaunchProbe().launch('droid', 'prompt');
    expect(invocation.args[2]).toContain(`cd '${process.cwd()}' &&`);
  });
});
