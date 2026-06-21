// Stale-while-revalidate cache for getUserProfile(userId), keyed by user.
// Mirrors lib/cache.ts's pattern but with a longer TTL and explicit request
// deduplication, since the same profile (e.g. a chat participant) is
// typically opened repeatedly within a short window and a profile's
// name/bio/avatar/stats rarely change mid-session.

import { getUserProfile } from '@/lib/api';
import type { UserProfile } from '@/lib/types';

type CacheEntry = { data: UserProfile; fetchedAt: number };

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<UserProfile>>();

const STALE_AFTER_MS = 5 * 60 * 1000; // a few minutes

export function getCachedUserProfile(userId: string): UserProfile | null {
  return cache.get(userId)?.data ?? null;
}

export function isUserProfileStale(userId: string): boolean {
  const entry = cache.get(userId);
  if (!entry) return true;
  return Date.now() - entry.fetchedAt > STALE_AFTER_MS;
}

// Always hits the network (skips the staleness check) but deduplicates
// concurrent calls for the same userId — if this profile is already being
// fetched, every caller shares that one in-flight request instead of firing
// a new one.
export function fetchUserProfile(userId: string): Promise<UserProfile> {
  const existing = inFlight.get(userId);
  if (existing) return existing;

  const promise = getUserProfile(userId)
    .then((data: UserProfile) => {
      cache.set(userId, { data, fetchedAt: Date.now() });
      return data;
    })
    .finally(() => {
      inFlight.delete(userId);
    });

  inFlight.set(userId, promise);
  return promise;
}

// The main entry point: returns the cached profile without touching the
// network if it's still fresh. Only fetches (deduped, see above) when
// missing, stale, or explicitly forced. This is what makes reopening the
// same profile repeatedly within the TTL window not issue repeated network
// calls.
export async function loadUserProfile(userId: string, options?: { forceRefresh?: boolean }): Promise<UserProfile> {
  if (!options?.forceRefresh && !isUserProfileStale(userId)) {
    const cached = getCachedUserProfile(userId);
    if (cached) return cached;
  }
  return fetchUserProfile(userId);
}

export function invalidateUserProfile(userId?: string): void {
  if (!userId) {
    cache.clear();
    return;
  }
  cache.delete(userId);
}
