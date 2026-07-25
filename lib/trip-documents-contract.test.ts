import assert from 'node:assert/strict';
import test from 'node:test';

import {
  documentLoadErrorCodeForStatus,
  normalizeTripDocumentRouteId,
  parseTripDocumentListResponse,
  TripDocumentApiError,
} from './trip-documents-contract';

const DOCUMENT = {
  id: '11111111-1111-4111-8111-111111111111',
  tripId: '22222222-2222-4222-8222-222222222222',
  name: 'Booking',
  category: 'booking',
  fileType: 'application/pdf',
  fileSize: 123,
  date: null,
  activityId: null,
  activityTitle: null,
  note: null,
  bookingReference: null,
  createdByUserId: '33333333-3333-4333-8333-333333333333',
  createdByName: 'Traveler',
  uploadedAt: '2026-07-24T12:00:00Z',
  canEdit: true,
};

test('normalizes a string or array route param and rejects non-UUID values', () => {
  assert.equal(
    normalizeTripDocumentRouteId('22222222-2222-4222-8222-222222222222'),
    '22222222-2222-4222-8222-222222222222',
  );
  assert.equal(
    normalizeTripDocumentRouteId(['not-an-id', '22222222-2222-4222-8222-222222222222']),
    '22222222-2222-4222-8222-222222222222',
  );
  assert.equal(normalizeTripDocumentRouteId(undefined), null);
  assert.equal(normalizeTripDocumentRouteId('not-an-id'), null);
});

test('parses the backend top-level array contract', async () => {
  const response = new Response(JSON.stringify([DOCUMENT]), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
  assert.deepEqual(await parseTripDocumentListResponse(response), [DOCUMENT]);
});

test('parses a documents wrapper and PascalCase DTO fields', async () => {
  const pascalDocument = Object.fromEntries(
    Object.entries(DOCUMENT).map(([key, value]) => [
      `${key[0].toUpperCase()}${key.slice(1)}`,
      value,
    ]),
  );
  const response = new Response(JSON.stringify({ Documents: [pascalDocument] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
  assert.deepEqual(await parseTripDocumentListResponse(response), [DOCUMENT]);
});

test('treats 200 [] and 204 as valid empty lists', async () => {
  const emptyArray = new Response('[]', {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
  const noContent = new Response(null, { status: 204 });
  assert.deepEqual(await parseTripDocumentListResponse(emptyArray), []);
  assert.deepEqual(await parseTripDocumentListResponse(noContent), []);
});

test('classifies malformed JSON and an invalid payload as parse failures', async () => {
  const malformed = new Response('<html>', { status: 200 });
  const invalidPayload = new Response(JSON.stringify({ items: [] }), { status: 200 });

  await assert.rejects(
    parseTripDocumentListResponse(malformed),
    (error) => error instanceof TripDocumentApiError && error.code === 'parse',
  );
  await assert.rejects(
    parseTripDocumentListResponse(invalidPayload),
    (error) => error instanceof TripDocumentApiError && error.code === 'parse',
  );
});

test('classifies list HTTP statuses without conflating auth, access, or server failures', () => {
  assert.equal(documentLoadErrorCodeForStatus(401), 'authentication');
  assert.equal(documentLoadErrorCodeForStatus(403), 'forbidden');
  assert.equal(documentLoadErrorCodeForStatus(404), 'endpoint_missing');
  assert.equal(documentLoadErrorCodeForStatus(500), 'server');
  assert.equal(documentLoadErrorCodeForStatus(503), 'server');
  assert.equal(documentLoadErrorCodeForStatus(429), 'request_failed');
});
