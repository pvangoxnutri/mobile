// TripDayLocation data layer. GET returns the fully resolved per-day
// timeline (explicit picks, carried forward, or the trip destination
// fallback) — the backend is the single source of truth for that
// resolution, this file never carries a location forward itself.

import { apiFetch, apiJson } from '@/lib/api';
import { getCached, invalidateTripCache, setCached } from '@/lib/cache';
import type { TripDayLocation } from '@/lib/types';

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
