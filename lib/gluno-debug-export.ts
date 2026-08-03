import type { GlunoChatMessage } from '@/lib/gluno-cache';

// ──────────────────────────────────────────────────────────────────────────
// GLUNO — a copyable transcript for debugging.
//
// This exists because the same production failure survived several rounds of
// fixing, and every investigation started by guessing which path produced a
// line. A transcript the user can paste turns that into a reading.
//
// WHAT THIS IS ALLOWED TO CONTAIN. The user's own conversation, as it is
// already on their screen, plus the structural facts about how each turn was
// produced — ids, codes, enums, counts.
//
// WHAT IT MUST NEVER CONTAIN is anything the user cannot see and did not
// choose to share: tokens, headers, keys, signed URLs, coordinates, raw
// provider payloads, other people's data. Those are not filtered out at the
// end — they are never read in the first place. Every field below is named
// explicitly, so a future field on the message type cannot arrive in an export
// by default.
//
// The sanitiser is a second line of defence for the one field that carries
// free text: what the user typed and what Gluno answered. A URL with a query
// string in a chat message is unlikely, but a signed one would be a real leak.
// ──────────────────────────────────────────────────────────────────────────

export type GlunoDebugExportInput = {
  /** "all_adventures" or "adventure:{tripId}" — the authoritative identity. */
  scope: string;
  scopeLabel: string;
  conversationId: string | null;
  tripId: string | null;
  messages: GlunoChatMessage[];
  /** Injected so the output is deterministic and testable. */
  now?: Date;
};

/**
 * How much of a single message body is kept.
 *
 * Long enough for any real answer, short enough that a pasted transcript stays
 * readable and a runaway payload cannot be smuggled through the text field.
 */
const MAX_TEXT = 4000;

/**
 * Strips anything secret-shaped out of free text.
 *
 * ORDER MATTERS: query strings go first, so a signed URL loses its signature
 * before the URL itself is considered. Each rule replaces with a fixed marker
 * rather than deleting, so a reader can see that something was removed instead
 * of silently reading a truncated sentence.
 */
export function sanitiseForExport(text: string): string {
  const cleaned = text
    // Anything after a ? or # in a URL — where signatures and tokens live.
    .replace(/(https?:\/\/[^\s?#]+)[?#][^\s]*/gi, '$1?[removed]')
    // Bearer tokens and Authorization headers, however they were pasted.
    .replace(/\b(bearer|authorization)\s*[:=]?\s*\S+/gi, '$1 [removed]')
    // JWTs, which are recognisable without knowing where they came from.
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+/g, '[removed]')
    // Long opaque blobs — a key, a hash, a base64 payload.
    .replace(/\b[A-Za-z0-9_-]{40,}\b/g, '[removed]')
    // Explicit key/secret assignments.
    .replace(/\b(api[_-]?key|secret|token|password)\s*[:=]\s*\S+/gi, '$1=[removed]');

  return cleaned.length > MAX_TEXT ? `${cleaned.slice(0, MAX_TEXT)}…[truncated]` : cleaned;
}

function clockTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '--:--';

  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/**
 * The structural facts about one turn, as `key=value` pairs.
 *
 * Only what is present. An absent field is omitted rather than printed as
 * "none", so the shape of the line itself says what the turn carried.
 */
function metadata(message: GlunoChatMessage): string[] {
  const pairs: string[] = [`messageId=${message.id}`];

  if (message.responseOrigin) pairs.push(`responseOrigin=${message.responseOrigin}`);
  if (message.pending) pairs.push('pending=true');
  if (message.failed) pairs.push('failed=true');
  if (message.failureCode) pairs.push(`errorCode=${message.failureCode}`);
  if (message.errorStatus !== undefined) pairs.push(`httpStatus=${message.errorStatus}`);
  if (message.retryable !== undefined) pairs.push(`retryable=${message.retryable}`);
  if (message.action?.type) pairs.push(`action=${message.action.type}`);

  if (message.clarification) {
    pairs.push(`clarification=${message.clarification.type}`);
    pairs.push(`clarificationOptions=${message.clarification.options?.length ?? 0}`);
  }

  if (message.proposals?.length) {
    // Kind and status — never the payload, which holds the plan itself.
    pairs.push(`proposals=${message.proposals.map((p) => `${p.kind}:${p.status}`).join(',')}`);
  }

  if (message.places?.length) {
    pairs.push(`places=${message.places.length}`);
    // The server's own positional keys. They identify a card within a message
    // and mean nothing outside it.
    pairs.push(`optionKeys=${message.places.map((place) => place.optionKey).join(',')}`);
  }

  if (message.navigations?.length) pairs.push(`navigations=${message.navigations.length}`);
  if (message.sources?.length) pairs.push(`sources=${message.sources.length}`);

  return pairs;
}

/**
 * Where a row came from, as far as the app can tell.
 *
 * A local id means an optimistic row this device created and the server has
 * not replaced yet. Everything else came from a response or from the history
 * load — the app cannot distinguish those two after the fact, which is
 * exactly why the backend now stamps responseOrigin.
 */
function source(message: GlunoChatMessage): string {
  if (message.id.startsWith('local-')) return 'local_optimistic';
  return message.responseOrigin ? 'live_response' : 'history_or_cache';
}

/**
 * The whole transcript, as plain text.
 *
 * Pure: no clipboard, no navigation, no state. That is what makes it testable
 * without a UI, and what keeps the decision about WHAT to include separate
 * from the decision about when to offer it.
 */
export function buildGlunoDebugExport(input: GlunoDebugExportInput): string {
  const exportedAt = (input.now ?? new Date()).toISOString();

  const header = [
    'GLUNO DEBUG EXPORT',
    `Scope: ${input.scopeLabel}`,
    `ScopeKey: ${input.scope}`,
    `ConversationId: ${input.conversationId ?? '-'}`,
    `TripId: ${input.tripId ?? '-'}`,
    `Messages: ${input.messages.length}`,
    `ExportedAt: ${exportedAt}`,
  ].join('\n');

  // Chronological, and stable when two rows share a timestamp — the same
  // ordering the list itself uses.
  const ordered = [...input.messages].sort((a, b) => {
    const byTime = a.createdAt.localeCompare(b.createdAt);
    return byTime !== 0 ? byTime : a.id.localeCompare(b.id);
  });

  const body = ordered.map((message) => {
    const who = message.role === 'user' ? 'USER' : 'GLUNO';

    return [
      `[${clockTime(message.createdAt)}] ${who}`,
      sanitiseForExport(message.text ?? ''),
      `  · ${metadata(message).join(' ')} source=${source(message)}`,
    ].join('\n');
  });

  return `${header}\n\n${body.join('\n\n')}\n`;
}
