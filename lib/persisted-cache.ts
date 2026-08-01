// Makes the in-memory URL cache survive a real cold start.
//
// lib/cache.ts is a Map, so every launch from a killed process started with
// nothing: Home had no trips to show, rendered its full-screen
// "Loading your next adventure…", and sat there until GET /api/trips came back
// — up to the 15s request timeout on a slow or unreachable backend. Persisting
// the snapshot is what lets Home paint real content on the first frame instead.
//
// Deliberately narrow:
//
//   * Only keys under /api/trips are written. That is the adventure list and
//     its sub-resources (activities, members, day locations, weather) — the
//     data Home and the adventure header render. Chat is never cached at all,
//     and signed URLs for private chat images live in their own in-memory-only
//     cache (lib/chat-image-access.ts), so neither can reach disk from here.
//   * Never auth tokens. Supabase owns session storage; this file must not
//     become a second place credentials live.
//   * Scoped per user id, so switching accounts cannot hydrate someone else's
//     adventures, and versioned so a future shape change is a miss rather than
//     a crash.

import AsyncStorage from '@react-native-async-storage/async-storage';

// Bump when the persisted SHAPE changes. An old version is simply not read —
// the app refetches, which is always safe.
const CACHE_VERSION = 'v1';
const KEY_PREFIX = `sidequest.cache.${CACHE_VERSION}`;

/** Entries older than this are dropped on hydrate rather than shown. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Coalesces the writes that a Home load fires in quick succession. */
const WRITE_DEBOUNCE_MS = 1_000;

type PersistedEntry = { data: unknown; fetchedAt: number };
type PersistedSnapshot = Record<string, PersistedEntry>;

function storageKey(userId: string) {
  return `${KEY_PREFIX}.${userId}`;
}

/**
 * Which cache keys are allowed on disk. Everything Home and the adventure
 * screens read starts with the API path, including the user-scoped Home keys
 * (`/api/trips::home-user:<id>`), so a single prefix test covers them.
 */
export function isPersistableCacheKey(key: string) {
  return key.startsWith('/api/trips');
}

let pendingWrite: ReturnType<typeof setTimeout> | null = null;
let pendingUserId: string | null = null;
let snapshotProvider: (() => PersistedSnapshot) | null = null;

/** Registered by lib/cache.ts — avoids a circular import between the two. */
export function registerSnapshotProvider(provider: () => PersistedSnapshot) {
  snapshotProvider = provider;
}

/**
 * Reads the persisted snapshot for a user. Returns an empty object for a first
 * launch, a different account, an old version, or anything unparseable — a
 * cache miss is always an acceptable outcome here.
 */
export async function readPersistedCache(userId: string): Promise<PersistedSnapshot> {
  if (!userId) return {};
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId));
    if (!raw) return {};

    const parsed = JSON.parse(raw) as PersistedSnapshot;
    if (!parsed || typeof parsed !== 'object') return {};

    const cutoff = Date.now() - MAX_AGE_MS;
    const fresh: PersistedSnapshot = {};
    for (const [key, entry] of Object.entries(parsed)) {
      if (!entry || typeof entry.fetchedAt !== 'number') continue;
      // Day-old adventure data is still worth showing instantly, but not
      // week-old data — that would be actively misleading.
      if (entry.fetchedAt < cutoff) continue;
      if (!isPersistableCacheKey(key)) continue;
      fresh[key] = entry;
    }
    return fresh;
  } catch {
    return {};
  }
}

/**
 * Schedules a write of the current snapshot. Debounced because a single Home
 * load calls setCached once per trip per resource; without this, opening the
 * app would fire dozens of serialisations of the same growing object.
 */
export function schedulePersist(userId: string) {
  if (!userId || !snapshotProvider) return;
  pendingUserId = userId;
  if (pendingWrite) return;

  pendingWrite = setTimeout(() => {
    pendingWrite = null;
    const targetUserId = pendingUserId;
    if (!targetUserId || !snapshotProvider) return;
    const snapshot = snapshotProvider();
    void AsyncStorage.setItem(storageKey(targetUserId), JSON.stringify(snapshot)).catch(() => {
      // Persistence is an optimisation. A full disk or a serialisation failure
      // must never surface to the user or break the in-memory cache.
    });
  }, WRITE_DEBOUNCE_MS);
}

/** Drops one user's persisted cache. Called on sign-out and account deletion. */
export async function clearPersistedCache(userId: string) {
  if (pendingWrite) {
    clearTimeout(pendingWrite);
    pendingWrite = null;
  }
  pendingUserId = null;
  if (!userId) return;
  try {
    await AsyncStorage.removeItem(storageKey(userId));
  } catch {
    // Nothing useful to do — the in-memory cache is cleared regardless.
  }
}
