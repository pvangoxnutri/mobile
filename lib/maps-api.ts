import { apiJson } from '@/lib/api';

export type PlaceAutocompleteSuggestion = {
  placeId: string;
  primaryText: string;
  secondaryText?: string | null;
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
