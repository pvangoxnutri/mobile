import { apiJson } from '@/lib/api';

export type PlaceAutocompleteSuggestion = {
  placeId: string;
  primaryText: string;
  secondaryText?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  googleMapsUri?: string | null;
};

export type PlaceDetails = {
  placeId: string;
  name: string;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  googleMapsUri?: string | null;
};

export async function fetchPlaceSuggestions(input: string) {
  const q = input.trim();
  if (q.length < 2) return [] as PlaceAutocompleteSuggestion[];

  const params = new URLSearchParams({ input: q });
  return await apiJson<PlaceAutocompleteSuggestion[]>(`/api/maps/autocomplete?${params.toString()}`);
}

// Google-path autocomplete suggestions carry no coordinates (the OSM
// fallback does) — this resolves them via the backend's place-details
// proxy. Only works for Google place ids; callers should skip it when the
// suggestion already has coordinates.
export async function fetchPlaceDetails(placeId: string) {
  return await apiJson<PlaceDetails>(`/api/maps/place/${encodeURIComponent(placeId)}`);
}
