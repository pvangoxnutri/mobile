import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiJson } from '@/lib/api';

const NOTIFICATION_PREFS_KEY = 'sidequest.notification-prefs';
const NOTIFICATIONS_LAST_SEEN_KEY = 'sidequest.notifications.lastSeenAt';
const memoryStorage = new Map<string, string>();

export type NotificationPreferences = {
  pushEnabled: boolean;
};

// The in-app notification center's six notification types — mirrors the
// backend's NotificationsController allow-list (see
// backend/Controllers/NotificationsController.cs). Title/Body are already
// rendered server-side (localized to the user's language), so this is
// display-ready as-is.
export type AppNotification = {
  id: string;
  type: 'member_joined' | 'new_activity' | 'new_hidden_sidequest' | 'sidequest_revealed' | 'chat' | 'expense' | 'support_reply';
  title: string;
  body: string;
  createdAt: string;
  tripId?: string;
  route?: string;
  // Set only when the backend allows attributing this notification to one
  // specific person (see NotificationLog.ActorName in the backend) — null
  // for hidden SideQuests, reveals, and aggregated "N new chat messages".
  actorName?: string;
  actorAvatarUrl?: string;
};

type NotificationLogResponse = {
  id: string;
  type: string;
  title: string;
  body: string;
  tripId?: string | null;
  route?: string | null;
  actorName?: string | null;
  actorAvatarUrl?: string | null;
  createdAt: string;
};

export function getDefaultNotificationPreferences(): NotificationPreferences {
  return {
    pushEnabled: true,
  };
}

export async function loadNotificationPreferences() {
  const raw = await safeGetItem(NOTIFICATION_PREFS_KEY);
  if (!raw) return getDefaultNotificationPreferences();

  try {
    return { ...getDefaultNotificationPreferences(), ...(JSON.parse(raw) as Partial<NotificationPreferences>) };
  } catch {
    return getDefaultNotificationPreferences();
  }
}

export async function saveNotificationPreferences(preferences: NotificationPreferences) {
  await safeSetItem(NOTIFICATION_PREFS_KEY, JSON.stringify(preferences));
}

export async function loadNotifications(): Promise<AppNotification[]> {
  try {
    const rows = await apiJson<NotificationLogResponse[]>('/api/notifications');
    return rows.map((row) => ({
      id: row.id,
      type: row.type as AppNotification['type'],
      title: row.title,
      body: row.body,
      createdAt: row.createdAt,
      tripId: row.tripId ?? undefined,
      route: row.route ?? undefined,
      actorName: row.actorName ?? undefined,
      actorAvatarUrl: row.actorAvatarUrl ?? undefined,
    }));
  } catch {
    return [];
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Unread notification tracking
//
// A single "last seen" timestamp is stored in AsyncStorage. Any notification
// with createdAt > lastSeen counts as unread. Opening the notification
// center calls markNotificationsAsRead() which advances lastSeen to "now",
// clearing the unread indicator until something newer arrives.
// ──────────────────────────────────────────────────────────────────────────

export async function loadLastNotificationSeenAt(): Promise<number> {
  const raw = await safeGetItem(NOTIFICATIONS_LAST_SEEN_KEY);
  if (!raw) return 0;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

export async function markNotificationsAsRead(): Promise<void> {
  await safeSetItem(NOTIFICATIONS_LAST_SEEN_KEY, new Date().toISOString());
}

export async function loadUnreadNotificationCount(): Promise<number> {
  const [items, lastSeen] = await Promise.all([
    loadNotifications(),
    loadLastNotificationSeenAt(),
  ]);
  if (lastSeen === 0) return items.length;
  return items.filter((n) => {
    const t = new Date(n.createdAt).getTime();
    return Number.isFinite(t) && t > lastSeen;
  }).length;
}

async function safeGetItem(key: string) {
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return memoryStorage.get(key) ?? null;
  }
}

async function safeSetItem(key: string, value: string) {
  try {
    await AsyncStorage.setItem(key, value);
  } catch {
    memoryStorage.set(key, value);
  }
}
