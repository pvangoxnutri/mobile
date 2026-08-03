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
  // A FAILED row without an origin prints the absence explicitly. This is
  // what separates "the backend named the failing branch" from "no server
  // response existed at all" — the distinction the whole export exists for.
  else if (message.failed) pairs.push('responseOrigin=-');
  if (message.pending) pairs.push('pending=true');
  if (message.failed) pairs.push('failed=true');
  if (message.failureCode) pairs.push(`errorCode=${message.failureCode}`);
  if (message.errorStatus !== undefined) pairs.push(`httpStatus=${message.errorStatus}`);
  if (message.retryable !== undefined) pairs.push(`retryable=${message.retryable}`);
  // The id that joins this row to the backend's own
  // "[GLUNO] request done requestId=…" summary line. On a FAILED row its
  // absence is printed outright: requestId=- beside a clientRequestId is the
  // signature of an answer that never came from our backend.
  if (message.requestId) pairs.push(`requestId=${message.requestId}`);
  else if (message.failed) pairs.push('requestId=-');
  if (message.clientRequestId) pairs.push(`clientRequestId=${message.clientRequestId}`);
  // Shape of a contractless answer — media type and declared length, never
  // the body.
  if (message.failed && message.errorContentType !== undefined) {
    pairs.push(`contentType=${message.errorContentType}`);
  }
  if (message.failed && message.errorBodyLength !== undefined) {
    pairs.push(`bodyLength=${message.errorBodyLength}`);
  }
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
 * Which TRANSPORT delivered a row — and nothing about which code path
 * produced it, which is responseOrigin's job and printed separately.
 *
 * A local id means an optimistic row this device created and the server has
 * not replaced yet. `live` is set only by the handler that applied a turn
 * response in this session; everything else arrived through a history or
 * page load. Conflating the two was a bug: history rows carry responseOrigin
 * now, and reading origin as liveness would have relabelled every reloaded
 * row as a live response.
 */
function source(message: GlunoChatMessage): string {
  // `live` wins over the local id: a FAILED turn keeps its optimistic row id,
  // but when a server response actually arrived (any status, any code) the
  // transport fact is live_response — that is what separates "the backend
  // answered with an error" from "this never got an answer" in an export.
  if (message.live) return 'live_response';
  if (message.id.startsWith('local-')) return 'local_optimistic';
  return 'history_or_cache';
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
