/**
 * DESIGN TOKENS — Single source of truth for all visual design
 * Reference: DESIGN_SYSTEM.md
 * DO NOT hardcode values elsewhere. Import from this file.
 */

// ──────────────────────────────────────────────────────────────────────────────
// SPACING SYSTEM
// ──────────────────────────────────────────────────────────────────────────────

export const SPACING = {
  xs: 4,      // Minimal gap (tight icon+text)
  sm: 8,      // Small gap (icon button + label)
  md: 12,     // Medium gap (list items, card sections)
  lg: 16,     // Large gap (section spacing, form fields)
  xl: 22,     // Extra large (horizontal page padding STANDARD)
  xxl: 32,    // Double large (major sections)
  xxxl: 44,   // Triple large (section header to content)
} as const;

// ──────────────────────────────────────────────────────────────────────────────
// TYPOGRAPHY SCALE
// ──────────────────────────────────────────────────────────────────────────────

export const TYPOGRAPHY = {
  // Page-level heading (Calendar, Profile pages)
  pageHeading: {
    fontSize: 24,
    fontWeight: '900' as const,
    lineHeight: 28,
    letterSpacing: -0.8,
  },
  // Card title / Activity title
  cardTitle: {
    fontSize: 15,
    fontWeight: '700' as const,
    lineHeight: 18,
    letterSpacing: -0.3,
  },
  // Section header (ACTIVITY, UP NEXT, INVITED)
  sectionHeader: {
    fontSize: 11,
    fontWeight: '800' as const,
    lineHeight: 13,
    letterSpacing: 1.4,
  },
  // Body text (descriptions, activity text)
  body: {
    fontSize: 13,
    fontWeight: '500' as const,
    lineHeight: 18,
    letterSpacing: -0.2,
  },
  // Meta/secondary text (timestamps, "by Name", hints)
  meta: {
    fontSize: 12,
    fontWeight: '600' as const,
    lineHeight: 16,
    letterSpacing: 0.2,
  },
  // Label/eyebrow (form labels, section eyebrows)
  label: {
    fontSize: 13,
    fontWeight: '700' as const,
    lineHeight: 16,
  },
  // Eyebrow in all caps (INVITE CODE, MEMBERS HEADING)
  eyebrow: {
    fontSize: 11,
    fontWeight: '800' as const,
    lineHeight: 13,
    letterSpacing: 1.4,
  },
  // Button text (primary, secondary)
  buttonLarge: {
    fontSize: 15,
    fontWeight: '800' as const,
    lineHeight: 18,
    letterSpacing: -0.2,
  },
  // Small button text
  buttonSmall: {
    fontSize: 13,
    fontWeight: '800' as const,
    lineHeight: 16,
  },
  // Modal title
  modalTitle: {
    fontSize: 22,
    fontWeight: '900' as const,
    lineHeight: 26,
    letterSpacing: -0.7,
  },
} as const;

// ──────────────────────────────────────────────────────────────────────────────
// COLOR SYSTEM
// ──────────────────────────────────────────────────────────────────────────────

export const COLORS = {
  // Primary brand color (buttons, accents, interactive)
  primary: '#ff4f74',
  // Secondary brand color (trip planning, dates, alternative accent)
  secondary: '#0d90a8',

  // Primary color variants (backgrounds, light fills)
  primaryLight08: 'rgba(255,79,116,0.08)',
  primaryLight12: 'rgba(255,79,116,0.12)',
  primaryLight20: 'rgba(255,79,116,0.2)',

  // Neutral background & text colors
  white: '#fff',
  textPrimary: '#161821',       // Dark text (headers, primary copy)
  textSecondary: '#6f7683',     // Medium gray (secondary info)
  textMeta: '#8a909e',          // Light gray (timestamps, meta)
  textMuted: '#bbc0c8',         // Very light gray (disabled, hints)

  // Background colors
  bgPrimary: '#fff',            // Main page background
  bgLight: '#f4f4f5',           // Input backgrounds, secondary fills
  bgLightest: '#f8f9fc',        // Input field background

  // Border & divider colors
  borderPrimary: '#e3e5e9',     // Standard divider
  borderInput: '#e2e5ee',       // Input border

  // Input placeholder
  placeholderText: '#bbc0c8',   // Placeholder text color

  // Semantic colors
  success: '#3ddc8c',           // Activity dot, success state, LIVE indicator
  successLight: '#e9f8f1',      // Success message background
  successBorder: '#bfe9d2',     // Success message border
  error: '#d53d18',             // Error messages
  errorLight: '#ffefeb',        // Error message background
  errorBorder: '#ffd0c3',       // Error message border
  warning: '#f59e0b',           // Reserved for future warnings

  // Modal & overlay backdrops
  backdropModal: 'rgba(10,12,18,0.28)',
  backdropFab: 'rgba(17,18,23,0.08)',

  // Semi-transparent blacks for gradients
  gradientDark55: 'rgba(0,0,0,0.55)',
  gradientDark28: 'rgba(0,0,0,0.28)',
  gradientDark12: 'rgba(0,0,0,0.12)',

  // Semi-transparent blacks for pills/overlays
  pillDark70: 'rgba(20,22,29,0.7)',
  pillDark42: 'rgba(0,0,0,0.42)',

  // Avatar backgrounds
  avatarDark: '#1d212a',
  avatarLight: '#fff1f5',
} as const;

// ──────────────────────────────────────────────────────────────────────────────
// BORDER RADIUS SYSTEM
// ──────────────────────────────────────────────────────────────────────────────

export const RADIUS = {
  xs: 14,      // Small (badge buttons, compact icons)
  sm: 16,      // Medium cards (activity cards, inputs)
  md: 20,      // Larger cards (invite cards, form sections)
  lg: 28,      // Large modals (join modal)
  xl: 32,      // Extra large (BigHeroCard, bottom sheets)
  circle: 999, // Fully circular (all avatars, icon buttons)
} as const;

// ──────────────────────────────────────────────────────────────────────────────
// AVATAR SIZING SYSTEM
// ──────────────────────────────────────────────────────────────────────────────

export const AVATAR_SIZES = {
  xs: 28,    // Small list avatars
  sm: 32,    // BigHeroCard stack, small contexts
  md: 36,    // Activity feed
  lg: 42,    // Members list
  xl: 48,    // Profile page secondary
  xxl: 56,   // Profile page primary, large contexts
} as const;

// ──────────────────────────────────────────────────────────────────────────────
// SHADOW & ELEVATION SYSTEM
// ──────────────────────────────────────────────────────────────────────────────

export const SHADOWS = {
  // Subtle elevation (1-2) — activity rows, up next cards, small cards
  subtle: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  // Medium elevation (5) — cards, form sections, larger elements
  medium: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.06,
    shadowRadius: 22,
    elevation: 5,
  },
  // Strong elevation (10) — BigHeroCard, FAB, prominent cards
  strong: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 10,
  },
  // Floating elevation (14) — Modals, sheets, FAB menu, maximum prominence
  floating: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.16,
    shadowRadius: 28,
    elevation: 14,
  },
} as const;

// ──────────────────────────────────────────────────────────────────────────────
// ANIMATION TIMING
// ──────────────────────────────────────────────────────────────────────────────

export const TIMING = {
  quick: 120,      // Quick feedback (opacity, small changes)
  standard: 180,   // Standard transition (slides, modals)
  slow: 300,       // Slow transition (progress bars, reveals)
  verySlow: 320,   // Very slow (step changes, progressive reveals)
} as const;

// ──────────────────────────────────────────────────────────────────────────────
// BUTTON SIZING
// ──────────────────────────────────────────────────────────────────────────────

export const BUTTON_SIZES = {
  sm: {
    height: 34,
    paddingHorizontal: 16,
    borderRadius: RADIUS.xs,
  },
  md: {
    height: 52,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.sm,
  },
  lg: {
    height: 60,
    paddingHorizontal: SPACING.xl,
    borderRadius: RADIUS.sm,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.circle,
  },
  iconLarge: {
    width: 68,
    height: 68,
    borderRadius: RADIUS.circle,
  },
} as const;

// ──────────────────────────────────────────────────────────────────────────────
// INPUT SIZING
// ──────────────────────────────────────────────────────────────────────────────

export const INPUT = {
  height: 54,
  borderRadius: RADIUS.sm,
  borderWidth: 1.5,
  paddingHorizontal: SPACING.lg,
  minHeight: 100, // For multiline
} as const;

// ──────────────────────────────────────────────────────────────────────────────
// CARD PADDING VARIANTS
// ──────────────────────────────────────────────────────────────────────────────

export const CARD_PADDING = {
  compact: SPACING.md,      // 12px (activity rows)
  standard: SPACING.lg,     // 16px (most cards)
  large: SPACING.xl,        // 22px (form sections)
} as const;

// ──────────────────────────────────────────────────────────────────────────────
// MODAL/SHEET SIZING
// ──────────────────────────────────────────────────────────────────────────────

export const MODAL = {
  padding: SPACING.xl,                  // 22px standard padding
  maxHeightPercent: 0.82,               // 82% of screen
  headerSpacing: SPACING.xxxl,          // 44px for top spacing
  closeButtonSize: 38,
  borderRadius: RADIUS.xl,              // 32px for top corners
} as const;

// ──────────────────────────────────────────────────────────────────────────────
// EMPTY STATE SIZING
// ──────────────────────────────────────────────────────────────────────────────

export const EMPTY_STATE = {
  iconSize: 46,
  iconContainerSize: 112,
  titleSize: TYPOGRAPHY.pageHeading.fontSize,
  descriptionSize: TYPOGRAPHY.body.fontSize,
  spacing: SPACING.lg,
  containerVerticalPadding: SPACING.xxxl,
} as const;

// ──────────────────────────────────────────────────────────────────────────────
// TOUCH TARGET / ACCESSIBILITY
// ──────────────────────────────────────────────────────────────────────────────

export const TOUCH_TARGET = {
  minimum: 44, // Minimum touch target size (WCAG AA)
} as const;

// ──────────────────────────────────────────────────────────────────────────────
// OPACITIES / STATES
// ──────────────────────────────────────────────────────────────────────────────

export const OPACITIES = {
  disabled: 0.5,           // Disabled state
  pressed: 0.7,            // Pressed/active state for some components
  activeButton: 0.88,      // Active opacity for buttons
} as const;

// ──────────────────────────────────────────────────────────────────────────────
// ICON SIZING SYSTEM
// ──────────────────────────────────────────────────────────────────────────────

export const ICON_SIZES = {
  xs: 11,     // Smallest (in labels)
  sm: 12,     // Small (in badges)
  md: 14,     // Medium (in text)
  lg: 16,     // Large (standard)
  xl: 18,     // Extra large (button icons)
  xxl: 20,    // Double large (header icons)
  xxxl: 22,   // Triple large (large badges)
  huge: 28,   // Huge (empty states)
  massive: 46, // Massive (empty state primary icon)
} as const;

// ──────────────────────────────────────────────────────────────────────────────
// PRESET STYLE OBJECTS (For common patterns)
// ──────────────────────────────────────────────────────────────────────────────

export const PRESET_STYLES = {
  // Hairline divider (use with borderWidth: StyleSheet.hairlineWidth)
  hairlineDivider: {
    borderColor: COLORS.borderPrimary,
  },
  // Standard divider line
  divider: {
    height: 1,
    backgroundColor: COLORS.borderPrimary,
  },
  // FAB shadow (colored glow effect)
  fabShadow: {
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.26,
    shadowRadius: 22,
    elevation: 8,
  },
} as const;

export default {
  SPACING,
  TYPOGRAPHY,
  COLORS,
  RADIUS,
  AVATAR_SIZES,
  SHADOWS,
  TIMING,
  BUTTON_SIZES,
  INPUT,
  CARD_PADDING,
  MODAL,
  EMPTY_STATE,
  TOUCH_TARGET,
  OPACITIES,
  ICON_SIZES,
  PRESET_STYLES,
} as const;
