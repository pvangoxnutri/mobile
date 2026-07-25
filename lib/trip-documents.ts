import { apiFetch } from '@/lib/api';
import {
  documentLoadErrorCodeForStatus,
  parseTripDocumentListResponse,
  TripDocumentApiError,
  type TripDocument,
  type TripDocumentCategory,
  type TripDocumentErrorCode,
} from '@/lib/trip-documents-contract';

export const TRIP_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;

export {
  TripDocumentApiError,
  TRIP_DOCUMENT_CATEGORIES,
  type TripDocument,
  type TripDocumentCategory,
  type TripDocumentErrorCode,
  type TripDocumentLoadErrorCode,
} from '@/lib/trip-documents-contract';

export type PickedTripDocumentFile = {
  uri: string;
  name: string;
  mimeType: string;
  size?: number | null;
};

export type TripDocumentMetadataInput = {
  name: string;
  category: TripDocumentCategory;
  date?: string | null;
  activityId?: string | null;
  note?: string | null;
  bookingReference?: string | null;
};

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const MIME_TYPE_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export function inferTripDocumentMimeType(
  fileName: string,
  suppliedMimeType?: string | null,
): string | null {
  const normalizedMime = suppliedMimeType?.trim().toLowerCase();
  if (normalizedMime && ALLOWED_MIME_TYPES.has(normalizedMime)) return normalizedMime;

  const extension = fileName.split('.').pop()?.trim().toLowerCase();
  return extension ? (MIME_TYPE_BY_EXTENSION[extension] ?? null) : null;
}

export function validatePickedTripDocumentFile(
  file: PickedTripDocumentFile,
): TripDocumentErrorCode | null {
  if (!inferTripDocumentMimeType(file.name, file.mimeType)) return 'invalid_type';
  if (typeof file.size === 'number' && file.size > TRIP_DOCUMENT_MAX_BYTES) {
    return 'too_large';
  }
  return null;
}

export function tripDocumentNameFromFile(fileName: string): string {
  const withoutExtension = fileName.replace(/\.[^.]+$/, '').trim();
  return withoutExtension || 'Document';
}

export async function getTripDocuments(tripId: string): Promise<TripDocument[]> {
  let response: Response;
  try {
    response = await apiFetch(
      `/api/trips/${encodeURIComponent(tripId)}/documents`,
      {
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
      },
      undefined,
      { privateEndpointName: 'trip_documents_list' },
    );
  } catch {
    throw new TripDocumentApiError('network');
  }

  if (!response.ok) {
    throw new TripDocumentApiError(
      documentLoadErrorCodeForStatus(response.status),
      response.status,
    );
  }
  return parseTripDocumentListResponse(response);
}

export async function createTripDocument(
  tripId: string,
  file: PickedTripDocumentFile,
  metadata: TripDocumentMetadataInput,
): Promise<TripDocument> {
  const validationError = validatePickedTripDocumentFile(file);
  if (validationError) throw new TripDocumentApiError(validationError);

  const mimeType = inferTripDocumentMimeType(file.name, file.mimeType);
  if (!mimeType) throw new TripDocumentApiError('invalid_type');

  const formData = new FormData();
  formData.append('file', {
    uri: file.uri,
    name: file.name,
    type: mimeType,
  } as never);
  appendMetadata(formData, metadata);

  const response = await apiFetch(
    `/api/trips/${encodeURIComponent(tripId)}/documents`,
    { method: 'POST', body: formData },
    60_000,
    { privateEndpointName: 'trip_documents_create' },
  );
  if (!response.ok) throw await createDocumentApiError(response);
  return (await response.json()) as TripDocument;
}

export async function updateTripDocument(
  tripId: string,
  documentId: string,
  metadata: TripDocumentMetadataInput,
): Promise<TripDocument> {
  const response = await apiFetch(
    `/api/trips/${encodeURIComponent(tripId)}/documents/${encodeURIComponent(documentId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(normalizeMetadata(metadata)),
    },
    undefined,
    { privateEndpointName: 'trip_documents_update' },
  );
  if (!response.ok) throw await createDocumentApiError(response);
  return (await response.json()) as TripDocument;
}

export async function deleteTripDocument(
  tripId: string,
  documentId: string,
): Promise<void> {
  const response = await apiFetch(
    `/api/trips/${encodeURIComponent(tripId)}/documents/${encodeURIComponent(documentId)}`,
    { method: 'DELETE' },
    undefined,
    { privateEndpointName: 'trip_documents_delete' },
  );
  if (!response.ok && response.status !== 404) throw await createDocumentApiError(response);
}

export async function getTripDocumentOpenUrl(
  tripId: string,
  documentId: string,
): Promise<{ url: string; expiresAt: string }> {
  const response = await apiFetch(
    `/api/trips/${encodeURIComponent(tripId)}/documents/${encodeURIComponent(documentId)}/open`,
    { method: 'POST' },
    undefined,
    { privateEndpointName: 'trip_documents_open' },
  );
  if (!response.ok) throw await createDocumentApiError(response);

  const data = (await response.json()) as { url?: unknown; expiresAt?: unknown };
  if (typeof data.url !== 'string' || !/^https:\/\//i.test(data.url)) {
    throw new TripDocumentApiError('open_failed');
  }
  return {
    url: data.url,
    expiresAt: typeof data.expiresAt === 'string' ? data.expiresAt : '',
  };
}

function appendMetadata(formData: FormData, metadata: TripDocumentMetadataInput) {
  const normalized = normalizeMetadata(metadata);
  formData.append('name', normalized.name);
  formData.append('category', normalized.category);
  if (normalized.date) formData.append('date', normalized.date);
  if (normalized.activityId) formData.append('activityId', normalized.activityId);
  if (normalized.note) formData.append('note', normalized.note);
  if (normalized.bookingReference) {
    formData.append('bookingReference', normalized.bookingReference);
  }
}

function normalizeMetadata(metadata: TripDocumentMetadataInput) {
  return {
    name: metadata.name.trim(),
    category: metadata.category,
    date: metadata.date?.trim() || null,
    activityId: metadata.activityId?.trim() || null,
    note: metadata.note?.trim() || null,
    bookingReference: metadata.bookingReference?.trim() || null,
  };
}

async function createDocumentApiError(response: Response): Promise<TripDocumentApiError> {
  const codeFromStatus = documentErrorCodeForStatus(response.status);
  try {
    const body = (await response.clone().json()) as { code?: unknown; error?: unknown };
    if (body.code === 'file_too_large' || body.error === 'document_too_large') {
      return new TripDocumentApiError('too_large', response.status);
    }
    if (body.code === 'invalid_file_type' || body.error === 'invalid_document_type') {
      return new TripDocumentApiError('invalid_type', response.status);
    }
  } catch {
    // Document errors deliberately do not surface or log response text: it
    // could contain a private filename or storage detail.
  }
  return new TripDocumentApiError(codeFromStatus, response.status);
}

function documentErrorCodeForStatus(status: number): TripDocumentErrorCode {
  if (status === 401) return 'authentication';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 413) return 'too_large';
  if (status === 415) return 'invalid_type';
  if (status >= 500) return 'server';
  return 'request_failed';
}
