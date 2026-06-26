import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import type { Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getCached, setCached } from '@/lib/cache';
import { loadNotifications, markNotificationsAsRead, type AppNotification } from '@/lib/social';
import { PRIMARY_COLOR, SECONDARY_COLOR } from '@/constants/colors';

const ICON_BY_TYPE: Record<AppNotification['type'], { name: keyof typeof Ionicons.glyphMap; background: string }> = {
  member_joined: { name: 'person-add-outline', background: SECONDARY_COLOR },
  new_activity: { name: 'calendar-outline', background: '#d79a19' },
  new_hidden_sidequest: { name: 'lock-closed-outline', background: '#d79a19' },
  sidequest_revealed: { name: 'gift-outline', background: '#d79a19' },
  chat: { name: 'chatbubble-outline', background: PRIMARY_COLOR },
  expense: { name: 'cash-outline', background: '#2f9e6f' },
};

const NOTIFICATIONS_CACHE_KEY = '/api/notifications';

export default function TmpNavbarScreen() {
  const insets = useSafeAreaInsets();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [error, setError] = useState('');

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
          notifications.map((item) => {
            const icon = ICON_BY_TYPE[item.type];
            return (
              <TouchableOpacity
                key={item.id}
                activeOpacity={item.route ? 0.84 : 1}
                disabled={!item.route}
                style={styles.feedRow}
                onPress={() => {
                  void markNotificationsAsRead();
                  if (item.route) router.push(item.route as Href);
                }}>
                <View style={[styles.feedIcon, { backgroundColor: icon?.background ?? '#9aa2ae' }]}>
                  <Ionicons name={icon?.name ?? 'notifications-outline'} size={16} color="#fff" />
                </View>
                <View style={styles.feedCopy}>
                  <Text style={styles.feedTitle}>{item.title}</Text>
                  <Text style={styles.feedBody}>{item.body}</Text>
                  <Text style={styles.feedMeta}>{formatTimestamp(item.createdAt)}</Text>
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

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
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
