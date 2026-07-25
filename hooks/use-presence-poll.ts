import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useRef } from 'react';
import { AppState } from 'react-native';

import { apiJson } from '@/lib/api';
import { setCached } from '@/lib/cache';

// How often member presence is re-fetched while a screen is focused. The
// server counts a user as online for 2 minutes after their last request and
// clients heartbeat every 60s, so 30s keeps the dots at most one tick stale
// without meaningfully adding load.
export const PRESENCE_POLL_INTERVAL_MS = 30_000;

// Fast cadence for views that actively display online dots (members sheet,
// chat). Combined with the explicit online/offline heartbeat signals in
// auth-provider, transitions land within ~5s while such a view is open.
export const PRESENCE_POLL_FAST_MS = 5_000;

// Re-fetches GET /api/trips/{id}/members on an interval while the screen is
// focused, so online dots update without leaving and re-opening the screen.
//
// Every screen using this already fetches members immediately on focus, so
// the hook deliberately has no leading fetch — the interval only keeps that
// data live afterwards. Ticks are skipped while the app is backgrounded
// (mirroring the global heartbeat) and while a previous tick is still in
// flight, so requests never stack. A failed fetch keeps the last known
// status and never surfaces an error.
//
// tripIds and onMembers are read through refs — callers can pass inline
// values without restarting the poll.
export function useMembersPresencePoll<T>(
  tripIds: readonly string[],
  onMembers: (tripId: string, members: T[]) => void,
  intervalMs: number = PRESENCE_POLL_INTERVAL_MS,
): void {
  const tripIdsRef = useRef(tripIds);
  tripIdsRef.current = tripIds;
  const onMembersRef = useRef(onMembers);
  onMembersRef.current = onMembers;
  const inFlightRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      let focused = true;

      const tick = async () => {
        if (AppState.currentState !== 'active') return;
        if (inFlightRef.current) return;
        const ids = tripIdsRef.current;
        if (ids.length === 0) return;
        inFlightRef.current = true;
        try {
          const results = await Promise.all(
            ids.map(async (tripId) => {
              try {
                return { tripId, members: await apiJson<T[]>(`/api/trips/${tripId}/members`) };
              } catch {
                return null;
              }
            }),
          );
          if (!focused) return;
          for (const result of results) {
            if (!result) continue;
            setCached(`/api/trips/${result.tripId}/members`, result.members);
            onMembersRef.current(result.tripId, result.members);
          }
        } finally {
          inFlightRef.current = false;
        }
      };

      // Fast mode usually starts on a transition (a members sheet or chat
      // just opened) — fetch immediately so the view is fresh at once. The
      // slow-mode entry is already covered by the screens' own focus loads.
      if (intervalMs < PRESENCE_POLL_INTERVAL_MS) void tick();
      const interval = setInterval(() => void tick(), intervalMs);

      // Coming back from the app switcher / lock screen is not a focus
      // change, so without this the dots could stay up to a full interval
      // stale. One immediate tick on re-activation makes member status
      // (including our own dot, revived by the auth-provider's instant
      // online beat) refresh right away. Backgrounding needs no handler —
      // the tick's own AppState guard already skips while not active.
      const appStateSub = AppState.addEventListener('change', (state) => {
        if (state === 'active') void tick();
      });

      return () => {
        focused = false;
        clearInterval(interval);
        appStateSub.remove();
      };
    }, [intervalMs]),
  );
}
