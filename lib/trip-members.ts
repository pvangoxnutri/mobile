// The one ordering rule for an adventure's member avatars.
//
// The avatars used to reshuffle on their own — visibly, while standing still on
// Home, and again on every navigation back into an adventure. The cause was not
// rendering: keys were already stable. It was the data. GET
// /api/trips/{id}/members had no ORDER BY, so Postgres returned rows in
// whatever order the plan produced, and that order genuinely changes (after row
// updates, or when the planner picks a different scan). The presence poll
// re-fetches that endpoint every 5–30 seconds and writes the result straight
// into state and cache, so each poll could rearrange the row.
//
// The server now orders explicitly. This function is the defensive half: it
// reproduces the same order on the client, so a cached list and a freshly
// fetched one agree, and Home and the adventure header can never disagree with
// each other.
//
// The sort keys are deliberately all immutable facts about the membership:
//
//   1. owner first          — existing product rule; the row already leads with
//                             the person who created the adventure
//   2. then when they joined
//   3. then user id         — the final tie-breaker, stable forever
//
// Nothing here sorts on anything that changes by itself. Online status,
// last-seen, whether an avatar image has loaded or fallen back to initials —
// all of those move constantly and none of them may touch position.

/** The shape every avatar surface needs. Screens may carry extra fields. */
export type TripMemberLike = {
  id: string;
  name: string;
  avatarUrl?: string | null;
  isOwner: boolean;
  isOnline?: boolean;
  /** ISO timestamp of when the membership was created. Absent on payloads
   *  cached before the server started sending it. */
  joinedAt?: string | null;
};

/**
 * Deduplicates and orders a member list.
 *
 * Duplicates are collapsed by user id — the same person must never appear twice
 * because one copy came from an owner record and another from a plain
 * membership. When copies disagree, the merge keeps the strongest claim:
 * owner wins over non-owner, online wins over offline, and any avatar wins over
 * none, so a partial copy can never erase detail a fuller copy had.
 *
 * Returns a new array; the input is never mutated.
 */
export function normalizeTripMembers<T extends TripMemberLike>(raw: readonly T[] | null | undefined): T[] {
  if (!Array.isArray(raw)) return [];

  const byId = new Map<string, T>();

  for (const member of raw) {
    // A row with no id cannot be keyed, deduped or ordered — and would render
    // as an avatar nobody can identify.
    if (!member || typeof member.id !== 'string' || member.id.length === 0) continue;

    const existing = byId.get(member.id);
    if (!existing) {
      byId.set(member.id, member);
      continue;
    }

    byId.set(member.id, {
      ...existing,
      ...member,
      isOwner: existing.isOwner || member.isOwner,
      isOnline: existing.isOnline || member.isOnline,
      avatarUrl: member.avatarUrl ?? existing.avatarUrl ?? null,
      joinedAt: existing.joinedAt ?? member.joinedAt ?? null,
    });
  }

  return [...byId.values()].sort(compareMembers);
}

function compareMembers(left: TripMemberLike, right: TripMemberLike): number {
  if (left.isOwner !== right.isOwner) return left.isOwner ? -1 : 1;

  // Empty string for a missing timestamp keeps this a total order (every
  // comparison is well-defined and transitive), which Array.sort requires.
  // Payloads cached before the server sent joinedAt therefore group ahead of
  // the rest and fall through to the id tie-breaker — a single settle on the
  // first fresh fetch, not an ongoing shuffle.
  const leftJoined = left.joinedAt ?? '';
  const rightJoined = right.joinedAt ?? '';
  if (leftJoined !== rightJoined) return leftJoined < rightJoined ? -1 : 1;

  if (left.id !== right.id) return left.id < right.id ? -1 : 1;
  return 0;
}

/**
 * The first `limit` members of the normalized list, plus how many are left
 * over. Both the visible avatars and any "+N" must come from the SAME
 * deduplicated list, or the count contradicts what is on screen.
 */
export function pickVisibleMembers<T extends TripMemberLike>(
  members: readonly T[],
  limit: number,
): { visible: T[]; overflow: number } {
  const normalized = normalizeTripMembers(members);
  return {
    visible: normalized.slice(0, limit),
    overflow: Math.max(0, normalized.length - limit),
  };
}
