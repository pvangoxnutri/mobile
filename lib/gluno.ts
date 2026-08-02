import { apiFetch } from '@/lib/api';

// ──────────────────────────────────────────────────────────────────────────
// GLUNO — client for the backend assistant.
//
// This file is the ONLY thing the Gluno UI talks to, and it does exactly one
// kind of work: send a message, read what comes back. Deliberately no prompt,
// no model name, no API key, no trip queries. Everything Gluno needs to know
// about a SideQuest — context, history, tools, external data — is assembled
// server-side in backend/Services/Gluno/, behind the same membership checks
// as the rest of the API. A model key must never reach the app bundle, and
// the assistant's behaviour must be changeable without an app release.
//
// Responses can carry PROPOSALS: validated previews of a change (an Activity,
// a day plan, a move…). They are previews only — nothing is written until the
// user accepts one through the ordinary trip screens.
// ──────────────────────────────────────────────────────────────────────────

/**
 * An AI turn is not a normal request. The model may think, call tools and
 * come back — comfortably past the app's 15s default, which would otherwise
 * report a perfectly healthy turn as a timeout.
 */
const GLUNO_TIMEOUT_MS = 90_000;

/**
 * Conversation text can contain anything the user typed or Gluno answered, so
 * it never goes near a log line. Both request paths carry this.
 */
const PRIVATE = { privateEndpointName: 'gluno' } as const;

export type GlunoStatus = {
  /**
   * Whether Gluno can answer at all: switched on, and able to reach a model.
   *
   * NOT a summary of the capability booleans below. Tripadvisor, routing and
   * live information are optional extras, and requiring them here would take
   * the whole assistant away because one paid API is off.
   */
  available: boolean;
  /** This environment has Gluno switched on. */
  enabled: boolean;
  /** The backend can reach a model. A boolean — never which one. */
  aiConfigured: boolean;
  /** 'disabled' | 'not_configured' | null */
  reason: string | null;
  systemPromptVersion: number;
  travelDataAvailable: boolean;
  /**
   * Whether Gluno can look up current conditions — strikes, closures, events.
   * A boolean; the app never learns which provider or on what credentials.
   */
  liveTravelInfoAvailable: boolean;
  /**
   * Whether travel times in a day plan are verified by a routing provider.
   *
   * A boolean and nothing more — which provider, and on what credentials, is
   * server-side detail the app never sees. False means every travel figure in
   * a plan is an estimate, and the UI has to say so.
   */
  verifiedTravelTimes: boolean;
};

/** One leg between two stops in a day plan. */
export type GlunoTravelLeg = {
  minutes: number;
  /** False means SideQuest estimated it from a straight line. Never present it as measured. */
  verified: boolean;
  mode: 'walking' | 'driving' | 'transit' | 'cycling' | string;
  /** Already localised server-side ("Gång" / "Walking"). */
  modeLabel: string;
  distanceKm: number | null;
  source: string;
};

export type GlunoOpeningHours = {
  status: 'open' | 'closed' | 'partiallyopen' | 'unknown' | string;
  opensAt: string | null;
  closesAt: string | null;
  /** 'closed_that_day' | 'opens_later' | 'closes_before_end' | 'unknown_hours' | … */
  warning: string | null;
  source: string | null;
};

/** One row of a day plan, as the review screen renders and edits it. */
export type GlunoDayPlanRow = {
  title: string;
  time: string;
  endTime?: string;
  description?: string;
  category?: string;
  durationMinutes?: number;
  /** 'category_estimate' | 'provider' | 'user' — never presented as a fact. */
  durationSource?: string;
  isFixed?: boolean;
  /** Set when this row is an Activity that already exists; it is shown for context and not re-created. */
  existingActivityId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  travelFromPrevious?: GlunoTravelLeg | null;
  openingHours?: GlunoOpeningHours | null;
  warnings?: string[];
};

export type GlunoConversation = {
  id: string;
  /** null for a global conversation (no Adventure selected). */
  tripId: string | null;
  /**
   * The Adventure's current name, resolved server-side. Null when global.
   * Comes from the API rather than from navigation params so the chat header
   * stays right after a rename and when the conversation is reopened from
   * somewhere that doesn't know the name.
   */
  tripTitle: string | null;
  title: string | null;
  createdAt: string;
  updatedAt: string;
};

export type GlunoProposalKind =
  | 'activity'
  | 'day_plan'
  | 'day_location'
  | 'activity_move'
  | 'trip_dates';

/**
 * Where a proposal is in its life.
 *
 * Server-side state, not local UI state: two devices, a retry and a double tap
 * all have to agree on whether something has already been applied, and the
 * app's own memory cannot answer that.
 */
export type GlunoProposalStatus =
  | 'pending'
  | 'applying'
  | 'applied'
  | 'rejected'
  | 'failed'
  | 'stale';

/**
 * A change Gluno suggests. `payload`'s shape depends on `kind` — the backend
 * has already validated it against the Adventure, so the app can trust the
 * dates and ids in it, but nothing happens until the user applies it.
 *
 * `id` is both the handle for apply/edit/reject AND the idempotency key: the
 * same proposal can only ever be applied once, however many times it is sent.
 * An empty id means a proposal from before the apply flow existed — it renders
 * as history and cannot be applied.
 */
export type GlunoProposal = {
  id: string;
  kind: GlunoProposalKind | string;
  /** The allow-listed backend action, e.g. "propose_activity". */
  actionType: string;
  tripId: string;
  summary: string;
  payload: Record<string, unknown>;
  payloadVersion: number;
  status: GlunoProposalStatus;
  /** Machine-readable reason for a failed or stale proposal. */
  failureCode: string | null;
  appliedAt: string | null;
};

/** What an apply changed, so the app can refresh exactly the right Adventure. */
export type GlunoApplyChanges = {
  tripId: string | null;
  createdActivityIds: string[];
  updatedActivityIds: string[];
  createdDayLocationIds: string[];
  updatedDayLocationIds: string[];
  tripDatesChanged: boolean;
  affectedDates: string[];
};

export type GlunoApplyResponse = {
  proposal: GlunoProposal;
  changes: GlunoApplyChanges;
  /** Short, neutral, already localised-safe copy. Null on success. */
  message: string | null;
};

/**
 * One real place found through SideQuest's external travel-data provider.
 *
 * Already normalised server-side — the app never sees, and never needs to
 * understand, a provider's raw payload. A null field means the provider did
 * not return it: render nothing, never a placeholder value, and never treat
 * absence as a fact ("no reviews", "free", "open now").
 *
 * `signals` are SideQuest's OWN ranking reasons, not the provider's ordering.
 */
export type GlunoPlace = {
  /**
   * The handle sent back when this place is tapped.
   *
   * Server-generated and positional, scoped to the message that produced it.
   * The app never sends a provider id, a name or a coordinate back — all three
   * are things the server already knows and a client could otherwise change.
   */
  optionKey: string;
  /** Provider id, e.g. "tripadvisor". Stays per-result, never per-list. */
  provider: string;
  /** Namespaced id, e.g. "tripadvisor:12345". */
  externalId: string;
  name: string;
  /** 'restaurant' | 'attraction' | 'hotel' | 'general' */
  category: string;
  categoryLabel: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  /** On the provider's own scale — see ratingScaleMax. Never rescaled. */
  rating: number | null;
  ratingScaleMax: number | null;
  reviewCount: number | null;
  priceLevel: string | null;
  imageUrl: string | null;
  providerUrl: string | null;
  /** Attribution that must be shown wherever this result appears. */
  sourceAttribution: string;
  distanceKm: number | null;
  openingHours: string[];
  reviewSummary: string | null;
  signals: string[];
};

/**
 * A screen Gluno offers to open.
 *
 * A stable target id, never a route: the backend has no field that accepts a
 * path or a URL, and the mapping to an actual screen lives in this app (see
 * lib/gluno-navigation.ts). A target this build does not recognise is ignored
 * rather than followed.
 *
 * Opening a screen changes nothing. The card is an offer, and nothing
 * navigates until the user taps it.
 */
export type GlunoNavigation = {
  targetId: string;
  /** What this app calls the screen, in the user's language. */
  label: string;
  reason: string | null;
  tripId: string | null;
  activityId: string | null;
  /** ISO date — a feed day, or a prefill for the create form. */
  date: string | null;
};

export type GlunoApiMessage = {
  id: string;
  /** 'user' | 'assistant' | 'system' | 'tool' */
  role: string;
  text: string;
  /**
   * False for system and tool turns. The chat renders a bubble only when this
   * is true — the backend decides, so a role added later can't leak into the
   * UI just because the app forgot to filter it.
   */
  isRenderable: boolean;
  proposals: GlunoProposal[];
  /** External places found for this turn, rendered as cards under the answer. */
  places: GlunoPlace[];
  /** Screens the user can choose to open. */
  navigations: GlunoNavigation[];
  /**
   * Where this answer's non-place facts came from, collapsed by source.
   *
   * Place attribution rides on the place cards themselves — next to the rating
   * it supports, which is both where a provider's terms expect it and where it
   * actually means something to a reader.
   */
  sources: GlunoSource[];
  /**
   * The tappable question this turn asked, if any.
   *
   * Carried on the message so a reloaded conversation renders its cards again.
   * Without it, reopening Gluno turns "Which Adventure is this about?" into a
   * question with nothing under it — one the user has to answer by typing.
   */
  clarification?: GlunoClarification | null;
  createdAt: string;
};

/** One chip in the chat's compact "Sources" row. */
export type GlunoSource = {
  /** 'route' | 'weather' | 'hours' | 'plan' | 'provider' | 'live' — drives the icon. */
  kind: string;
  /** Already localised server-side. */
  label: string;
  /** What this source backs, in a few words. */
  supports: string;
  verifiedAt: string | null;
  /** Past its freshness window. Labelled, never hidden. */
  isStale: boolean;
  provider: string | null;
};

export type GlunoTurnResponse = {
  conversation: GlunoConversation;
  userMessage: GlunoApiMessage;
  assistantMessage: GlunoApiMessage;
  /**
   * A question with tappable answers, when the turn stopped to ask one.
   * Absent on an ordinary turn.
   */
  clarification?: GlunoClarification | null;
  /**
   * Something the server can do again after a failure, described entirely by
   * ids it minted.
   *
   * THE BUG THIS EXISTS FOR. A failed add told the user to retype "lägg till
   * Casas de Pilatos". Everything needed to try again was already known
   * server-side, so it comes back here and the chat renders a button.
   *
   * Sent back UNCHANGED to the route that produced it. Nothing in it is a
   * place name or a coordinate, and none of it is worth forging: every field
   * is re-verified against the caller's own conversation.
   */
  action?: GlunoTurnAction | null;
};

export type GlunoTurnActionType = 'retry_place_add' | 'show_new_place_suggestions';

export type GlunoTurnAction = {
  type: GlunoTurnActionType;
  messageId?: string | null;
  optionKey?: string | null;
  /** A day the user already chose, so a retry does not ask again. */
  date?: string | null;
  /** Reused verbatim, so a retry cannot produce a second proposal. */
  idempotencyKey?: string | null;
};

export type GlunoConversationDetail = {
  conversation: GlunoConversation;
  /** Newest page, oldest message first. */
  messages: GlunoApiMessage[];
  /** True when older messages exist beyond this page. */
  hasMore: boolean;
};

export type GlunoMessagePage = {
  messages: GlunoApiMessage[];
  hasMore: boolean;
};

/**
 * A failed Gluno request, carrying what the UI needs to respond well.
 *
 * `code` is a stable backend failure code; the app localises it. `retryable`
 * comes from the backend rather than being guessed here — only the server knows
 * whether a missing API key (never retryable) or a timeout (often) caused it,
 * and offering "try again" on a permanent config error is cruel.
 */
export type GlunoRequestError = Error & {
  status?: number;
  code?: string;
  retryable?: boolean;
  /** The user pressed stop. Never rendered as a failure. */
  cancelled?: boolean;
};

/** HTTP 499: the conventional "client closed request". */
const STATUS_CANCELLED = 499;

async function glunoJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;

  try {
    response = await apiFetch(path, options, GLUNO_TIMEOUT_MS, PRIVATE);
  } catch (transport) {
    // The request never produced a response: a timeout, a dead radio, a
    // backend that could not be reached at all.
    //
    // apiFetch throws a PLAIN Error here — no status, no code — so without
    // this every transport failure arrived at the UI as an untyped error and
    // rendered as "Gluno could not answer", which blames Gluno for something
    // that never reached it. Giving it a code lets the chat say the true
    // thing.
    if ((transport as { name?: string })?.name === 'AbortError'
      && (options.signal as AbortSignal | undefined)?.aborted) {
      throw transport;   // The user pressed Stop. Not a failure.
    }

    const error = new Error('Gluno request failed.') as GlunoRequestError;
    error.code = 'network_error';
    error.retryable = true;

    if (__DEV__) {
      // Names and codes only — never a body, a token or message text.
      console.log('[GLUNO] request failed before a response: network_error');
    }

    throw error;
  }

  if (!response.ok) {
    const error = new Error('Gluno request failed.') as GlunoRequestError;
    error.status = response.status;
    error.cancelled = response.status === STATUS_CANCELLED;

    // Only the small typed envelope, never a message body — on this endpoint
    // the body can echo conversation content.
    try {
      const body = (await response.json()) as {
        code?: unknown; error?: unknown; retryable?: unknown;
      };

      // `code` is the current field, `error` the one earlier builds sent. Same
      // value from a current backend; either alone is enough.
      if (typeof body?.code === 'string') error.code = body.code;
      else if (typeof body?.error === 'string') error.code = body.error;

      if (typeof body?.retryable === 'boolean') error.retryable = body.retryable;
    } catch {
      // Intentionally empty — the fallback below covers it.
    }

    // ── The contract, enforced on this side too ─────────────────────────
    //
    // THE BUG THIS CLOSES. A 502 arrived with no JSON at all — it came from the
    // edge, which knows nothing about this envelope — and the chat rendered
    // "code: missing, retry: missing" beside the message. A response that does
    // not match the contract is not a response to describe field by field; it
    // is a failure like any other, and it gets a code the UI has copy for.
    //
    // Deliberately not derived from the status: a 502 from our backend and a
    // 502 from a proxy in front of it mean the same thing to the person
    // waiting, and neither is worth a different sentence.
    if (error.code === undefined) error.code = 'request_failed';
    if (error.retryable === undefined) error.retryable = response.status >= 500;

    if (__DEV__) {
      // The four things that decide what the chat shows, and nothing else:
      // no body, no token, no conversation or trip id, no message text.
      console.log(
        `[GLUNO] turn failed status=${error.status} code=${error.code ?? 'none'} `
        + `retryable=${error.retryable ?? 'unset'}`,
      );
    }

    throw error;
  }

  return (await response.json()) as T;
}

/**
 * Whether Gluno can answer at all in this environment. The UI asks once on
 * open, so a build with the feature flag on never presents a chat panel
 * against a backend that has Gluno switched off or unconfigured.
 */
export async function getGlunoStatus() {
  return normaliseGlunoStatus(await glunoJson<Partial<GlunoStatus>>('/api/gluno/status'));
}

/**
 * Fills in a status response from a backend older or newer than this build.
 *
 * The important default is `available`. A response missing the field must NOT
 * read as "Gluno does not exist here" — that is a claim about the product, and
 * an absent field is not evidence for it. So a reachable backend that answered
 * at all is treated as available unless it explicitly said otherwise, and the
 * optional capability booleans default to false, which only ever makes the UI
 * more modest about what it can verify.
 */
export function normaliseGlunoStatus(raw: Partial<GlunoStatus> | null | undefined): GlunoStatus {
  const available = typeof raw?.available === 'boolean' ? raw.available : true;

  return {
    available,
    // Older backends sent neither. Deriving them from `available` keeps the
    // two consistent rather than reporting "available but not configured".
    enabled: typeof raw?.enabled === 'boolean' ? raw.enabled : available,
    aiConfigured: typeof raw?.aiConfigured === 'boolean' ? raw.aiConfigured : available,
    reason: typeof raw?.reason === 'string' ? raw.reason : null,
    systemPromptVersion: typeof raw?.systemPromptVersion === 'number' ? raw.systemPromptVersion : 0,
    travelDataAvailable: raw?.travelDataAvailable === true,
    liveTravelInfoAvailable: raw?.liveTravelInfoAvailable === true,
    verifiedTravelTimes: raw?.verifiedTravelTimes === true,
  };
}

/**
 * One turn.
 *
 * Omit `conversationId` to start a new conversation; pass `tripId` at that
 * point to scope it to an Adventure. Scope is fixed at creation — continuing
 * a conversation ignores `tripId`, which is what stops a chat from silently
 * drifting onto a different trip.
 *
 * NOT STREAMED, deliberately. Gluno's backend turn is a tool loop: the model
 * may call an action, the backend validates it, and the model then answers —
 * so a token stream would have to carry mid-loop state and the client would
 * have to render around it. That is a real rebuild of the backend turn, not a
 * flag, and a fake stream that reveals an already-complete reply character by
 * character is worse than an honest wait. The screen shows "Gluno is
 * thinking…" instead, and the whole answer arrives at once.
 */
export async function sendGlunoMessage(input: {
  message: string;
  conversationId?: string | null;
  tripId?: string | null;
  /**
   * Where the user opened Gluno from, as a stable screen id. Only makes help
   * shorter — the backend drops anything it does not recognise, and nothing
   * acts on it.
   */
  screen?: string | null;
  /**
   * Generated once per composed message and reused across retries, so a
   * dropped connection or a double tap cannot produce a second answer or a
   * second applicable proposal.
   */
  idempotencyKey?: string;
  /** Aborted when the user taps Stop. */
  signal?: AbortSignal;
}) {
  return glunoJson<GlunoTurnResponse>('/api/gluno/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: input.signal,
    body: JSON.stringify({
      message: input.message,
      conversationId: input.conversationId ?? null,
      tripId: input.tripId ?? null,
      screen: input.screen ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
    }),
  });
}

/**
 * A key for one composed message.
 *
 * Deliberately generated at SEND time and held for the lifetime of that
 * message's retries — regenerating it on retry would defeat the whole point,
 * and generating it per keystroke would make two deliberate identical questions
 * collide.
 */
export function createGlunoIdempotencyKey() {
  return `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** True when a failure was the user pressing Stop, not something going wrong. */
export function isGlunoCancellation(error: unknown) {
  const candidate = error as GlunoRequestError | { name?: string } | null;
  if (!candidate) return false;

  return (candidate as GlunoRequestError).cancelled === true
    || (candidate as { name?: string }).name === 'AbortError';
}

/**
 * The conversation to reopen for this scope, or null when there isn't one.
 *
 * Opening the screen must not mint an empty conversation every time — nothing
 * is created until a message is actually sent, so this returns 204 (→ null)
 * for a scope the user has never used.
 */
export async function getCurrentGlunoConversation(tripId?: string | null) {
  const query = tripId ? `?tripId=${encodeURIComponent(tripId)}` : '';
  const response = await apiFetch(`/api/gluno/conversations/current${query}`, {}, GLUNO_TIMEOUT_MS, PRIVATE);

  if (response.status === 204) return null;
  if (!response.ok) {
    const error = new Error('Gluno request failed.') as Error & { status?: number };
    error.status = response.status;
    throw error;
  }

  return (await response.json()) as GlunoConversationDetail;
}

export async function getGlunoConversation(conversationId: string) {
  return glunoJson<GlunoConversationDetail>(`/api/gluno/conversations/${conversationId}`);
}

/**
 * One page of older messages. `before` is the createdAt of the oldest message
 * already held — a timestamp cursor rather than an offset, so new turns
 * arriving mid-scroll can't shift the window and duplicate or skip rows.
 */
export async function getGlunoMessagePage(
  conversationId: string,
  before: string,
  limit = 30,
) {
  const query = `?before=${encodeURIComponent(before)}&limit=${limit}`;
  return glunoJson<GlunoMessagePage>(`/api/gluno/conversations/${conversationId}/messages${query}`);
}

export async function listGlunoConversations(tripId?: string | null) {
  const query = tripId ? `?tripId=${encodeURIComponent(tripId)}` : '';
  return glunoJson<GlunoConversation[]>(`/api/gluno/conversations${query}`);
}

// ── Proposals ─────────────────────────────────────────────────────────────
//
// Applying is always a separate, explicit request — never something a chat
// turn does on the user's behalf. The backend re-validates everything against
// the live database at that moment, so a proposal made ten minutes ago cannot
// slip past a permission change or a plan someone else has since edited.

/**
 * Shared reader for the proposal endpoints.
 *
 * 200, 409 and 422 all return the SAME body: the proposal in its new state
 * plus a neutral message. That is deliberate — "already applied", "gone stale"
 * and "could not be applied" are outcomes the UI has to render, not transport
 * failures to throw on. Anything else really is an error.
 */
async function proposalRequest(path: string, options: RequestInit = {}): Promise<GlunoApplyResponse> {
  const response = await apiFetch(path, options, GLUNO_TIMEOUT_MS, PRIVATE);

  if (response.ok || response.status === 409 || response.status === 422) {
    return (await response.json()) as GlunoApplyResponse;
  }

  const error = new Error('Gluno request failed.') as Error & { status?: number };
  error.status = response.status;
  throw error;
}

export async function getGlunoProposal(proposalId: string) {
  return glunoJson<GlunoProposal>(`/api/gluno/proposals/${proposalId}`);
}

/**
 * Records the user's edits. Does not apply anything — the edited payload is
 * what a later apply validates.
 */
export async function updateGlunoProposal(proposalId: string, payload: Record<string, unknown>) {
  return proposalRequest(`/api/gluno/proposals/${proposalId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload }),
  });
}

/**
 * Applies the proposal. Safe to retry: the proposal id is the idempotency
 * key, so a repeat returns the original result rather than creating a second
 * Activity.
 */
export async function applyGlunoProposal(proposalId: string) {
  return proposalRequest(`/api/gluno/proposals/${proposalId}/apply`, { method: 'POST' });
}

export async function rejectGlunoProposal(proposalId: string) {
  return proposalRequest(`/api/gluno/proposals/${proposalId}/reject`, { method: 'POST' });
}

// ──────────────────────────────────────────────────────────────────────────
// GLUNO — clickable follow-up questions.
//
// When a question cannot be answered without a choice, the turn comes back
// with one of these instead of a guess. Tapping an option resumes the ORIGINAL
// question — the user never retypes it.
//
// The client holds no entity ids. An option is a key and a label; every id
// stays server-side, which is what stops a tampered request from pointing the
// choice at something the user may not touch.
// ──────────────────────────────────────────────────────────────────────────

export type GlunoClarificationOption = {
  key: string;
  label: string;
  description?: string | null;
  /** A stable icon name from the app's own set. Never a URL. */
  icon?: string | null;
  disabled?: boolean;
  /** Already localised by the backend — never a raw status. */
  disabledReason?: string | null;
};

export type GlunoClarification = {
  id: string;
  /**
   * adventure | day | activity | place | transport_mode | pace | budget |
   * preference_scope | proposal_conflict
   *
   * A type this build has never seen still renders: the question and the
   * options are all the card actually needs.
   */
  type: string;
  question: string;
  options: GlunoClarificationOption[];
  allowFreeText?: boolean;
  multiSelect?: boolean;
  /** pending | resolved | expired | cancelled | stale */
  status: string;
  selectedKey?: string | null;
  expiresAt: string;
  /** Present only on a proposal_conflict. */
  conflict?: GlunoConflictMeta | null;
};

/**
 * What a conflict card shows above its options.
 *
 * NOTE WHAT IS NOT HERE: no draft id, no version numbers, no activity ids. The
 * app renders a sentence, a day and a time, and sends back nothing but the
 * clarification id and the option key. Everything the server checks a tap
 * against stays on the server, where the app cannot change it.
 */
export type GlunoConflictMeta = {
  /** time_overlap | locked_booking | outside_trip_dates | … */
  type: string;
  /** ISO date, when the clash is about one day. */
  date?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  /** True when the thing it clashes with is a booking that cannot be moved. */
  existingIsLocked?: boolean;
  /**
   * Minutes the gap is short by, on a travel-time clash. Zero otherwise.
   *
   * A number rather than a sentence, so the app writes it in the user's own
   * language instead of rendering one the backend picked.
   */
  missingTravelMinutes?: number;
  /** Titles of what is involved, as the Adventure already shows them. */
  affectedTitles?: string[];
};

/**
 * Answers a clarification and returns the continuation.
 *
 * The response is an ordinary turn — the answer to the question the user
 * asked before the choice was needed.
 */
/**
 * One recommended place, in full, for the detail card.
 *
 * Read back from the turn that recommended it rather than searched again — a
 * second lookup could return different data, and the card would then show
 * something the user was never recommended.
 */
export async function getGlunoRecommendedPlace(messageId: string, optionKey: string) {
  return glunoJson<GlunoPlace>(
    `/api/gluno/messages/${encodeURIComponent(messageId)}/places/${encodeURIComponent(optionKey)}`,
  );
}

/**
 * Turns a recommended place into a proposal awaiting approval.
 *
 * Never a direct write: the response carries the same proposal card a chat
 * turn would, and the change happens only when the user applies it.
 *
 * The body carries no place data at all — the route already identifies it, and
 * a name or a coordinate travelling from the app would be something the server
 * would have to trust.
 */
export async function addGlunoRecommendedPlace(
  messageId: string,
  optionKey: string,
  options?: { date?: string; idempotencyKey?: string },
) {
  return glunoJson<GlunoTurnResponse>(
    `/api/gluno/messages/${encodeURIComponent(messageId)}/places/${encodeURIComponent(optionKey)}/add`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: options?.date ?? null,
        idempotencyKey: options?.idempotencyKey ?? null,
      }),
    },
  );
}

/**
 * Asks for a fresh shortlist from the same search.
 *
 * FOR THE ONE CASE RETRY CANNOT FIX: a place that is no longer in the
 * provider's results. The body carries only an idempotency key — the
 * destination, the category and the search words all come from what the
 * message already stored server-side, so this cannot aim the search anywhere
 * the user did not.
 */
export async function refreshGlunoPlaceSuggestions(
  messageId: string,
  idempotencyKey?: string,
) {
  return glunoJson<GlunoTurnResponse>(
    `/api/gluno/messages/${encodeURIComponent(messageId)}/places/refresh`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idempotencyKey: idempotencyKey ?? null }),
    },
  );
}

export async function resolveGlunoClarification(
  clarificationId: string,
  optionKey: string,
  idempotencyKey?: string,
) {
  return glunoJson<GlunoTurnResponse>(
    `/api/gluno/clarifications/${encodeURIComponent(clarificationId)}/resolve`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ optionKey, idempotencyKey: idempotencyKey ?? null }),
    },
  );
}

/** Dismisses a question the user does not want to answer. */
export async function cancelGlunoClarification(clarificationId: string) {
  return glunoJson<void>(
    `/api/gluno/clarifications/${encodeURIComponent(clarificationId)}/cancel`,
    { method: 'POST' },
  );
}

/**
 * "Something else" — searches within the clarification's own scope.
 *
 * The backend decides what that scope is from the clarification's type. The
 * client sends a string and gets back new tappable options; no id travels in
 * either direction, and nothing external is queried.
 */
export async function searchGlunoClarification(
  clarificationId: string,
  query: string,
  idempotencyKey?: string,
) {
  return glunoJson<GlunoClarification>(
    `/api/gluno/clarifications/${encodeURIComponent(clarificationId)}/search`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, idempotencyKey: idempotencyKey ?? null }),
    },
  );
}
