export const TRIP_DOCUMENT_CATEGORIES = [
  'car_rental',
  'flight',
  'train',
  'ferry',
  'accommodation',
  'insurance',
  'booking',
  'identification_visa',
  'other',
] as const;

export type TripDocumentCategory = (typeof TRIP_DOCUMENT_CATEGORIES)[number];

export type TripDocument = {
  id: string;
  tripId: string;
  name: string;
  category: TripDocumentCategory;
  fileType: string;
  fileSize?: number | null;
  date?: string | null;
  activityId?: string | null;
  activityTitle?: string | null;
  note?: string | null;
  bookingReference?: string | null;
  createdByUserId: string;
  createdByName: string;
  uploadedAt: string;
  canEdit: boolean;
};

export type TripDocumentErrorCode =
  | 'permission'
  | 'authentication'
  | 'forbidden'
  | 'endpoint_missing'
  | 'network'
  | 'server'
  | 'parse'
  | 'invalid_route'
  | 'too_large'
  | 'invalid_type'
  | 'not_found'
  | 'open_failed'
  | 'request_failed';

export type TripDocumentLoadErrorCode =
  | 'authentication'
  | 'forbidden'
  | 'endpoint_missing'
  | 'network'
  | 'server'
  | 'parse'
  | 'invalid_route'
  | 'request_failed';

export class TripDocumentApiError extends Error {
  readonly code: TripDocumentErrorCode;
  readonly status: number;

  constructor(code: TripDocumentErrorCode, status = 0) {
    super(code);
    this.name = 'TripDocumentApiError';
    this.code = code;
    this.status = status;
  }
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Expo Router params can briefly be undefined and can be arrays when a query
 * key occurs more than once. Only a real UUID is allowed to reach the API.
 */
export function normalizeTripDocumentRouteId(
  value: string | string[] | undefined,
): string | null {
  const candidates = Array.isArray(value) ? value : value ? [value] : [];
  for (const candidate of candidates) {
    const normalized = candidate.trim();
    if (UUID_PATTERN.test(normalized)) return normalized;
  }
  return null;
}

export function documentLoadErrorCodeForStatus(status: number): TripDocumentLoadErrorCode {
  if (status === 401) return 'authentication';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'endpoint_missing';
  if (status >= 500) return 'server';
  return 'request_failed';
}

export function isTripDocumentLoadErrorCode(
  code: TripDocumentErrorCode,
): code is TripDocumentLoadErrorCode {
  return code === 'authentication'
    || code === 'forbidden'
    || code === 'endpoint_missing'
    || code === 'network'
    || code === 'server'
    || code === 'parse'
    || code === 'invalid_route'
    || code === 'request_failed';
}

/**
 * The local ASP.NET endpoint returns a top-level array. Accept the common
 * `{ documents: [...] }` wrapper too so an API gateway cannot turn a valid
 * empty list into a false error. A 204 is also an empty list.
 */
export async function parseTripDocumentListResponse(
  response: Response,
): Promise<TripDocument[]> {
  if (response.status === 204) return [];

  let payload: unknown;
  try {
    const text = await response.text();
    if (!text.trim()) throw new Error('empty_response');
    payload = JSON.parse(text) as unknown;
  } catch {
    throw new TripDocumentApiError('parse', response.status);
  }

  const list = Array.isArray(payload)
    ? payload
    : getWrappedDocumentList(payload);
  if (!list) throw new TripDocumentApiError('parse', response.status);

  const documents = list.map(normalizeTripDocument);
  if (documents.some((document) => document === null)) {
    throw new TripDocumentApiError('parse', response.status);
  }
  return documents as TripDocument[];
}

function getWrappedDocumentList(payload: unknown): unknown[] | null {
  if (!isRecord(payload)) return null;
  const documents = readProperty(payload, 'documents');
  return Array.isArray(documents) ? documents : null;
}

function normalizeTripDocument(value: unknown): TripDocument | null {
  if (!isRecord(value)) return null;

  const id = readProperty(value, 'id');
  const tripId = readProperty(value, 'tripId');
  const name = readProperty(value, 'name');
  const category = readProperty(value, 'category');
  const fileType = readProperty(value, 'fileType');
  const fileSize = readProperty(value, 'fileSize');
  const date = readProperty(value, 'date');
  const activityId = readProperty(value, 'activityId');
  const activityTitle = readProperty(value, 'activityTitle');
  const note = readProperty(value, 'note');
  const bookingReference = readProperty(value, 'bookingReference');
  const createdByUserId = readProperty(value, 'createdByUserId');
  const createdByName = readProperty(value, 'createdByName');
  const uploadedAt = readProperty(value, 'uploadedAt');
  const canEdit = readProperty(value, 'canEdit');

  if (
    typeof id !== 'string'
    || typeof tripId !== 'string'
    || typeof name !== 'string'
    || !isTripDocumentCategory(category)
    || typeof fileType !== 'string'
    || !isOptionalNumber(fileSize)
    || !isOptionalString(date)
    || !isOptionalString(activityId)
    || !isOptionalString(activityTitle)
    || !isOptionalString(note)
    || !isOptionalString(bookingReference)
    || typeof createdByUserId !== 'string'
    || typeof createdByName !== 'string'
    || typeof uploadedAt !== 'string'
    || typeof canEdit !== 'boolean'
  ) {
    return null;
  }

  return {
    id,
    tripId,
    name,
    category,
    fileType,
    fileSize,
    date,
    activityId,
    activityTitle,
    note,
    bookingReference,
    createdByUserId,
    createdByName,
    uploadedAt,
    canEdit,
  };
}

function readProperty(record: Record<string, unknown>, camelCaseName: string): unknown {
  if (camelCaseName in record) return record[camelCaseName];
  const pascalCaseName = `${camelCaseName[0].toUpperCase()}${camelCaseName.slice(1)}`;
  return record[pascalCaseName];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTripDocumentCategory(value: unknown): value is TripDocumentCategory {
  return typeof value === 'string'
    && (TRIP_DOCUMENT_CATEGORIES as readonly string[]).includes(value);
}

function isOptionalString(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || typeof value === 'string';
}

function isOptionalNumber(value: unknown): value is number | null | undefined {
  return value === undefined || value === null || typeof value === 'number';
}
