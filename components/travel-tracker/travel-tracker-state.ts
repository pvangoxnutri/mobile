import {
  CONTINENT_ORDER,
  COUNTRIES,
  type Continent,
  type Country,
  type CountryStatus,
  type StatusMap,
} from './country-data';

// The tracker's AsyncStorage key — shared so other screens (own profile)
// can read the same source of truth without importing the whole screen.
export const TRAVEL_TRACKER_STORAGE_KEY = 'travel_tracker_status_map';

const COUNTRY_BY_CODE = new Map(COUNTRIES.map((country) => [country.code, country]));

export function isKnownCountryCode(code: string): boolean {
  return COUNTRY_BY_CODE.has(code);
}

export function getCountryByCode(code: string): Country | undefined {
  return COUNTRY_BY_CODE.get(code);
}

export function getPrimaryLivingCountryCode(statusMap: StatusMap): string | null {
  for (const [code, status] of Object.entries(statusMap)) {
    if (status === 'living') return code;
  }
  return null;
}

export function sanitizeStatusMap(value: unknown): StatusMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  const clean: StatusMap = {};
  for (const [code, status] of Object.entries(value)) {
    if (!isKnownCountryCode(code)) {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.warn(`[TRAVEL_TRACKER] Ignoring unknown country code: ${code}`);
      }
      continue;
    }
    if (status === 'none' || status === 'visited' || status === 'planned' || status === 'living') {
      clean[code] = status;
    } else if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn(`[TRAVEL_TRACKER] Ignoring invalid status for country code: ${code}`);
    }
  }
  return clean;
}

export function mergeStatusMaps(tripDerived: StatusMap, local: StatusMap): StatusMap {
  return { ...tripDerived, ...local };
}

export function setCountryStatus(
  local: StatusMap,
  code: string,
  status: CountryStatus,
): StatusMap {
  if (!isKnownCountryCode(code)) return local;

  const next = { ...local };
  if (status === 'living') {
    for (const existingCode of Object.keys(next)) {
      if (next[existingCode] === 'living') next[existingCode] = 'none';
    }
  }
  next[code] = status;
  return next;
}

export function getVisitedCount(statusMap: StatusMap): number {
  return COUNTRIES.reduce((count, { code }) => {
    const status = statusMap[code];
    return count + (status === 'visited' || status === 'living' ? 1 : 0);
  }, 0);
}

export function getVisitedContinents(statusMap: StatusMap): Set<Continent> {
  const continents = new Set<Continent>();
  for (const country of COUNTRIES) {
    const status = statusMap[country.code];
    if (status !== 'visited' && status !== 'living') continue;
    continents.add(country.continent);
    if (country.continent2) continents.add(country.continent2);
  }
  return continents;
}

/**
 * Derives implicit country statuses from the user's trips: a past trip's
 * countries count as visited, upcoming ones as planned (visited wins when
 * both occur). Unknown codes are skipped. Pure — shared by the tracker
 * screen and the profile stats hook so the numbers always agree.
 */
export function deriveTripStatusMap(
  trips: readonly { countries?: string[]; endDate: string }[],
  todayIso: string,
): StatusMap {
  const derived: StatusMap = {};
  for (const trip of trips) {
    if (!trip.countries?.length) continue;
    const status: CountryStatus = trip.endDate < todayIso ? 'visited' : 'planned';
    for (const code of trip.countries) {
      if (!isKnownCountryCode(code)) continue;
      if (!derived[code] || (derived[code] === 'planned' && status === 'visited')) {
        derived[code] = status;
      }
    }
  }
  return derived;
}

export type TravelStats = {
  countriesVisited: number;
  worldExploredPercent: number;
  continentsReached: number;
  totalCountries: number;
  totalContinents: number;
};

/**
 * THE single stats computation behind every TravelStatsSummary render —
 * tracker screen, own profile and (via the synced aggregates) other
 * profiles all agree because totals come from the shared COUNTRIES /
 * CONTINENT_ORDER data, never from any screen-local math.
 */
export function computeTravelStats(statusMap: StatusMap): TravelStats {
  const countriesVisited = getVisitedCount(statusMap);
  return {
    countriesVisited,
    worldExploredPercent: (countriesVisited / COUNTRIES.length) * 100,
    continentsReached: getVisitedContinents(statusMap).size,
    totalCountries: COUNTRIES.length,
    totalContinents: CONTINENT_ORDER.length,
  };
}

/** World-% for a bare visited count (other users' synced aggregates). */
export function worldPercentForCount(countriesVisited: number): number {
  return (countriesVisited / COUNTRIES.length) * 100;
}
