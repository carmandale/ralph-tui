/**
 * ABOUTME: SubagentTreePanel component for displaying subagent hierarchy in a dedicated panel.
 * Shows a tree structure of spawned subagents with status icons, descriptions, and durations.
 * Supports highlighting the currently active subagent and auto-scrolling to newest activity.
 */

import type { ReactNode } from 'react';
import { useRef, useEffect } from 'react';
import { colors } from '../theme.js';
import type { SubagentTreeNode } from '../../engine/types.js';
import type { EngineSubagentStatus } from '../../engine/types.js';

/**
 * Status icon for subagent based on its completion state.
 * - running: spinner (◐ animated feel)
 * - completed: checkmark (✓)
 * - error: X (✗)
 */
function getStatusIcon(status: EngineSubagentStatus): string {
  switch (status) {
    case 'running':
      return '◐'; // Spinner/running indicator
    case 'completed':
      return '✓'; // Checkmark
    case 'error':
      return '✗'; // X for failure
    default:
      return '○'; // Default circle
  }
}

/**
 * Status color for subagent based on its completion state.
 */
function getStatusColor(status: EngineSubagentStatus): string {
  switch (status) {
    case 'running':
      return colors.status.info;
    case 'completed':
      return colors.status.success;
    case 'error':
      return colors.status.error;
    default:
      return colors.fg.muted;
  }
}

/**
 * Format duration in human-readable format.
 * Shows milliseconds for short durations, seconds for longer ones.
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
 * Adds ellipsis if text is truncated.
 */
function truncateText(text: string, maxWidth: number): string {
  if (text.length <= maxWidth) return text;
  if (maxWidth <= 3) return text.slice(0, maxWidth);
  return text.slice(0, maxWidth - 1) + '…';
}

/**
 * Props for a single SubagentTreeRow component.
 */
interface SubagentTreeRowProps {
  /** The subagent tree node to render */
  node: SubagentTreeNode;
  /** ID of the currently active (running) subagent for highlighting */
  activeSubagentId?: string;
  /** Maximum width for the row content (for truncation) */
  maxWidth: number;
  /** Currently selected node ID (for keyboard navigation) */
  selectedId?: string | 'main';
  /** Whether the panel has keyboard focus (affects selection styling) */
  isFocused?: boolean;
}

/**
 * Renders a single row in the subagent tree.
 * Format: [indent][status icon] [agent type] description [duration]
 * Highlights based on: selection state with focus-aware styling
 */
function SubagentTreeRow({
  node,
  activeSubagentId,
  maxWidth,
  selectedId,
  isFocused = false,
}: SubagentTreeRowProps): ReactNode {
  const { state } = node;
  const isSelected = selectedId === state.id;
  const isActive = state.id === activeSubagentId || state.status === 'running';
  // Show selection highlight when selected, show active indicator for running nodes
  const showSelectionHighlight = isSelected;
  const showActiveIndicator = !isSelected && isActive;
  const statusIcon = getStatusIcon(state.status);
  const statusColor = getStatusColor(state.status);

  // Indentation: 2 spaces per depth level (depth starts at 1 for top-level)
  const indentLevel = Math.max(0, state.depth - 1);
  const indent = '  '.repeat(indentLevel);

  // Calculate available width for description
  // Format: [indent][icon] [Type] description [duration]
  // icon=1, space=1, type brackets and content, space=1, duration with brackets
  const typeDisplay = `[${state.type}]`;
  const durationStr = state.durationMs !== undefined ? ` [${formatDuration(state.durationMs)}]` : '';
  const fixedWidth = indent.length + 2 + typeDisplay.length + 1 + durationStr.length;
  const descriptionWidth = Math.max(5, maxWidth - fixedWidth);
  const truncatedDescription = truncateText(state.description, descriptionWidth);

  // Determine background color based on selection and focus state
  // - Selected + focused: bright highlight
  // - Selected + unfocused: muted highlight (still visible but dimmed)
  // - Active (running): subtle highlight
  // - Default: transparent
  let bgColor = 'transparent';
  if (showSelectionHighlight) {
    bgColor = isFocused ? colors.bg.highlight : colors.bg.tertiary;
  } else if (showActiveIndicator) {
    bgColor = colors.bg.secondary;
  }

  // Text color: brighter when selected and focused
  const textColor = showSelectionHighlight && isFocused
    ? colors.fg.primary
    : showSelectionHighlight
      ? colors.fg.secondary
      : colors.fg.secondary;

  return (
    <box
      style={{
        width: '100%',
        flexDirection: 'row',
        paddingLeft: 1,
        paddingRight: 1,
        backgroundColor: bgColor,
      }}
    >
      <text>
        <span fg={colors.fg.dim}>{indent}</span>
        <span fg={statusColor}>{statusIcon}</span>
        <span fg={colors.accent.tertiary}> {typeDisplay}</span>
        <span fg={textColor}> {truncatedDescription}</span>
        {durationStr && <span fg={colors.fg.muted}>{durationStr}</span>}
      </text>
    </box>
  );
}

/**
 * Recursively render a subagent tree node and its children.
 */
function SubagentTreeNodeRows({
  node,
  activeSubagentId,
  maxWidth,
  selectedId,
  isFocused,
}: SubagentTreeRowProps): ReactNode {
  return (
    <>
      <SubagentTreeRow
        node={node}
        activeSubagentId={activeSubagentId}
        maxWidth={maxWidth}
        selectedId={selectedId}
        isFocused={isFocused}
      />
      {node.children.map((child) => (
        <SubagentTreeNodeRows
          key={child.state.id}
          node={child}
          activeSubagentId={activeSubagentId}
          maxWidth={maxWidth}
          selectedId={selectedId}
          isFocused={isFocused}
        />
      ))}
    </>
  );
}

/**
 * Props for the SubagentTreePanel component.
 */
export interface SubagentTreePanelProps {
  /** Array of root-level subagent tree nodes */
  tree: SubagentTreeNode[];
  /** ID of the currently active (running) subagent for highlighting */
  activeSubagentId?: string;
  /** Panel width for truncation calculations */
  width?: number;
  /** Current task ID (shown as root node, prep for parallel execution) */
  currentTaskId?: string;
  /** Current task title (shown as root node label) */
  currentTaskTitle?: string;
  /** Current task status for display icon */
  currentTaskStatus?: 'running' | 'completed' | 'error' | 'idle';
  /** Currently selected node ID (for keyboard navigation) - taskId for root, subagent ID for children */
  selectedId?: string;
  /** Callback when a node is selected */
  onSelect?: (id: string) => void;
  /** Whether this panel currently has keyboard focus (TAB navigation) */
  isFocused?: boolean;
}

/**
 * Find the ID of the most recently active (running) subagent in the tree.
 * Traverses depth-first and returns the last running subagent found.
 */
function findActiveSubagentId(nodes: SubagentTreeNode[]): string | undefined {
  let activeId: string | undefined;

  function traverse(node: SubagentTreeNode): void {
    if (node.state.status === 'running') {
      activeId = node.state.id;
    }
    for (const child of node.children) {
      traverse(child);
    }
  }

  for (const node of nodes) {
    traverse(node);
  }

  return activeId;
}

/**
 * Count total number of subagents in the tree (for display).
 */
function countSubagents(nodes: SubagentTreeNode[]): number {
  let count = 0;

  function traverse(node: SubagentTreeNode): void {
    count++;
    for (const child of node.children) {
      traverse(child);
    }
  }

  for (const node of nodes) {
    traverse(node);
  }

  return count;
}

/**
 * Get status icon for main agent.
 */
function getMainAgentIcon(status: 'running' | 'completed' | 'error' | 'idle'): string {
  switch (status) {
    case 'running':
      return '◉'; // Filled circle for main agent running
    case 'completed':
      return '✓';
    case 'error':
      return '✗';
    default:
      return '○';
  }
}

/**
 * Get status color for main agent.
 */
function getMainAgentColor(status: 'running' | 'completed' | 'error' | 'idle'): string {
  switch (status) {
    case 'running':
      return colors.accent.primary;
    case 'completed':
      return colors.status.success;
    case 'error':
      return colors.status.error;
    default:
      return colors.fg.muted;
  }
}

/**
 * SubagentTreePanel component showing a dedicated panel with subagent hierarchy.
 * Displays: main agent at root, subagents as children with types, descriptions, status icons, durations.
 * Features: indented nested subagents, highlighted active/selected nodes, auto-scroll.
 */
export function SubagentTreePanel({
  tree,
  activeSubagentId,
  width = 45,
  currentTaskId,
  currentTaskTitle,
  currentTaskStatus = 'running',
  selectedId,
  onSelect: _onSelect, // Reserved for future keyboard navigation
  isFocused = false,
}: SubagentTreePanelProps): ReactNode {
  // Calculate max width for row content (panel width minus padding and border)
  const maxRowWidth = Math.max(20, width - 4);

  // Auto-detect active subagent if not provided
  const effectiveActiveId = activeSubagentId ?? findActiveSubagentId(tree);

  // Count subagents for title
  const totalSubagents = countSubagents(tree);
  const runningCount = tree.reduce((acc, node) => {
    let count = 0;
    function countRunning(n: SubagentTreeNode): void {
      if (n.state.status === 'running') count++;
      n.children.forEach(countRunning);
    }
    countRunning(node);
    return acc + count;
  }, 0);

  // Build title with counts
  const title = runningCount > 0
    ? `Agent Tree (${runningCount} active)`
    : totalSubagents > 0
      ? `Agent Tree (${totalSubagents})`
      : 'Agent Tree';

  // Use a ref for auto-scroll behavior
  // Note: In @opentui/react, scrollbox auto-scrolls when content exceeds height
  // We track the previous tree length to detect new subagents
  const prevTreeLengthRef = useRef(totalSubagents);

  useEffect(() => {
    // When new subagents are added, the scrollbox should auto-scroll
    // This is handled automatically by the scrollbox component when content grows
    prevTreeLengthRef.current = totalSubagents;
  }, [totalSubagents]);

  // Determine if task root is selected (selectedId matches currentTaskId or 'main' for backwards compat)
  const isTaskRootSelected = selectedId === currentTaskId || selectedId === 'main';
  const taskIcon = getMainAgentIcon(currentTaskStatus);
  const taskColor = getMainAgentColor(currentTaskStatus);

  // Determine border color based on focus state
  // Simple: focused = accent, not focused = normal
  const borderColor = isFocused ? colors.accent.primary : colors.border.normal;

  return (
    <box
      title={title}
      style={{
        flexGrow: 1,
        flexShrink: 1,
        minWidth: 30,
        maxWidth: 50,
        flexDirection: 'column',
        backgroundColor: colors.bg.primary,
        border: true,
        borderColor,
      }}
    >
      <scrollbox
        style={{
          flexGrow: 1,
          width: '100%',
        }}
      >
        {/* Task root node - shows task ID and title */}
        <box
          style={{
            width: '100%',
            flexDirection: 'row',
            paddingLeft: 1,
            paddingRight: 1,
            backgroundColor: isTaskRootSelected
              ? (isFocused ? colors.bg.highlight : colors.bg.tertiary)
              : 'transparent',
          }}
        >
          <text>
            <span fg={taskColor}>{taskIcon}</span>
            <span fg={isTaskRootSelected && isFocused ? colors.fg.primary : colors.accent.primary}>
              {' '}{currentTaskId || 'Task'}
            </span>
            {currentTaskTitle && (
              <span fg={colors.fg.secondary}> {truncateText(currentTaskTitle, Math.max(0, maxRowWidth - (currentTaskId?.length || 4) - 10))}</span>
            )}
            {tree.length > 0 && <span fg={colors.fg.muted}> ({tree.length})</span>}
          </text>
        </box>

        {/* Subagents as children */}
        {tree.length === 0 ? (
          <box style={{ paddingLeft: 3 }}>
            <text fg={colors.fg.muted}>└─ No subagents</text>
          </box>
        ) : (
          tree.map((node) => (
            <SubagentTreeNodeRows
              key={node.state.id}
              node={{
                ...node,
                state: {
                  ...node.state,
                  // Increase depth by 1 since main agent is at depth 0
                  depth: node.state.depth + 1,
                },
              }}
              activeSubagentId={effectiveActiveId}
              maxWidth={maxRowWidth}
              selectedId={selectedId}
              isFocused={isFocused}
            />
          ))
        )}
      </scrollbox>
    </box>
  );
}
