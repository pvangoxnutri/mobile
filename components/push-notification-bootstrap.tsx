import { useEffect, useRef } from 'react';
import { router } from 'expo-router';
import type { Href } from 'expo-router';
import { useAuth } from '@/components/auth-provider';
import { invalidateCache, invalidateTripCache } from '@/lib/cache';
import {
  addNotificationTapListener,
  addPushTokenRotationListener,
  getInitialNotificationData,
  registerPushTokenIfPermitted,
  type PushNotificationData,
} from '@/lib/push-notifications';

// Invalidates whatever cache could be stale for the screen a push is about
// to land on — called BEFORE router.push() so that screen's own existing
// "show cache, then fetch fresh" effect finds nothing cached and fetches for
// real, instead of briefly showing pre-push data.
//
// Deliberately narrow: chat is never cached (chat_message needs no action),
// and teaser only touches the one key that could actually be stale, not the
// full trip helper — there's no reason for a teaser tap to invalidate
// anything that could risk surfacing more than the teaser text.
function invalidateForPush(data: PushNotificationData) {
  if (!data.tripId) return;

  switch (data.type) {
    case 'reveal':
      // The activity just flipped from hidden to revealed — make sure the
      // trip's activities list (and the trip record itself) can't show the
      // pre-reveal snapshot once the user lands.
      invalidateTripCache(data.tripId);
      break;
    case 'teaser':
      // The teaser window just opened — the cached activities list may
      // predate it and would otherwise show the old "nothing yet" state
      // instead of the teaser text.
      invalidateCache(`/api/trips/${data.tripId}/activities`);
      break;
    case 'trip_invite':
      // Both the recipient's pending-invites list (home) and this trip's
      // own invites list must be fresh before the highlighted card renders.
      invalidateCache('/api/trips/invites/me');
      invalidateTripCache(data.tripId);
      break;
    case 'chat_message':
    default:
      // Chat is never cached — nothing to do.
      break;
  }
}

function handlePushData(data: PushNotificationData) {
  if (!data.route) return;
  invalidateForPush(data);
  router.push(data.route as Href);
}

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
    void getInitialNotificationData().then((data) => {
      if (data) handlePushData(data);
    });
  }, [user]);

  // Foreground/backgrounded taps (app already running in JS).
  useEffect(() => {
    const subscription = addNotificationTapListener(handlePushData);
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
