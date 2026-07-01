import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import type { Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Avatar, { getInitials } from '@/components/avatar';
import { getCached, setCached } from '@/lib/cache';
import { formatRelativeTime } from '@/lib/format-time';
import { loadNotifications, markNotificationsAsRead, type AppNotification } from '@/lib/social';
import { PRIMARY_COLOR, SECONDARY_COLOR } from '@/constants/colors';

// Mirrors Home Activity's avatar slot (app/(tabs)/index.tsx) — a circular
// 36px badge to the left of the row. Notifications don't always have one
// single knowable actor (e.g. a hidden SideQuest, or "5 new chat messages"),
// so this is a type icon rather than a person's photo, but the size,
// placement, and muted treatment for "identity withheld" rows match exactly.
const ICON_BY_TYPE: Record<AppNotification['type'], { name: keyof typeof Ionicons.glyphMap; background: string; color: string }> = {
  member_joined: { name: 'person-add-outline', background: SECONDARY_COLOR, color: '#fff' },
  new_activity: { name: 'calendar-outline', background: '#d79a19', color: '#fff' },
  new_hidden_sidequest: { name: 'lock-closed-outline', background: '#f4f5f7', color: '#8a909e' },
  sidequest_revealed: { name: 'gift-outline', background: '#d79a19', color: '#fff' },
  chat: { name: 'chatbubble-outline', background: PRIMARY_COLOR, color: '#fff' },
  expense: { name: 'cash-outline', background: '#2f9e6f', color: '#fff' },
  support_reply: { name: 'mail-outline', background: SECONDARY_COLOR, color: '#fff' },
};

const NOTIFICATIONS_CACHE_KEY = '/api/notifications';

export default function TmpNavbarScreen() {
  const insets = useSafeAreaInsets();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  // loadNotifications() itself never touches read state — it's a plain
  // fetch. The ONLY two triggers allowed to mark notifications as read are
  // (a) this screen gaining focus (opening the bell), handled below, and
  // (b) tapping a specific notification, handled in that row's onPress.
  const loadAlerts = useCallback(() => {
    let active = true;

    const cached = getCached<AppNotification[]>(NOTIFICATIONS_CACHE_KEY);
    if (cached) setNotifications(cached);

    void loadNotifications()
      .then((items) => {
        if (!active) return;
        setNotifications(items);
        setCached(NOTIFICATIONS_CACHE_KEY, items);
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

  useFocusEffect(
    useCallback(() => {
      // Opening the notification center clears the unread indicator. Fire
      // and forget — the TopAlertsButton in any tab refetches its unread
      // count next time that tab gains focus, so the dot vanishes on the
      // way back out.
      void markNotificationsAsRead();
      return loadAlerts();
    }, [loadAlerts]),
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.screen, { paddingTop: Math.max(insets.top, 18) + 8, paddingBottom: Math.max(insets.bottom, 20) + 28 }]}
      showsVerticalScrollIndicator={false}>
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.topButton} activeOpacity={0.84} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#161821" />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Notifications</Text>
        <View style={styles.topSpacer} />
      </View>

      <Text style={styles.copy}>Recent activity across your trips, SideQuests, and group chats.</Text>

      <View style={styles.feedCard}>
        <Text style={styles.sectionTitle}>All activity</Text>
        {notifications.length > 0 ? (
          notifications.map((item, index) => {
            const icon = ICON_BY_TYPE[item.type];
            return (
              <TouchableOpacity
                key={item.id}
                activeOpacity={item.route ? 0.84 : 1}
                disabled={!item.route}
                style={[styles.feedRow, index > 0 && styles.feedRowBorder]}
                onPress={() => {
                  void markNotificationsAsRead();
                  if (item.route) router.push(item.route as Href);
                }}>
                {item.actorName ? (
                  <Avatar uri={item.actorAvatarUrl} name={item.actorName} fallbackText={getInitials(item.actorName)} size={36} />
                ) : (
                  <View style={[styles.feedIcon, { backgroundColor: icon?.background ?? '#9aa2ae' }]}>
                    <Ionicons name={icon?.name ?? 'notifications-outline'} size={16} color={icon?.color ?? '#fff'} />
                  </View>
                )}
                <View style={styles.feedCopy}>
                  <Text style={styles.feedTitle} numberOfLines={2}>
                    <Text style={styles.feedTitleBold}>{item.title}</Text>
                    {item.body ? ` ${item.body}` : ''}
                  </Text>
                  <Text style={styles.feedMeta}>{formatRelativeTime(item.createdAt, now)}</Text>
                </View>
              </TouchableOpacity>
            );
          })
        ) : (
          <View>
            <Text style={styles.emptyText}>No notifications yet</Text>
            <Text style={styles.emptyBody}>Updates from your adventures will appear here.</Text>
          </View>
        )}
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  screen: {
    flexGrow: 1,
    backgroundColor: '#fff',
    paddingHorizontal: 20,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f6f8',
  },
  topTitle: {
    color: '#121317',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.9,
  },
  topSpacer: {
    width: 46,
    height: 46,
  },
  copy: {
    marginTop: 14,
    fontSize: 16,
    color: '#737883',
    lineHeight: 24,
  },
  feedCard: {
    marginTop: 22,
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
  // Row tokens below intentionally mirror Home Activity's activityRow /
  // activityAvatar / activityTextBlock / activityTitle / activityMeta (see
  // app/(tabs)/index.tsx) — same spacing, avatar size, typography scale, and
  // a top hairline border between rows instead of one under every row.
  feedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    gap: 10,
  },
  feedRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#eef0f4',
  },
  feedIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  feedCopy: {
    flex: 1,
    minWidth: 0,
  },
  feedTitle: {
    fontSize: 13,
    color: '#14161d',
    fontWeight: '500',
    lineHeight: 18,
  },
  feedTitleBold: {
    fontWeight: '800',
  },
  feedMeta: {
    fontSize: 11,
    color: '#8a909e',
    marginTop: 2,
  },
  emptyText: {
    color: '#171821',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 8,
  },
  emptyBody: {
    color: '#7c8290',
    fontSize: 14,
    marginTop: 4,
  },
  errorText: {
    marginTop: 14,
    color: '#d53d18',
    textAlign: 'center',
  },
});
