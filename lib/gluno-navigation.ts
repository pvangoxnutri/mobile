import { router } from 'expo-router';
import type { GlunoNavigation } from '@/lib/gluno';

// ──────────────────────────────────────────────────────────────────────────
// GLUNO — turning a navigation target into an actual screen.
//
// This file is the ONLY place a Gluno navigation becomes a route. The backend
// never sends a path and has no field that could carry one; it sends a stable
// target id plus ids it has already verified against the user's membership.
// The mapping lives here because routes are this app's business — a renamed
// file changes one line in this table and nothing on the server.
//
// A target id this build has never heard of returns null and the card is not
// rendered. That is deliberate: a newer backend offering a screen this app
// does not have should show nothing, not a button that dead-ends.
//
// Nothing here navigates on its own. It is called from an onPress, always.
// ──────────────────────────────────────────────────────────────────────────

/**
 * Stable screen ids sent WITH a message so help can be shorter.
 *
 * Must match SideQuestScreens on the backend. An unknown value is dropped
 * server-side, so a mismatch degrades to generic help rather than breaking.
 */
export const GLUNO_SCREENS = {
  home: 'home',
  calendar: 'calendar',
  profile: 'profile',
  createAdventure: 'create_adventure',
  adventureOverview: 'adventure_overview',
  adventureFunctions: 'adventure_functions',
  adventureSettings: 'adventure_settings',
  activityDetail: 'activity_detail',
  activityCreate: 'activity_create',
  chat: 'chat',
  expenses: 'expenses',
  packlist: 'packlist',
  documents: 'documents',
  weather: 'weather',
  travelTracker: 'travel_tracker',
  previousAdventures: 'previous_adventures',
  support: 'support',
  gluno: 'gluno',
} as const;

export type GlunoScreen = (typeof GLUNO_SCREENS)[keyof typeof GLUNO_SCREENS];

/**
 * Resolves a target to a route, or null when this build cannot open it.
 *
 * Every branch that needs a trip or an Activity checks for it: the backend has
 * already verified membership, but a card restored from an old conversation
 * can be missing an id, and a half-built route is worse than no button.
 */
export function resolveGlunoRoute(navigation: GlunoNavigation): string | null {
  const trip = navigation.tripId;
  const activity = navigation.activityId;
  const date = navigation.date;

  switch (navigation.targetId) {
    case 'home':
      return '/(tabs)';
    case 'create_adventure':
      return '/create-trip';
    case 'travel_tracker':
      return '/travel-tracker';
    case 'profile':
      return '/(tabs)/profile';
    case 'previous_adventures':
      return '/previous-adventures';
    case 'support':
      return '/support';

    case 'adventure_overview':
    case 'adventure_feed_day':
      // The feed lives on the Adventure screen; a date is a hint the screen
      // may use to scroll, never something that changes the trip.
      return trip ? `/trip/${trip}` : null;
    case 'adventure_functions':
      return trip ? `/trip/${trip}/functions` : null;
    case 'adventure_settings':
      return trip ? `/trip/${trip}/settings` : null;
    case 'chat':
      // The Adventure screen already accepts this param.
      return trip ? `/trip/${trip}?openChat=1` : null;
    case 'documents':
      return trip ? `/trip/${trip}/documents` : null;
    case 'expenses':
      return trip ? `/trip/${trip}/split` : null;
    case 'packlist':
      return trip ? `/trip/${trip}/packing-list` : null;
    case 'weather':
      return trip ? `/trip/${trip}/weather` : null;

    case 'activity_detail':
      return trip && activity ? `/trip/${trip}/sidequest/${activity}` : null;
    case 'activity_create':
      // The date is PREFILL only. It opens the ordinary create form, still
      // editable, still validated, and nothing is saved by opening it.
      return trip
        ? `/trip/${trip}/sidequest/new${date ? `?date=${encodeURIComponent(date)}` : ''}`
        : null;

    default:
      // Unknown target — ignore it safely.
      return null;
  }
}

/** True when this build can open the target at all. Drives whether the card renders. */
export function canOpenGlunoNavigation(navigation: GlunoNavigation): boolean {
  return resolveGlunoRoute(navigation) != null;
}

/**
 * Opens the target. Called from an onPress and nowhere else.
 *
 * `push`, not `replace`: the Gluno conversation stays underneath, so back
 * returns to where the user was reading.
 */
export function openGlunoNavigation(navigation: GlunoNavigation): void {
  const route = resolveGlunoRoute(navigation);
  if (!route) return;

  router.push(route as never);
}
