/**
 * ABOUTME: Codex agent plugin for the codex CLI.
 * Integrates with OpenAI's Codex CLI for AI-assisted coding.
 * Supports: exec mode execution, model selection, JSONL output parsing,
 * sandbox modes, timeout, graceful interruption.
 */

import { spawn } from 'node:child_process';
import { BaseAgentPlugin, findCommandPath } from '../base.js';
import {
  processAgentEvents,
  processAgentEventsToSegments,
  type AgentDisplayEvent,
} from '../output-formatting.js';
import type {
  AgentPluginMeta,
  AgentPluginFactory,
  AgentFileContext,
  AgentExecuteOptions,
  AgentSetupQuestion,
  AgentDetectResult,
  AgentExecutionHandle,
} from '../types.js';

/**
 * Parse a Codex JSONL line into standardized display events.
 * Returns AgentDisplayEvent[] - the shared processAgentEvents decides what to show.
 *
 * Codex CLI --json format emits events like:
 * - message/content events for LLM output
 * - tool_call for tool invocations
 * - tool_result for tool outputs
 * - error for errors
 */
function parseCodexJsonLine(jsonLine: string): AgentDisplayEvent[] {
  if (!jsonLine || jsonLine.length === 0) return [];

  try {
    const event = JSON.parse(jsonLine) as Record<string, unknown>;
    const events: AgentDisplayEvent[] = [];

    // Handle different Codex event types
    const eventType = event.type as string | undefined;

    switch (eventType) {
      case 'message':
      case 'content':
      case 'text': {
        // Text content from the LLM
        const content =
          (event.content as string) ||
          (event.text as string) ||
          (event.message as string);
        if (content) {
          events.push({ type: 'text', content });
        }
        break;
      }

      case 'tool_call':
      case 'tool_use':
      case 'function_call': {
        // Tool being called
        const toolName =
          (event.name as string) ||
          (event.tool as string) ||
          (event.function as string) ||
          'unknown';
        const toolInput =
          (event.arguments as Record<string, unknown>) ||
          (event.input as Record<string, unknown>) ||
          (event.parameters as Record<string, unknown>);
        events.push({ type: 'tool_use', name: toolName, input: toolInput });
        break;
      }

      case 'tool_result':
      case 'function_result': {
        // Tool completed - check for errors
        const isError =
          event.is_error === true ||
          event.isError === true ||
          event.error !== undefined;
        if (isError) {
          const errorMsg =
            (event.error as string) ||
            (event.content as string) ||
            'tool execution failed';
          events.push({ type: 'error', message: errorMsg });
        }
        events.push({ type: 'tool_result' });
        break;
      }

      case 'error': {
        // Error from Codex
        const errorMsg =
          (event.message as string) ||
          (event.error as string) ||
          'Unknown error';
        events.push({ type: 'error', message: errorMsg });
        break;
      }

      case 'status':
      case 'system':
      case 'info': {
        // System/status events - treat as system events
        events.push({ type: 'system', subtype: eventType });
        break;
      }

      default: {
        // For unknown event types, try to extract any text content
        if (event.content && typeof event.content === 'string') {
          events.push({ type: 'text', content: event.content });
        } else if (event.text && typeof event.text === 'string') {
          events.push({ type: 'text', content: event.text });
        }
        break;
      }
    }

    return events;
  } catch {
    // Not valid JSON - might be plain text output
    // Pass through non-JSON lines that look meaningful
    if (jsonLine.trim() && !jsonLine.startsWith('{')) {
      return [{ type: 'text', content: jsonLine + '\n' }];
    }
    return [];
  }
}

/**
 * Parse Codex JSON stream output into display events.
 */
function parseCodexOutputToEvents(data: string): AgentDisplayEvent[] {
  const allEvents: AgentDisplayEvent[] = [];
  for (const line of data.split('\n')) {
    const events = parseCodexJsonLine(line.trim());
    allEvents.push(...events);
  }
  return allEvents;
}

/**
 * Codex agent plugin implementation.
 * Uses the `codex exec` command for non-interactive AI coding tasks.
 *
 * Key features:
 * - Auto-detects codex binary using `which`
 * - Executes in exec mode (codex exec) for non-interactive use
 * - Supports --json flag for JSONL streaming output
 * - Model specified via --model flag (e.g., o3, o4-mini, gpt-4.1)
 * - Sandbox modes: read-only, workspace-write, danger-full-access
 * - --dangerously-bypass-approvals-and-sandbox for autonomous operation
 * - Timeout handling with graceful SIGINT before SIGTERM
 * - Streaming stdout/stderr capture
 */
export class CodexAgentPlugin extends BaseAgentPlugin {
  readonly meta: AgentPluginMeta = {
    id: 'codex',
    name: 'Codex CLI',
    description: 'OpenAI Codex CLI for AI-assisted coding',
    version: '1.0.0',
    author: 'OpenAI',
    defaultCommand: 'codex',
    supportsStreaming: true,
    supportsInterrupt: true,
    supportsFileContext: true,
    supportsSubagentTracing: true,
    structuredOutputFormat: 'jsonl',
    skillsPaths: {
      personal: '~/.codex/skills',
      repo: '.codex/skills',
    },
  };

  /** Model to use (e.g., 'o3', 'o4-mini', 'gpt-4.1') */
  private model?: string;

  /** Sandbox mode for command execution */
  private sandboxMode: 'read-only' | 'workspace-write' | 'danger-full-access' =
    'workspace-write';

  /** Bypass approval prompts and sandbox for autonomous operation */
  private bypassApprovals = true;

  /** Use --full-auto convenience mode */
  private fullAuto = false;

  /** Configuration profile to use */
  private profile?: string;

  /** Timeout in milliseconds (0 = no timeout) */
  protected override defaultTimeout = 0;

  override async initialize(config: Record<string, unknown>): Promise<void> {
    await super.initialize(config);

    if (typeof config.model === 'string' && config.model.length > 0) {
      this.model = config.model;
    }

    if (
      typeof config.sandboxMode === 'string' &&
      ['read-only', 'workspace-write', 'danger-full-access'].includes(
        config.sandboxMode
      )
    ) {
      this.sandboxMode = config.sandboxMode as typeof this.sandboxMode;
    }

    if (typeof config.bypassApprovals === 'boolean') {
      this.bypassApprovals = config.bypassApprovals;
    }

    if (typeof config.fullAuto === 'boolean') {
      this.fullAuto = config.fullAuto;
    }

    if (typeof config.profile === 'string' && config.profile.length > 0) {
      this.profile = config.profile;
    }

    if (typeof config.timeout === 'number' && config.timeout > 0) {
      this.defaultTimeout = config.timeout;
    }
  }

  /**
   * Detect codex CLI availability.
   * Uses platform-appropriate command (where on Windows, which on Unix).
   */
  override async detect(): Promise<AgentDetectResult> {
    const command = this.commandPath ?? this.meta.defaultCommand;

    // First, try to find the binary in PATH
    const findResult = await findCommandPath(command);

    if (!findResult.found) {
      return {
        available: false,
        error: `Codex CLI not found in PATH. Install from: https://github.com/openai/codex`,
      };
    }

    // Verify the binary works by running --version
    const versionResult = await this.runVersion(findResult.path);

    if (!versionResult.success) {
      return {
        available: false,
        executablePath: findResult.path,
        error: versionResult.error,
      };
    }

    return {
      available: true,
      version: versionResult.version,
      executablePath: findResult.path,
    };
  }

  override getSandboxRequirements() {
    return {
      // ~/.codex contains config.toml and session data
      authPaths: ['~/.codex'],
      binaryPaths: ['/opt/homebrew/bin', '/usr/local/bin', '~/.local/bin'],
      runtimePaths: [],
      requiresNetwork: true,
    };
  }

  /**
   * Run --version to verify binary and extract version number.
   */
  private runVersion(
    command: string
  ): Promise<{ success: boolean; version?: string; error?: string }> {
    return new Promise((resolve) => {
      const proc = spawn(command, ['--version'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true,
      });

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('error', (error) => {
        resolve({
          success: false,
          error: `Failed to execute: ${error.message}`,
        });
      });

      proc.on('close', (code) => {
        if (code === 0) {
          // Extract version from output (e.g., "codex-cli 0.87.0")
          const versionMatch = stdout.match(/(\d+\.\d+\.\d+)/);
          resolve({
            success: true,
            version: versionMatch?.[1],
          });
        } else {
          resolve({
            success: false,
            error: stderr || `Exited with code ${code}`,
          });
        }
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        proc.kill();
        resolve({ success: false, error: 'Timeout waiting for --version' });
      }, 5000);
    });
  }

  override getSetupQuestions(): AgentSetupQuestion[] {
    const baseQuestions = super.getSetupQuestions();
    return [
      ...baseQuestions,
      {
        id: 'model',
        prompt: 'Model to use:',
        type: 'select',
        choices: [
          {
            value: '',
            label: 'Default',
            description: 'Use configured default model',
          },
          { value: 'o3', label: 'o3', description: 'OpenAI o3 - most capable' },
          {
            value: 'o4-mini',
            label: 'o4-mini',
            description: 'OpenAI o4-mini - fast and efficient',
          },
          {
            value: 'gpt-4.1',
            label: 'gpt-4.1',
            description: 'GPT-4.1 - balanced',
          },
        ],
        default: '',
        required: false,
        help: 'Which model to use for this agent (leave empty for Codex default)',
      },
      {
        id: 'sandboxMode',
        prompt: 'Sandbox mode:',
        type: 'select',
        choices: [
          {
            value: 'workspace-write',
            label: 'Workspace Write',
            description: 'Write to workspace only (recommended)',
          },
          {
            value: 'read-only',
            label: 'Read Only',
            description: 'No file writes allowed',
          },
          {
            value: 'danger-full-access',
            label: 'Full Access',
            description: 'Full disk access (dangerous)',
          },
        ],
        default: 'workspace-write',
        required: false,
        help: 'Sandbox policy for model-generated shell commands',
      },
      {
        id: 'bypassApprovals',
        prompt: 'Bypass approval prompts?',
        type: 'boolean',
        default: true,
        required: false,
        help: 'Enable --dangerously-bypass-approvals-and-sandbox for autonomous Ralph loops',
      },
      {
        id: 'fullAuto',
        prompt: 'Use full-auto mode?',
        type: 'boolean',
        default: false,
        required: false,
        help: 'Enable --full-auto for low-friction sandboxed automatic execution',
      },
      {
        id: 'profile',
        prompt: 'Configuration profile:',
        type: 'text',
        default: '',
        required: false,
        help: 'Configuration profile name from ~/.codex/config.toml (leave empty for default)',
      },
    ];
  }

  protected buildArgs(
    _prompt: string,
    files?: AgentFileContext[],
    options?: AgentExecuteOptions
  ): string[] {
    // Codex uses: codex exec [flags] [prompt]
    const args: string[] = ['exec'];

    // Add JSON output for structured JSONL streaming (for subagent tracing)
    if (options?.subagentTracing) {
      args.push('--json');
    }

    // Add model if specified
    if (this.model) {
      args.push('--model', this.model);
    }

    // Add configuration profile if specified
    if (this.profile) {
      args.push('--profile', this.profile);
    }

    // Handle sandbox/approval settings
    if (this.bypassApprovals) {
      // Full bypass mode - skips all prompts and sandboxing
      args.push('--dangerously-bypass-approvals-and-sandbox');
    } else if (this.fullAuto) {
      // Full-auto mode - sandboxed but automatic
      args.push('--full-auto');
    } else {
      // Standard sandbox mode
      args.push('--sandbox', this.sandboxMode);
    }

    // Add file context if provided (--add-dir for additional directories)
    if (files && files.length > 0) {
      const directories = new Set<string>();

      for (const file of files) {
        // Extract directory from file path for --add-dir
        const lastSlash = file.path.lastIndexOf('/');
        if (lastSlash > 0) {
          directories.add(file.path.substring(0, lastSlash));
        }
      }

      // Add unique directories
      for (const dir of directories) {
        args.push('--add-dir', dir);
      }
    }

    // NOTE: Prompt is passed via stdin (using '-' placeholder)
    // This avoids shell interpretation issues with special characters
    args.push('-');

    return args;
  }

  /**
   * Provide the prompt via stdin instead of command args.
   * Codex exec accepts prompt from stdin when '-' is passed as the prompt argument.
   * This avoids shell interpretation issues with special characters in prompts.
   */
  protected override getStdinInput(
    prompt: string,
    _files?: AgentFileContext[],
    _options?: AgentExecuteOptions
  ): string {
    return prompt;
  }

  /**
   * Override execute to parse Codex JSONL output for display.
   * Wraps the onStdout/onStdoutSegments callbacks to format tool calls and messages.
   * Also forwards raw JSONL messages to onJsonlMessage for subagent tracing.
   */
  override execute(
    prompt: string,
    files?: AgentFileContext[],
    options?: AgentExecuteOptions
  ): AgentExecutionHandle {
    // Wrap callbacks to parse JSONL events when using --json output
    const isStreamingJson = options?.subagentTracing;

    const parsedOptions: AgentExecuteOptions = {
      ...options,
      onStdout:
        isStreamingJson &&
        (options?.onStdout ||
          options?.onStdoutSegments ||
          options?.onJsonlMessage)
          ? (data: string) => {
              // Parse raw JSONL lines and forward to onJsonlMessage for subagent tracing
              if (options?.onJsonlMessage) {
                for (const line of data.split('\n')) {
                  const trimmed = line.trim();
                  if (trimmed && trimmed.startsWith('{')) {
                    try {
                      const parsed = JSON.parse(trimmed) as Record<
                        string,
                        unknown
                      >;
                      options.onJsonlMessage(parsed);
                    } catch {
                      // Not valid JSON, skip for JSONL callback
                    }
                  }
                }
              }

              // Process for display events
              const events = parseCodexOutputToEvents(data);
              if (events.length > 0) {
                // Call TUI-native segments callback if provided
                if (options?.onStdoutSegments) {
                  const segments = processAgentEventsToSegments(events);
                  if (segments.length > 0) {
                    options.onStdoutSegments(segments);
                  }
                }
                // Also call legacy string callback if provided
                if (options?.onStdout) {
                  const parsed = processAgentEvents(events);
                  if (parsed.length > 0) {
                    options.onStdout(parsed);
                  }
                }
              }
            }
          : options?.onStdout,
    };

    return super.execute(prompt, files, parsedOptions);
  }

  override async validateSetup(
    answers: Record<string, unknown>
  ): Promise<string | null> {
    // Validate sandbox mode
    const sandboxMode = answers.sandboxMode;
    if (
      sandboxMode !== undefined &&
      sandboxMode !== '' &&
      !['read-only', 'workspace-write', 'danger-full-access'].includes(
        String(sandboxMode)
      )
    ) {
      return 'Invalid sandbox mode. Must be one of: read-only, workspace-write, danger-full-access';
    }

    // Model validation is delegated to Codex CLI - it validates model availability
    return null;
  }

  /**
   * Validate a model name for the Codex agent.
   * Codex accepts any model string - validation happens server-side.
   * @param model The model name to validate
   * @returns null if valid, error message if invalid
   */
  override validateModel(model: string): string | null {
    if (model === '' || model === undefined) {
      return null; // Empty is valid (uses default)
    }
    // Codex CLI validates models server-side, so we accept any string
    // Common models: o3, o4-mini, gpt-4.1, etc.
    return null;
  }

  /**
   * Get Codex-specific suggestions for preflight failures.
   * Provides actionable guidance for common configuration issues.
   */
  protected override getPreflightSuggestion(): string {
    return (
      'Common fixes for Codex CLI:\n' +
      '  1. Test Codex directly: codex exec "hello"\n' +
      '  2. Check authentication: codex login\n' +
      '  3. Verify installation: codex --version\n' +
      '  4. Check your OpenAI API key is configured\n' +
      '  5. Try specifying a model: ralph-tui run --agent codex --model o4-mini'
    );
  }
}

/**
 * Factory function for the Codex agent plugin.
 */
const createCodexAgent: AgentPluginFactory = () => new CodexAgentPlugin();

export default createCodexAgent;
