// The one place that answers date questions about an adventure that may have
// no end date.
//
// `Quest.endDate` is null when the traveller picked "I don't know yet". Null
// means unknown — it is never a placeholder date, and nothing here invents one.
// What it changes:
//
//   * The adventure is ongoing from its start day onwards, indefinitely. It
//     never ages into "previous" on its own; only setting an end date or
//     marking it completed does that.
//   * Anything that renders a range shows "Ongoing" instead of a second date.
//   * Anything that iterates day-by-day needs a finite last day, which
//     `effectiveEndDate` derives: as far as there is a reason to go, no
//     further. Mirrors backend Services/TripDateRange.cs.

/** Matches backend TripDateRange.MaxHorizonDays. */
export const MAX_OPEN_ENDED_HORIZON_DAYS = 730;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** ISO yyyy-MM-dd for a Date, in local time. */
export function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Normalises a possibly-datetime value to yyyy-MM-dd, or null. */
export function dayOnly(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.slice(0, 10);
  return trimmed.length === 10 ? trimmed : null;
}

/**
 * True when the adventure has no known end date. Both null and absent count —
 * older cached payloads may not carry the field at all.
 */
export function isOpenEnded(endDate?: string | null) {
  return !dayOnly(endDate);
}

export function addDays(isoDate: string, days: number) {
  const base = new Date(`${isoDate}T12:00:00`);
  return toIsoDate(new Date(base.getTime() + days * MS_PER_DAY));
}

/**
 * The last day worth materialising for this adventure.
 *
 * With an end date: that date, unchanged. Existing adventures are untouched by
 * any of this.
 *
 * Without one: today, extended to cover anything already planned further out,
 * and capped at the horizon so a mistyped year cannot turn a day loop into
 * decades of iterations. Recomputed on every call, so an ongoing adventure's
 * range follows today rather than freezing.
 */
export function effectiveEndDate(
  startDate?: string | null,
  endDate?: string | null,
  latestContentDate?: string | null,
  now: Date = new Date(),
): string | null {
  const start = dayOnly(startDate);
  if (!start) return null;

  const stored = dayOnly(endDate);
  if (stored) return stored;

  let end = start;
  const today = toIsoDate(now);
  if (today > end) end = today;

  const latest = dayOnly(latestContentDate);
  if (latest && latest > end) end = latest;

  const horizon = addDays(start, MAX_OPEN_ENDED_HORIZON_DAYS);
  return end > horizon ? horizon : end;
}

/**
 * Is the adventure happening right now?
 *
 * An open-ended one is ongoing from its start day and stays that way — that is
 * the whole point of leaving the end date unknown.
 */
export function isTripOngoing(
  startDate?: string | null,
  endDate?: string | null,
  now: Date = new Date(),
) {
  const start = dayOnly(startDate);
  if (!start) return false;

  const today = toIsoDate(now);
  if (today < start) return false;

  const end = dayOnly(endDate);
  return end ? today <= end : true;
}

/**
 * Has the adventure finished on its dates alone? Always false while open-ended
 * — an unknown end date must never let something drift into "previous
 * adventures" by itself.
 */
export function isTripPast(
  startDate?: string | null,
  endDate?: string | null,
  now: Date = new Date(),
) {
  const end = dayOnly(endDate);
  if (!end) return false;
  return toIsoDate(now) > end;
}

/**
 * "Day 3 of 7" for a fixed range; for an open-ended adventure there is no
 * total, so only the day number is returned and callers render just that.
 */
export function getTripDayProgress(
  startDate?: string | null,
  endDate?: string | null,
  now: Date = new Date(),
): { dayOfTrip: number; totalDays: number | null } | null {
  const start = dayOnly(startDate);
  if (!start) return null;

  const startMid = new Date(`${start}T12:00:00`);
  const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  const dayOfTrip = Math.floor((todayMid.getTime() - startMid.getTime()) / MS_PER_DAY) + 1;

  const end = dayOnly(endDate);
  if (!end) return { dayOfTrip, totalDays: null };

  const endMid = new Date(`${end}T12:00:00`);
  const totalDays = Math.max(1, Math.round((endMid.getTime() - startMid.getTime()) / MS_PER_DAY) + 1);
  return { dayOfTrip, totalDays };
}

/**
 * The date line shown on cards and headers.
 *
 * Open-ended → "Jun 3 · Ongoing". Never a bare start date that reads like a
 * one-day adventure, never a dash to nowhere, never "Invalid date".
 */
export function formatTripDateRange(
  startDate: string | undefined | null,
  endDate: string | undefined | null,
  locale: string,
  t: (key: string, vars?: Record<string, string | number>) => string,
  fallback?: string,
): string | null {
  const start = dayOnly(startDate);
  if (!start) return fallback ?? null;

  const formatter = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' });
  const startLabel = formatter.format(new Date(`${start}T12:00:00`));

  const end = dayOnly(endDate);
  if (!end) return `${startLabel} · ${t('trip.ongoing')}`;

  return `${startLabel} – ${formatter.format(new Date(`${end}T12:00:00`))}`;
}
