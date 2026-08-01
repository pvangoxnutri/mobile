/**
 * THE selector that answers "which weather belongs to the slide on screen".
 *
 * One implementation, shared by the Home card and the adventure header, so the
 * two can never disagree about what the same slide means. Everything here is
 * pure: it reads an already-fetched forecast, so there is no request to race
 * and a fast swipe changes which entry is READ, never which response wins.
 *
 * A slide is matched to a stored place in a deliberate order, most reliable
 * first. Anything weaker than an id can be ambiguous — two places can share a
 * label — so a weaker signal is only consulted when the stronger ones are
 * absent.
 */
import type {
  TripWeather,
  TripWeatherDay,
  TripWeatherLocationForecast,
  WeatherCondition,
} from '@/lib/weather-api';

/** What a slide knows about itself. Every field is optional because the trip
 * cover slide belongs to no single day or place. */
export type SlideLocationRef = {
  dayLocationId?: string | null;
  date?: string | null;
  placeId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  locationLabel?: string | null;
};

/** The shape both surfaces render: an icon and a temperature. */
export type SlideWeather = {
  condition: WeatherCondition;
  tempMaxC: number;
  locationLabel: string;
};

/** ~1.1 km. Loose enough that a re-picked place with slightly different
 * coordinates still matches, tight enough that two real towns never do. */
const COORD_TOLERANCE = 0.01;

function normalizeLabel(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function sameCoordinate(
  a: { latitude?: number | null; longitude?: number | null },
  b: { latitude: number; longitude: number },
): boolean {
  if (a.latitude == null || a.longitude == null) return false;
  return (
    Math.abs(a.latitude - b.latitude) <= COORD_TOLERANCE &&
    Math.abs(a.longitude - b.longitude) <= COORD_TOLERANCE
  );
}

/**
 * Finds the stored place a slide represents. Restricted to the slide's own date
 * whenever it has one — an additional stop belongs to its day alone, so a match
 * from another date would be wrong by construction.
 */
export function matchSlideLocation(
  slide: SlideLocationRef,
  forecasts: readonly TripWeatherLocationForecast[] | undefined,
): TripWeatherLocationForecast | null {
  if (!forecasts || forecasts.length === 0) return null;

  const sameDay = slide.date
    ? forecasts.filter((f) => f.date.slice(0, 10) === slide.date!.slice(0, 10))
    : forecasts;
  if (sameDay.length === 0) return null;

  // 1. An id the slide already carries is authoritative — nothing below can
  //    contradict it.
  if (slide.dayLocationId) {
    const byId = sameDay.find((f) => f.dayLocationId === slide.dayLocationId);
    if (byId) return byId;
  }

  // 2. placeId: stable across renames and re-picks.
  if (slide.placeId) {
    const byPlace = sameDay.find((f) => f.placeId && f.placeId === slide.placeId);
    if (byPlace) return byPlace;
  }

  // 3. Coordinates. Ranked above the label on purpose: two stops can share a
  //    label ("Airport") while being different places, and the coordinates are
  //    what the forecast was actually fetched for.
  const byCoord = sameDay.find((f) => sameCoordinate(slide, f));
  if (byCoord) return byCoord;

  // 4. Label, trimmed and case-insensitive — the last resort before giving up
  //    and letting the caller fall back to the day's main location.
  const label = normalizeLabel(slide.locationLabel);
  if (label) {
    const byLabel = sameDay.find((f) => normalizeLabel(f.locationLabel) === label);
    if (byLabel) return byLabel;
  }

  return null;
}

function fromLocationForecast(entry: TripWeatherLocationForecast): SlideWeather | null {
  if (!entry.isForecastAvailable) return null;
  return {
    condition: entry.code,
    tempMaxC: entry.tempMaxC,
    locationLabel: entry.locationLabel,
  };
}

function fromDay(day: TripWeatherDay | undefined): SlideWeather | null {
  if (!day || !day.isForecastAvailable) return null;
  return { condition: day.code, tempMaxC: day.tempMaxC, locationLabel: day.locationLabel };
}

/**
 * The weather for the slide on screen, or null when nothing truthful can be
 * shown — callers hide the row rather than display the previous slide's numbers
 * under the new slide's location.
 *
 * Fallback order:
 *   1. the slide's matched stored place (id → placeId → coordinates → label)
 *   2. the day's main forecast for the slide's date
 *   3. the caller's trip-level summary (carry-forward main location, then the
 *      adventure destination — both already resolved server-side into `days`)
 */
export function selectSlideWeather(
  slide: SlideLocationRef | null,
  weather: TripWeather | null | undefined,
  tripFallback: SlideWeather | null,
): SlideWeather | null {
  if (!weather || weather.status !== 'available') return tripFallback;

  if (slide) {
    const matched = matchSlideLocation(slide, weather.locationForecasts);
    if (matched) {
      // A matched place with no forecast yet resolves to null rather than
      // falling through: the slide's real place IS known, and showing another
      // place's numbers under it would be worse than showing none.
      return fromLocationForecast(matched);
    }

    if (slide.date) {
      const day = weather.days.find((d) => d.date.slice(0, 10) === slide.date!.slice(0, 10));
      const dayWeather = fromDay(day);
      if (dayWeather) return dayWeather;
      // The date is known and the day exists but has no forecast — again, no
      // numbers rather than the wrong ones.
      if (day) return null;
    }
  }

  return tripFallback;
}
