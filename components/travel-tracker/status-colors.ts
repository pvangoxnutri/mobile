import type { AppTheme } from '@/constants/themes';

export interface TravelTrackerLivingColors {
  accent: string;
  globe: string;
  surface: string;
  onAccent: string;
}

export const TRAVEL_TRACKER_LIVING_COLOR_TOKENS = Object.freeze({
  light: Object.freeze({
    accent: '#A16207',
    globe: '#D4A017',
    surface: '#FEF3C7',
    onAccent: '#FFFFFF',
  }),
  dark: Object.freeze({
    accent: '#E8A44A',
    globe: '#E8A44A',
    surface: 'rgba(232,164,74,0.16)',
    onAccent: '#161821',
  }),
});

export function getTravelTrackerLivingColors(
  theme: AppTheme,
): TravelTrackerLivingColors {
  return theme.isDark
    ? TRAVEL_TRACKER_LIVING_COLOR_TOKENS.dark
    : TRAVEL_TRACKER_LIVING_COLOR_TOKENS.light;
}
