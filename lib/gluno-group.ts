import { apiFetch } from '@/lib/api';

// ──────────────────────────────────────────────────────────────────────────
// GLUNO — planning an Adventure with several people in it.
//
// The one thing to keep in mind when changing anything here: this client never
// receives another member's private preferences, and never learns who voted for
// what. Both are enforced server-side, and the types below are deliberately
// shaped so there is nowhere for that data to arrive even if it were sent.
//
// Sharing a preference is always the owner's own action. There is no endpoint
// for sharing somebody else's, and no client call that could construct one.
// ──────────────────────────────────────────────────────────────────────────

const GROUP_TIMEOUT_MS = 20_000;

/** Preferences and votes are personal; this endpoint stays out of logs. */
const PRIVATE = { privateEndpointName: 'gluno-group' } as const;

/** 'private' | 'trip_shared' | 'global_private' */
export type GlunoPreferenceVisibility = 'private' | 'trip_shared' | 'global_private';

/**
 * A clash between shared constraints.
 *
 * `explanation` names WHAT does not fit and never WHO — the backend does not
 * send member attribution, and the UI has nothing to render even by accident.
 */
export type GlunoGroupConflict = {
  /** 'pace_mismatch' | 'walking_vs_distance' | … */
  type: string;
  /** 'info' | 'warning' | 'blocking' */
  severity: string;
  /** Already localised. */
  explanation: string;
  compromises: string[];
  requiresGroupDecision: boolean;
};

/**
 * The Adventure's shared planning profile.
 *
 * Constraint KEYS only — never their values. A group screen showing "someone
 * needs short walking distances" has revealed something personal, however
 * carefully it is phrased.
 */
export type GlunoGroupProfile = {
  version: number;
  groupSize: number;
  contributingMembers: number;
  sharedConstraintKeys: string[];
  hardConstraintCount: number;
  conflicts: GlunoGroupConflict[];
};

export type GlunoGroupOption = {
  id: string;
  label: string;
  summary: string | null;
  /** How many chose it. Never who. */
  votes: number;
};

export type GlunoGroupDecision = {
  id: string;
  tripId: string;
  /** Schema version. An unknown one is refused server-side, not interpreted. */
  version: number;
  kind: string;
  question: string;
  /** pending | accepted | rejected | expired | superseded */
  status: string;
  /** 'all_voted' | 'owner_closes' | 'deadline' */
  closingRule: string;
  closesAt: string | null;
  acceptedOptionId: string | null;
  options: GlunoGroupOption[];
  responded: number;
  groupSize: number;
  /** A tie is never resolved automatically — the group chooses again. */
  isTie: boolean;
  /** The caller's own choice. Null when they haven't answered or abstained. */
  myVote: string | null;
  hasVoted: boolean;
};

export type GlunoGroupError = Error & {
  status?: number;
  code?: string;
  retryable?: boolean;
};

async function groupJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await apiFetch(path, options, GROUP_TIMEOUT_MS, PRIVATE);

  if (!response.ok) {
    const error = new Error('Gluno group request failed.') as GlunoGroupError;
    error.status = response.status;

    // Only the typed envelope. An unparseable body leaves the code undefined,
    // which renders as the generic line — an unknown future code must never
    // crash the chat.
    try {
      const body = (await response.json()) as { error?: unknown; retryable?: unknown };
      if (typeof body?.error === 'string') error.code = body.error;
      if (typeof body?.retryable === 'boolean') error.retryable = body.retryable;
    } catch {
      // Intentionally empty.
    }

    throw error;
  }

  return (await response.json()) as T;
}

export async function getGlunoGroupProfile(tripId: string) {
  return groupJson<GlunoGroupProfile>(`/api/gluno/group/${encodeURIComponent(tripId)}/profile`);
}

export async function getGlunoGroupDecisions(tripId: string) {
  return groupJson<GlunoGroupDecision[]>(`/api/gluno/group/${encodeURIComponent(tripId)}/decisions`);
}

export async function getGlunoGroupDecision(decisionId: string) {
  return groupJson<GlunoGroupDecision>(`/api/gluno/group/decisions/${encodeURIComponent(decisionId)}`);
}

/**
 * Casts or changes the caller's own vote.
 *
 * Note the absence of a userId: the voter is always the authenticated
 * principal. A null option is a deliberate abstention, which is a real answer —
 * simply not calling this is not.
 */
export async function voteOnGlunoDecision(decisionId: string, optionId: string | null) {
  return groupJson<GlunoGroupDecision>(
    `/api/gluno/group/decisions/${encodeURIComponent(decisionId)}/vote`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ optionId }),
    },
  );
}

export async function closeGlunoDecision(decisionId: string) {
  return groupJson<GlunoGroupDecision>(
    `/api/gluno/group/decisions/${encodeURIComponent(decisionId)}/close`,
    { method: 'POST' },
  );
}

/**
 * Shares one of the caller's OWN preferences with the group, or takes it back.
 *
 * Only ever the caller's own — the backend scopes the lookup to their user id,
 * so a preference id from somebody else's conversation simply does not resolve.
 */
export async function setGlunoPreferenceVisibility(
  preferenceId: string,
  visibility: GlunoPreferenceVisibility,
  isHardConstraint?: boolean,
) {
  return groupJson<{ id: string; key: string; visibility: string; isHardConstraint: boolean }>(
    `/api/gluno/group/preferences/${encodeURIComponent(preferenceId)}/visibility`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visibility, isHardConstraint }),
    },
  );
}
