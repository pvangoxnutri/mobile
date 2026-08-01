import { apiFetch } from '@/lib/api';

// ──────────────────────────────────────────────────────────────────────────
// GLUNO — telling Gluno when an answer landed, and when it did not.
//
// This is NOT model training. Nothing sent here fine-tunes anything or leaves
// SideQuest. It is product data that changes which suggestions this user sees
// next, on this trip, at a scope they agreed to.
//
// Two things the shape below enforces. There is no userId field — the author is
// always the authenticated principal, and there is no legitimate reason for a
// client to name another. And a failed send is swallowed by callers: a signal
// that did not record must never interrupt what somebody was doing.
// ──────────────────────────────────────────────────────────────────────────

const FEEDBACK_TIMEOUT_MS = 15_000;

/** Reasons and notes are personal; this endpoint stays out of logs. */
const PRIVATE = { privateEndpointName: 'gluno-feedback' } as const;

/** The closed list the reason chips offer. Free text is separate and optional. */
export type GlunoFeedbackReason =
  | 'factual_correction'
  | 'wrong_reference'
  | 'not_relevant'
  | 'too_busy'
  | 'too_much_walking'
  | 'too_expensive'
  | 'too_slow'
  | 'already_planned'
  | 'provider_information_wrong'
  | 'other';

/**
 * A preference Gluno has noticed and has NOT started assuming.
 *
 * Deliberately carries no evidence count and no confidence — "we saw you do
 * this four times" reads as surveillance and does not help anyone decide.
 */
export type GlunoPreferenceCandidate = {
  id: string;
  /** 'start_time' | 'pace' | 'budget' | … */
  key: string;
  proposedValue: string;
  /** What confirming would apply to: conversation | trip | global. */
  scope: string;
  tripId: string | null;
};

export type GlunoLearnedPreference = {
  id: string;
  key: string;
  value: string;
  scope: string;
  /** private | trip_shared | global_private */
  visibility: string;
  isHardConstraint: boolean;
  confirmedAt: string | null;
  tripId: string | null;
  conversationId: string | null;
  /** choice | time | minutes | text | read_only — anything else renders read-only. */
  editor: string;
  /** Stable option ids for a choice editor. The app owns the wording. */
  options: string[];
};

export type GlunoTripLabel = {
  id: string;
  title: string;
};

export type GlunoLearned = {
  preferences: GlunoLearnedPreference[];
  candidates: GlunoPreferenceCandidate[];
  /** Only Adventures the user is still a member of. */
  trips: GlunoTripLabel[];
};

async function feedbackJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await apiFetch(path, options, FEEDBACK_TIMEOUT_MS, PRIVATE);

  if (!response.ok) {
    const error = new Error('Gluno feedback request failed.') as Error & { status?: number };
    error.status = response.status;
    throw error;
  }

  // 204 on the resolve endpoints.
  if (response.status === 204) return undefined as T;

  return (await response.json()) as T;
}

/**
 * Records one signal.
 *
 * Pressing the same verdict twice is a no-op server-side rather than a
 * duplicate; changing it supersedes the earlier row without deleting it.
 */
export async function sendGlunoFeedback(input: {
  conversationId: string;
  tripId?: string | null;
  messageId?: string | null;
  proposalId?: string | null;
  /** Namespaced provider id when the feedback is about one recommendation. */
  recommendationRef?: string | null;
  eventType: string;
  reason?: GlunoFeedbackReason;
  /** Optional, capped and sanitised server-side. Data, never an instruction. */
  note?: string;
}) {
  return feedbackJson<{ recorded: boolean; readyCandidate: GlunoPreferenceCandidate | null }>(
    '/api/gluno/feedback',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationId: input.conversationId,
        tripId: input.tripId ?? null,
        messageId: input.messageId ?? null,
        proposalId: input.proposalId ?? null,
        recommendationRef: input.recommendationRef ?? null,
        eventType: input.eventType,
        reason: input.reason ?? null,
        note: input.note ?? null,
      }),
    },
  );
}

/** What Gluno currently assumes, and what it is thinking about assuming. */
export async function getGlunoLearned(tripId?: string | null) {
  const query = tripId ? `?tripId=${encodeURIComponent(tripId)}` : '';
  return feedbackJson<GlunoLearned>(`/api/gluno/feedback/learned${query}`);
}

/**
 * Answers a candidate.
 *
 * A no closes it permanently — being asked twice about something you declined
 * is worse than never being asked. Global scope takes an explicit choice; it is
 * never the default.
 */
export async function resolveGlunoCandidate(
  candidateId: string,
  confirm: boolean,
  scope?: string,
) {
  return feedbackJson<void>(`/api/gluno/feedback/candidates/${encodeURIComponent(candidateId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirm, scope: scope ?? null }),
  });
}

/** Forgets a confirmed preference. A hard delete — "forget that" means gone. */
export async function forgetGlunoPreference(preferenceId: string) {
  return feedbackJson<void>(`/api/gluno/feedback/preferences/${encodeURIComponent(preferenceId)}`, {
    method: 'DELETE',
  });
}

/**
 * Changes the caller's own confirmed preference.
 *
 * The key never moves — a row is about one thing. Passing `scope` widens or
 * narrows where it applies; omitting it leaves the scope alone, which is what
 * an ordinary value edit wants.
 */
export async function updateGlunoPreference(
  preferenceId: string,
  update: { value?: string; scope?: string },
) {
  return feedbackJson<GlunoLearnedPreference>(
    `/api/gluno/feedback/preferences/${encodeURIComponent(preferenceId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: update.value ?? null, scope: update.scope ?? null }),
    },
  );
}
