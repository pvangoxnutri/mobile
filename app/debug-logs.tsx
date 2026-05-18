// TEMPORARY: Diagnostic viewer for API/auth logs captured in-app on the
// iPhone preview build (Metro/Console.app don't connect to non-dev-client
// builds). Remove this screen and its route once the issue is resolved.

import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import * as Updates from 'expo-updates';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  clearDebugLogs,
  formatDebugLogEntry,
  formatDebugLogsAsText,
  getDebugLogs,
  subscribeDebugLogs,
  type DebugLogEntry,
} from '@/lib/debug-log-store';

function getBuildInfo() {
  const appVersion = Constants.expoConfig?.version ?? 'unknown';
  const iosBuild = Constants.expoConfig?.ios?.buildNumber;
  const androidVersionCode = Constants.expoConfig?.android?.versionCode;
  const nativeBuild = Platform.OS === 'ios' ? iosBuild : androidVersionCode?.toString();
  const runtimeVersion = Updates.runtimeVersion ?? 'unknown';
  const channel = Updates.channel ?? 'embedded';
  const updateId = Updates.updateId ?? 'embedded (no OTA loaded)';
  const createdAt = Updates.createdAt ? Updates.createdAt.toISOString() : 'n/a';
  const isEmbedded = Updates.isEmbeddedLaunch;
  return {
    appVersion,
    nativeBuild: nativeBuild ?? 'n/a',
    runtimeVersion,
    channel,
    updateId,
    createdAt,
    isEmbedded,
  };
}

function levelColor(level: DebugLogEntry['level']): string {
  switch (level) {
    case 'error':
      return '#d53d18';
    case 'warn':
      return '#c47b00';
    default:
      return '#1f2937';
  }
}

export default function DebugLogsScreen() {
  const insets = useSafeAreaInsets();
  const [entries, setEntries] = useState<DebugLogEntry[]>(() => getDebugLogs());
  const [copyState, setCopyState] = useState<'idle' | 'copying' | 'copied'>('idle');
  const buildInfo = getBuildInfo();

  useEffect(() => {
    return subscribeDebugLogs(() => {
      setEntries(getDebugLogs());
    });
  }, []);

  function formatPayload() {
    const header = [
      `app version: ${buildInfo.appVersion} (native build ${buildInfo.nativeBuild})`,
      `runtimeVersion: ${buildInfo.runtimeVersion}`,
      `channel: ${buildInfo.channel}`,
      `updateId: ${buildInfo.updateId}`,
      `update createdAt: ${buildInfo.createdAt}`,
      `isEmbeddedLaunch: ${buildInfo.isEmbedded}`,
      '',
    ].join('\n');
    return header + formatDebugLogsAsText();
  }

  async function handleCopy() {
    setCopyState('copying');
    try {
      await Clipboard.setStringAsync(formatPayload());
      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 1500);
    } catch {
      setCopyState('idle');
    }
  }

  async function handleShare() {
    try {
      await Share.share({ message: formatPayload() });
    } catch {
      // user dismissed
    }
  }

  function handleClear() {
    clearDebugLogs();
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.backButton}>
          <Ionicons name="chevron-back" size={26} color="#1f2937" />
        </TouchableOpacity>
        <View style={styles.headerTitleBlock}>
          <Text style={styles.title}>Debug Logs</Text>
          <Text style={styles.subtitle}>Temporary diagnostics · {entries.length} entries</Text>
        </View>
      </View>

      <View style={styles.buildCard}>
        <Text style={styles.buildLine} selectable>
          <Text style={styles.buildLabel}>App: </Text>
          {buildInfo.appVersion} (build {buildInfo.nativeBuild})
        </Text>
        <Text style={styles.buildLine} selectable>
          <Text style={styles.buildLabel}>Runtime: </Text>
          {buildInfo.runtimeVersion}
        </Text>
        <Text style={styles.buildLine} selectable>
          <Text style={styles.buildLabel}>Channel: </Text>
          {buildInfo.channel}
        </Text>
        <Text style={styles.buildLine} selectable>
          <Text style={styles.buildLabel}>Update: </Text>
          {buildInfo.updateId}
        </Text>
        <Text style={styles.buildLine} selectable>
          <Text style={styles.buildLabel}>Published: </Text>
          {buildInfo.createdAt}
        </Text>
        <Text style={styles.buildLine} selectable>
          <Text style={styles.buildLabel}>Embedded: </Text>
          {buildInfo.isEmbedded ? 'yes (no OTA applied)' : 'no (running OTA)'}
        </Text>
      </View>

      <View style={styles.actionsRow}>
        <TouchableOpacity style={[styles.actionButton, styles.actionPrimary]} onPress={() => void handleCopy()} activeOpacity={0.85}>
          {copyState === 'copying' ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Ionicons name="copy-outline" size={16} color="#fff" />
              <Text style={styles.actionPrimaryText}>{copyState === 'copied' ? 'Copied' : 'Copy logs'}</Text>
            </>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={() => void handleShare()} activeOpacity={0.85}>
          <Ionicons name="share-outline" size={16} color="#1f2937" />
          <Text style={styles.actionText}>Share</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={handleClear} activeOpacity={0.85}>
          <Ionicons name="trash-outline" size={16} color="#d53d18" />
          <Text style={[styles.actionText, { color: '#d53d18' }]}>Clear</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        {entries.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={32} color="#9aa0ac" />
            <Text style={styles.emptyText}>No logs yet. Trigger the failing flow, then return here.</Text>
          </View>
        ) : (
          entries
            .slice()
            .reverse()
            .map((entry) => (
              <View key={entry.id} style={[styles.row, { borderLeftColor: levelColor(entry.level) }]}>
                <Text style={[styles.rowText, { color: levelColor(entry.level) }]} selectable>
                  {formatDebugLogEntry(entry)}
                </Text>
              </View>
            ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  backButton: {
    paddingRight: 8,
  },
  headerTitleBlock: {
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1f2937',
  },
  subtitle: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  buildCard: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e5e7eb',
    gap: 2,
  },
  buildLine: {
    fontSize: 11,
    color: '#1f2937',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  buildLabel: {
    fontWeight: '700',
    color: '#6b7280',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
  },
  actionPrimary: {
    backgroundColor: '#10a6c0',
  },
  actionText: {
    fontSize: 13,
    color: '#1f2937',
    fontWeight: '600',
  },
  actionPrimaryText: {
    fontSize: 13,
    color: '#fff',
    fontWeight: '600',
  },
  list: {
    flex: 1,
    paddingHorizontal: 16,
  },
  row: {
    paddingVertical: 6,
    paddingLeft: 10,
    borderLeftWidth: 3,
    marginBottom: 4,
  },
  rowText: {
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    paddingHorizontal: 32,
  },
});

