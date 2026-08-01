// THE place-search implementation. Every field in the app that lets someone
// pick a place goes through this: the adventure destination (create + edit),
// a day's location (and its extra stops), and an activity's location.
//
// Before this, three copies of the same effect existed with slightly different
// debounces, different result caps, and — most importantly — different amounts
// of care about stale responses. The activity field was the weakest: it had no
// race protection at all, and it never resolved coordinates, so picking a
// Google result stored a place with latitude/longitude null. Anything reading
// coordinates off an activity therefore silently got nothing.
//
// What lives here, so it cannot drift apart again:
//   * one minimum query length, one debounce, one result cap
//   * race protection — a response for an older query can never replace a
//     newer query's results
//   * dedupe — retyping a query we just searched reuses the results instead of
//     hitting the network again
//   * coordinate resolution — Google suggestions carry no coordinates and need
//     a details lookup; the OSM fallback already has them and must not
//     trigger a pointless request
//   * normalization into one shape (ResolvedPlace) the whole app understands
//
// Presentation is deliberately NOT here. Each field keeps its own layout and
// decides whether to render `error` — the adventure destination has always
// failed silently (coordinates are a bonus there), the activity field shows
// the message. Same logic, same guarantees, unchanged looks.

import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchPlaceDetails, fetchPlaceSuggestions, type PlaceAutocompleteSuggestion } from '@/lib/maps-api';

/** Below this many characters, searching is noise. */
export const PLACES_MIN_QUERY_LENGTH = 2;
/** Long enough to skip most intermediate keystrokes, short enough to feel live. */
export const PLACES_DEBOUNCE_MS = 260;
/** More than five rows pushes the field off screen once the keyboard is up. */
export const PLACES_MAX_RESULTS = 5;

/**
 * One place, however it was found. `latitude`/`longitude` are null only when
 * the provider genuinely could not supply them — never merely because nobody
 * asked for them.
 */
export type ResolvedPlace = {
  placeId: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  googleMapsUri: string | null;
};

/**
 * Anything that can be turned into a ResolvedPlace. PlaceAutocompleteSuggestion
 * satisfies it as-is; a place already stored on an activity can be adapted with
 * a one-line rename, so the "reuse this activity's location" shortcut resolves
 * coordinates through exactly the same path as a fresh search result.
 */
export type ResolvablePlace = {
  placeId: string;
  primaryText: string;
  secondaryText?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  googleMapsUri?: string | null;
};

/** OSM-fallback ids carry their own coordinates and have no details endpoint. */
function needsDetailsLookup(suggestion: ResolvablePlace) {
  return (suggestion.latitude == null || suggestion.longitude == null)
    && !suggestion.placeId.startsWith('osm:');
}

/**
 * Turns a suggestion into a full place, fetching coordinates when the provider
 * did not include them.
 *
 * Never throws: a failed details lookup yields the place with null coordinates
 * rather than losing the pick entirely. Callers that REQUIRE coordinates (a day
 * location, which feeds weather) check for null and say so; callers that treat
 * them as a bonus (an activity's location) just store what they got.
 */
export async function resolvePlace(suggestion: ResolvablePlace): Promise<ResolvedPlace> {
  let latitude = suggestion.latitude ?? null;
  let longitude = suggestion.longitude ?? null;

  if (needsDetailsLookup(suggestion)) {
    try {
      const details = await fetchPlaceDetails(suggestion.placeId);
      latitude = details.latitude ?? null;
      longitude = details.longitude ?? null;
    } catch {
      // Leave them null — see the doc comment.
    }
  }

  return {
    placeId: suggestion.placeId,
    name: suggestion.primaryText.trim(),
    address: suggestion.secondaryText ?? null,
    latitude,
    longitude,
    googleMapsUri: suggestion.googleMapsUri ?? null,
  };
}

type Options = {
  /** False pauses searching entirely (a closed sheet, a locked field). */
  enabled?: boolean;
  /**
   * A query to treat as "already answered" — the label of the place the user
   * just picked. Without this, selecting a result immediately re-searches for
   * its own name and reopens the list under the user's finger.
   */
  skipQuery?: string | null;
};

export function usePlacesAutocomplete(query: string, options: Options = {}) {
  const { enabled = true, skipQuery = null } = options;

  const [suggestions, setSuggestions] = useState<PlaceAutocompleteSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Monotonic id for the newest request. A response whose id is no longer
  // current is dropped — this is what stops a slow "Par" from landing after
  // a fast "Paris" and replacing the better results with worse ones.
  const requestIdRef = useRef(0);
  // Last query we actually fetched, with its results. Retyping it (backspace
  // then the same character, switching between two fields) reuses these.
  const cacheRef = useRef<{ query: string; results: PlaceAutocompleteSuggestion[] } | null>(null);

  const reset = useCallback(() => {
    // Bumping the id first means any in-flight response is already stale by
    // the time it resolves, so it cannot repopulate a list we just cleared.
    requestIdRef.current += 1;
    setSuggestions([]);
    setLoading(false);
    setError(null);
  }, []);

  useEffect(() => {
    if (!enabled) {
      reset();
      return;
    }

    const trimmed = query.trim();
    const skip = skipQuery?.trim() ?? null;

    if (trimmed.length < PLACES_MIN_QUERY_LENGTH || (skip !== null && trimmed === skip)) {
      reset();
      return;
    }

    const cached = cacheRef.current;
    if (cached && cached.query === trimmed) {
      requestIdRef.current += 1;
      setSuggestions(cached.results);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    const handle = setTimeout(() => {
      requestIdRef.current += 1;
      const requestId = requestIdRef.current;

      void fetchPlaceSuggestions(trimmed)
        .then((items) => {
          const results = items.slice(0, PLACES_MAX_RESULTS);
          cacheRef.current = { query: trimmed, results };
          if (requestIdRef.current !== requestId) return;
          setSuggestions(results);
          setError(null);
        })
        .catch((err: unknown) => {
          if (requestIdRef.current !== requestId) return;
          setSuggestions([]);
          // The message only ever describes the failure — never the query, the
          // response, or anything the user typed.
          setError(err instanceof Error ? err.message : 'places_failed');
        })
        .finally(() => {
          if (requestIdRef.current !== requestId) return;
          setLoading(false);
        });
    }, PLACES_DEBOUNCE_MS);

    // Cancels the pending search on every keystroke — the debounce.
    return () => clearTimeout(handle);
  }, [query, skipQuery, enabled, reset]);

  return { suggestions, loading, error, reset };
}
