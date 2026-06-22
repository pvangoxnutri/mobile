import * as Notifications from 'expo-notifications';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch } from '@/lib/api';
import { markStartup } from '@/lib/startup-timing'; // TEMPORARY — see lib/startup-timing.ts

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

// Expo Go can't register a real remote push token (it has no native
// APNs/FCM credential of its own) and getExpoPushTokenAsync() behaves
// unreliably there — this is also what was hammered in a loop during the
// startup investigation. Push only matters in dev-client/standalone builds,
// so skip retrieval entirely in Expo Go rather than trying to make a flaky
// path "work".
function isExpoGo(): boolean {
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

// Module-level singleton: at most one getExpoPushTokenAsync + POST
// /api/push-tokens attempt may be in flight at a time, no matter how many
// call sites (bootstrap effect, contextual permission prompt, token
// rotation listener) try to trigger one concurrently. Every caller below
// funnels through requestPushRegistration() instead of calling
// pushCurrentToken() directly.
let pushRegistrationPromise: Promise<void> | null = null;

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

function requestPushRegistration(): Promise<void> {
  if (pushRegistrationPromise) {
    markStartup('[PUSH] duplicate call prevented — registration already in flight');
    return pushRegistrationPromise;
  }

  markStartup('[PUSH] registration starting');
  pushRegistrationPromise = pushCurrentToken()
    .then(() => {
      markStartup('[PUSH] registration completed');
    })
    .catch((err) => {
      markStartup('[PUSH] registration failed');
      console.warn('[PUSH] registration failed:', err instanceof Error ? err.message : err);
    })
    .finally(() => {
      pushRegistrationPromise = null;
    });
  return pushRegistrationPromise;
}

// Caps the AUTOMATIC startup sync (called from PushNotificationBootstrap's
// effect and from home's first-trips-loaded hook) to one attempt per app
// session. Explicit user actions — the contextual permission prompt
// (maybeRequestPushPermission) and the profile toggle — are NOT gated by
// this flag, since those represent a real state change (permission status
// changed, or the user explicitly opted in/out) and must still run.
let autoSyncAttemptedThisSession = false;

// Call on every app start (once a user is signed in). No-ops quietly if
// permission was never granted — this is the "keep the token fresh" path,
// not the "ask for permission" path. Safe to call from multiple effects:
// the in-flight guard above and this session flag together mean only the
// first call in a session ever reaches the network.
export async function registerPushTokenIfPermitted(): Promise<void> {
  if (Platform.OS === 'web' || isExpoGo()) return;
  if (autoSyncAttemptedThisSession) return;
  autoSyncAttemptedThisSession = true;

  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;
    await requestPushRegistration();
  } catch (err) {
    console.warn('[PUSH] registerPushTokenIfPermitted failed:', err);
  }
}

// Call at a contextual moment (joining/creating a first adventure, creating
// a first hidden SideQuest) — NOT on app launch. Only actually shows the OS
// dialog the first time it's ever called across the app's lifetime.
export async function maybeRequestPushPermission(): Promise<void> {
  if (Platform.OS === 'web' || isExpoGo()) return;
  try {
    const alreadyAsked = await AsyncStorage.getItem(ASKED_KEY);
    if (alreadyAsked) {
      // Permission was already decided previously — this is still an
      // explicit, user-triggered call (e.g. opening home after creating a
      // first trip), so go straight through the shared singleton instead of
      // the auto-sync path (which intentionally only fires once a session).
      await requestPushRegistration();
      return;
    }

    const { status: currentStatus } = await Notifications.getPermissionsAsync();
    if (currentStatus === 'granted') {
      await AsyncStorage.setItem(ASKED_KEY, '1');
      await requestPushRegistration();
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
      await requestPushRegistration();
    }
  } catch (err) {
    console.warn('[PUSH] maybeRequestPushPermission failed:', err);
  }
}

// Used by the profile screen's real "Push notifications" toggle when turned
// off — deactivates this device's token server-side so it stops receiving
// sends, without revoking the OS-level permission itself.
export async function disablePushNotifications(): Promise<void> {
  if (isExpoGo()) return;
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
    if (isExpoGo()) return;
    void requestPushRegistration();
    onNewToken();
  });
}
