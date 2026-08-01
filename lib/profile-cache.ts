// The last known profile for the signed-in user, on disk.
//
// This exists to take POST /api/auth/sync off the cold-start critical path.
// AuthGate blocks the whole app on `loading`, and `loading` only cleared once
// that request finished — so a slow or unreachable backend held the branded
// startup screen for the full 15-second timeout before anything else could
// even begin. With a cached profile the app can route on the first frame and
// let the sync happen behind the running UI.
//
// What is stored is the minimum needed to ROUTE and render the shell:
// identity, onboarding status, language, display fields. Never a token —
// Supabase owns session storage, and this must not become a second place
// credentials live. The Supabase session is still what authenticates every
// request; this only avoids waiting on a round-trip to learn the user's own
// profile fields, which barely change.

import AsyncStorage from '@react-native-async-storage/async-storage';

import type { UserInfo } from '@/lib/types';

// Bump when UserInfo's shape changes in a way an old cached copy could not
// satisfy. An unknown version simply misses, and the app fetches.
const CACHE_VERSION = 'v1';
const KEY_PREFIX = `sidequest.profile.${CACHE_VERSION}`;

/**
 * Beyond this the cached profile is not trusted for routing. Long enough that
 * normal use never re-blocks on the network, short enough that a stale
 * onboarding flag cannot persist indefinitely for someone who does not open
 * the app for months.
 */
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

type PersistedProfile = { profile: UserInfo; savedAt: number };

function storageKey(userId: string) {
  return `${KEY_PREFIX}.${userId}`;
}

/**
 * The cached profile for this Supabase user, or null if there is none, it is
 * too old, or it does not match the session. Never throws: any problem is a
 * miss, and a miss just means the app waits for the sync as it used to.
 */
export async function loadCachedProfile(userId: string): Promise<UserInfo | null> {
  if (!userId) return null;
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as PersistedProfile;
    if (!parsed?.profile || typeof parsed.savedAt !== 'number') return null;
    if (Date.now() - parsed.savedAt > MAX_AGE_MS) return null;
    // Guards against a key collision or a hand-edited store handing back
    // somebody else's profile for this session.
    if (parsed.profile.id !== userId) return null;

    return parsed.profile;
  } catch {
    return null;
  }
}

/** Stores the freshly-synced profile. Fire-and-forget; failures are ignored. */
export function saveCachedProfile(profile: UserInfo | null | undefined): void {
  if (!profile?.id) return;
  const payload: PersistedProfile = { profile, savedAt: Date.now() };
  void AsyncStorage.setItem(storageKey(profile.id), JSON.stringify(payload)).catch(() => {});
}

/** Removes the cached profile. Called on sign-out and account deletion. */
export async function clearCachedProfile(userId: string | null | undefined): Promise<void> {
  if (!userId) return;
  try {
    await AsyncStorage.removeItem(storageKey(userId));
  } catch {
    // Nothing useful to do.
  }
}
