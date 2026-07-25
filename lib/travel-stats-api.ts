import { apiFetch, apiJson } from '@/lib/api';

/**
 * Aggregate Travel Tracker stats over the wire. The tracker's raw country
 * statuses are device-local by design — only these aggregate numbers are
 * synced, so another user's profile can show them without any private
 * travel data (never a country list) leaving the device.
 */

export type RemoteTravelStats = {
  countriesVisited: number;
  continentsReached: number;
  updatedAt: string;
};

// Small stale-while-revalidate cache KEYED BY USER ID — one user's numbers
// can never leak onto another profile through a shared key.
const cache = new Map<string, { data: RemoteTravelStats; fetchedAt: number }>();
const inFlight = new Map<string, Promise<RemoteTravelStats | null>>();
const STALE_AFTER_MS = 2 * 60 * 1000;

/**
 * Fetches a user's synced aggregates. Resolves null when the user has
 * never synced stats (backend 404) — callers hide the section then.
 * Throws on real failures so callers can show the error/retry state.
 */
export async function loadUserTravelStats(
  userId: string,
  options?: { forceRefresh?: boolean },
): Promise<RemoteTravelStats | null> {
  const cached = cache.get(userId);
  if (!options?.forceRefresh && cached && Date.now() - cached.fetchedAt < STALE_AFTER_MS) {
    return cached.data;
  }
  const existing = inFlight.get(userId);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const data = await apiJson<RemoteTravelStats>(
        `/api/users/${encodeURIComponent(userId)}/travel-stats`,
      );
      cache.set(userId, { data, fetchedAt: Date.now() });
      return data;
    } catch (error) {
      if ((error as { status?: number }).status === 404) return null;
      throw error;
    } finally {
      inFlight.delete(userId);
    }
  })();
  inFlight.set(userId, promise);
  return promise;
}

export function getCachedUserTravelStats(userId: string): RemoteTravelStats | null {
  return cache.get(userId)?.data ?? null;
}

/**
 * Best-effort upsert of the caller's OWN aggregates (the id comes from the
 * JWT server-side). Called from BOTH the tracker screen and the own-stats
 * hook (profile focus), so a user syncs without ever opening the tracker.
 * A session-level value guard keeps the duplicate call sites from spamming
 * identical PUTs; a failed attempt clears the guard so the next focus
 * retries. Failures are silent — the next successful sync self-heals.
 */
let lastPushedKey: string | null = null;

export function pushOwnTravelStats(stats: {
  countriesVisited: number;
  continentsReached: number;
}): void {
  const key = `${stats.countriesVisited}:${stats.continentsReached}`;
  if (key === lastPushedKey) return;
  lastPushedKey = key;
  void apiFetch('/api/users/me/travel-stats', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(stats),
  })
    .then((response) => {
      if (!response.ok) lastPushedKey = null;
    })
    .catch(() => {
      lastPushedKey = null;
    });
}
