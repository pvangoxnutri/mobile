const LOCATION_MARKER = '[map-location]:';
const PLACE_MARKER = '[map-place]:';

export type StoredMapPlace = {
  placeId: string;
  name: string;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  googleMapsUri?: string | null;
};

export function stripLocationMarker(description?: string | null): string | null {
  if (!description) return null;
  const lines = description
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => !line.trim().startsWith(LOCATION_MARKER) && !line.trim().startsWith(PLACE_MARKER));
  const cleaned = lines.join('\n').trim();
  return cleaned.length > 0 ? cleaned : null;
}

export function extractLocationQuery(description?: string | null): string {
  if (!description) return '';
  const lines = description.split('\n');
  const marker = lines.find((line) => line.trim().startsWith(LOCATION_MARKER));
  if (!marker) return '';

  const raw = marker.trim().slice(LOCATION_MARKER.length).trim();
  if (!raw) return '';

  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function extractStoredMapPlace(description?: string | null): StoredMapPlace | null {
  if (!description) return null;
  const lines = description.split('\n');
  const marker = lines.find((line) => line.trim().startsWith(PLACE_MARKER));
  if (!marker) return null;

  const raw = marker.trim().slice(PLACE_MARKER.length).trim();
  if (!raw) return null;

  try {
    return JSON.parse(decodeURIComponent(raw)) as StoredMapPlace;
  } catch {
    return null;
  }
}

export function withLocationMarker(
  description: string | null | undefined,
  locationQuery: string | null | undefined,
  place?: StoredMapPlace | null,
): string | null {
  const base = stripLocationMarker(description);
  const location = (locationQuery ?? '').trim();
  if (!location) {
    return base;
  }

  const encoded = encodeURIComponent(location);
  var result = base ? `${base}\n\n${LOCATION_MARKER}${encoded}` : `${LOCATION_MARKER}${encoded}`;
  if (place?.placeId) {
    result = `${result}\n${PLACE_MARKER}${encodeURIComponent(JSON.stringify(place))}`;
  }
  return result;
}

export function buildGoogleMapsSearchUrl(locationQuery: string, place?: StoredMapPlace | null): string {
  if (place?.googleMapsUri) {
    return place.googleMapsUri;
  }

  if (place?.placeId) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locationQuery)}&query_place_id=${encodeURIComponent(place.placeId)}`;
  }

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locationQuery)}`;
}
