/**
 * MOTION HOOKS — Reusable Animation Logic
 *
 * Drop-in hooks for common animation patterns
 * Each hook handles animation setup, cleanup, and haptic feedback
 *
 * Philosophy: Write once, use everywhere for consistent motion
 */

import { useRef, useCallback, useEffect } from 'react';
import { Animated } from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  MOTION_TIMING,
  MOTION_SPRING,
  MOTION_SCALE,
  MOTION_OPACITY,
  MOTION_TRANSLATE,
  MOTION_STAGGER,
} from '../MOTION_CONSTANTS';

// ──────────────────────────────────────────────────────────────────────────────
// CORE HOOK: useRevealAnimation (HIGHEST PRIORITY — Hidden SideQuest Reveal)
// ──────────────────────────────────────────────────────────────────────────────

interface RevealAnimationConfig {
  onComplete?: () => void;
  triggerHaptics?: boolean;
}

export function useRevealAnimation(config: RevealAnimationConfig = {}) {
  const { onComplete, triggerHaptics = true } = config;

  // Blur effect animation (backdrop clarity)
  const blurValue = useRef(new Animated.Value(8)).current;

  // Content rise animation (content comes from -4px)
  const contentTranslateY = useRef(new Animated.Value(4)).current;

  // Content opacity (fade in)
  const contentOpacity = useRef(new Animated.Value(0)).current;

  // Glow effect (subtle brightness increase)
  const glowOpacity = useRef(new Animated.Value(0)).current;

  const startReveal = useCallback(() => {
    if (triggerHaptics) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    Animated.sequence([
      Animated.delay(100),

      // Main reveal animation (runs in parallel)
      Animated.parallel([
        // Clear the blur (8dp → 0dp)
        Animated.timing(blurValue, {
          toValue: 0,
          duration: MOTION_TIMING.cinematic,
          useNativeDriver: false, // blur can't use native driver
        }),

        // Rise content up (4px → 0px)
        Animated.timing(contentTranslateY, {
          toValue: 0,
          duration: MOTION_TIMING.cinematic,
          useNativeDriver: true,
        }),

        // Fade in content
        Animated.timing(contentOpacity, {
          toValue: 1,
          duration: MOTION_TIMING.cinematic,
          useNativeDriver: true,
        }),

        // Glow effect
        Animated.timing(glowOpacity, {
          toValue: 1,
          duration: MOTION_TIMING.cinematic,
          useNativeDriver: true,
        }),
      ]),

      // Haptic at midway (感じる moment)
      Animated.delay(MOTION_TIMING.cinematic / 2),

      // Glow fade out (post-reveal)
      Animated.timing(glowOpacity, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start(() => {
      if (triggerHaptics) {
        // Success completion haptic
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      onComplete?.();
    });
  }, [blurValue, contentTranslateY, contentOpacity, glowOpacity, onComplete, triggerHaptics]);

  return {
    blurValue,
    contentTranslateY,
    contentOpacity,
    glowOpacity,
    startReveal,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// HOOK: useScalePress (Button/Card Press Feedback)
// ──────────────────────────────────────────────────────────────────────────────

interface ScalePressConfig {
  scale?: number;
  triggerHaptics?: boolean;
  onPress?: () => void;
}

export function useScalePress(config: ScalePressConfig = {}) {
  const {
    scale = MOTION_SCALE.pressMedium.to,
    triggerHaptics = true,
    onPress,
  } = config;

  const scaleValue = useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback(() => {
    if (triggerHaptics) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    Animated.timing(scaleValue, {
      toValue: scale,
      duration: MOTION_TIMING.quick,
      useNativeDriver: true,
    }).start();
  }, [scaleValue, scale, triggerHaptics]);

  const handlePressOut = useCallback(() => {
    Animated.timing(scaleValue, {
      toValue: 1,
      duration: MOTION_TIMING.quick,
      useNativeDriver: true,
    }).start(onPress);
  }, [scaleValue, onPress]);

  return {
    scaleValue,
    handlePressIn,
    handlePressOut,
    animatedStyle: {
      transform: [{ scale: scaleValue }],
    },
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// HOOK: useFadeIn (Card/Element Entrance)
// ──────────────────────────────────────────────────────────────────────────────

interface FadeInConfig {
  duration?: number;
  delay?: number;
  autoStart?: boolean;
  onComplete?: () => void;
}

export function useFadeIn(config: FadeInConfig = {}) {
  const {
    duration = MOTION_TIMING.standard,
    delay = 0,
    autoStart = true,
    onComplete,
  } = config;

  const opacityValue = useRef(new Animated.Value(0)).current;
  const scaleValue = useRef(new Animated.Value(0.95)).current;

  const start = useCallback(() => {
    Animated.parallel([
      Animated.timing(opacityValue, {
        toValue: 1,
        duration,
        delay,
        useNativeDriver: true,
      }),

      Animated.timing(scaleValue, {
        toValue: 1,
        duration,
        delay,
        useNativeDriver: true,
      }),
    ]).start(onComplete);
  }, [opacityValue, scaleValue, duration, delay, onComplete]);

  useEffect(() => {
    if (autoStart) {
      start();
    }
  }, [autoStart, start]);

  return {
    opacityValue,
    scaleValue,
    start,
    animatedStyle: {
      opacity: opacityValue,
      transform: [{ scale: scaleValue }],
    },
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// HOOK: useListItemStagger (Activity List Entrance)
// ──────────────────────────────────────────────────────────────────────────────

interface ListItemStaggerConfig {
  itemCount: number;
  gap?: number;
  duration?: number;
  autoStart?: boolean;
  initialValue?: number;
}

export function useListItemStagger(config: ListItemStaggerConfig) {
  const {
    itemCount,
    gap = MOTION_STAGGER.standard,
    duration = MOTION_TIMING.standard,
    autoStart = true,
    initialValue = 0,
  } = config;

  const animatedValues = useRef(
    Array.from({ length: itemCount }, () => new Animated.Value(initialValue))
  ).current;

  const start = useCallback(() => {
    const animations = animatedValues.map((value, index) =>
      Animated.timing(value, {
        toValue: 1,
        duration,
        delay: index * gap,
        useNativeDriver: true,
      })
    );

    Animated.stagger(gap, animations).start();
  }, [animatedValues, duration, gap]);

  useEffect(() => {
    if (autoStart) {
      start();
    }
  }, [autoStart, start]);

  const getAnimatedStyle = useCallback((index: number) => ({
    opacity: animatedValues[index],
    transform: [
      {
        translateX: animatedValues[index].interpolate({
          inputRange: [0, 1],
          outputRange: [MOTION_TRANSLATE.smallX, 0],
        }),
      },
    ],
  }), [animatedValues]);

  return { start, getAnimatedStyle, animatedValues };
}

// ──────────────────────────────────────────────────────────────────────────────
// HOOK: useBob (Idle Motion for Empty States)
// ──────────────────────────────────────────────────────────────────────────────

interface BobConfig {
  distance?: number;
  duration?: number;
  autoStart?: boolean;
}

export function useBob(config: BobConfig = {}) {
  const {
    distance = 4,
    duration = MOTION_TIMING.loop.bobbing,
    autoStart = true,
  } = config;

  const translateY = useRef(new Animated.Value(0)).current;

  const start = useCallback(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(translateY, {
          toValue: distance,
          duration: duration / 2,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: duration / 2,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [translateY, distance, duration]);

  useEffect(() => {
    if (autoStart) {
      start();
    }
  }, [autoStart, start]);

  return {
    translateY,
    start,
    animatedStyle: {
      transform: [{ translateY }],
    },
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// HOOK: useShake (Error Feedback)
// ──────────────────────────────────────────────────────────────────────────────

interface ShakeConfig {
  amplitude?: number;
  frequency?: number;
  duration?: number;
  triggerHaptics?: boolean;
}

export function useShake(config: ShakeConfig = {}) {
  const {
    amplitude = 6,
    frequency = 4,
    duration = MOTION_TIMING.standard,
    triggerHaptics = true,
  } = config;

  const translateX = useRef(new Animated.Value(0)).current;

  const shake = useCallback(() => {
    if (triggerHaptics) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }

    const shakeCount = Math.ceil((duration / 1000) * frequency);
    const animations: Animated.CompositeAnimation[] = [];

    for (let i = 0; i < shakeCount; i++) {
      const direction = i % 2 === 0 ? amplitude : -amplitude;

      animations.push(
        Animated.timing(translateX, {
          toValue: direction,
          duration: duration / shakeCount,
          useNativeDriver: true,
        })
      );
    }

    animations.push(
      Animated.timing(translateX, {
        toValue: 0,
        duration: duration / shakeCount,
        useNativeDriver: true,
      })
    );

    Animated.sequence(animations).start();
  }, [translateX, amplitude, frequency, duration, triggerHaptics]);

  return {
    translateX,
    shake,
    animatedStyle: {
      transform: [{ translateX }],
    },
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// HOOK: useModalSpring (Sheet/Modal Entry)
// ──────────────────────────────────────────────────────────────────────────────

interface ModalSpringConfig {
  autoStart?: boolean;
  onComplete?: () => void;
  triggerHaptics?: boolean;
  /** Starting offset (px) the sheet slides up from. Defaults to a small pop-in;
   *  pass the sheet's own height for a full slide-up from off-screen. */
  initialTranslateY?: number;
  /** Spring preset for the entry motion. Defaults to MOTION_SPRING.standard;
   *  pass e.g. MOTION_SPRING.graceful for a slower, weightier glide.
   *  Structural type (not `typeof MOTION_SPRING.standard`) because the
   *  as-const presets are distinct literal types. */
  entrySpring?: {
    damping: number;
    mass: number;
    stiffness: number;
    overshootClamping: boolean;
    restSpeedThreshold: number;
    restDisplacementThreshold: number;
  };
}

export function useModalSpring(config: ModalSpringConfig = {}) {
  const {
    autoStart = true,
    onComplete,
    triggerHaptics = true,
    initialTranslateY = 100,
    entrySpring = MOTION_SPRING.standard,
  } = config;

  const translateY = useRef(new Animated.Value(initialTranslateY)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const scaleValue = useRef(new Animated.Value(0.8)).current;

  const start = useCallback(() => {
    if (triggerHaptics) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        ...entrySpring,
        useNativeDriver: true,
      }),

      Animated.timing(backdropOpacity, {
        toValue: MOTION_OPACITY.backdrop,
        duration: MOTION_TIMING.emotional,
        useNativeDriver: true,
      }),

      Animated.spring(scaleValue, {
        toValue: 1,
        ...entrySpring,
        useNativeDriver: true,
      }),
    ]).start(onComplete);
  }, [translateY, backdropOpacity, scaleValue, onComplete, triggerHaptics, entrySpring]);

  useEffect(() => {
    if (autoStart) {
      start();
    }
  }, [autoStart, start]);

  return {
    translateY,
    backdropOpacity,
    scaleValue,
    start,
    animatedSheetStyle: {
      transform: [{ translateY }],
    },
    animatedBackdropStyle: {
      opacity: backdropOpacity,
    },
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// HOOK: useSuccessCelebration (Confirmation Celebration)
// ──────────────────────────────────────────────────────────────────────────────

interface SuccessConfig {
  autoStart?: boolean;
  onComplete?: () => void;
  triggerHaptics?: boolean;
}

export function useSuccessCelebration(config: SuccessConfig = {}) {
  const { autoStart = false, onComplete, triggerHaptics = true } = config;

  const scaleValue = useRef(new Animated.Value(0)).current;
  const opacityValue = useRef(new Animated.Value(0)).current;

  const celebrate = useCallback(() => {
    if (triggerHaptics) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    Animated.parallel([
      Animated.spring(scaleValue, {
        toValue: 1.05,
        ...MOTION_SPRING.celebratory,
        useNativeDriver: true,
      }),

      Animated.timing(opacityValue, {
        toValue: 1,
        duration: MOTION_TIMING.emotional,
        useNativeDriver: true,
      }),
    ]).start(() => {
      Animated.timing(scaleValue, {
        toValue: 1,
        duration: MOTION_TIMING.standard,
        useNativeDriver: true,
      }).start(onComplete);
    });
  }, [scaleValue, opacityValue, onComplete, triggerHaptics]);

  useEffect(() => {
    if (autoStart) {
      celebrate();
    }
  }, [autoStart, celebrate]);

  return {
    scaleValue,
    opacityValue,
    celebrate,
    animatedStyle: {
      transform: [{ scale: scaleValue }],
      opacity: opacityValue,
    },
  };
}

export default {
  useRevealAnimation,
  useScalePress,
  useFadeIn,
  useListItemStagger,
  useBob,
  useShake,
  useModalSpring,
  useSuccessCelebration,
};
