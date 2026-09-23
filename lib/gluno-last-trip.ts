/**
 * Which Adventure Gluno was last used for, per user.
 *
 * WHY THIS IS PERSISTED WHEN THE CONVERSATION IS NOT. A Gluno conversation is
 * whatever the user typed plus an answer built from their private trip data,
 * and lib/gluno-cache.ts keeps it in memory for exactly that reason. This is a
 * trip id: an opaque handle the user's own Adventure list already contains,
 * carrying no provider content, no message text and nothing about what was
 * asked. It is the same class of data as the trip snapshots
 * lib/persisted-cache.ts is allowed to write.
 *
 * SCOPED PER USER, like every other cache in the app. A shared device that
 * hydrated the previous account's Adventure would be a worse bug than the
 * picker it saves.
 *
 * A stored id is a HINT, never an authority. The trip may have been deleted or
 * access revoked since, so the caller must check it against the live Adventure
 * list before selecting it — see app/gluno.tsx.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_PREFIX = 'sidequest.gluno.lastTrip.v1';

function storageKey(userId: string) {
  return `${KEY_PREFIX}.${userId}`;
}

/** The last Adventure Gluno was opened in, or null when there is no hint. */
export async function readLastGlunoTripId(userId: string): Promise<string | null> {
  try {
    const stored = await AsyncStorage.getItem(storageKey(userId));
    const trimmed = stored?.trim();

    return trimmed && trimmed.length > 0 ? trimmed : null;
  } catch {
    // Storage being unavailable is not worth a broken screen: no hint simply
    // falls through to the ordinary 0/1/2+ rule.
    return null;
  }
}

export async function writeLastGlunoTripId(userId: string, tripId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(storageKey(userId), tripId);
  } catch {
    // The hint is an optimisation. Losing it costs one tap next time.
  }
}

/** Forgets the hint — a deleted trip, or a scope that is no longer an Adventure. */
export async function clearLastGlunoTripId(userId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(storageKey(userId));
  } catch {
    // Nothing to do: a stale id is re-checked against the live list anyway.
  }
}
