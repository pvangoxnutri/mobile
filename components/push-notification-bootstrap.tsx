import { useEffect } from 'react';
import { router } from 'expo-router';
import type { Href } from 'expo-router';
import { useAuth } from '@/components/auth-provider';
import { addNotificationTapListener, registerPushTokenIfPermitted } from '@/lib/push-notifications';

// No UI — just wires push token freshness and notification-tap deep links
// for the whole app. Mounted once in the root layout, inside AuthGate so
// useAuth() is available.
export function PushNotificationBootstrap() {
  const { user } = useAuth();

  // Re-registers the token (if permission was already granted) every time
  // the signed-in user is known — covers token rotation and app updates.
  // Does NOT prompt for permission; that only happens at the contextual
  // moments wired via maybeRequestPushPermission() elsewhere.
  useEffect(() => {
    if (!user) return;
    void registerPushTokenIfPermitted();
  }, [user]);

  useEffect(() => {
    const subscription = addNotificationTapListener((route) => {
      router.push(route as Href);
    });
    return () => subscription.remove();
  }, []);

  return null;
}
