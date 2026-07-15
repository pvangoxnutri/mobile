/**
 * Shared category visual system.
 *
 * Single source of truth for category → icon + colors + label across the app.
 * Used by:
 * - components/activity-image-fallback.tsx (pastel fallback boxes)
 * - app/(tabs)/index.tsx (Home Up Next badge, Tomorrow row)
 * - app/trip/[id]/index.tsx via ActivityImageFallback (timeline icons)
 * - app/trip/[id]/sidequest/[sidequestId]/index.tsx via ActivityImageFallback (hero)
 * - components/sidequest-form.tsx (Create/Edit category chips)
 *
 * If a render site needs to display a category, import from here.
 */

import type { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

export type ActivityCategoryValue =
  | 'flight'
  | 'boat'
  | 'sea'
  | 'taxi'
  | 'train'
  | 'bus'
  | 'car'
  | 'food'
  | 'drinks'
  | 'beach'
  | 'museum'
  | 'city'
  | 'shopping'
  | 'hiking'
  | 'hotel'
  | 'party'
  | 'sun'
  | 'spa'
  | 'sight'
  | 'sidequest'
  | 'other';

export interface CategorySymbol {
  /** Ionicons glyph name. */
  icon: ComponentProps<typeof Ionicons>['name'];
  /** Foreground color of the icon. */
  iconColor: string;
  /** Soft pastel background tied to the category. */
  backgroundColor: string;
  /** i18n key for the localized label. */
  labelKey: string;
}

const CATEGORY_SYMBOLS: Record<ActivityCategoryValue, CategorySymbol> = {
  flight: {
    icon: 'airplane',
    iconColor: '#0284c7',
    backgroundColor: '#e0f2fe',
    labelKey: 'activity.category_flight',
  },
  sidequest: {
    icon: 'compass',
    iconColor: '#7c3aed',
    backgroundColor: '#f5f3ff',
    labelKey: 'activity.category_sidequest',
  },
  food: {
    icon: 'restaurant',
    iconColor: '#d97706',
    backgroundColor: '#fef3c7',
    labelKey: 'activity.category_food',
  },
  sight: {
    icon: 'images',
    iconColor: '#6b7280',
    backgroundColor: '#f3f4f6',
    labelKey: 'activity.category_sight',
  },
  city: {
    icon: 'business',
    iconColor: '#4f46e5',
    backgroundColor: '#e0e7ff',
    labelKey: 'activity.category_city',
  },
  other: {
    icon: 'star',
    iconColor: '#ec4899',
    backgroundColor: '#fce7f3',
    labelKey: 'activity.category_other',
  },
  boat: {
    icon: 'boat',
    iconColor: '#0e7490',
    backgroundColor: '#cffafe',
    labelKey: 'activity.category_boat',
  },
  sea: {
    icon: 'water',
    iconColor: '#0891b2',
    backgroundColor: '#ecfeff',
    labelKey: 'activity.category_sea',
  },
  taxi: {
    icon: 'car-sport',
    iconColor: '#ca8a04',
    backgroundColor: '#fef9c3',
    labelKey: 'activity.category_taxi',
  },
  train: {
    icon: 'train',
    iconColor: '#4f46e5',
    backgroundColor: '#e0e7ff',
    labelKey: 'activity.category_train',
  },
  bus: {
    icon: 'bus',
    iconColor: '#16a34a',
    backgroundColor: '#dcfce7',
    labelKey: 'activity.category_bus',
  },
  car: {
    icon: 'car',
    iconColor: '#475569',
    backgroundColor: '#f1f5f9',
    labelKey: 'activity.category_car',
  },
  drinks: {
    icon: 'wine',
    iconColor: '#be185d',
    backgroundColor: '#fdf2f8',
    labelKey: 'activity.category_drinks',
  },
  beach: {
    icon: 'umbrella',
    iconColor: '#ea580c',
    backgroundColor: '#ffedd5',
    labelKey: 'activity.category_beach',
  },
  museum: {
    icon: 'library',
    iconColor: '#9333ea',
    backgroundColor: '#f3e8ff',
    labelKey: 'activity.category_museum',
  },
  shopping: {
    icon: 'bag-handle',
    iconColor: '#e11d48',
    backgroundColor: '#ffe4e6',
    labelKey: 'activity.category_shopping',
  },
  hiking: {
    icon: 'trail-sign',
    iconColor: '#15803d',
    backgroundColor: '#f0fdf4',
    labelKey: 'activity.category_hiking',
  },
  hotel: {
    icon: 'bed',
    iconColor: '#b45309',
    backgroundColor: '#fffbeb',
    labelKey: 'activity.category_hotel',
  },
  party: {
    icon: 'musical-notes',
    iconColor: '#c026d3',
    backgroundColor: '#fae8ff',
    labelKey: 'activity.category_party',
  },
  sun: {
    icon: 'sunny',
    iconColor: '#f59e0b',
    backgroundColor: '#fef3c7',
    labelKey: 'activity.category_sun',
  },
  spa: {
    icon: 'flower',
    iconColor: '#0d9488',
    backgroundColor: '#ccfbf1',
    labelKey: 'activity.category_spa',
  },
};

const DEFAULT_SYMBOL: CategorySymbol = {
  icon: 'sparkles',
  iconColor: '#0369a1',
  backgroundColor: '#f0f9ff',
  labelKey: 'activity.category_other',
};

/** Ordered list for selectors (Create/Edit chips): the original five first
 * (familiar order), then transport, then places/activities, 'other' last. */
export const CATEGORY_VALUES: ActivityCategoryValue[] = [
  'flight',
  'sidequest',
  'food',
  'sight',
  'car',
  'taxi',
  'bus',
  'train',
  'boat',
  'sea',
  'beach',
  'hiking',
  'museum',
  'city',
  'shopping',
  'hotel',
  'spa',
  'drinks',
  'party',
  'sun',
  'other',
];

/** Lookup the symbol for a category. Falls back to a neutral default when missing/unknown. */
export function getCategorySymbol(category?: string | null): CategorySymbol {
  if (!category) return DEFAULT_SYMBOL;
  const key = category.toLowerCase() as ActivityCategoryValue;
  return CATEGORY_SYMBOLS[key] ?? DEFAULT_SYMBOL;
}

/** Symbols a CUSTOM category may pick from — the built-in library minus
 * "sidequest" (a reserved marker for the hidden-until-reveal feature). The
 * chosen key is stored in the activity's `category`; the name goes in
 * `customCategoryLabel`. */
export const CUSTOM_SYMBOL_VALUES: ActivityCategoryValue[] = CATEGORY_VALUES.filter(
  (value) => value !== 'sidequest',
);

/** Strips a leading emoji from a localized category label (labels are stored
 * as "🍽️ Food"). Shared so every render site formats identically. */
export function stripCategoryEmoji(label: string): string {
  return label.replace(/^\p{Extended_Pictographic}️?\s*/u, '');
}

/** The text to show for an activity's category: the trimmed custom name when
 * present, otherwise the built-in localized label (emoji stripped). Returns
 * null when there is no category at all. */
export function getCategoryLabel(
  category: string | null | undefined,
  customCategoryLabel: string | null | undefined,
  translate: (key: string) => string,
): string | null {
  const custom = customCategoryLabel?.trim();
  if (custom) return custom;
  if (!category) return null;
  return stripCategoryEmoji(translate(getCategorySymbol(category).labelKey));
}
