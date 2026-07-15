/**
 * THEMES — Light/Dark appearance system.
 *
 * SideQuest has exactly two appearances: 'light' and 'dark'. There is no
 * "system"/automatic mode — the app never follows the device appearance.
 * The light palette is a pixel-for-pixel copy of the pre-theming app
 * (see constants/design-tokens.ts COLORS); the dark palette is designed,
 * not inverted: soft blue-blacks, elevation through surface contrast and
 * hairline borders rather than Android elevation, and the SideQuest pink
 * accent unchanged.
 *
 * Usage: never import lightTheme/darkTheme directly in screens — use
 * useTheme()/useThemedStyles() from components/theme-provider.tsx so the
 * whole tree re-renders on switch.
 */

import {
  DarkTheme as NavDarkTheme,
  DefaultTheme as NavDefaultTheme,
  type Theme as NavigationTheme,
} from '@react-navigation/native';

export type ThemeMode = 'light' | 'dark';

export interface ThemeColors {
  // Brand
  primary: string;
  secondary: string;
  primaryLight08: string;
  primaryLight12: string;
  primaryLight20: string;

  // Pure white — stays white in both themes (text on pink buttons, etc.).
  white: string;

  // Text
  textPrimary: string;
  textSecondary: string;
  textMeta: string;
  textMuted: string;

  // Page + fill backgrounds
  bgPrimary: string;   // main page background
  bgLight: string;     // input backgrounds, secondary fills
  bgLightest: string;  // subtle field background

  // Card surfaces — in light mode these equal bgPrimary (cards float on
  // shadows); in dark mode they are the contrast steps that replace shadows.
  surface: string;          // standard card
  surfaceElevated: string;  // sheet/modal/elevated card

  // Borders & dividers
  borderPrimary: string;
  borderInput: string;

  placeholderText: string;

  // Semantic
  success: string;
  successLight: string;
  successBorder: string;
  error: string;
  errorLight: string;
  errorBorder: string;
  warning: string;

  // Overlays & backdrops
  backdropModal: string;
  backdropFab: string;

  // Image overlays — identical in both themes: they sit on photos, not on
  // themed surfaces, and photos stay vibrant regardless of appearance.
  gradientDark55: string;
  gradientDark28: string;
  gradientDark12: string;
  pillDark70: string;
  pillDark42: string;

  // Avatars
  avatarDark: string;
  avatarLight: string;
}

type ShadowStyle = {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
};

export interface ThemeShadows {
  subtle: ShadowStyle;
  medium: ShadowStyle;
  strong: ShadowStyle;
  floating: ShadowStyle;
}

export interface AppTheme {
  mode: ThemeMode;
  isDark: boolean;
  colors: ThemeColors;
  shadows: ThemeShadows;
  navTheme: NavigationTheme;
  // expo-status-bar style ('dark' = dark icons for light backgrounds).
  statusBarStyle: 'light' | 'dark';
}

// ─── Light — must stay pixel-identical to the pre-theming app ──────────────

const lightColors: ThemeColors = {
  primary: '#ff4f74',
  secondary: '#0d90a8',
  primaryLight08: 'rgba(255,79,116,0.08)',
  primaryLight12: 'rgba(255,79,116,0.12)',
  primaryLight20: 'rgba(255,79,116,0.2)',

  white: '#fff',

  textPrimary: '#161821',
  textSecondary: '#6f7683',
  textMeta: '#8a909e',
  textMuted: '#bbc0c8',

  bgPrimary: '#fff',
  bgLight: '#f4f4f5',
  bgLightest: '#f8f9fc',

  surface: '#fff',
  surfaceElevated: '#fff',

  borderPrimary: '#e3e5e9',
  borderInput: '#e2e5ee',

  placeholderText: '#bbc0c8',

  success: '#3ddc8c',
  successLight: '#e9f8f1',
  successBorder: '#bfe9d2',
  error: '#d53d18',
  errorLight: '#ffefeb',
  errorBorder: '#ffd0c3',
  warning: '#f59e0b',

  backdropModal: 'rgba(10,12,18,0.28)',
  backdropFab: 'rgba(17,18,23,0.08)',

  gradientDark55: 'rgba(0,0,0,0.55)',
  gradientDark28: 'rgba(0,0,0,0.28)',
  gradientDark12: 'rgba(0,0,0,0.12)',
  pillDark70: 'rgba(20,22,29,0.7)',
  pillDark42: 'rgba(0,0,0,0.42)',

  avatarDark: '#1d212a',
  avatarLight: '#fff1f5',
};

// Today's shadows, unchanged.
const lightShadows: ThemeShadows = {
  subtle: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  medium: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.06,
    shadowRadius: 22,
    elevation: 5,
  },
  strong: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 10,
  },
  floating: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.16,
    shadowRadius: 28,
    elevation: 14,
  },
};

// ─── Dark — designed, not inverted ──────────────────────────────────────────

const darkColors: ThemeColors = {
  // Pink is the brand in both themes; teal is lifted slightly so date/plan
  // accents keep their contrast on dark surfaces.
  primary: '#ff4f74',
  secondary: '#22aec7',
  primaryLight08: 'rgba(255,79,116,0.1)',
  primaryLight12: 'rgba(255,79,116,0.16)',
  primaryLight20: 'rgba(255,79,116,0.24)',

  white: '#fff',

  textPrimary: '#f0f2f5',
  textSecondary: '#a2a9b4',
  textMeta: '#7d8591',
  textMuted: '#525a66',

  // Soft blue-black scale — never pure #000.
  bgPrimary: '#0d0f14',
  bgLight: '#1a1e27',
  bgLightest: '#141821',

  surface: '#161922',
  surfaceElevated: '#1d212a',

  borderPrimary: 'rgba(255,255,255,0.08)',
  borderInput: 'rgba(255,255,255,0.1)',

  placeholderText: '#525a66',

  success: '#3ddc8c',
  successLight: 'rgba(61,220,140,0.14)',
  successBorder: 'rgba(61,220,140,0.28)',
  // Brightened for contrast on dark, same semantic red-orange.
  error: '#ff6b4a',
  errorLight: 'rgba(255,107,74,0.14)',
  errorBorder: 'rgba(255,107,74,0.28)',
  warning: '#f5a623',

  backdropModal: 'rgba(0,0,0,0.6)',
  backdropFab: 'rgba(0,0,0,0.35)',

  gradientDark55: 'rgba(0,0,0,0.55)',
  gradientDark28: 'rgba(0,0,0,0.28)',
  gradientDark12: 'rgba(0,0,0,0.12)',
  pillDark70: 'rgba(20,22,29,0.7)',
  pillDark42: 'rgba(0,0,0,0.42)',

  // avatarDark must contrast against dark surfaces (it *is* the light-mode
  // surfaceElevated color), so it steps one level lighter here.
  avatarDark: '#262c38',
  avatarLight: 'rgba(255,79,116,0.16)',
};

// Elevation through contrast, not shadows: Android elevation renders muddy
// gray boxes on dark surfaces, so it's minimal here — surfaces separate via
// surface/surfaceElevated steps and hairline borders instead. iOS keeps a
// faint real shadow for depth on overlapping elements.
const darkShadows: ThemeShadows = {
  subtle: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 0,
  },
  medium: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
    elevation: 0,
  },
  strong: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 22,
    elevation: 4,
  },
  floating: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.5,
    shadowRadius: 26,
    elevation: 6,
  },
};

// ─── Navigation themes — SideQuest-flavored, never the raw defaults ────────

const lightNavTheme: NavigationTheme = {
  ...NavDefaultTheme,
  colors: {
    ...NavDefaultTheme.colors,
    primary: lightColors.primary,
    background: lightColors.bgPrimary,
    card: lightColors.surface,
    text: lightColors.textPrimary,
    border: lightColors.borderPrimary,
    notification: lightColors.primary,
  },
};

const darkNavTheme: NavigationTheme = {
  ...NavDarkTheme,
  colors: {
    ...NavDarkTheme.colors,
    primary: darkColors.primary,
    background: darkColors.bgPrimary,
    card: darkColors.surface,
    text: darkColors.textPrimary,
    border: darkColors.borderPrimary,
    notification: darkColors.primary,
  },
};

export const lightTheme: AppTheme = {
  mode: 'light',
  isDark: false,
  colors: lightColors,
  shadows: lightShadows,
  navTheme: lightNavTheme,
  statusBarStyle: 'dark',
};

export const darkTheme: AppTheme = {
  mode: 'dark',
  isDark: true,
  colors: darkColors,
  shadows: darkShadows,
  navTheme: darkNavTheme,
  statusBarStyle: 'light',
};

export const themes: Record<ThemeMode, AppTheme> = {
  light: lightTheme,
  dark: darkTheme,
};
