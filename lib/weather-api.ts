// Trip weather data layer. All weather comes from the SideQuest backend
// (GET /api/trips/{id}/weather) — the app never talks to the weather
// provider and holds no provider key. Responses ride lib/cache.ts's
// stale-while-revalidate store, so Home, the trip overview and the Weather
// page share one cache entry per trip instead of firing duplicates.

import { apiJson } from '@/lib/api';
import { getCached, setCached } from '@/lib/cache';

export type WeatherCondition =
  | 'clear'
  | 'partly_cloudy'
  | 'cloudy'
  | 'fog'
  | 'rain'
  | 'heavy_rain'
  | 'thunderstorm'
  | 'snow';

// Discriminated on isForecastAvailable so the compiler — not a runtime
// null-check the render code might forget — enforces that temperature/code
// fields are only ever read when the backend actually had a real forecast
// for this date. False means the provider had no data yet (e.g. the last
// day of its window); never a fabricated zero.
export type TripWeatherDay =
  | {
      date: string; // YYYY-MM-DD in the destination's timezone
      isForecastAvailable: true;
      code: WeatherCondition;
      tempMinC: number;
      tempMaxC: number;
      precipitationProbability: number; // 0–100
      uvIndexMax: number;
      // Which resolved location this day's forecast came from — a
      // TripDayLocation anchor (explicit or carried forward), or the trip
      // destination fallback. Lets consecutive same-location days be
      // grouped without the client re-deriving anything.
      locationLabel: string;
    }
  | {
      date: string;
      isForecastAvailable: false;
      code: null;
      tempMinC: null;
      tempMaxC: null;
      precipitationProbability: null;
      uvIndexMax: null;
      locationLabel: string;
    };

export type TripWeatherStatus = 'available' | 'too_early' | 'no_coordinates' | 'unavailable';

export type TripWeather = {
  status: TripWeatherStatus;
  destinationName?: string | null;
  timezone?: string | null;
  forecastStart?: string | null;
  forecastEnd?: string | null;
  forecastAvailableFrom?: string | null;
  updatedAt?: string | null;
  stale: boolean;
  attribution?: string | null;
  days: TripWeatherDay[];
};

const weatherUrl = (tripId: string) => `/api/trips/${tripId}/weather`;

export function getCachedTripWeather(tripId: string): TripWeather | null {
  return getCached<TripWeather>(weatherUrl(tripId));
}

export async function fetchTripWeather(tripId: string): Promise<TripWeather> {
  const data = await apiJson<TripWeather>(weatherUrl(tripId));
  setCached(weatherUrl(tripId), data);
  return data;
}

export function conditionLabelKey(code: WeatherCondition): string {
  return `weather.condition.${code}`;
}

// WHO UV-index bands, mapped to i18n keys.
export function uvCategoryKey(uvIndexMax: number): string {
  if (uvIndexMax < 3) return 'weather.uv.low';
  if (uvIndexMax < 6) return 'weather.uv.moderate';
  if (uvIndexMax < 8) return 'weather.uv.high';
  if (uvIndexMax < 11) return 'weather.uv.veryHigh';
  return 'weather.uv.extreme';
}

// The one day a compact summary shows: days[] is already clipped to the
// trip, so day 0 is the trip start — or today when the trip is ongoing.
// Returns null (hides the summary entirely) rather than an unavailable day —
// a compact pill has no room to explain "forecast not available yet", and
// must never show a fabricated 0° instead.
export function summaryDay(weather: TripWeather | null | undefined): Extract<TripWeatherDay, { isForecastAvailable: true }> | null {
  if (!weather || weather.status !== 'available') return null;
  const day = weather.days[0];
  return day?.isForecastAvailable ? day : null;
}
