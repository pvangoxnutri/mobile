// Cache keyed by URL with stale-while-revalidate. Screens read whatever's in
// cache instantly (so tab switches feel instant), then fire a background fetch
// and call setCached when fresh data arrives.
//
// Reads and writes stay synchronous against an in-memory Map — that is what
// makes a screen able to paint cached content in its very first render pass.
// Adventure data is ALSO mirrored to AsyncStorage (see lib/persisted-cache.ts)
// so it survives a real cold start: without that, every launch from a killed
// process began with an empty cache, and Home had nothing to show but a
// blocking spinner until the network answered.
//
// Hydration is explicit — call hydratePersistedCache(userId) once the signed-in
// user is known, before Home reads.

import {
  clearPersistedCache,
  isPersistableCacheKey,
  readPersistedCache,
  registerSnapshotProvider,
  schedulePersist,
} from '@/lib/persisted-cache';

type CacheEntry = { data: unknown; fetchedAt: number };

const cache = new Map<string, CacheEntry>();

// Whose data is currently in memory. Set by hydratePersistedCache; writes are
// only mirrored to disk while it is known, so nothing can be filed under the
// wrong account.
let activeUserId: string | null = null;

registerSnapshotProvider(() => {
  const snapshot: Record<string, CacheEntry> = {};
  for (const [key, entry] of cache) {
    if (isPersistableCacheKey(key)) snapshot[key] = entry;
  }
  return snapshot;
});

/**
 * Loads this user's persisted adventure data into memory. Safe to call more
 * than once; a second call for the same user is a no-op.
 *
 * Entries already in memory win — a value fetched during this launch is newer
 * than anything on disk by definition.
 */
export async function hydratePersistedCache(userId: string): Promise<void> {
  if (!userId || activeUserId === userId) return;
  activeUserId = userId;

  const persisted = await readPersistedCache(userId);
  for (const [key, entry] of Object.entries(persisted)) {
    if (!cache.has(key)) cache.set(key, entry);
  }
}

/** Forgets everything, in memory and on disk, for the user who was signed in. */
export async function clearAllCaches(): Promise<void> {
  const userId = activeUserId;
  cache.clear();
  activeUserId = null;
  if (userId) await clearPersistedCache(userId);
}

// Default staleness threshold. After this many ms, a refetch is triggered
// (but the cached value is still returned immediately).
export const DEFAULT_STALE_AFTER_MS = 30_000;

export function getCached<T>(url: string): T | null {
  const entry = cache.get(url);
  return entry ? (entry.data as T) : null;
}

export function setCached<T>(url: string, data: T): void {
  cache.set(url, { data, fetchedAt: Date.now() });
  // Debounced and filtered inside — only adventure data reaches disk.
  if (activeUserId && isPersistableCacheKey(url)) schedulePersist(activeUserId);
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
    if (activeUserId) schedulePersist(activeUserId);
    return;
  }
  for (const key of Array.from(cache.keys())) {
    if (key === urlOrPrefix || key.startsWith(urlOrPrefix)) {
      cache.delete(key);
    }
  }
  // The persisted copy must follow, or the next cold start would resurrect
  // exactly the data a mutation just invalidated.
  if (activeUserId) schedulePersist(activeUserId);
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
