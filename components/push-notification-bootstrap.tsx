import { useEffect, useRef } from 'react';
import { router } from 'expo-router';
import type { Href } from 'expo-router';
import { useAuth } from '@/components/auth-provider';
import {
  addNotificationTapListener,
  addPushTokenRotationListener,
  getInitialNotificationRoute,
  registerPushTokenIfPermitted,
} from '@/lib/push-notifications';

// No UI — just wires push token freshness and notification-tap deep links
// for the whole app. Mounted once in the root layout, inside AuthGate so
// useAuth() is available and — crucially — so this only runs once auth/
// session restoration has finished (AuthGate blocks rendering its children
// until `loading` is false), which is what makes the cold-start deep link
// below safe: by the time we navigate, the user is already signed in.
export function PushNotificationBootstrap() {
  const { user } = useAuth();
  const consumedColdStart = useRef(false);

  // Re-registers the token (if permission was already granted) every time
  // the signed-in user is known — covers token rotation and app updates.
  // Does NOT prompt for permission; that only happens at the contextual
  // moments wired via maybeRequestPushPermission() elsewhere.
  useEffect(() => {
    if (!user) return;
    void registerPushTokenIfPermitted();
  }, [user]);

  // Cold start: the app was fully terminated and a notification tap
  // launched it. getLastNotificationResponseAsync() is the only API that
  // can see that tap — addNotificationResponseReceivedListener below never
  // fires for it, since the JS engine wasn't running when the tap happened.
  // Guarded by a ref so we only ever act on this once per app session, even
  // though the underlying call keeps returning the same response.
  useEffect(() => {
    if (!user || consumedColdStart.current) return;
    consumedColdStart.current = true;
    void getInitialNotificationRoute().then((route) => {
      if (route) router.push(route as Href);
    });
  }, [user]);

  // Foreground/backgrounded taps (app already running in JS).
  useEffect(() => {
    const subscription = addNotificationTapListener((route) => {
      router.push(route as Href);
    });
    return () => subscription.remove();
  }, []);

  // Rare, but APNs/FCM can rotate a device's push token while the app is
  // alive — re-register immediately instead of silently going stale.
  useEffect(() => {
    const subscription = addPushTokenRotationListener(() => {});
    return () => subscription.remove();
  }, []);

  return null;
}
