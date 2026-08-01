// Use the JSON locale files from i18n-iso-countries directly. The library's
// own entry-node.js does dynamic require() calls that Metro can't follow at
// bundle time, which broke `eas update`. Importing the JSON directly avoids
// the whole library wrapper — we only need a code → name lookup.
import enLocale from 'i18n-iso-countries/langs/en.json';
import svLocale from 'i18n-iso-countries/langs/sv.json';

import type { AppLanguage } from '@/components/i18n-provider';
import { COUNTRIES, type Continent, type Country } from './country-data';

/** Every ISO code this app knows, for the pass-through path in
 * normalizeCountryValue. */
const KNOWN_CODES = new Set(COUNTRIES.map((country) => country.code.toUpperCase()));

// The JSON files have shape: { locale: "en", countries: { "SE": "Sweden", "US": ["United States of America", "USA", ...] } }
// Some entries are an array of alternative names; we pick the first.
type LocaleData = { locale: string; countries: Record<string, string | string[]> };
const LOCALE_DICTS: Record<AppLanguage, LocaleData> = {
  en: enLocale as LocaleData,
  sv: svLocale as LocaleData,
};

function lookupCountryName(code: string, language: AppLanguage): string | undefined {
  const entry = LOCALE_DICTS[language]?.countries?.[code];
  if (Array.isArray(entry)) return entry[0];
  if (typeof entry === 'string') return entry;
  return undefined;
}

// UK subdivisions: not ISO 3166-1 standalone, so the country dictionary
// doesn't have them. Provide explicit Swedish names; English already lives
// on country-data.ts and is used as the fallback.
const SUBDIVISION_NAMES_SV: Record<string, string> = {
  'GB-ENG': 'England',
  'GB-SCT': 'Skottland',
  'GB-WLS': 'Wales',
  'GB-NIR': 'Nordirland',
};

const CONTINENT_NAMES: Record<AppLanguage, Record<Continent, string>> = {
  en: {
    Europe: 'Europe',
    Asia: 'Asia',
    Africa: 'Africa',
    Antarctica: 'Antarctica',
    'North America': 'North America',
    'South America': 'South America',
    Oceania: 'Oceania',
  },
  sv: {
    Europe: 'Europa',
    Asia: 'Asien',
    Africa: 'Afrika',
    Antarctica: 'Antarktis',
    'North America': 'Nordamerika',
    'South America': 'Sydamerika',
    Oceania: 'Oceanien',
  },
};

const CONTINENT_SHORT_NAMES: Record<AppLanguage, Record<Continent, string>> = {
  en: {
    Europe: 'Europe',
    Asia: 'Asia',
    Africa: 'Africa',
    Antarctica: 'Antarctica',
    'North America': 'N. America',
    'South America': 'S. America',
    Oceania: 'Oceania',
  },
  sv: {
    Europe: 'Europa',
    Asia: 'Asien',
    Africa: 'Afrika',
    Antarctica: 'Antarktis',
    'North America': 'N. Amerika',
    'South America': 'S. Amerika',
    Oceania: 'Oceanien',
  },
};

/** A country's name in a SPECIFIC language, regardless of the app language.
 * Used by search, so a Swedish user can still find a country by typing its
 * English name and vice versa. */
export function getCountryNameInLanguage(code: string, language: AppLanguage): string | undefined {
  if (code.includes('-')) {
    return language === 'sv' ? SUBDIVISION_NAMES_SV[code] : undefined;
  }
  return lookupCountryName(code, language);
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Every name any country is known by → its ISO code. Built once from BOTH
 * locale dictionaries (including the libraries' alternate spellings, which is
 * where "USA", "Great Britain" and similar come from for free) plus the short
 * English names in country-data.
 *
 * This exists because trips saved before country selection moved to ISO codes
 * stored the NAME. deriveTripStatusMap skips anything that isn't a known code,
 * so those trips silently vanished from the tracker and from the visited
 * count — the data was fine, the read was not.
 */
const NAME_TO_CODE: Map<string, string> = (() => {
  const map = new Map<string, string>();
  const add = (name: string | undefined, code: string) => {
    if (!name) return;
    const key = normalizeKey(name);
    // First writer wins: a real country must never be shadowed by another's
    // alternate spelling.
    if (!map.has(key)) map.set(key, code);
  };

  for (const country of COUNTRIES) {
    add(country.code, country.code);
    add(country.name, country.code);
  }
  for (const language of ['en', 'sv'] as const) {
    const dict = LOCALE_DICTS[language]?.countries ?? {};
    for (const [code, entry] of Object.entries(dict)) {
      const names = Array.isArray(entry) ? entry : [entry];
      for (const name of names) add(name, code);
    }
  }
  for (const [code, name] of Object.entries(SUBDIVISION_NAMES_SV)) add(name, code);
  return map;
})();

/**
 * Resolves a stored country value to its ISO code. Already-valid codes pass
 * through untouched, so nothing saved is rewritten — this only makes old
 * name-based values readable. Trim-safe and case-insensitive, English and
 * Swedish. Returns null when the value matches nothing, so callers keep their
 * existing "skip unknown" behaviour.
 */
export function normalizeCountryValue(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const upper = trimmed.toUpperCase();
  if (KNOWN_CODES.has(upper)) return upper;

  return NAME_TO_CODE.get(normalizeKey(trimmed)) ?? null;
}

/**
 * THE country search predicate. Matches the localized name, the English name,
 * the Swedish name and the ISO code — so a country is findable whichever of
 * those the user happens to type. Trim-safe and case-insensitive.
 */
export function countryMatchesQuery(
  country: Pick<Country, 'code' | 'name'>,
  query: string,
  language: AppLanguage,
): boolean {
  const q = normalizeKey(query);
  if (!q) return true;

  const candidates = [
    country.code,
    country.name,
    getCountryNameInLanguage(country.code, language),
    getCountryNameInLanguage(country.code, 'en'),
    getCountryNameInLanguage(country.code, 'sv'),
  ];

  return candidates.some((candidate) => candidate && normalizeKey(candidate).includes(q));
}

export function getLocalizedCountryName(country: Country, language: AppLanguage): string {
  if (country.code.includes('-')) {
    if (language === 'sv') {
      return SUBDIVISION_NAMES_SV[country.code] ?? country.name;
    }
    return country.name;
  }
  return lookupCountryName(country.code, language) ?? country.name;
}

export function getLocalizedContinentName(continent: Continent, language: AppLanguage): string {
  return CONTINENT_NAMES[language][continent];
}

export function getLocalizedContinentShortName(continent: Continent, language: AppLanguage): string {
  return CONTINENT_SHORT_NAMES[language][continent];
}

/**
 * Collation-aware comparator so picker sort matches the current language's
 * alphabet (e.g. Ö/Å go to the end of the Swedish list, but mid-alphabet
 * for English).
 */
export function compareCountriesByLocalizedName(
  a: Country,
  b: Country,
  language: AppLanguage,
): number {
  const locale = language === 'sv' ? 'sv' : 'en';
  return getLocalizedCountryName(a, language).localeCompare(
    getLocalizedCountryName(b, language),
    locale,
  );
}
