import { apiFetch } from '@/lib/api';

// ──────────────────────────────────────────────────────────────────────────
// GLUNO — reading a document the user already put in their Adventure.
//
// The whole flow is opt-in and reviewed. Nothing is analysed on upload, in the
// background, or without a tap; nothing is written to the Adventure by any of
// these calls. What comes back is a list of what Gluno THINKS the document
// says, which the user reads, corrects and selects from before any of it
// becomes a proposal.
//
// Nothing here ever receives a storage path, a signed URL, the document's
// text, or a full confirmation number — the backend keeps all four.
// ──────────────────────────────────────────────────────────────────────────

/** Analysis reads a whole file and can take a while. */
const ANALYSIS_TIMEOUT_MS = 120_000;

/** Booking details are private; this endpoint never goes near a log line. */
const PRIVATE = { privateEndpointName: 'gluno-documents' } as const;

export type GlunoDocumentStatus = {
  available: boolean;
  /** 'disabled' | 'not_configured' | null */
  reason: string | null;
  /** Lowercase names. A server fact — the app must not keep its own list. */
  supportedFormats: string[];
  maxFileSizeBytes: number;
};

export type GlunoAnalysisState =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'superseded';

/** One booking Gluno believes it found. */
export type GlunoDocumentItem = {
  id: string;
  /** 'flight' | 'hotel' | 'train' | 'ferry' | 'bus' | 'car_rental' | … */
  type: string;
  title: string;
  provider: string | null;
  /** '•••• 4821'. The full value stays on the server. */
  maskedConfirmation: string | null;
  bookingStatus: string | null;
  startDate: string | null;
  startTime: string | null;
  endDate: string | null;
  endTime: string | null;
  /** Only when a real place identified it. Never guessed. */
  timeZoneId: string | null;
  /** Exactly as the document printed it, so the user can compare. */
  startDateOriginalText: string | null;
  /**
   * Non-empty means the date is genuinely ambiguous — "05/08" is two different
   * days depending on where the document was written. The user picks; we never
   * do.
   */
  alternativeDateReadings: string[];
  departureLocation: string | null;
  arrivalLocation: string | null;
  address: string | null;
  /** 'high' | 'medium' | 'low' | 'very_low'. A bucket, not a number. */
  confidenceBucket: string;
  warnings: string[];
  blockers: string[];
  isPossibleDuplicate: boolean;
};

export type GlunoDocumentAnalysis = {
  id: string;
  documentId: string;
  status: GlunoAnalysisState;
  failureCode: string | null;
  extractionVersion: number;
  createdAt: string;
  completedAt: string | null;
  reviewedAt: string | null;
  /** The document changed since. This result describes a file that is gone. */
  isSuperseded: boolean;
  /** An existing reading of the same bytes was returned instead of a new run. */
  wasReplay: boolean;
  /** The document contains a QR code. Noted as a fact; never decoded. */
  containsQrCode: boolean;
  /** Hosts the document linked to, for information only. Never opened. */
  linkHosts: string[];
  /** Something needs a human decision — an ambiguous date, a duplicate. */
  requiresReview: boolean;
  items: GlunoDocumentItem[];
};

export type GlunoDocumentError = Error & {
  status?: number;
  code?: string;
  retryable?: boolean;
  cancelled?: boolean;
};

const STATUS_CANCELLED = 499;

async function documentJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await apiFetch(path, options, ANALYSIS_TIMEOUT_MS, PRIVATE);

  if (!response.ok) {
    const error = new Error('Gluno document request failed.') as GlunoDocumentError;
    error.status = response.status;
    error.cancelled = response.status === STATUS_CANCELLED;

    // Only the small typed envelope. An unparseable body leaves the code
    // undefined, which renders as the generic line — an unknown future failure
    // code must never crash the document screen.
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

/** Whether analysis is available at all. Asked before showing the action. */
export async function getGlunoDocumentStatus() {
  return documentJson<GlunoDocumentStatus>('/api/gluno/documents/status');
}

/**
 * Starts an analysis, or returns the existing one for the same bytes.
 *
 * Idempotent on the file's CONTENT: tapping twice, or re-opening the screen,
 * does not pay to read the same document again.
 */
export async function analyzeGlunoDocument(documentId: string, signal?: AbortSignal) {
  return documentJson<GlunoDocumentAnalysis>(
    `/api/gluno/documents/${documentId}/analyze`,
    { method: 'POST', signal },
  );
}

export async function getGlunoDocumentAnalysis(analysisId: string, signal?: AbortSignal) {
  return documentJson<GlunoDocumentAnalysis>(
    `/api/gluno/documents/analyses/${analysisId}`,
    { signal },
  );
}

export async function cancelGlunoDocumentAnalysis(analysisId: string) {
  return documentJson<GlunoDocumentAnalysis>(
    `/api/gluno/documents/analyses/${analysisId}/cancel`,
    { method: 'POST' },
  );
}

/**
 * Turns the items the user selected into ordinary Gluno proposals.
 *
 * The selection is explicit — there is no "accept all". From here the normal
 * review-and-apply rules take over, and nothing has been written yet.
 */
export async function createGlunoDocumentProposals(analysisId: string, itemIds: string[]) {
  return documentJson<unknown[]>(
    `/api/gluno/documents/analyses/${analysisId}/proposals`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemIds }),
    },
  );
}

/** Formats that can be analysed at all. Checked before offering the action. */
export function isAnalysableDocument(fileType: string | null | undefined, supported: string[]) {
  if (!fileType) return false;

  const normalised = fileType.toLowerCase();
  return supported.some(
    (format) => normalised.includes(format) || (format === 'jpeg' && normalised.includes('jpg')),
  );
}
