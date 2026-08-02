import type { GlunoClarification, GlunoNavigation, GlunoPlace, GlunoProposal, GlunoSource, GlunoTurnAction } from '@/lib/gluno';

// ──────────────────────────────────────────────────────────────────────────
// GLUNO — in-memory conversation cache.
//
// Deliberately NOT persisted. A Gluno conversation contains whatever the user
// typed plus a travel-expert answer built from their private trip data; that
// belongs in memory for the length of a session and nowhere else. This is the
// same reasoning as lib/chat-image-access.ts — the app's other caches persist
// because they hold data the API would return again anyway.
//
// What it buys: leaving the screen and coming back doesn't re-fetch, and an
// in-progress conversation survives a tab switch. What it must never do is
// leak between users, hence the userId in every key and the logout hook.
// ──────────────────────────────────────────────────────────────────────────

/**
 * A message as the chat screen holds it.
 *
 * Deliberately not the API shape. `pending` and `failed` describe an
 * optimistic user message that has no server row yet, and `localId` is what
 * lets the server's version replace it in place instead of appearing as a
 * duplicate underneath it.
 */
export type GlunoChatMessage = {
  id: string;
  role: 'user' | 'gluno';
  text: string;
  createdAt: string;
  proposals?: GlunoProposal[];
  places?: GlunoPlace[];
  navigations?: GlunoNavigation[];
  /** Where this answer's non-place facts came from — the compact source row. */
  sources?: GlunoSource[];
  /**
   * A question with tappable answers attached to this turn. The card renders
   * under the answer text and resolves in place — no navigation, and the
   * original question is never retyped.
   */
  clarification?: GlunoClarification;
  /**
   * A retry the server owns, attached to a failed add.
   *
   * NOT CACHED and not part of the history — it describes work the server can
   * redo from ids it already has, and offering the button after a reload would
   * offer a retry for a failure nobody remembers.
   */
  action?: GlunoTurnAction;
  /** In flight — rendered dimmed, no timestamp yet. */
  pending?: boolean;
  /** The send failed. Carries a retry action; never silently dropped. */
  failed?: boolean;
  /**
   * HTTP status of the failure, so the row can say "you don't have access to
   * this Adventure" instead of the generic line. Never the error's message —
   * raw backend/SDK/timeout text must not reach the user.
   */
  errorStatus?: number;
  /**
   * A stable backend failure code, localised by the row. An unknown future
   * code falls back to the generic line rather than crashing the chat.
   */
  failureCode?: string;
  /**
   * Whether offering retry is honest. Decided by the SERVER — only it knows
   * whether a missing key (never retryable) or a timeout (often) caused this.
   */
  retryable?: boolean;
};

export type GlunoConversationCacheEntry = {
  conversationId: string | null;
  /** Adventure name as the API last reported it; null for a global chat. */
  tripTitle: string | null;
  messages: GlunoChatMessage[];
  /** Whether older pages remain on the server. */
  hasMore: boolean;
  /** True once the first load for this scope has completed. */
  loaded: boolean;
};

/**
 * Scope key. A global conversation and an Adventure-scoped one are separate
 * histories on the backend, and mixing them here would show a user the wrong
 * one — so the trip is part of the key, not a filter applied afterwards.
 */
function scopeKey(userId: string, tripId: string | null) {
  return `${userId}:${tripId ?? 'global'}`;
}

const cache = new Map<string, GlunoConversationCacheEntry>();

export function readGlunoCache(userId: string, tripId: string | null): GlunoConversationCacheEntry | null {
  return cache.get(scopeKey(userId, tripId)) ?? null;
}

export function writeGlunoCache(
  userId: string,
  tripId: string | null,
  entry: GlunoConversationCacheEntry,
): void {
  cache.set(scopeKey(userId, tripId), entry);
}

/**
 * Merge by id, newest wins, order by createdAt.
 *
 * The dedupe is what makes optimistic sends, page loads and a re-opened screen
 * all safe to combine: the same server row can arrive from several of those
 * paths and must appear exactly once.
 */
export function mergeGlunoMessages(
  existing: GlunoChatMessage[],
  incoming: GlunoChatMessage[],
): GlunoChatMessage[] {
  const byId = new Map<string, GlunoChatMessage>();
  for (const message of existing) byId.set(message.id, message);
  for (const message of incoming) byId.set(message.id, message);

  return Array.from(byId.values()).sort((a, b) => {
    const byTime = a.createdAt.localeCompare(b.createdAt);
    // Stable tiebreak: two rows written in the same tick must not swap places
    // between renders, which would make the list visibly jump.
    return byTime !== 0 ? byTime : a.id.localeCompare(b.id);
  });
}

/** Called on sign-out and account deletion — see components/auth-provider.tsx. */
export function clearGlunoCache(): void {
  cache.clear();
}
