// Lightweight in-memory cache keyed by URL with stale-while-revalidate.
// Screens read whatever's in cache instantly (so tab switches feel instant),
// then fire a background fetch and call setCached when fresh data arrives.
//
// Not persisted across cold launches — that's intentional. We just want
// to make navigation between already-loaded screens feel snappy. A
// proper cross-launch cache would need AsyncStorage + serialization
// handling for Date/Map types.

type CacheEntry = { data: unknown; fetchedAt: number };

const cache = new Map<string, CacheEntry>();

// Default staleness threshold. After this many ms, a refetch is triggered
// (but the cached value is still returned immediately).
export const DEFAULT_STALE_AFTER_MS = 30_000;

export function getCached<T>(url: string): T | null {
  const entry = cache.get(url);
  return entry ? (entry.data as T) : null;
}

export function setCached<T>(url: string, data: T): void {
  cache.set(url, { data, fetchedAt: Date.now() });
}

export function isCacheStale(url: string, staleAfterMs: number = DEFAULT_STALE_AFTER_MS): boolean {
  const entry = cache.get(url);
  if (!entry) return true;
  return Date.now() - entry.fetchedAt > staleAfterMs;
}

/**
 * Drop a single cached URL or every URL whose key starts with the given
 * prefix. Use this from mutation paths (e.g. after POST /api/trips) so the
 * next read sees the new state instead of stale data.
 */
export function invalidateCache(urlOrPrefix?: string): void {
  if (!urlOrPrefix) {
    cache.clear();
    return;
  }
  for (const key of Array.from(cache.keys())) {
    if (key === urlOrPrefix || key.startsWith(urlOrPrefix)) {
      cache.delete(key);
    }
  }
}

/**
 * Drops every cache entry tied to a specific trip — its own details,
 * members, invites, and activities (the `/api/trips/{tripId}` prefix covers
 * all of those sub-resources in one go) — plus the two global, cross-trip
 * reads that embed this trip's data: the home tab's trip list (titles,
 * destinations, cover images) and the cross-trip events feed (member
 * joined/left).
 *
 * Call this after any mutation that changes a trip's own fields, its
 * membership, its invites, or its activities — accept/decline/create
 * invite, remove member, trip settings save, leave trip, etc. Deliberately
 * does NOT touch chat (never cached) or expenses/balances/settlements
 * (never cached — financial data must always be fetched fresh).
 */
export function invalidateTripCache(tripId: string): void {
  invalidateCache(`/api/trips/${tripId}`);
  invalidateCache('/api/trips');
  invalidateCache('/api/trips/events/me');
}
