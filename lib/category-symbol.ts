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

export type ActivityCategoryValue = 'flight' | 'food' | 'sight' | 'sidequest' | 'other';

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
  other: {
    icon: 'star',
    iconColor: '#ec4899',
    backgroundColor: '#fce7f3',
    labelKey: 'activity.category_other',
  },
};

const DEFAULT_SYMBOL: CategorySymbol = {
  icon: 'sparkles',
  iconColor: '#0369a1',
  backgroundColor: '#f0f9ff',
  labelKey: 'activity.category_other',
};

/** Ordered list for selectors (Create/Edit chips). */
export const CATEGORY_VALUES: ActivityCategoryValue[] = [
  'flight',
  'sidequest',
  'food',
  'sight',
  'other',
];

/** Lookup the symbol for a category. Falls back to a neutral default when missing/unknown. */
export function getCategorySymbol(category?: string | null): CategorySymbol {
  if (!category) return DEFAULT_SYMBOL;
  const key = category.toLowerCase() as ActivityCategoryValue;
  return CATEGORY_SYMBOLS[key] ?? DEFAULT_SYMBOL;
}
