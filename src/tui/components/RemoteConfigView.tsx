/**
 * ABOUTME: Remote config viewer component for displaying a remote instance's configuration.
 * Shows the remote's global and/or project config in read-only mode.
 * Provides option to push local config to the remote.
 */

import type { ReactNode } from 'react';
import { useState, useCallback, useEffect } from 'react';
import { useKeyboard } from '@opentui/react';
import { colors } from '../theme.js';

/**
 * Remote config data returned from checkConfig
 */
export interface RemoteConfigData {
  globalExists: boolean;
  projectExists: boolean;
  globalPath?: string;
  projectPath?: string;
  globalContent?: string;
  projectContent?: string;
  remoteCwd?: string;
}

/**
 * Props for the RemoteConfigView component
 */
export interface RemoteConfigViewProps {
  /** Whether the view is visible */
  visible: boolean;
  /** Remote alias/name for display */
  remoteAlias: string;
  /** Config data from the remote (null while loading) */
  configData: RemoteConfigData | null;
  /** Whether config is currently loading */
  loading: boolean;
  /** Error message if fetch failed */
  error?: string;
  /** Callback when view should close */
  onClose: () => void;
  /** Callback to push local config to remote */
  onPushConfig?: (scope: 'global' | 'project') => void;
}

/**
 * RemoteConfigView - displays a remote instance's configuration read-only
 */
export function RemoteConfigView({
  visible,
  remoteAlias,
  configData,
  loading,
  error,
  onClose,
  onPushConfig,
}: RemoteConfigViewProps): ReactNode {
  // Tab state: 'global' or 'project'
  const [activeTab, setActiveTab] = useState<'global' | 'project'>('global');
  // Scroll offset for content
  const [scrollOffset, setScrollOffset] = useState(0);

  // Reset state when opening
  useEffect(() => {
    if (visible) {
      setScrollOffset(0);
      // Default to whichever config exists
      if (configData) {
        if (configData.globalExists) {
          setActiveTab('global');
        } else if (configData.projectExists) {
          setActiveTab('project');
        }
      }
    }
  }, [visible, configData]);

  // Handle keyboard input
  useKeyboard(
    useCallback(
      (key) => {
        if (!visible) return;

        switch (key.name) {
          case 'escape':
          case 'q':
            onClose();
            break;

          case 'tab':
            // Toggle between global and project tabs
            if (configData?.globalExists && configData?.projectExists) {
              setActiveTab((prev) => (prev === 'global' ? 'project' : 'global'));
              setScrollOffset(0);
            }
            break;

          case 'j':
          case 'down':
            setScrollOffset((prev) => prev + 1);
            break;

          case 'k':
          case 'up':
            setScrollOffset((prev) => Math.max(0, prev - 1));
            break;

          case 'g':
            // Go to top
            setScrollOffset(0);
            break;

          case 'G':
            // Go to bottom (approximate - set high value)
            setScrollOffset(1000);
            break;

          case 'p':
            // Push config (if handler provided)
            if (onPushConfig) {
              onPushConfig(activeTab);
            }
            break;
        }
      },
      [visible, configData, activeTab, onClose, onPushConfig]
    )
  );

  if (!visible) return null;

  // Get current content based on active tab
  const currentContent = activeTab === 'global'
    ? configData?.globalContent
    : configData?.projectContent;
  const currentPath = activeTab === 'global'
    ? configData?.globalPath
    : configData?.projectPath;
  const currentExists = activeTab === 'global'
    ? configData?.globalExists
    : configData?.projectExists;

  // Split content into lines for display
  const contentLines = currentContent?.split('\n') ?? [];
  const visibleLines = contentLines.slice(scrollOffset, scrollOffset + 20);
  const canScrollDown = scrollOffset + 20 < contentLines.length;
  const canScrollUp = scrollOffset > 0;

  return (
    <box
      style={{
        position: 'absolute',
        top: 2,
        left: 4,
        right: 4,
        bottom: 2,
        backgroundColor: colors.bg.secondary,
        border: true,
        borderColor: colors.border.normal,
        flexDirection: 'column',
        padding: 1,
      }}
    >
      {/* Header */}
      <box style={{ flexDirection: 'row', marginBottom: 1 }}>
        <text fg={colors.fg.primary}>
          ⚙ Config: {remoteAlias}
        </text>
        <text fg={colors.fg.muted}> (read-only)</text>
      </box>

      {/* Loading state */}
      {loading && (
        <box style={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center' }}>
          <text fg={colors.fg.muted}>Loading configuration...</text>
        </box>
      )}

      {/* Error state */}
      {error && !loading && (
        <box style={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center' }}>
          <text fg={colors.status.error}>Error: {error}</text>
        </box>
      )}

      {/* Config content */}
      {!loading && !error && configData && (
        <>
          {/* Tab bar (if both configs exist) */}
          {configData.globalExists && configData.projectExists && (
            <box style={{ flexDirection: 'row', marginBottom: 1 }}>
              <box
                style={{
                  paddingLeft: 1,
                  paddingRight: 1,
                  backgroundColor: activeTab === 'global' ? colors.bg.tertiary : undefined,
                  border: activeTab === 'global',
                  borderColor: colors.accent.primary,
                }}
              >
                <text fg={activeTab === 'global' ? colors.accent.primary : colors.fg.muted}>
                  Global
                </text>
              </box>
              <text fg={colors.fg.muted}> </text>
              <box
                style={{
                  paddingLeft: 1,
                  paddingRight: 1,
                  backgroundColor: activeTab === 'project' ? colors.bg.tertiary : undefined,
                  border: activeTab === 'project',
                  borderColor: colors.accent.primary,
                }}
              >
                <text fg={activeTab === 'project' ? colors.accent.primary : colors.fg.muted}>
                  Project
                </text>
              </box>
              <text fg={colors.fg.muted}> (Tab to switch)</text>
            </box>
          )}

          {/* Config path */}
          {currentPath && (
            <box style={{ marginBottom: 1 }}>
              <text fg={colors.fg.muted}>Path: {currentPath}</text>
            </box>
          )}

          {/* Remote CWD */}
          {configData.remoteCwd && (
            <box style={{ marginBottom: 1 }}>
              <text fg={colors.fg.muted}>Remote CWD: {configData.remoteCwd}</text>
            </box>
          )}

          {/* Config content area */}
          <box
            style={{
              flexGrow: 1,
              border: true,
              borderColor: colors.border.muted,
              backgroundColor: colors.bg.primary,
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {!currentExists ? (
              <box style={{ padding: 1 }}>
                <text fg={colors.fg.muted}>
                  No {activeTab} config exists on this remote.
                </text>
              </box>
            ) : !currentContent ? (
              <box style={{ padding: 1 }}>
                <text fg={colors.fg.muted}>Config file is empty.</text>
              </box>
            ) : (
              <>
                {/* Scroll indicator (top) */}
                {canScrollUp && (
                  <text fg={colors.fg.muted}>  ↑ more above (k/↑ to scroll)</text>
                )}

                {/* Content lines */}
                {visibleLines.map((line, idx) => (
                  <text key={idx} fg={colors.fg.secondary}>
                    {formatConfigLine(line)}
                  </text>
                ))}

                {/* Scroll indicator (bottom) */}
                {canScrollDown && (
                  <text fg={colors.fg.muted}>  ↓ more below (j/↓ to scroll)</text>
                )}
              </>
            )}
          </box>
        </>
      )}

      {/* No config at all */}
      {!loading && !error && configData && !configData.globalExists && !configData.projectExists && (
        <box style={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center' }}>
          <text fg={colors.fg.muted}>No configuration found on this remote.</text>
        </box>
      )}

      {/* Footer with controls */}
      <box style={{ marginTop: 1, flexDirection: 'row' }}>
        <text fg={colors.fg.muted}>
          [q/Esc] Close
          {configData?.globalExists && configData?.projectExists && '  [Tab] Switch'}
          {'  [j/k] Scroll'}
          {onPushConfig && '  [p] Push local config'}
        </text>
      </box>
    </box>
  );
}

/**
 * Format a TOML config line with basic syntax highlighting
 */
function formatConfigLine(line: string): string {
  // Just return the line as-is for now
  // Could add TOML syntax highlighting later
  return '  ' + line;
}
