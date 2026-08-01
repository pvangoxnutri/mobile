// Short-lived read access to private chat images.
//
// Chat photos live in a private bucket now, so a message no longer carries a
// URL — it carries `hasPrivateImage`, and the client trades the message id for
// a signed URL that expires in a few minutes. That makes the caching rules
// load-bearing rather than an optimisation:
//
//   * MEMORY ONLY. Nothing here touches AsyncStorage or the database. A signed
//     URL that outlives the process would be a durable grant of access to
//     private conversation content sitting on the device.
//   * DEDUPED. Chat polls every couple of seconds and re-renders the whole
//     list; without dedupe, one visible photo would mint a fresh signed URL on
//     every tick. Concurrent callers for the same message share one request.
//   * EXPIRY-AWARE. Entries are treated as stale slightly before the server's
//     expiry so a URL is never handed to <Image> just as it dies.
//   * CLEARABLE. Sign-out, leaving an adventure, or losing membership must drop
//     what is cached — see clearChatImageAccessCache / clearTripChatImageAccess.
//
// Nothing in this file logs a URL, an object path, or a response body.

import { apiJson } from '@/lib/api';

type AccessResponse = {
  url: string;
  expiresAt: string;
};

type CacheEntry = {
  url: string;
  /** Epoch ms after which this URL must not be used again. */
  expiresAtMs: number;
};

// Re-request this long before the real expiry. Covers clock skew between
// device and server plus the time it takes <Image> to actually fetch.
const EXPIRY_SAFETY_MS = 30_000;

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<string | null>>();

function cacheKey(tripId: string, messageId: string) {
  return `${tripId}:${messageId}`;
}

function readFresh(key: string): string | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() >= entry.expiresAtMs - EXPIRY_SAFETY_MS) {
    cache.delete(key);
    return null;
  }
  return entry.url;
}

/**
 * A usable signed URL for this message's private image, or null if access
 * could not be obtained (not a member any more, message gone, storage down).
 *
 * Returns a cached URL when one is still fresh, so repeated renders and chat
 * polls cost nothing. Concurrent calls for the same message resolve to the
 * same request.
 */
export async function getChatImageUrl(tripId: string, messageId: string): Promise<string | null> {
  const key = cacheKey(tripId, messageId);

  const cached = readFresh(key);
  if (cached) return cached;

  const existing = inFlight.get(key);
  if (existing) return existing;

  const request = (async () => {
    try {
      const data = await apiJson<AccessResponse>(
        `/api/trips/${encodeURIComponent(tripId)}/chat/${encodeURIComponent(messageId)}/image`,
        {},
        // The response body IS a working URL to private content — the private
        // marking keeps it out of the log on every failure path.
        { privateEndpointName: 'trip_chat_image_access' },
      );

      if (!data?.url) return null;

      const expiresAtMs = Date.parse(data.expiresAt);
      cache.set(key, {
        url: data.url,
        // An unparseable timestamp must not become "never expires" — fall back
        // to a conservative minute.
        expiresAtMs: Number.isFinite(expiresAtMs) ? expiresAtMs : Date.now() + 60_000,
      });

      return data.url;
    } catch {
      // Deliberately silent: apiFetch already logged the status, and the
      // caller renders a placeholder. The error can carry the response body.
      return null;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, request);
  return request;
}

/**
 * Drops a single message's cached URL. Call when the image itself failed to
 * load — an expired or revoked URL looks exactly like a broken image, and the
 * next attempt has to go back to the server rather than reuse the dead entry.
 */
export function invalidateChatImageUrl(tripId: string, messageId: string) {
  cache.delete(cacheKey(tripId, messageId));
}

/**
 * Drops everything cached for one adventure. Call when leaving the chat/trip,
 * so a URL minted while the user was a member cannot outlive their membership
 * in memory.
 */
export function clearTripChatImageAccess(tripId: string) {
  const prefix = `${tripId}:`;
  for (const key of [...cache.keys()]) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

/** Drops everything. Call on sign-out and account deletion. */
export function clearChatImageAccessCache() {
  cache.clear();
  inFlight.clear();
}
