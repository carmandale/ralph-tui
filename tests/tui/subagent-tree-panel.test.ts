/**
 * ABOUTME: Tests for SubagentTreePanel helper functions.
 * Tests status icons, colors, duration formatting, and text truncation.
 */

import { describe, test, expect } from 'bun:test';

/**
 * Re-implemented helper functions from SubagentTreePanel for testing.
 * These mirror the internal functions used for rendering.
 */

type SubagentStatus = 'running' | 'completed' | 'error';

/**
 * Status icon for subagent based on its completion state.
 */
function getStatusIcon(status: SubagentStatus): string {
  switch (status) {
    case 'running':
      return '◐';
    case 'completed':
      return '✓';
    case 'error':
      return '✗';
    default:
      return '○';
  }
}

/**
 * Format duration in human-readable format.
 */
function formatDuration(durationMs?: number): string {
  if (durationMs === undefined) return '';
  if (durationMs < 1000) return `${durationMs}ms`;
  const seconds = Math.floor(durationMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

/**
 * Truncate text to fit within a maximum width.
 */
function truncateText(text: string, maxWidth: number): string {
  if (text.length <= maxWidth) return text;
  if (maxWidth <= 3) return text.slice(0, maxWidth);
  return text.slice(0, maxWidth - 1) + '…';
}

/**
 * Get main agent icon based on status.
 */
function getMainAgentIcon(status: 'running' | 'completed' | 'error' | 'idle'): string {
  switch (status) {
    case 'running':
      return '◉';
    case 'completed':
      return '✓';
    case 'error':
      return '✗';
    default:
      return '○';
  }
}

describe('SubagentTreePanel helpers', () => {
  describe('getStatusIcon', () => {
    test('returns spinner for running status', () => {
      expect(getStatusIcon('running')).toBe('◐');
    });

    test('returns checkmark for completed status', () => {
      expect(getStatusIcon('completed')).toBe('✓');
    });

    test('returns X for error status', () => {
      expect(getStatusIcon('error')).toBe('✗');
    });

    test('returns circle for unknown status', () => {
      expect(getStatusIcon('unknown' as SubagentStatus)).toBe('○');
    });
  });

  describe('formatDuration', () => {
    test('returns empty string for undefined', () => {
      expect(formatDuration(undefined)).toBe('');
    });

    test('returns milliseconds for < 1000ms', () => {
      expect(formatDuration(500)).toBe('500ms');
      expect(formatDuration(0)).toBe('0ms');
      expect(formatDuration(999)).toBe('999ms');
    });

    test('returns seconds for >= 1000ms and < 60s', () => {
      expect(formatDuration(1000)).toBe('1s');
      expect(formatDuration(5000)).toBe('5s');
      expect(formatDuration(59999)).toBe('59s');
    });

    test('returns minutes and seconds for >= 60s', () => {
      expect(formatDuration(60000)).toBe('1m 0s');
      expect(formatDuration(90000)).toBe('1m 30s');
      expect(formatDuration(3661000)).toBe('61m 1s');
    });
  });

  describe('truncateText', () => {
    test('returns original text if within maxWidth', () => {
      expect(truncateText('hello', 10)).toBe('hello');
      expect(truncateText('hello', 5)).toBe('hello');
    });

    test('truncates and adds ellipsis for long text', () => {
      expect(truncateText('hello world', 8)).toBe('hello w…');
      expect(truncateText('hello world', 6)).toBe('hello…');
    });

    test('handles very small maxWidth', () => {
      expect(truncateText('hello', 3)).toBe('hel');
      expect(truncateText('hello', 2)).toBe('he');
      expect(truncateText('hello', 1)).toBe('h');
    });

    test('handles empty string', () => {
      expect(truncateText('', 10)).toBe('');
    });

    test('handles maxWidth of 4 (minimum for ellipsis)', () => {
      expect(truncateText('hello', 4)).toBe('hel…');
    });
  });

  describe('getMainAgentIcon', () => {
    test('returns filled circle for running', () => {
      expect(getMainAgentIcon('running')).toBe('◉');
    });

    test('returns checkmark for completed', () => {
      expect(getMainAgentIcon('completed')).toBe('✓');
    });

    test('returns X for error', () => {
      expect(getMainAgentIcon('error')).toBe('✗');
    });

    test('returns empty circle for idle', () => {
      expect(getMainAgentIcon('idle')).toBe('○');
    });
  });
});

describe('SubagentTreePanel selection logic', () => {
  /**
   * Check if task root is selected.
   * Mirrors the logic in SubagentTreePanel for determining if the root node is selected.
   */
  function isTaskRootSelected(
    selectedId: string | undefined,
    currentTaskId: string | undefined
  ): boolean {
    return selectedId === currentTaskId || selectedId === 'main';
  }

  test('returns true when selectedId matches currentTaskId', () => {
    expect(isTaskRootSelected('task-123', 'task-123')).toBe(true);
  });

  test('returns true when selectedId is "main" (backwards compat)', () => {
    expect(isTaskRootSelected('main', 'task-123')).toBe(true);
    expect(isTaskRootSelected('main', undefined)).toBe(true);
  });

  test('returns false when selectedId is a subagent ID', () => {
    expect(isTaskRootSelected('subagent_123_abc', 'task-123')).toBe(false);
  });

  test('returns false when selectedId is undefined', () => {
    expect(isTaskRootSelected(undefined, 'task-123')).toBe(false);
  });

  test('returns true when both are undefined (undefined === undefined)', () => {
    // Note: In JavaScript, undefined === undefined is true
    // This is actually correct behavior - if no task and no selection, root is "selected"
    expect(isTaskRootSelected(undefined, undefined)).toBe(true);
  });
});

describe('Task tool name detection', () => {
  /**
   * Check if a tool name matches "Task" (case-insensitive).
   * Mirrors the isTaskToolInvocation logic in parser.ts.
   */
  function isTaskTool(toolName: string | undefined | null): boolean {
    return typeof toolName === 'string' && toolName.toLowerCase() === 'task';
  }

  test('detects "Task" (Claude format)', () => {
    expect(isTaskTool('Task')).toBe(true);
  });

  test('detects "task" (OpenCode format)', () => {
    expect(isTaskTool('task')).toBe(true);
  });

  test('detects "TASK" (uppercase)', () => {
    expect(isTaskTool('TASK')).toBe(true);
  });

  test('detects "TaSk" (mixed case)', () => {
    expect(isTaskTool('TaSk')).toBe(true);
  });

  test('rejects undefined', () => {
    expect(isTaskTool(undefined)).toBe(false);
  });

  test('rejects null', () => {
    expect(isTaskTool(null)).toBe(false);
  });

  test('rejects other tool names', () => {
    expect(isTaskTool('Bash')).toBe(false);
    expect(isTaskTool('Read')).toBe(false);
    expect(isTaskTool('Write')).toBe(false);
  });
});

describe('SubagentTreePanel navigation', () => {
  interface SubagentTreeNode {
    state: { id: string };
    children: SubagentTreeNode[];
  }

  /**
   * Build a flat list of node IDs for keyboard navigation.
   * Mirrors the navigateSubagentTree logic in RunApp.
   */
  function buildFlatList(
    rootNodeId: string,
    tree: SubagentTreeNode[]
  ): string[] {
    const flatList: string[] = [rootNodeId];

    function traverse(nodes: SubagentTreeNode[]) {
      for (const node of nodes) {
        flatList.push(node.state.id);
        traverse(node.children);
      }
    }
    traverse(tree);

    return flatList;
  }

  test('returns only root when tree is empty', () => {
    expect(buildFlatList('task-1', [])).toEqual(['task-1']);
  });

  test('includes all nodes in depth-first order', () => {
    const tree: SubagentTreeNode[] = [
      {
        state: { id: 'sub-1' },
        children: [
          { state: { id: 'sub-1-1' }, children: [] },
          { state: { id: 'sub-1-2' }, children: [] },
        ],
      },
      { state: { id: 'sub-2' }, children: [] },
    ];
    expect(buildFlatList('task-1', tree)).toEqual([
      'task-1',
      'sub-1',
      'sub-1-1',
      'sub-1-2',
      'sub-2',
    ]);
  });

  test('handles deeply nested tree', () => {
    const tree: SubagentTreeNode[] = [
      {
        state: { id: 'a' },
        children: [
          {
            state: { id: 'b' },
            children: [
              {
                state: { id: 'c' },
                children: [{ state: { id: 'd' }, children: [] }],
              },
            ],
          },
        ],
      },
    ];
    expect(buildFlatList('root', tree)).toEqual(['root', 'a', 'b', 'c', 'd']);
  });

  /**
   * Navigate through the flat list.
   */
  function navigate(
    flatList: string[],
    currentId: string,
    direction: 1 | -1
  ): string {
    const currentIdx = flatList.indexOf(currentId);
    if (currentIdx === -1) return flatList[0] || currentId;
    const newIdx = Math.max(0, Math.min(flatList.length - 1, currentIdx + direction));
    return flatList[newIdx]!;
  }

  test('navigates down through list', () => {
    const list = ['root', 'a', 'b', 'c'];
    expect(navigate(list, 'root', 1)).toBe('a');
    expect(navigate(list, 'a', 1)).toBe('b');
    expect(navigate(list, 'b', 1)).toBe('c');
  });

  test('navigates up through list', () => {
    const list = ['root', 'a', 'b', 'c'];
    expect(navigate(list, 'c', -1)).toBe('b');
    expect(navigate(list, 'b', -1)).toBe('a');
    expect(navigate(list, 'a', -1)).toBe('root');
  });

  test('clamps at boundaries', () => {
    const list = ['root', 'a', 'b'];
    expect(navigate(list, 'root', -1)).toBe('root'); // Can't go before first
    expect(navigate(list, 'b', 1)).toBe('b'); // Can't go after last
  });

  test('handles unknown current ID', () => {
    const list = ['root', 'a', 'b'];
    expect(navigate(list, 'unknown', 1)).toBe('root');
  });
});
