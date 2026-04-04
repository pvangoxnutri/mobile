import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiJson } from '@/lib/api';
import {
  getDefaultNotificationPreferences,
  loadNotificationPreferences,
  loadNotifications,
  saveNotificationPreferences,
  type AppNotification,
  type NotificationPreferences,
} from '@/lib/social';
import type { Quest, SideQuestActivity } from '@/lib/types';

export default function AlertsScreen() {
  const insets = useSafeAreaInsets();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [preferences, setPreferences] = useState<NotificationPreferences>(getDefaultNotificationPreferences());
  const [upcomingItems, setUpcomingItems] = useState<SideQuestActivity[]>([]);
  const [error, setError] = useState('');

  const loadAlerts = useCallback(() => {
    let active = true;

    void Promise.all([loadNotificationPreferences(), loadNotifications(), apiJson<Quest[]>('/api/trips')])
      .then(async ([prefs, storedNotifications, quests]) => {
        if (!active) return;

        const activityGroups = await Promise.all(
          (Array.isArray(quests) ? quests : []).map(async (trip) => {
            try {
              return await apiJson<SideQuestActivity[]>(`/api/trips/${trip.id}/activities`);
            } catch {
              return [];
            }
          }),
        );

        if (!active) return;
        setPreferences(prefs);
        setNotifications(storedNotifications);
        setUpcomingItems(
          activityGroups
            .flat()
            .filter((item) => new Date(`${item.date}T12:00:00`).getTime() >= new Date().setHours(0, 0, 0, 0))
            .sort((left, right) => new Date(`${left.date}T12:00:00`).getTime() - new Date(`${right.date}T12:00:00`).getTime())
            .slice(0, 4),
        );
        setError('');
      })
      .catch((err: Error) => {
        if (!active) return;
        setError(err.message || 'Unable to load alerts.');
      });

    return () => {
      active = false;
    };
  }, []);

  useFocusEffect(loadAlerts);

  const feed = useMemo(() => {
    const derived = upcomingItems.map((item) => ({
      id: `upcoming-${item.id}`,
      type: 'upcoming_sidequest' as const,
      title: item.title ?? 'Upcoming SideQuest',
      body: `${formatDate(item.date)}${item.time ? ` at ${item.time}` : ''}`,
      createdAt: item.createdAt,
      tripId: item.tripId,
      pushReady: preferences.pushEnabled,
    }));

    return [...notifications, ...derived]
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
      .slice(0, 12);
  }, [notifications, preferences.pushEnabled, upcomingItems]);

  async function updatePreference<K extends keyof NotificationPreferences>(key: K, value: NotificationPreferences[K]) {
    const next = { ...preferences, [key]: value };
    setPreferences(next);
    await saveNotificationPreferences(next);
  }

  return (
    <ScrollView
      contentContainerStyle={[styles.screen, { paddingTop: Math.max(insets.top, 18) + 12, paddingBottom: Math.max(insets.bottom, 20) + 30 }]}
      showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>Alerts</Text>
      <Text style={styles.copy}>Prepared for push and group chat updates, with a live in-app feed you can already test.</Text>

      <View style={styles.settingsCard}>
        <Text style={styles.sectionTitle}>Notification settings</Text>
        <SettingRow
          icon="phone-portrait-outline"
          title="Push notifications"
          subtitle="Prepare alerts when someone sends a message."
          value={preferences.pushEnabled}
          onValueChange={(value) => void updatePreference('pushEnabled', value)}
        />
        <SettingRow
          icon="chatbubble-ellipses-outline"
          title="Chat messages"
          subtitle="Create in-app alerts for new group chat messages."
          value={preferences.chatMessages}
          onValueChange={(value) => void updatePreference('chatMessages', value)}
        />
        <SettingRow
          icon="people-outline"
          title="Chat joins"
          subtitle="Alert when someone joins a group chat."
          value={preferences.chatJoins}
          onValueChange={(value) => void updatePreference('chatJoins', value)}
        />
      </View>

      <View style={styles.feedCard}>
        <Text style={styles.sectionTitle}>Recent activity</Text>
        {feed.length > 0 ? (
          feed.map((item) => (
            <View key={item.id} style={styles.feedRow}>
              <View style={[styles.feedIcon, item.type === 'chat_message' ? styles.feedIconPink : item.type === 'chat_member_joined' ? styles.feedIconBlue : styles.feedIconGold]}>
                <Ionicons
                  name={item.type === 'chat_message' ? 'chatbubble-outline' : item.type === 'chat_member_joined' ? 'person-add-outline' : 'calendar-outline'}
                  size={16}
                  color="#fff"
                />
              </View>
              <View style={styles.feedCopy}>
                <Text style={styles.feedTitle}>{item.title}</Text>
                <Text style={styles.feedBody}>{item.body}</Text>
                <Text style={styles.feedMeta}>{item.pushReady ? 'Push ready' : 'In-app only'} • {formatTimestamp(item.createdAt)}</Text>
              </View>
            </View>
          ))
        ) : (
          <Text style={styles.emptyText}>No alerts yet. Open a trip chat or add more plans to see this fill up.</Text>
        )}
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </ScrollView>
  );
}

function SettingRow({
  icon,
  title,
  subtitle,
  value,
  onValueChange,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.settingRow}>
      <View style={styles.settingIcon}>
        <Ionicons name={icon} size={18} color="#ff4f74" />
      </View>
      <View style={styles.settingCopy}>
        <Text style={styles.settingTitle}>{title}</Text>
        <Text style={styles.settingSubtitle}>{subtitle}</Text>
      </View>
      <Switch value={value} onValueChange={onValueChange} trackColor={{ false: '#d8dde6', true: '#ffbdd0' }} thumbColor={value ? '#ff4f74' : '#fff'} />
    </View>
  );
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(`${value}T12:00:00`));
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 34,
    fontWeight: '900',
    color: '#121317',
    letterSpacing: -1.2,
  },
  copy: {
    marginTop: 10,
    fontSize: 16,
    color: '#737883',
    lineHeight: 24,
  },
  settingsCard: {
    marginTop: 22,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#ebeef3',
    backgroundColor: '#fff',
    padding: 18,
    gap: 14,
  },
  feedCard: {
    marginTop: 18,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#ebeef3',
    backgroundColor: '#fff',
    padding: 18,
  },
  sectionTitle: {
    color: '#171821',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 6,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff1f5',
    marginRight: 12,
  },
  settingCopy: {
    flex: 1,
    paddingRight: 12,
  },
  settingTitle: {
    color: '#171821',
    fontSize: 15,
    fontWeight: '700',
  },
  settingSubtitle: {
    marginTop: 2,
    color: '#7c8290',
    fontSize: 13,
    lineHeight: 18,
  },
  feedRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f3f6',
  },
  feedIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  feedIconPink: {
    backgroundColor: '#ff4f74',
  },
  feedIconBlue: {
    backgroundColor: '#0d90a8',
  },
  feedIconGold: {
    backgroundColor: '#d79a19',
  },
  feedCopy: {
    flex: 1,
  },
  feedTitle: {
    color: '#171821',
    fontSize: 15,
    fontWeight: '700',
  },
  feedBody: {
    marginTop: 3,
    color: '#6f7683',
    fontSize: 13,
    lineHeight: 19,
  },
  feedMeta: {
    marginTop: 4,
    color: '#9aa2ae',
    fontSize: 12,
    fontWeight: '700',
  },
  emptyText: {
    color: '#7c8290',
    fontSize: 15,
    marginTop: 8,
  },
  errorText: {
    marginTop: 14,
    color: '#d53d18',
    textAlign: 'center',
  },
});
