import AsyncStorage from '@react-native-async-storage/async-storage';
import type { UserInfo } from '@/lib/types';

const NOTIFICATION_PREFS_KEY = 'sidequest.notification-prefs';
const NOTIFICATIONS_KEY = 'sidequest.notifications';
const CHAT_KEY_PREFIX = 'sidequest.trip-chat.';

export type NotificationPreferences = {
  pushEnabled: boolean;
  chatMessages: boolean;
  chatJoins: boolean;
};

export type AppNotification = {
  id: string;
  type: 'chat_message' | 'chat_member_joined' | 'upcoming_sidequest';
  title: string;
  body: string;
  createdAt: string;
  tripId?: string;
  tripTitle?: string;
  pushReady?: boolean;
};

export type ChatMessage = {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
  createdAt: string;
  kind: 'system' | 'user';
};

type TripChatState = {
  messages: ChatMessage[];
  memberIds: string[];
};

export function getDefaultNotificationPreferences(): NotificationPreferences {
  return {
    pushEnabled: true,
    chatMessages: true,
    chatJoins: true,
  };
}

export async function loadNotificationPreferences() {
  const raw = await AsyncStorage.getItem(NOTIFICATION_PREFS_KEY);
  if (!raw) return getDefaultNotificationPreferences();

  try {
    return { ...getDefaultNotificationPreferences(), ...(JSON.parse(raw) as Partial<NotificationPreferences>) };
  } catch {
    return getDefaultNotificationPreferences();
  }
}

export async function saveNotificationPreferences(preferences: NotificationPreferences) {
  await AsyncStorage.setItem(NOTIFICATION_PREFS_KEY, JSON.stringify(preferences));
}

export async function loadNotifications() {
  const raw = await AsyncStorage.getItem(NOTIFICATIONS_KEY);
  if (!raw) return [] as AppNotification[];

  try {
    return JSON.parse(raw) as AppNotification[];
  } catch {
    return [] as AppNotification[];
  }
}

export async function prependNotification(notification: AppNotification) {
  const current = await loadNotifications();
  const next = [notification, ...current].slice(0, 50);
  await AsyncStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(next));
}

export async function loadTripChat(tripId: string, tripTitle: string) {
  const key = `${CHAT_KEY_PREFIX}${tripId}`;
  const raw = await AsyncStorage.getItem(key);

  if (!raw) {
    const initialState: TripChatState = {
      memberIds: [],
      messages: [
        {
          id: createId(),
          authorId: 'system',
          authorName: 'SideQuest',
          text: `Group chat ready for ${tripTitle}.`,
          createdAt: new Date().toISOString(),
          kind: 'system',
        },
      ],
    };

    await AsyncStorage.setItem(key, JSON.stringify(initialState));
    return initialState;
  }

  try {
    return JSON.parse(raw) as TripChatState;
  } catch {
    return {
      memberIds: [],
      messages: [],
    } satisfies TripChatState;
  }
}

export async function sendTripChatMessage({
  tripId,
  tripTitle,
  user,
  text,
  preferences,
}: {
  tripId: string;
  tripTitle: string;
  user: Pick<UserInfo, 'id' | 'name'>;
  text: string;
  preferences: NotificationPreferences;
}) {
  const key = `${CHAT_KEY_PREFIX}${tripId}`;
  const state = await loadTripChat(tripId, tripTitle);
  const nextMessages = [...state.messages];
  const nextMemberIds = [...state.memberIds];
  const timestamp = new Date().toISOString();
  const trimmed = text.trim();

  if (!trimmed) {
    return state;
  }

  if (!nextMemberIds.includes(user.id)) {
    nextMemberIds.push(user.id);
    const joinMessage: ChatMessage = {
      id: createId(),
      authorId: 'system',
      authorName: 'SideQuest',
      text: `${user.name} joined the group chat.`,
      createdAt: timestamp,
      kind: 'system',
    };
    nextMessages.push(joinMessage);

    if (preferences.chatJoins) {
      await prependNotification({
        id: createId(),
        type: 'chat_member_joined',
        title: `${user.name} joined chat`,
        body: `${tripTitle} group chat has a new participant.`,
        createdAt: timestamp,
        tripId,
        tripTitle,
        pushReady: preferences.pushEnabled,
      });
    }
  }

  const message: ChatMessage = {
    id: createId(),
    authorId: user.id,
    authorName: user.name,
    text: trimmed,
    createdAt: timestamp,
    kind: 'user',
  };
  nextMessages.push(message);

  if (preferences.chatMessages) {
    await prependNotification({
      id: createId(),
      type: 'chat_message',
      title: `${user.name} sent a message`,
      body: trimmed,
      createdAt: timestamp,
      tripId,
      tripTitle,
      pushReady: preferences.pushEnabled,
    });
  }

  const nextState: TripChatState = {
    memberIds: nextMemberIds,
    messages: nextMessages.slice(-80),
  };

  await AsyncStorage.setItem(key, JSON.stringify(nextState));
  return nextState;
}

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
