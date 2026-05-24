/**
 * NOTIFICATION SYSTEM
 * Infrastructure for warm, emotionally meaningful notifications
 *
 * Philosophy:
 * - Notifications are NOT engagement spam
 * - They are emotional anticipation reminders
 * - They deepen emotional connection to the app
 * - They respect user's time and attention
 *
 * Categories:
 * 1. REVEAL ANTICIPATION (highest emotional value)
 *    "Your SideQuest unlocks in 1 hour 👀"
 * 2. SOCIAL MOMENTS (connection, not FOMO)
 *    "Alex added a hidden SideQuest to Barcelona 🇪🇸"
 * 3. MILESTONE MOMENTS (celebration, not spam)
 *    "Your SideQuest reveal just unlocked ✨"
 * 4. OPERATIONAL NOTIFICATIONS (necessary but minimal)
 *    "Your invite is expiring in 2 days"
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// ──────────────────────────────────────────────────────────────────────────────
// NOTIFICATION CATEGORIES
// ──────────────────────────────────────────────────────────────────────────────

export enum NotificationCategory {
  // Reveal Anticipation: Moments of genuine emotional relevance
  REVEAL_ANTICIPATION = 'reveal_anticipation',

  // Social Moments: Connection, belonging, social proof
  SOCIAL_MOMENTS = 'social_moments',

  // Milestone Moments: Celebration of achievements
  MILESTONE_MOMENTS = 'milestone_moments',

  // Operational: Only when user action is required
  OPERATIONAL = 'operational',
}

// ──────────────────────────────────────────────────────────────────────────────
// NOTIFICATION PREFERENCES
// ──────────────────────────────────────────────────────────────────────────────

export interface NotificationPreferences {
  // Reveal Anticipation: 'none' | 'oneHourBefore' | 'allReminders'
  revealReminders: 'none' | 'oneHourBefore' | 'allReminders';

  // Social Notifications: true/false
  socialNotifications: boolean;

  // Muted trips (user can mute notifications by trip)
  socialMutedTrips: Set<string>;

  // Milestone Notifications: true/false
  milestoneNotifications: boolean;

  // Operational Notifications: true/false
  operationalNotifications: boolean;

  // Quiet Hours: respect user's sleep schedule
  quietHours: {
    enabled: boolean;
    startTime: string; // HH:mm format, e.g., "22:00"
    endTime: string;   // HH:mm format, e.g., "08:00"
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// DEFAULT PREFERENCES
// ──────────────────────────────────────────────────────────────────────────────

export const DEFAULT_PREFERENCES: NotificationPreferences = {
  revealReminders: 'oneHourBefore',
  socialNotifications: true,
  socialMutedTrips: new Set(),
  milestoneNotifications: true,
  operationalNotifications: true,
  quietHours: {
    enabled: true,
    startTime: '22:00',
    endTime: '08:00',
  },
};

// ──────────────────────────────────────────────────────────────────────────────
// QUIET HOURS LOGIC
// ──────────────────────────────────────────────────────────────────────────────

export function isWithinQuietHours(preferences: NotificationPreferences): boolean {
  if (!preferences.quietHours.enabled) return false;

  const now = new Date();
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const [startH, startM] = preferences.quietHours.startTime.split(':').map(Number);
  const [endH, endM] = preferences.quietHours.endTime.split(':').map(Number);
  const [nowH, nowM] = currentTime.split(':').map(Number);
  const nowTotal = nowH * 60 + nowM;
  const startTotal = startH * 60 + startM;
  const endTotal = endH * 60 + endM;

  if (startTotal > endTotal) {
    // Quiet hours span midnight (e.g., 22:00 to 08:00)
    return nowTotal >= startTotal || nowTotal < endTotal;
  } else {
    // Quiet hours don't span midnight
    return nowTotal >= startTotal && nowTotal < endTotal;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// NOTIFICATION PREFERENCE STORAGE
// ──────────────────────────────────────────────────────────────────────────────

const PREFS_KEY = '@sidequest/notification_preferences';

export async function loadNotificationPreferences(): Promise<NotificationPreferences> {
  try {
    const stored = await AsyncStorage.getItem(PREFS_KEY);
    if (!stored) return DEFAULT_PREFERENCES;

    const parsed = JSON.parse(stored);
    return {
      ...parsed,
      socialMutedTrips: new Set(parsed.socialMutedTrips || []),
    };
  } catch (err) {
    console.error('[NOTIFICATIONS] Failed to load preferences:', err);
    return DEFAULT_PREFERENCES;
  }
}

export async function saveNotificationPreferences(prefs: NotificationPreferences): Promise<void> {
  try {
    const serialized = {
      ...prefs,
      socialMutedTrips: Array.from(prefs.socialMutedTrips),
    };
    await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(serialized));
  } catch (err) {
    console.error('[NOTIFICATIONS] Failed to save preferences:', err);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// NOTIFICATION SHOULD SEND LOGIC
// ──────────────────────────────────────────────────────────────────────────────

export function shouldSendNotification(
  category: NotificationCategory,
  preferences: NotificationPreferences,
  tripId?: string
): boolean {
  // Respect quiet hours
  if (isWithinQuietHours(preferences)) {
    return false;
  }

  // Check category preferences
  switch (category) {
    case NotificationCategory.REVEAL_ANTICIPATION:
      return preferences.revealReminders !== 'none';

    case NotificationCategory.SOCIAL_MOMENTS:
      if (!preferences.socialNotifications) return false;
      // Skip if trip is muted
      if (tripId && preferences.socialMutedTrips.has(tripId)) return false;
      return true;

    case NotificationCategory.MILESTONE_MOMENTS:
      return preferences.milestoneNotifications;

    case NotificationCategory.OPERATIONAL:
      return preferences.operationalNotifications;

    default:
      return false;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// NOTIFICATION PAYLOAD STRUCTURE
// ──────────────────────────────────────────────────────────────────────────────

export interface NotificationPayload {
  category: NotificationCategory;
  title: string;
  body: string;
  emoji?: string;
  haptic?: 'light' | 'medium' | 'heavy' | 'success';
  action?: string;
  actionData?: Record<string, string>;
  priority?: 'high' | 'normal' | 'low';
  silent?: boolean;
}

// ──────────────────────────────────────────────────────────────────────────────
// EXAMPLE NOTIFICATIONS (Reference for implementation)
// ──────────────────────────────────────────────────────────────────────────────

export const NOTIFICATION_EXAMPLES = {
  revealAnticipation: {
    oneHourBefore: {
      title: 'Spain Summer awaits',
      body: 'Your SideQuest unlocks in 1 hour 👀',
      emoji: '👀',
      haptic: 'light',
      priority: 'normal',
    },
    fiveMinutesBefore: {
      title: 'Secret Barcelona tapas',
      body: 'Your SideQuest unlocks in 5 minutes ✨',
      emoji: '✨',
      haptic: 'medium',
      priority: 'high',
    },
    atRevealTime: {
      title: 'SideQuest Unlocked! 🎉',
      body: 'Secret Barcelona tapas is here',
      emoji: '🎉',
      haptic: 'success',
      priority: 'high',
    },
  },
  socialMoments: {
    inviteSent: {
      title: 'Elena invited you to Barcelona',
      body: 'Join her adventure in Spain this summer ✨',
      emoji: '✨',
      haptic: 'light',
      priority: 'normal',
    },
    memberJoined: {
      title: 'Alex joined your trip',
      body: 'Now you have 3 travelers ✈️',
      emoji: '✈️',
      haptic: 'light',
      priority: 'normal',
    },
    hiddenSidequestAdded: {
      title: 'Alex added a hidden SideQuest',
      body: 'Barcelona adventure just got more mysterious 🔒',
      emoji: '🔒',
      haptic: 'light',
      priority: 'normal',
    },
  },
  milestoneMoments: {
    revealUnlocked: {
      title: 'Reveal moment unlocked',
      body: 'Your secret Barcelona tapas is revealed ✨',
      emoji: '✨',
      haptic: 'success',
      priority: 'high',
    },
    tripStartsTomorrow: {
      title: 'Your adventure starts tomorrow!',
      body: 'Get ready for Barcelona 🚀',
      emoji: '🚀',
      haptic: 'success',
      priority: 'high',
    },
    fiveSidequestsPlanned: {
      title: 'Five SideQuests planned',
      body: 'You\'re really committing to this adventure 🔥',
      emoji: '🔥',
      haptic: 'medium',
      priority: 'normal',
    },
  },
  operational: {
    inviteExpiring: {
      title: 'Invite expires in 2 days',
      body: 'Accept Elena\'s Barcelona trip invitation before it expires',
      haptic: 'light',
      priority: 'normal',
    },
    mentioned: {
      title: 'You were mentioned in chat',
      body: 'Alex: "What time are we going to the tapas bar?" 💬',
      emoji: '💬',
      haptic: 'light',
      priority: 'normal',
    },
  },
};
