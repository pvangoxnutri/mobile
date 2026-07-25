// Use the JSON locale files from i18n-iso-countries directly. The library's
// own entry-node.js does dynamic require() calls that Metro can't follow at
// bundle time, which broke `eas update`. Importing the JSON directly avoids
// the whole library wrapper — we only need a code → name lookup.
import enLocale from 'i18n-iso-countries/langs/en.json';
import svLocale from 'i18n-iso-countries/langs/sv.json';

import type { AppLanguage } from '@/components/i18n-provider';
import type { Continent, Country } from './country-data';

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
