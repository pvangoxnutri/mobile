// TripDayLocation data layer. GET returns the fully resolved per-day
// timeline (explicit picks, carried forward, or the trip destination
// fallback) — the backend is the single source of truth for that
// resolution, this file never carries a location forward itself.

import { apiFetch, apiJson } from '@/lib/api';
import { getCached, invalidateTripCache, setCached } from '@/lib/cache';
import type { TripDayLocation, TripDayLocationEntry } from '@/lib/types';

const dayLocationsUrl = (tripId: string) => `/api/trips/${tripId}/day-locations`;

export type SetDayLocationInput = {
  locationLabel: string;
  latitude: number;
  longitude: number;
  placeId?: string | null;
};

export function getCachedTripDayLocations(tripId: string): TripDayLocation[] | null {
  return getCached<TripDayLocation[]>(dayLocationsUrl(tripId));
}

export async function fetchTripDayLocations(tripId: string): Promise<TripDayLocation[]> {
  const data = await apiJson<TripDayLocation[]>(dayLocationsUrl(tripId));
  setCached(dayLocationsUrl(tripId), data);
  return data;
}

// Invalidates the trip's whole cache prefix (day-locations AND weather share
// it) so both refetch resolved instead of one going stale.
export async function setTripDayLocation(tripId: string, date: string, input: SetDayLocationInput) {
  const result = await apiJson<TripDayLocation>(`${dayLocationsUrl(tripId)}/${date}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  invalidateTripCache(tripId);
  return result;
}

export async function deleteTripDayLocation(tripId: string, date: string) {
  const response = await apiFetch(`${dayLocationsUrl(tripId)}/${date}`, { method: 'DELETE' });
  if (!response.ok) {
    throw new Error((await response.text()) || 'Request failed.');
  }
  invalidateTripCache(tripId);
}

/* ── Stored entries: several ordered places per day ──────────────────────
 *
 * Separate from the resolved timeline above on purpose. The timeline answers
 * "where are the travellers on day X" including carried-forward days; these
 * are the rows the user actually created, each addressable by id so it can be
 * edited, removed or moved. sortIndex 0 is the day's main location.
 *
 * Every mutation invalidates the trip's whole cache prefix, because both the
 * timeline and the weather derive from these rows. */

const entriesUrl = (tripId: string) => `${dayLocationsUrl(tripId)}/entries`;

export function getCachedTripDayLocationEntries(tripId: string): TripDayLocationEntry[] | null {
  return getCached<TripDayLocationEntry[]>(entriesUrl(tripId));
}

export async function fetchTripDayLocationEntries(tripId: string): Promise<TripDayLocationEntry[]> {
  const data = await apiJson<TripDayLocationEntry[]>(entriesUrl(tripId));
  setCached(entriesUrl(tripId), data);
  return data;
}

/** Appends an additional place to a date. The server assigns sortIndex, so the
 * client never picks a position and can never create a gap. */
export async function addTripDayLocationEntry(
  tripId: string,
  input: SetDayLocationInput & { startDate: string },
): Promise<TripDayLocationEntry> {
  const result = await apiJson<TripDayLocationEntry>(entriesUrl(tripId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  invalidateTripCache(tripId);
  return result;
}

export async function updateTripDayLocationEntry(
  tripId: string,
  entryId: string,
  input: SetDayLocationInput,
): Promise<TripDayLocationEntry> {
  const result = await apiJson<TripDayLocationEntry>(`${entriesUrl(tripId)}/${entryId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  invalidateTripCache(tripId);
  return result;
}

export async function deleteTripDayLocationEntry(tripId: string, entryId: string) {
  const response = await apiFetch(`${entriesUrl(tripId)}/${entryId}`, { method: 'DELETE' });
  if (!response.ok) {
    throw new Error((await response.text()) || 'Request failed.');
  }
  invalidateTripCache(tripId);
}

/** Rewrites one date's order. `locationIds` must name every place on that date
 * exactly once — the server rejects a partial list rather than leaving the
 * unnamed ones at stale positions. Whatever ends up first becomes the day's
 * main location and therefore the one that carries forward. */
export async function reorderTripDayLocationEntries(
  tripId: string,
  startDate: string,
  locationIds: string[],
): Promise<TripDayLocationEntry[]> {
  const result = await apiJson<TripDayLocationEntry[]>(`${entriesUrl(tripId)}/reorder`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ startDate, locationIds }),
  });
  invalidateTripCache(tripId);
  return result;
}
