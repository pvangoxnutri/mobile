import type { GlunoLearnedPreference } from '@/lib/gluno-feedback';

// ──────────────────────────────────────────────────────────────────────────
// GLUNO — turning stored preferences into something a person can read.
//
// The store holds stable ids: `pace` = `relaxed`, `start_time` = `10:00`.
// Those are the right thing to store and the wrong thing to show. This module
// is the only place that knows how to say them out loud.
//
// TWO RULES.
//
// Nothing here ever renders a raw key or a raw enum. An unrecognised key falls
// back to a neutral label, not to `walking_distance`.
//
// A value we do not recognise is shown VERBATIM rather than hidden. Older rows
// were written by Gluno from conversation — "later start", "shorter walks" —
// long before any option list existed. Those are still true, still the user's,
// and still the reason a plan looks the way it does. Hiding one because a
// validator arrived later would mean the screen quietly lies about what Gluno
// is actually using.
// ──────────────────────────────────────────────────────────────────────────

type Translate = (key: string, params?: Record<string, string | number>) => string;

/** Keys the app has product language for. Anything else gets a neutral label. */
const KNOWN_KEYS = new Set([
  'pace', 'budget', 'transport', 'walking_distance', 'start_time',
  'interests', 'food', 'avoid', 'nightlife', 'intent',
  'accessibility', 'group_context',
]);

/** Option ids with their own localised phrase. */
const KNOWN_VALUES = new Set([
  'relaxed', 'balanced', 'packed',
  'budget', 'moderate', 'comfortable', 'premium',
  'walking', 'public_transport', 'car', 'taxi', 'mixed',
  'none', 'some', 'lots',
  'inspiration', 'booking',
]);

export function preferenceKeyLabel(key: string, t: Translate): string {
  return KNOWN_KEYS.has(key) ? t(`gluno.pref.key.${key}`) : t('gluno.pref.key.unknown');
}

/**
 * The value as a sentence.
 *
 * Time and minutes get a phrase rather than a bare number — "10:00" alone on a
 * settings row does not say whether it is a start, an end or a deadline.
 */
export function preferenceValueLabel(preference: GlunoLearnedPreference, t: Translate): string {
  const value = preference.value?.trim() ?? '';
  if (!value) return '';

  if (preference.key === 'start_time' && /^\d{2}:\d{2}$/.test(value)) {
    return t('gluno.pref.value.startAround', { time: value });
  }

  if (preference.key === 'walking_distance' && /^\d+$/.test(value)) {
    return t('gluno.pref.value.walkAtMost', { minutes: value });
  }

  // Only for keys whose options we actually own. Without the editor check,
  // the token `budget` under the `budget` KEY would render as the budget
  // VALUE phrase by coincidence of naming.
  if (preference.editor === 'choice' && KNOWN_VALUES.has(value)) {
    return t(`gluno.pref.value.${value}`);
  }

  // The user's own words, or Gluno's from an older conversation. Shown as-is.
  return value;
}

/** The same treatment for a candidate, which carries no editor of its own. */
export function candidateValueLabel(key: string, value: string, t: Translate): string {
  return preferenceValueLabel(
    {
      key,
      value,
      editor: KNOWN_VALUES.has(value.trim()) ? 'choice' : 'text',
    } as GlunoLearnedPreference,
    t,
  );
}

export function scopeLabel(scope: string, t: Translate): string {
  switch (scope) {
    case 'conversation':
      return t('gluno.knows.scopeConversation');
    case 'trip':
      return t('gluno.knows.scopeTrip');
    case 'global':
      return t('gluno.knows.scopeGlobal');
    default:
      // A scope this build has never heard of. Neutral, and never rendered as
      // the raw token.
      return t('gluno.knows.scopeUnknown');
  }
}

/**
 * Whether this preference is visible to the rest of the Adventure.
 *
 * `global_private` is deliberately NOT shared: it is the widest SCOPE and the
 * narrowest audience. It follows the user between their own trips and nobody
 * else ever sees it.
 */
export function isSharedWithGroup(visibility: string): boolean {
  return visibility === 'trip_shared';
}

/** Sharing is only meaningful for a preference that belongs to an Adventure. */
export function canShare(preference: GlunoLearnedPreference): boolean {
  return preference.scope === 'trip' && preference.tripId != null;
}

/**
 * Ordering within a section.
 *
 * Hard practical constraints first — they are the ones that decide whether a
 * plan works at all. Then the shape of the day, then taste. Deliberately NOT
 * ordered by anything Gluno computed about how sure it is: a confidence-sorted
 * settings screen is a ranking of the user, and it would also reorder itself
 * under them for reasons they cannot see.
 */
const KEY_ORDER: Record<string, number> = {
  accessibility: 0,
  avoid: 1,
  walking_distance: 2,
  group_context: 3,
  pace: 10,
  start_time: 11,
  transport: 12,
  budget: 13,
  interests: 20,
  food: 21,
  nightlife: 22,
  intent: 23,
};

export function comparePreferences(a: GlunoLearnedPreference, b: GlunoLearnedPreference): number {
  // A must-have outranks its own category: somebody's stated requirement
  // belongs at the top whatever field it lives in.
  if (a.isHardConstraint !== b.isHardConstraint) return a.isHardConstraint ? -1 : 1;

  const rankA = KEY_ORDER[a.key] ?? 50;
  const rankB = KEY_ORDER[b.key] ?? 50;
  if (rankA !== rankB) return rankA - rankB;

  return a.key.localeCompare(b.key);
}
