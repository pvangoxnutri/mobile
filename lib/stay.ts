/**
 * Hotel-stay helpers — shared by the form, trip feed, calendar and detail
 * view so "what counts as a stay" and night math live in exactly one place.
 *
 * A stay = an activity with a non-null endDate (check-out) after its date
 * (check-in). Nights cover [date, endDate) — the check-out day is not an
 * occupied night. endDate is only exposed by the hotel UX for now, but the
 * helpers are category-agnostic on purpose.
 */

type StayLike = { date: string; endDate?: string | null };

/** True when the activity is a multi-day stay (valid check-out set). */
export function isStay(activity: StayLike): boolean {
  const start = activity.date?.slice(0, 10);
  const end = activity.endDate?.slice(0, 10);
  return !!start && !!end && end > start;
}

/** Number of nights in the stay ([check-in, check-out)). 0 when not a stay. */
export function stayNights(activity: StayLike): number {
  if (!isStay(activity)) return 0;
  const start = new Date(`${activity.date.slice(0, 10)}T12:00:00`);
  const end = new Date(`${activity.endDate!.slice(0, 10)}T12:00:00`);
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86_400_000));
}

/** Every date (yyyy-MM-dd) the stay covers as a NIGHT: check-in day up to
 * but not including the check-out day. Empty when not a stay. */
export function stayNightDates(activity: StayLike): string[] {
  const nights = stayNights(activity);
  if (nights === 0) return [];
  const out: string[] = [];
  let cursor = new Date(`${activity.date.slice(0, 10)}T12:00:00`);
  for (let i = 0; i < nights; i++) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor = new Date(cursor.getTime() + 86_400_000);
  }
  return out;
}

/** Adds `days` to a yyyy-MM-dd date string. */
export function addDaysIso(date: string, days: number): string {
  const d = new Date(`${date.slice(0, 10)}T12:00:00`);
  return new Date(d.getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

/** "1 natt" / "3 nätter" via the two i18n keys. */
export function formatNights(nights: number, t: (key: string, vars?: Record<string, string | number>) => string): string {
  return nights === 1 ? t('activity.stay.oneNight') : t('activity.stay.nights', { count: nights });
}
