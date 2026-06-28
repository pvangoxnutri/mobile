import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { COLORS } from '@/constants/design-tokens';

// ──────────────────────────────────────────────────────────────────────────
// EXPERIMENTAL — Gluno mascot (gated by ENABLE_GLUNO_ASSISTANT, see
// constants/feature-flags.ts — this component itself has no flag check;
// callers like GlunoButton/GlunoAssistant are what's gated).
//
// Gluno is NOT a static icon. This is the one place that knows how to
// render "Gluno" as a character, so every call site (header button,
// assistant panel) can stay simple — <GlunoMascot state="..." /> — no
// matter what's actually driving the visual underneath.
//
// RENDER STRATEGY (today vs. later):
//   1. Rive    — not installed. TODO(gluno-assets): once available, render
//                a RiveAnimation here using GLUNO_ANIMATION_SOURCES[state].rive.
//   2. Lottie  — not installed. TODO(gluno-assets): once available, render
//                a LottieView here using GLUNO_ANIMATION_SOURCES[state].lottie.
//   3. THIS — a Reanimated-driven placeholder shape (today's fallback).
// Do not add react-native-reanimated, lottie-react-native or
// rive-react-native as new dependencies casually — reanimated is already a
// project dependency (used here); the other two are deliberately NOT
// installed until real Gluno animation files exist to justify them.
// When they land, only the render branch below needs to change.
// ──────────────────────────────────────────────────────────────────────────

export type GlunoMascotState = 'idle' | 'thinking' | 'happy' | 'secret' | 'pointing';

type GlunoMascotProps = {
  // Diameter in px. Header button uses ~34-38, the assistant panel uses
  // something larger (e.g. 64).
  size?: number;
  state?: GlunoMascotState;
  // Whether the state's own animation (breathing, wiggle, ...) repeats
  // forever or plays once — e.g. a "happy" bounce on panel-open should
  // probably not loop forever, while "idle" should.
  loop?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
};

// TODO(gluno-assets): final source-of-truth filenames once real animation
// files exist — kept in one place so wiring up a real file later is a
// one-line change here, not a hunt through every call site.
//   Rive:   gluno_idle.riv, gluno_thinking.riv, gluno_happy.riv,
//           gluno_secret.riv, gluno_pointing.riv
//   Lottie: gluno_idle.json, gluno_thinking.json, gluno_happy.json,
//           gluno_secret.json, gluno_pointing.json
// Suggested home once they exist: mobile/assets/gluno/.
export const GLUNO_ANIMATION_SOURCES: Record<GlunoMascotState, { rive: string; lottie: string }> = {
  idle: { rive: 'gluno_idle.riv', lottie: 'gluno_idle.json' },
  thinking: { rive: 'gluno_thinking.riv', lottie: 'gluno_thinking.json' },
  happy: { rive: 'gluno_happy.riv', lottie: 'gluno_happy.json' },
  secret: { rive: 'gluno_secret.riv', lottie: 'gluno_secret.json' },
  pointing: { rive: 'gluno_pointing.riv', lottie: 'gluno_pointing.json' },
};

// Placeholder "face" per state — TODO: replace entirely with the final
// Gluno SVG/animation asset. This is just enough visual variety so the
// states read as different while there's no real character art yet.
const FACE_ICON_BY_STATE: Record<GlunoMascotState, keyof typeof Ionicons.glyphMap> = {
  idle: 'happy-outline',
  thinking: 'ellipsis-horizontal',
  happy: 'happy',
  secret: 'eye-off-outline',
  pointing: 'hand-right-outline',
};

const BLINK_INTERVAL_MIN_MS = 4000;
const BLINK_INTERVAL_MAX_MS = 6500;
const BOUNCE_INTERVAL_MIN_MS = 8000;
const BOUNCE_INTERVAL_MAX_MS = 12000;

export default function GlunoMascot({
  size = 48,
  state = 'idle',
  loop = true,
  onPress,
  accessibilityLabel,
  accessibilityHint,
}: GlunoMascotProps) {
  const reduceMotion = useReducedMotion();

  // Each gesture/loop gets its own shared value so they can run (and be
  // cancelled) independently — e.g. a tap reaction must never interrupt or
  // get interrupted by the idle breathing loop.
  const breathe = useSharedValue(1);
  const bounceY = useSharedValue(0);
  const wiggle = useSharedValue(0);
  const blink = useSharedValue(1);
  const tapScale = useSharedValue(1);

  const blinkTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Breathing — idle and secret both get a slow scale pulse; secret's is
  //    slower/subtler to read as "hushed" rather than "alert". ──────────────
  useEffect(() => {
    if (reduceMotion || (state !== 'idle' && state !== 'secret')) {
      breathe.value = withTiming(1, { duration: 200 });
      return;
    }

    const peak = state === 'secret' ? 1.015 : 1.035;
    const duration = state === 'secret' ? 1400 : 1100;
    breathe.value = withRepeat(
      withSequence(
        withTiming(peak, { duration, easing: Easing.inOut(Easing.sin) }),
        withTiming(1, { duration, easing: Easing.inOut(Easing.sin) }),
      ),
      loop ? -1 : 2,
      false,
    );

    return () => cancelAnimation(breathe);
  }, [state, loop, reduceMotion, breathe]);

  // ── Thinking wiggle — a gentle back-and-forth rotation while "thinking". ──
  useEffect(() => {
    if (reduceMotion || state !== 'thinking') {
      wiggle.value = withTiming(0, { duration: 150 });
      return;
    }

    wiggle.value = withRepeat(
      withSequence(
        withTiming(-6, { duration: 220, easing: Easing.inOut(Easing.quad) }),
        withTiming(6, { duration: 220, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 160, easing: Easing.inOut(Easing.quad) }),
      ),
      loop ? -1 : 1,
      false,
    );

    return () => cancelAnimation(wiggle);
  }, [state, loop, reduceMotion, wiggle]);

  // ── Happy bounce — a single (or looped, if loop=true) upward bounce. ─────
  useEffect(() => {
    if (reduceMotion || state !== 'happy') return;

    bounceY.value = withRepeat(
      withSequence(
        withTiming(-10, { duration: 160, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 220, easing: Easing.bounce }),
      ),
      loop ? -1 : 1,
      false,
    );

    return () => cancelAnimation(bounceY);
  }, [state, loop, reduceMotion, bounceY]);

  // ── Idle-only small bounce, every ~8-12s — randomized so several mascots
  //    on screen (unlikely today, but future-proof) don't bounce in
  //    lockstep, and so it never reads as a metronome. ─────────────────────
  useEffect(() => {
    if (reduceMotion || state !== 'idle') {
      bounceY.value = 0;
      return;
    }

    let active = true;
    const scheduleBounce = () => {
      const delay = BOUNCE_INTERVAL_MIN_MS + Math.random() * (BOUNCE_INTERVAL_MAX_MS - BOUNCE_INTERVAL_MIN_MS);
      bounceTimeoutRef.current = setTimeout(() => {
        if (!active) return;
        bounceY.value = withSequence(
          withTiming(-6, { duration: 180, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: 220, easing: Easing.inOut(Easing.quad) }),
        );
        scheduleBounce();
      }, delay);
    };
    scheduleBounce();

    return () => {
      active = false;
      if (bounceTimeoutRef.current) clearTimeout(bounceTimeoutRef.current);
      cancelAnimation(bounceY);
    };
  }, [state, reduceMotion, bounceY]);

  // ── Blink simulation — a quick vertical squash, every ~4-6.5s, only
  //    while idle/secret (thinking/happy/pointing have their own motion
  //    busy enough without also blinking on top). ─────────────────────────
  useEffect(() => {
    if (reduceMotion || (state !== 'idle' && state !== 'secret')) {
      blink.value = 1;
      return;
    }

    let active = true;
    const scheduleBlink = () => {
      const delay = BLINK_INTERVAL_MIN_MS + Math.random() * (BLINK_INTERVAL_MAX_MS - BLINK_INTERVAL_MIN_MS);
      blinkTimeoutRef.current = setTimeout(() => {
        if (!active) return;
        blink.value = withSequence(
          withTiming(0.82, { duration: 70, easing: Easing.inOut(Easing.quad) }),
          withTiming(1, { duration: 90, easing: Easing.inOut(Easing.quad) }),
        );
        scheduleBlink();
      }, delay);
    };
    scheduleBlink();

    return () => {
      active = false;
      if (blinkTimeoutRef.current) clearTimeout(blinkTimeoutRef.current);
      cancelAnimation(blink);
    };
  }, [state, reduceMotion, blink]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: bounceY.value },
      { scale: breathe.value * tapScale.value },
      { scaleY: blink.value },
      { rotate: `${wiggle.value}deg` },
    ],
  }));

  function handlePress() {
    if (!reduceMotion) {
      tapScale.value = withSequence(
        withTiming(0.86, { duration: 90, easing: Easing.out(Easing.quad) }),
        withTiming(1.08, { duration: 130, easing: Easing.out(Easing.quad) }),
        withTiming(1, { duration: 130, easing: Easing.inOut(Easing.quad) }),
      );
    }
    onPress?.();
  }

  const dimension = { width: size, height: size, borderRadius: size / 2 };

  return (
    <Pressable
      onPress={onPress ? handlePress : undefined}
      hitSlop={8}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={onPress ? accessibilityLabel ?? 'Gluno' : undefined}
      accessibilityHint={onPress ? accessibilityHint : undefined}>
      <Animated.View style={[styles.shadowWrap, dimension, animatedStyle]}>
        <View style={[styles.face, dimension]}>
          <Ionicons name={FACE_ICON_BY_STATE[state]} size={size * 0.5} color={COLORS.white} />
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shadowWrap: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
    elevation: 5,
  },
  face: {
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
