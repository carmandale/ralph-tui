# Ralph TUI: Agent How-To Guide

> **Purpose:** Step-by-step instructions for AI coding agents to use ralph-tui in headless (CLI-only) mode.

---

## Overview

Ralph TUI orchestrates AI agents to complete tasks autonomously. In headless mode (`--headless` or `--no-tui`), it runs without the interactive terminal UI and outputs structured logs to stdout—ideal for automation, CI pipelines, or agent-to-agent workflows.

---

## Quick Start (TL;DR)

```bash
# 1. Create prd.json (choose one method)
ralph-tui create-prd                           # AI-powered conversation
ralph-tui convert --to json ./tasks/prd.md     # From existing markdown

# 2. Run headless
ralph-tui run --prd ./prd.json --headless --iterations 10

# 3. Check status (machine-readable)
ralph-tui status --json

# 4. Resume if interrupted
ralph-tui resume --headless
```

---

## Step 1: Create a prd.json File

### Option A: AI-Powered Creation (Interactive)

```bash
ralph-tui create-prd
```

This launches an **interactive** AI conversation that:
1. Asks about the feature you want to build
2. Asks follow-up questions about users, requirements, scope
3. Generates a markdown PRD with user stories
4. Offers to create prd.json automatically

**Options:**
```bash
ralph-tui create-prd --agent claude      # Use specific agent
ralph-tui create-prd --output ./docs     # Custom output directory
ralph-tui create-prd --force             # Overwrite without prompting
```

> **Note:** This is interactive and requires human input. For fully automated workflows, use Option B.

### Option B: Convert Existing Markdown PRD (Non-Interactive, Recommended for Agents)

If you already have a PRD in markdown format:

```bash
ralph-tui convert --to json ./tasks/prd-feature.md
```

> **Best for automation:** This is non-interactive and works in headless pipelines.

This parses:
- User stories from `### US-XXX: Title` sections
- Acceptance criteria from `- [ ] item` checklists
- Priority from `**Priority:** P1-P4` lines
- Dependencies from `**Depends on:**` lines

**Options:**
```bash
ralph-tui convert --to json ./prd.md -o ./custom.json   # Custom output path
ralph-tui convert --to json ./prd.md --force            # Overwrite existing
ralph-tui convert --to json ./prd.md --verbose          # Show parsing details
```

### PRD Markdown Format

The `convert` command expects this markdown structure:

```markdown
# PRD: Feature Name

## Overview
Brief description of the feature.

## User Stories

### US-001: First Task Title
**Description:** As a user, I want X so that Y.

**Acceptance Criteria:**
- [ ] Criterion 1
- [ ] Criterion 2
- [ ] pnpm typecheck passes

### US-002: Second Task (depends on US-001)
**Description:** As a user, I want A so that B.

**Priority:** P2

**Depends on:** US-001

**Acceptance Criteria:**
- [ ] Criterion A
- [ ] Criterion B
```

### What Gets Parsed

| Markdown Pattern | Extracted As |
|------------------|--------------|
| `### US-XXX: Title` | `id` and `title` |
| `**Description:**` text | `description` |
| `- [ ] item` | `acceptanceCriteria` array |
| `**Priority:** P1-P4` | `priority` (1-4) |
| `**Depends on:** US-XXX` | `dependsOn` array |

### Task Dependencies

Use `**Depends on:**` in markdown to control execution order. Ralph will:
- Skip dependent tasks until prerequisites have `passes: true`
- Include "Prerequisites: US-001" in the prompt for dependent tasks

---

## Step 2: Run Headless

### Basic Command

```bash
ralph-tui run --prd ./prd.json --headless
```

### With Options

```bash
ralph-tui run \
  --prd ./prd.json \
  --headless \
  --iterations 20 \
  --agent claude \
  --model sonnet
```

### All Run Options

| Option | Description |
|--------|-------------|
| `--prd <path>` | Path to prd.json file **(required for JSON tracker)** |
| `--headless` | Run without TUI (alias: `--no-tui`) |
| `--iterations <n>` | Max iterations, 0 = unlimited (default: 10) |
| `--agent <name>` | Agent plugin: `claude` or `opencode` |
| `--model <name>` | Model override (see below) |
| `--delay <ms>` | Delay between iterations in milliseconds |
| `--output-dir <path>` | Directory for logs (default: `.ralph-tui/iterations`) |
| `--no-setup` | Skip interactive setup prompts |
| `--force` | Force start even if session exists |

### Model Options

**Claude agent:**
```bash
--agent claude --model sonnet   # Claude Sonnet (default)
--agent claude --model opus     # Claude Opus
--agent claude --model haiku    # Claude Haiku
```

**OpenCode agent:**
```bash
--agent opencode --model anthropic/claude-3-5-sonnet
--agent opencode --model openai/gpt-4o
--agent opencode --model google/gemini-1.5-pro
```

---

## Step 3: Parse Headless Output

### Log Format

Headless mode outputs structured logs:

```
[timestamp] [level] [component] message
```

**Levels:** `INFO`, `WARN`, `ERROR`, `DEBUG`

**Components:** `progress`, `agent`, `engine`, `tracker`, `session`, `system`

### Example Output

```
[10:42:15] [INFO] [session] Session abc123 created. Agent: claude, Tracker: json
[10:42:15] [INFO] [engine] Ralph started. Total tasks: 5
[10:42:15] [INFO] [progress] Iteration 1/10: Working on US-001 - Create login form
[10:42:15] [INFO] [agent] Building prompt for task...
[10:42:16] [INFO] [agent] Starting implementation...
[10:42:30] [INFO] [progress] Iteration 1 finished. Task US-001: COMPLETED. Duration: 15s
[10:42:30] [INFO] [tracker] Task US-001 completed in iteration 1
[10:42:31] [INFO] [progress] Iteration 2/10: Working on US-002 - Add validation
...
[10:45:00] [INFO] [engine] All tasks complete! Total: 5 tasks in 5 iterations.
```

### Key Log Patterns to Parse

| Pattern | Meaning |
|---------|---------|
| `[INFO] [engine] Ralph started. Total tasks: N` | Execution started |
| `[INFO] [progress] Iteration X/Y: Working on ID - Title` | Task started |
| `[INFO] [progress] Iteration X finished. Task ID: COMPLETED` | Task completed |
| `[INFO] [progress] Iteration X finished. Task ID: in progress` | Task not finished |
| `[INFO] [engine] All tasks complete!` | All done |
| `[INFO] [engine] Ralph stopped. Reason: X` | Stopped (see reason) |
| `[ERROR] [progress] Iteration X FAILED` | Task failed |
| `[WARN] [progress] Skipping ID` | Task skipped |

### Stop Reasons

| Reason | Meaning |
|--------|---------|
| `all_complete` | All tasks finished successfully |
| `max_iterations` | Hit iteration limit |
| `no_tasks` | No tasks available to work on |
| `error` | Fatal error occurred |
| `user_requested` | User stopped (Ctrl+C) |

---

## Step 4: Check Status

### Machine-Readable Status

```bash
ralph-tui status --json
```

### Example JSON Output

```json
{
  "status": "paused",
  "session": {
    "id": "abc123-def456",
    "status": "interrupted",
    "progress": {
      "completed": 3,
      "total": 5,
      "percent": 60
    },
    "iteration": {
      "current": 4,
      "max": 10
    },
    "elapsedSeconds": 180,
    "tracker": "json",
    "agent": "claude",
    "model": "sonnet",
    "prdPath": "./prd.json",
    "startedAt": "2026-01-14T10:42:15.000Z",
    "updatedAt": "2026-01-14T10:45:15.000Z",
    "resumable": true
  }
}
```

### Status Values

| Status | Exit Code | Meaning |
|--------|-----------|---------|
| `completed` | 0 | All tasks done successfully |
| `running` | 1 | Currently executing |
| `paused` | 1 | Paused or interrupted, can resume |
| `failed` | 2 | Session failed |
| `no-session` | 2 | No session exists |

### Parsing Status in Scripts

```bash
# Check if completed
if ralph-tui status --json | jq -e '.status == "completed"' > /dev/null; then
  echo "Ralph completed successfully"
fi

# Get progress percentage
ralph-tui status --json | jq '.session.progress.percent'

# Check if resumable
ralph-tui status --json | jq '.session.resumable'
```

---

## Step 5: Resume Interrupted Sessions

If execution is interrupted (Ctrl+C, crash, etc.), resume with:

```bash
ralph-tui resume --headless
```

### Resume Options

| Option | Description |
|--------|-------------|
| `--headless` | Resume without TUI |
| `--force` | Override stale lock |
| `--cwd <path>` | Working directory |

### When Sessions Can Resume

Sessions are resumable when status is:
- `paused` - User paused
- `running` - Crashed mid-execution
- `interrupted` - Stopped by Ctrl+C

Sessions that **cannot** resume:
- `completed` - All done, nothing to resume
- `failed` - Must start fresh with `--force`

---

## Step 6: Handle Interruption (Ctrl+C)

### Single Ctrl+C
- Initiates graceful shutdown
- Resets any in-progress tasks back to `open`
- Saves session state (resumable)
- Message: `Interrupted, stopping gracefully...`

### Double Ctrl+C (within 1 second)
- Forces immediate exit
- May leave tasks in inconsistent state
- Message: `Force quit!`

### SIGTERM
- Always graceful shutdown
- Same behavior as single Ctrl+C

---

## Complete Workflow Example

### 1. Create PRD Markdown

```bash
cat > ./tasks/prd-auth.md << 'EOF'
# PRD: User Authentication

## Overview
Add user authentication with login form, validation, and API integration.

## User Stories

### US-001: Create login form component
**Description:** As a user, I want a login form so I can authenticate.

**Priority:** P1

**Acceptance Criteria:**
- [ ] Form has email and password fields
- [ ] Submit button disabled when fields empty
- [ ] pnpm typecheck passes

### US-002: Add form validation
**Description:** As a user, I want validation feedback.

**Priority:** P2

**Depends on:** US-001

**Acceptance Criteria:**
- [ ] Email field validates format
- [ ] Password requires 8+ characters
- [ ] Error messages display below fields
- [ ] pnpm typecheck passes

### US-003: Connect to auth API
**Description:** As a user, I want to actually log in.

**Priority:** P3

**Depends on:** US-002

**Acceptance Criteria:**
- [ ] Form submits to /api/auth/login
- [ ] Success redirects to dashboard
- [ ] Failure shows error message
- [ ] pnpm typecheck passes
EOF
```

### 2. Convert to prd.json

```bash
ralph-tui convert --to json ./tasks/prd-auth.md --force
```

### 3. Run Headless

```bash
ralph-tui run --prd ./prd.json --headless --iterations 10 2>&1 | tee ralph.log
```

### 4. Monitor Progress

```bash
# In another terminal, check status
ralph-tui status --json | jq '.session.progress'
```

### 5. Handle Completion

```bash
# Check final status
STATUS=$(ralph-tui status --json | jq -r '.status')

case $STATUS in
  completed)
    echo "✓ All tasks completed"
    ;;
  paused)
    echo "⏸ Session paused, can resume"
    ralph-tui resume --headless
    ;;
  failed)
    echo "✗ Session failed"
    exit 1
    ;;
esac
```

### 6. Verify prd.json Updated

```bash
# All passes should be true
jq '.userStories[] | {id, passes}' prd.json
```

---

## Task Completion Detection

Ralph detects task completion when the agent outputs:

```
<promise>COMPLETE</promise>
```

The prompt template instructs the agent to output this token when finished. The default template ends with:

```
When finished, signal completion with:
<promise>COMPLETE</promise>
```

---

## Files Created by Ralph

| Path | Purpose |
|------|---------|
| `.ralph-tui/session.json` | Session state (for resume) |
| `.ralph-tui/iterations/` | Per-iteration output logs |
| `.ralph-tui/progress.md` | Cross-iteration context |
| `.ralph-tui/config.toml` | Project configuration |
| `.ralph-tui.lock` | Process lock file |

---

## Error Handling

### Common Issues

**"Session is currently locked"**
```bash
# Another Ralph instance is running, or stale lock
ralph-tui run --force --prd ./prd.json --headless
```

**"No tasks available"**
- All tasks have `passes: true`
- All remaining tasks have unmet `dependsOn`

**"Task stuck in in_progress"**
- Ralph auto-recovers on startup
- Or manually edit prd.json to set `passes: false`

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success (all complete) |
| 1 | In progress or interrupted |
| Non-zero | Error |

---

## Summary: Agent Command Sequence

```bash
# 1. Create PRD markdown file (see format above)
# Write to ./tasks/prd-feature.md

# 2. Convert to prd.json
ralph-tui convert --to json ./tasks/prd-feature.md --force

# 3. Start execution
ralph-tui run --prd ./prd.json --headless --iterations 20

# 4. Check status anytime
ralph-tui status --json

# 5. Resume if needed
ralph-tui resume --headless

# 6. Verify completion
ralph-tui status --json | jq -e '.status == "completed"'
```

---

## Reference: Full CLI Help

```bash
ralph-tui --help              # All commands
ralph-tui run --help          # Run options
ralph-tui resume --help       # Resume options
ralph-tui status --help       # Status options
```
