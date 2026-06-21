import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch } from '@/lib/api';

// Whether we've ever shown the OS permission dialog. Used so we only ever
// ask once — re-asking after a "no" is both impossible on iOS (the system
// dialog only shows once) and naggy on Android.
const ASKED_KEY = 'sidequest.push.asked-permission';
// The last token we successfully registered with the backend, so app-start
// "make sure it's still registered" calls don't hit the network every time.
const LAST_TOKEN_KEY = 'sidequest.push.last-registered-token';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function getProjectId(): string | undefined {
  return Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

async function pushCurrentToken(): Promise<void> {
  const projectId = getProjectId();
  const tokenData = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  const token = tokenData.data;

  const lastToken = await AsyncStorage.getItem(LAST_TOKEN_KEY);
  if (lastToken === token) return;

  await apiFetch('/api/push-tokens', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, platform: Platform.OS }),
  });
  await AsyncStorage.setItem(LAST_TOKEN_KEY, token);
}

// Call on every app start (once a user is signed in). No-ops quietly if
// permission was never granted — this is the "keep the token fresh" path,
// not the "ask for permission" path.
export async function registerPushTokenIfPermitted(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;
    await pushCurrentToken();
  } catch (err) {
    console.warn('[PUSH] registerPushTokenIfPermitted failed:', err);
  }
}

// Call at a contextual moment (joining/creating a first adventure, creating
// a first hidden SideQuest) — NOT on app launch. Only actually shows the OS
// dialog the first time it's ever called across the app's lifetime.
export async function maybeRequestPushPermission(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const alreadyAsked = await AsyncStorage.getItem(ASKED_KEY);
    if (alreadyAsked) {
      await registerPushTokenIfPermitted();
      return;
    }

    const { status: currentStatus } = await Notifications.getPermissionsAsync();
    if (currentStatus === 'granted') {
      await AsyncStorage.setItem(ASKED_KEY, '1');
      await pushCurrentToken();
      return;
    }

    if (currentStatus === 'denied') {
      // Denied at the OS level before this flow ever ran — record it so we
      // stop checking, but don't try to re-prompt (iOS won't show the
      // dialog again; Android would just feel naggy).
      await AsyncStorage.setItem(ASKED_KEY, '1');
      return;
    }

    const { status: newStatus } = await Notifications.requestPermissionsAsync();
    await AsyncStorage.setItem(ASKED_KEY, '1');
    if (newStatus === 'granted') {
      await pushCurrentToken();
    }
  } catch (err) {
    console.warn('[PUSH] maybeRequestPushPermission failed:', err);
  }
}

// Used by the profile screen's real "Push notifications" toggle when turned
// off — deactivates this device's token server-side so it stops receiving
// sends, without revoking the OS-level permission itself.
export async function disablePushNotifications(): Promise<void> {
  try {
    const projectId = getProjectId();
    const tokenData = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    await apiFetch(`/api/push-tokens?token=${encodeURIComponent(tokenData.data)}`, { method: 'DELETE' });
    await AsyncStorage.removeItem(LAST_TOKEN_KEY);
  } catch (err) {
    console.warn('[PUSH] disablePushNotifications failed:', err);
  }
}

export async function getCurrentPermissionStatus(): Promise<Notifications.PermissionStatus | 'unsupported'> {
  if (Platform.OS === 'web') return 'unsupported';
  const { status } = await Notifications.getPermissionsAsync();
  return status;
}

// Mirrors the `data` dict the backend puts on each of the four notification
// types (see backend/Services/NotificationDispatchService.cs) — `type` is
// what lets the caller decide what (if anything) needs invalidating before
// navigating, instead of just blindly following `route`.
export type PushNotificationData = {
  type?: 'teaser' | 'reveal' | 'trip_invite' | 'chat_message' | string;
  tripId?: string;
  activityId?: string;
  inviteId?: string;
  route?: string;
};

function extractData(response: Notifications.NotificationResponse | null): PushNotificationData | null {
  const data = response?.notification.request.content.data as Record<string, unknown> | undefined;
  if (!data || typeof data.route !== 'string') return null;
  return data as PushNotificationData;
}

// Wires a tapped notification's full data payload (type, tripId, route, …)
// to the caller. Returns the subscription so the caller can remove it.
//
// This listener ONLY fires for taps that happen while this listener is
// already registered — i.e. the app was foregrounded or backgrounded. A tap
// that cold-starts the app from fully terminated does NOT fire this (the JS
// engine, and this listener, didn't exist yet when the tap happened). Use
// getInitialNotificationData() once at startup to cover that case.
export function addNotificationTapListener(onDeepLink: (data: PushNotificationData) => void) {
  return Notifications.addNotificationResponseReceivedListener((response) => {
    const data = extractData(response);
    if (data) onDeepLink(data);
  });
}

// Call once, at startup, after auth/session restoration completes (the
// caller is responsible for that ordering — see PushNotificationBootstrap).
// Returns the notification's data payload if this app launch was caused by
// tapping a notification while fully terminated, or null otherwise. Safe to
// call repeatedly — expo-notifications keeps returning the same last
// response until the OS clears it, so the caller should only act on this
// once per app session (PushNotificationBootstrap guards this with a ref).
export async function getInitialNotificationData(): Promise<PushNotificationData | null> {
  try {
    const response = await Notifications.getLastNotificationResponseAsync();
    return extractData(response);
  } catch (err) {
    console.warn('[PUSH] getInitialNotificationData failed:', err);
    return null;
  }
}

// Fires whenever Expo issues a new push token for this device while the app
// is running (token rotation — rare, but APNs/FCM can do this). Re-registers
// immediately so we're never silently stuck on a stale token.
export function addPushTokenRotationListener(onNewToken: () => void) {
  return Notifications.addPushTokenListener(() => {
    void pushCurrentToken().catch((err) => console.warn('[PUSH] re-registration after token rotation failed:', err));
    onNewToken();
  });
}
