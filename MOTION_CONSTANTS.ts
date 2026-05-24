/**
 * MOTION CONSTANTS — Global Motion System
 * Single source of truth for all animations
 *
 * Philosophy: Soft anticipation, premium, intentional, restrained
 * NOT: flashy, gaming vibes, distracting, everywhere
 */

// ──────────────────────────────────────────────────────────────────────────────
// TIMING SCALE
// ──────────────────────────────────────────────────────────────────────────────

export const MOTION_TIMING = {
  // Quick reactions (button press, micro-interactions)
  quick: 120,

  // Standard transitions (fade, slide, scale)
  standard: 250,

  // Emotional moments (reveals, celebrations)
  emotional: 400,

  // Cinematic moments (hidden reveals — the heart)
  cinematic: 600,

  // Slow, elegant moments
  slow: 800,

  // Looping/ambient
  loop: {
    bobbing: 2000,
    pulsing: 2500,
    breathing: 3000,
  },
} as const;

// ──────────────────────────────────────────────────────────────────────────────
// EASING LIBRARY
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Easing curves for different emotional contexts
 * All use cubic-bezier format
 */
export const MOTION_EASING = {
  // Snappy, responsive (button releases, quick toggles)
  quick: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)', // ease-out

  // Smooth, natural (standard fades, scales)
  smooth: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)', // ease-out

  // Soft entry, quick exit (entrances that feel premium)
  softOut: 'cubic-bezier(0.33, 0.66, 0.66, 1)',

  // Soft enter, soft exit (gentle transitions)
  softBoth: 'cubic-bezier(0.42, 0, 0.58, 1)', // ease-in-out

  // Cinematic reveal (blur clearing, content rising)
  cinematic: 'cubic-bezier(0.25, 0.1, 0.25, 1)', // slow start, quick end

  // Bounce back (reject state, error shake)
  bounce: 'cubic-bezier(0.34, 1.56, 0.64, 1)',

  // Elastic spring-like (celebratory moments)
  spring: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
} as const;

// ──────────────────────────────────────────────────────────────────────────────
// SPRING CONFIGURATIONS
// ──────────────────────────────────────────────────────────────────────────────

/**
 * React Native Animated.spring({ config })
 * All configured for useNativeDriver: true
 */
export const MOTION_SPRING = {
  // Snappy, immediate feel (menu items, quick reveals)
  snappy: {
    damping: 18,
    mass: 1,
    stiffness: 250,
    overshootClamping: false,
    restSpeedThreshold: 2,
    restDisplacementThreshold: 2,
  },

  // Standard spring (FAB menu, modal entry, most transitions)
  standard: {
    damping: 14,
    mass: 1,
    stiffness: 200,
    overshootClamping: false,
    restSpeedThreshold: 2,
    restDisplacementThreshold: 2,
  },

  // Smooth, elegant spring (cinematic reveals, premium moments)
  smooth: {
    damping: 12,
    mass: 1,
    stiffness: 180,
    overshootClamping: false,
    restSpeedThreshold: 1,
    restDisplacementThreshold: 1,
  },

  // Slow, graceful spring (full-screen transitions, important modals)
  graceful: {
    damping: 11,
    mass: 1.2,
    stiffness: 160,
    overshootClamping: false,
    restSpeedThreshold: 1,
    restDisplacementThreshold: 1,
  },

  // Bouncy for celebratory moments (not overused)
  celebratory: {
    damping: 9,
    mass: 1,
    stiffness: 210,
    overshootClamping: false,
    restSpeedThreshold: 2,
    restDisplacementThreshold: 2,
  },
} as const;

// ──────────────────────────────────────────────────────────────────────────────
// SCALE HIERARCHY
// ──────────────────────────────────────────────────────────────────────────────

/**
 * How much elements scale for different interaction types
 */
export const MOTION_SCALE = {
  // Micro press feedback (button tap)
  pressSmall: { from: 1, to: 0.95 },

  // Medium press feedback (card tap)
  pressMedium: { from: 1, to: 0.92 },

  // Entrance scale (cards fading in)
  entranceSmall: { from: 0.95, to: 1 },
  entranceMedium: { from: 0.9, to: 1 },

  // Success celebration scale
  celebrate: { from: 1, to: 1.05 },

  // Emphasis scale (highlight something)
  emphasis: { from: 1, to: 1.02 },

  // Modal/sheet entrance
  modalEntrance: { from: 0.8, to: 1 },
  sheetEntrance: { from: 0.95, to: 1 },

  // Dismiss/exit scale
  dismiss: { from: 1, to: 0.85 },
} as const;

// ──────────────────────────────────────────────────────────────────────────────
// OPACITY HIERARCHY
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Opacity levels for different states and moments
 */
export const MOTION_OPACITY = {
  // Press/active state
  active: 0.88,

  // Pressed state
  pressed: 0.75,

  // Disabled state
  disabled: 0.5,

  // Secondary/muted
  secondary: 0.65,

  // Backdrop/overlay
  backdrop: 0.28,
  backdropDark: 0.5,

  // Transition endpoints
  hidden: 0,
  visible: 1,

  // Subtle presence
  ghost: 0.3,
  faint: 0.15,
} as const;

// ──────────────────────────────────────────────────────────────────────────────
// TRANSLATE DISTANCES
// ──────────────────────────────────────────────────────────────────────────────

/**
 * How far elements move (in pixels)
 */
export const MOTION_TRANSLATE = {
  // Micro slide (subtle entrance)
  microX: 4,
  microY: 4,

  // Small slide (card entrance)
  smallX: 8,
  smallY: 8,

  // Standard slide (activity list, larger items)
  standardX: 12,
  standardY: 12,

  // Modal slide (sheet coming from bottom)
  sheetX: 0,
  sheetY: 64,

  // Large slide (full screen transitions)
  largeX: 32,
  largeY: 32,

  // Reveal content rise (hidden SideQuest reveal)
  revealRise: 4,
} as const;

// ──────────────────────────────────────────────────────────────────────────────
// HAPTIC FEEDBACK LEVELS
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Haptic feedback pairs with motion for premium feel
 * Maps to react-native-haptic-feedback (or similar)
 */
export const MOTION_HAPTIC = {
  // Light tap (micro interactions, focus)
  light: 'impactOccurred',
  lightOptions: { style: 'Light' },

  // Medium thud (button press, small actions)
  medium: 'impactOccurred',
  mediumOptions: { style: 'Medium' },

  // Heavy feedback (success, accept invite, important action)
  heavy: 'impactOccurred',
  heavyOptions: { style: 'Heavy' },

  // Selection feedback (iOS picker-like)
  selection: 'selection',

  // Success pattern (revelation moment)
  success: 'notificationOccurred',
  successOptions: { type: 'Success' },

  // Warning/error pattern
  warning: 'notificationOccurred',
  warningOptions: { type: 'Warning' },

  // Error/rejection pattern (invalid code, etc)
  error: 'notificationOccurred',
  errorOptions: { type: 'Error' },
} as const;

// ──────────────────────────────────────────────────────────────────────────────
// STAGGER PATTERN (For revealing multiple items)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * How to time reveals of multiple items for "organized" feeling
 */
export const MOTION_STAGGER = {
  // Quick successive reveals (activity lists)
  tight: 50,

  // Standard stagger (form fields)
  standard: 75,

  // Generous stagger (cinematic reveals)
  generous: 100,

  // Very slow cascade (special moments)
  slow: 150,
} as const;

// ──────────────────────────────────────────────────────────────────────────────
// MOTION PATTERNS (Composed Animations)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Common animation combinations that work well together
 * Use these as templates for consistency
 */
export const MOTION_PATTERNS = {
  // Button press feedback
  buttonPress: {
    duration: MOTION_TIMING.quick,
    scaleFrom: 1,
    scaleTo: 0.95,
    easing: MOTION_EASING.quick,
    haptic: MOTION_HAPTIC.medium,
  },

  // Card entrance (fade + scale)
  cardEntrance: {
    duration: MOTION_TIMING.standard,
    opacityFrom: 0,
    opacityTo: 1,
    scaleFrom: 0.95,
    scaleTo: 1,
    easing: MOTION_EASING.softOut,
  },

  // Activity list item entrance (translate + fade)
  listItemEntrance: {
    duration: MOTION_TIMING.standard,
    opacityFrom: 0,
    opacityTo: 1,
    translateFrom: MOTION_TRANSLATE.smallX,
    translateTo: 0,
    easing: MOTION_EASING.smooth,
  },

  // Modal entry (spring from bottom)
  modalEntry: {
    duration: MOTION_TIMING.emotional,
    backdropOpacity: MOTION_OPACITY.backdrop,
    sheetTranslate: MOTION_TRANSLATE.sheetY,
    spring: MOTION_SPRING.standard,
  },

  // Success celebration (scale up + celebrate)
  successCelebration: {
    duration: MOTION_TIMING.emotional,
    scaleFrom: 1,
    scaleTo: 1.05,
    easing: MOTION_EASING.spring,
    haptic: MOTION_HAPTIC.success,
  },

  // Error shake (left-right rejection)
  errorShake: {
    duration: MOTION_TIMING.standard,
    amplitude: 6,
    frequency: 4, // shakes per second
    haptic: MOTION_HAPTIC.error,
  },

  // Hidden reveal (THE MOMENT)
  revealUnlock: {
    duration: MOTION_TIMING.cinematic,
    blurClear: { from: 8, to: 0 }, // dp units
    contentRise: MOTION_TRANSLATE.revealRise,
    opacityFrom: 0,
    opacityTo: 1,
    easing: MOTION_EASING.cinematic,
    glowDuration: 600,
    hapticSequence: [
      MOTION_HAPTIC.lightOptions, // initial tap
      { delay: 200, haptic: MOTION_HAPTIC.mediumOptions }, // midway
      { delay: 400, haptic: MOTION_HAPTIC.successOptions }, // success
    ],
  },

  // Loading state (elegant, not anxious)
  loadingState: {
    spinnerDuration: 2000,
    spinnerRotation: 360,
    fadeText: true,
    fadeTextDuration: MOTION_TIMING.standard,
  },
} as const;

// ──────────────────────────────────────────────────────────────────────────────
// MOTION PERFORMANCE BUDGETS
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Guidelines for performance-conscious animations
 */
export const MOTION_PERFORMANCE = {
  // Only animate these properties for 60fps
  nativeProperties: [
    'transform', // translateX, translateY, scale, rotate
    'opacity',   // color changes go through opacity cross-fade
  ],

  // Avoid animating these (can cause jank)
  avoidAnimating: [
    'width',     // can trigger layout
    'height',    // can trigger layout
    'padding',   // can trigger layout
    'margin',    // can trigger layout
    'borderRadius', // some platforms drop frames
    'fontSize',  // can trigger layout
  ],

  // Max simultaneous animations per screen
  maxConcurrentAnimations: 5,

  // Never animate more than this many list items at once
  maxListItemAnimations: 3,

  // Use InteractionManager.runAfterInteractions() for:
  maxHeavyAnimationDuration: 300,
} as const;

// ──────────────────────────────────────────────────────────────────────────────
// LOADING STATE PHILOSOPHY
// ──────────────────────────────────────────────────────────────────────────────

/**
 * How to show loading without anxiety
 */
export const MOTION_LOADING = {
  // Skeleton screens (preferred — show shape of content)
  skeleton: {
    animationDuration: MOTION_TIMING.loop.breathing,
    opacityFrom: 0.5,
    opacityTo: 0.7,
  },

  // Elegant spinner (if no skeleton possible)
  spinner: {
    size: 28,
    duration: MOTION_TIMING.loop.bobbing,
    color: 'primary',
    strokeWidth: 2.5,
    overshootClamping: true,
  },

  // Show cached data while fetching (best experience)
  cachedWithRefresh: {
    cachedFadeIn: MOTION_TIMING.standard,
    refreshFadeOut: MOTION_TIMING.standard,
    noLoadingIndicator: true,
  },
} as const;

// ──────────────────────────────────────────────────────────────────────────────
// ERROR STATE ANIMATION
// ──────────────────────────────────────────────────────────────────────────────

/**
 * How errors should feel (rejected, not broken)
 */
export const MOTION_ERROR = {
  // Invalid input shake
  shake: {
    duration: MOTION_TIMING.standard,
    amplitude: 6,
    direction: 'horizontal',
    frequency: 3,
    haptic: MOTION_HAPTIC.error,
  },

  // Error message appear
  messageFade: {
    duration: MOTION_TIMING.standard,
    opacityFrom: 0,
    opacityTo: 1,
    color: 'error',
  },

  // Error icon pulse
  iconPulse: {
    duration: MOTION_TIMING.emotional,
    scaleFrom: 1,
    scaleTo: 1.1,
    repeat: 2,
  },
} as const;

// ──────────────────────────────────────────────────────────────────────────────
// EMPTY STATE ANIMATION
// ──────────────────────────────────────────────────────────────────────────────

/**
 * How empty states should feel (inviting, not sad)
 */
export const MOTION_EMPTY = {
  // Icon gentle bob (soft up-down motion)
  iconBob: {
    duration: MOTION_TIMING.loop.bobbing,
    distance: 4,
    easing: MOTION_EASING.softBoth,
    loop: true,
  },

  // Container fade in
  containerFade: {
    duration: MOTION_TIMING.emotional,
    opacityFrom: 0,
    opacityTo: 1,
  },

  // Text elements stagger in
  textStagger: {
    duration: MOTION_TIMING.standard,
    gap: MOTION_STAGGER.standard,
  },
} as const;

// ──────────────────────────────────────────────────────────────────────────────
// SUCCESS STATE ANIMATION
// ──────────────────────────────────────────────────────────────────────────────

/**
 * How success should feel (rewarding, celebratory but restrained)
 */
export const MOTION_SUCCESS = {
  // Checkmark reveal
  checkmark: {
    duration: MOTION_TIMING.emotional,
    scaleFrom: 0,
    scaleTo: 1,
    easing: MOTION_EASING.spring,
    haptic: MOTION_HAPTIC.success,
  },

  // Message appear
  messageFade: {
    duration: MOTION_TIMING.standard,
    opacityFrom: 0,
    opacityTo: 1,
    color: 'success',
  },

  // Background color shift (optional glow)
  backgroundGlow: {
    duration: MOTION_TIMING.emotional,
    colorFrom: 'transparent',
    colorTo: 'successLight',
    colorEnd: 'transparent',
  },

  // Haptic pattern
  hapticPattern: [
    MOTION_HAPTIC.lightOptions,
    { delay: 100, haptic: MOTION_HAPTIC.mediumOptions },
    { delay: 100, haptic: MOTION_HAPTIC.successOptions },
  ],
} as const;

// ──────────────────────────────────────────────────────────────────────────────
// NAVIGATION TRANSITION
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Screen-to-screen transitions (kept subtle to avoid distraction)
 */
export const MOTION_NAVIGATION = {
  // Standard push (slide right → left)
  push: {
    duration: MOTION_TIMING.standard,
    translateFrom: { x: 64 },
    translateTo: { x: 0 },
    easing: MOTION_EASING.smooth,
  },

  // Standard pop (slide left → right)
  pop: {
    duration: MOTION_TIMING.standard,
    translateFrom: { x: 0 },
    translateTo: { x: -64 },
    easing: MOTION_EASING.smooth,
  },

  // Tab switch (fade only, no slide)
  tabSwitch: {
    duration: MOTION_TIMING.quick,
    opacityFrom: 1,
    opacityTo: 0,
    easing: MOTION_EASING.quick,
  },
} as const;

// ──────────────────────────────────────────────────────────────────────────────
// EXPORT HELPERS
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Helper to get a timing value by name
 */
export function getTiming(
  name: keyof typeof MOTION_TIMING | keyof typeof MOTION_TIMING.loop
): number {
  if (name in MOTION_TIMING.loop) {
    return MOTION_TIMING.loop[name as keyof typeof MOTION_TIMING.loop];
  }
  return MOTION_TIMING[name as keyof typeof MOTION_TIMING];
}

/**
 * Helper to compose multiple motion values
 */
export function composeMotion(
  basePattern: (typeof MOTION_PATTERNS)[keyof typeof MOTION_PATTERNS],
  overrides: Record<string, any> = {}
) {
  return { ...basePattern, ...overrides };
}

export default {
  MOTION_TIMING,
  MOTION_EASING,
  MOTION_SPRING,
  MOTION_SCALE,
  MOTION_OPACITY,
  MOTION_TRANSLATE,
  MOTION_HAPTIC,
  MOTION_STAGGER,
  MOTION_PATTERNS,
  MOTION_PERFORMANCE,
  MOTION_LOADING,
  MOTION_ERROR,
  MOTION_EMPTY,
  MOTION_SUCCESS,
  MOTION_NAVIGATION,
};
