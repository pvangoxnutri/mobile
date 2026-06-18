// Flight route metadata is stored INSIDE the activity description string,
// using the same hidden-marker pattern as lib/sidequest-location.ts. This
// keeps "From / To" working without any backend model or DB column change —
// the markers are stripped out before the description is shown to the user.

const FROM_MARKER = '[flight-from]:';
const TO_MARKER = '[flight-to]:';

export type FlightRoute = {
  from: string;
  to: string;
};

/** Removes flight markers so the human-facing description stays clean. */
export function stripFlightMarkers(description?: string | null): string | null {
  if (!description) return null;
  const lines = description
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith(FROM_MARKER) && !trimmed.startsWith(TO_MARKER);
    });
  const cleaned = lines.join('\n').trim();
  return cleaned.length > 0 ? cleaned : null;
}

export function extractFlightRoute(description?: string | null): FlightRoute {
  const empty: FlightRoute = { from: '', to: '' };
  if (!description) return empty;

  const lines = description.split('\n');
  const decode = (line: string, marker: string) => {
    const raw = line.trim().slice(marker.length).trim();
    if (!raw) return '';
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  };

  const fromLine = lines.find((line) => line.trim().startsWith(FROM_MARKER));
  const toLine = lines.find((line) => line.trim().startsWith(TO_MARKER));

  return {
    from: fromLine ? decode(fromLine, FROM_MARKER) : '',
    to: toLine ? decode(toLine, TO_MARKER) : '',
  };
}

/** True when at least one endpoint of the route is set. */
export function hasFlightRoute(route: FlightRoute | null | undefined): boolean {
  if (!route) return false;
  return Boolean(route.from.trim() || route.to.trim());
}

/** Renders a clean "CPH → HND" string (handles one-sided routes too). */
export function formatFlightRoute(route: FlightRoute | null | undefined): string {
  if (!route) return '';
  const from = route.from.trim();
  const to = route.to.trim();
  if (from && to) return `${from} → ${to}`;
  return from || to;
}

/**
 * Appends flight markers to a description. Existing flight markers are
 * stripped first so re-saving doesn't duplicate them. Location markers (added
 * by withLocationMarker) are left untouched, so the two systems compose.
 */
export function withFlightMarkers(
  description: string | null | undefined,
  from: string | null | undefined,
  to: string | null | undefined,
): string | null {
  const base = stripFlightMarkers(description);
  const f = (from ?? '').trim();
  const tt = (to ?? '').trim();
  if (!f && !tt) {
    return base;
  }

  const parts: string[] = base ? [base] : [];
  if (f) parts.push(`${FROM_MARKER}${encodeURIComponent(f)}`);
  if (tt) parts.push(`${TO_MARKER}${encodeURIComponent(tt)}`);
  const result = parts.join('\n').trim();
  return result.length > 0 ? result : null;
}
