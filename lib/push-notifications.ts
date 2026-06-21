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

// Wires a tapped notification's `data.route` (an in-app path we put there
// ourselves when sending, e.g. "/trip/{id}/sidequest/{activityId}") to
// in-app navigation. Returns the subscription so the caller can remove it.
export function addNotificationTapListener(onDeepLink: (route: string) => void) {
  return Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as Record<string, unknown> | undefined;
    const route = typeof data?.route === 'string' ? data.route : null;
    if (route) onDeepLink(route);
  });
}
