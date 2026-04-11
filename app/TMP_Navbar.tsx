import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/contexts/app-theme-context';
import { apiJson } from '@/lib/api';
import { loadNotifications, type AppNotification } from '@/lib/social';
import type { Quest, SideQuestActivity, TripEvent } from '@/lib/types';

export default function TmpNavbarScreen() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [activityFeed, setActivityFeed] = useState<SideQuestActivity[]>([]);
  const [tripEvents, setTripEvents] = useState<TripEvent[]>([]);
  const [error, setError] = useState('');

  const loadAlerts = useCallback(() => {
    let active = true;

    void Promise.all([
      loadNotifications(),
      apiJson<Quest[]>('/api/trips'),
      apiJson<TripEvent[]>('/api/trips/events/me').catch(() => [] as TripEvent[]),
    ])
      .then(async ([storedNotifications, quests, events]) => {
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
        setNotifications(storedNotifications);
        setTripEvents(Array.isArray(events) ? events : []);
        setActivityFeed(
          activityGroups
            .flat()
            .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
            .slice(0, 20),
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
    const derived = activityFeed.map((item) => ({
      id: `upcoming-${item.id}`,
      type: 'upcoming_sidequest' as const,
      title: item.visibility === 'hidden' ? 'Hidden' : item.title ?? 'Upcoming SideQuest',
      body: item.ownerName
        ? `${item.ownerName} added this for ${formatDate(item.date)}${item.time ? ` at ${item.time}` : ''}`
        : `Added for ${formatDate(item.date)}${item.time ? ` at ${item.time}` : ''}`,
      createdAt: item.createdAt,
      tripId: item.tripId,
      sideQuestId: item.id,
      pushReady: false,
    }));

    const joinedEvents = tripEvents.map((event) => ({
      id: `event-${event.id}`,
      type: 'chat_member_joined' as const,
      title: event.tripTitle ?? 'Adventure',
      body: event.type === 'member_left'
        ? `${event.actorName} left the adventure.`
        : `${event.actorName} joined the adventure!`,
      createdAt: event.createdAt,
      tripId: event.tripId,
      sideQuestId: undefined as string | undefined,
      pushReady: false,
    }));

    return [...joinedEvents, ...notifications, ...derived]
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
      .slice(0, 20);
  }, [activityFeed, notifications, tripEvents]);

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
        {feed.length > 0 ? (
          feed.map((item) => (
            <TouchableOpacity
              key={item.id}
              activeOpacity={item.tripId ? 0.84 : 1}
              disabled={!item.tripId}
              style={styles.feedRow}
              onPress={() => {
                if (!item.tripId) return;
                if (item.sideQuestId) {
                  router.push(`/trip/${item.tripId}/sidequest/${item.sideQuestId}`);
                  return;
                }
                router.push(`/trip/${item.tripId}`);
              }}>
              <View style={[styles.feedIcon, { backgroundColor: item.type === 'chat_message' ? theme.primary : item.type === 'chat_member_joined' ? theme.secondary : '#d79a19' }]}>
                <Ionicons
                  name={item.type === 'chat_message' ? 'chatbubble-outline' : item.type === 'chat_member_joined' ? 'person-add-outline' : 'calendar-outline'}
                  size={16}
                  color="#fff"
                />
              </View>
              <View style={styles.feedCopy}>
                <Text style={styles.feedTitle}>{item.title}</Text>
                <Text style={styles.feedBody}>{item.body}</Text>
                <Text style={styles.feedMeta}>{formatTimestamp(item.createdAt)}</Text>
              </View>
            </TouchableOpacity>
          ))
        ) : (
          <Text style={styles.emptyText}>No activity yet. Add SideQuests or chat in a trip to fill this feed.</Text>
        )}
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </ScrollView>
  );
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(`${value}T12:00:00`));
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
