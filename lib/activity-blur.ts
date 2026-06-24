// Per-activity reveal blur amount, stored as a hidden marker inside the
// description (same pattern as lib/sidequest-location.ts and lib/flight-route.ts)
// so it needs no backend model or DB column. Controls how blurred a hidden
// activity's cover image looks to viewers before the reveal.

const BLUR_MARKER = '[blur]:';

export const DEFAULT_BLUR = 22;
export const MIN_BLUR = 6;
export const MAX_BLUR = 50;

function clampBlur(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_BLUR;
  return Math.max(MIN_BLUR, Math.min(MAX_BLUR, Math.round(value)));
}

/** Removes the blur marker so the human-facing description stays clean. */
export function stripBlurMarker(description?: string | null): string | null {
  if (!description) return null;
  const lines = description
    .split('\n')
    .filter((line) => !line.trim().startsWith(BLUR_MARKER));
  const cleaned = lines.join('\n').trim();
  return cleaned.length > 0 ? cleaned : null;
}

/** Reads the stored blur amount, or null when none is set. */
export function extractBlur(description?: string | null): number | null {
  if (!description) return null;
  const line = description.split('\n').find((l) => l.trim().startsWith(BLUR_MARKER));
  if (!line) return null;
  const raw = line.trim().slice(BLUR_MARKER.length).trim();
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) ? clampBlur(parsed) : null;
}

/**
 * Whether a hidden SideQuest should appear sealed (blurred cover + lock) in
 * list/preview surfaces — calendar, trip feed — for EVERY viewer, including
 * its own creator. The backend's isHiddenForViewer is creator-aware (so the
 * owner can open the detail screen and see the real photo as usual); this is
 * deliberately not, so the surprise can't be spoiled by a glance at a list.
 */
export function isSealedInLists(activity: { visibility: 'public' | 'hidden'; isRevealed: boolean }): boolean {
  return activity.visibility === 'hidden' && !activity.isRevealed;
}

/** Appends a blur marker (replacing any existing one). */
export function withBlurMarker(
  description: string | null | undefined,
  blur: number | null | undefined,
): string | null {
  const base = stripBlurMarker(description);
  if (blur === null || blur === undefined) {
    return base;
  }
  const value = clampBlur(blur);
  const parts: string[] = base ? [base] : [];
  parts.push(`${BLUR_MARKER}${value}`);
  const result = parts.join('\n').trim();
  return result.length > 0 ? result : null;
}
