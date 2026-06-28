import { Ionicons } from '@expo/vector-icons';
import { Animated, StyleSheet, TouchableOpacity } from 'react-native';
import { useScalePress } from '@/hooks/useMotion';
import { ENABLE_GLUNO_ASSISTANT } from '@/constants/feature-flags';
import { COLORS } from '@/constants/design-tokens';

// EXPERIMENTAL — Gluno AI assistant entry point, meant to live in the main
// app header (see components/tab-header.tsx). Renders null unless
// ENABLE_GLUNO_ASSISTANT is true (constants/feature-flags.ts) — this is the
// single point that hides the whole feature when the flag is off, so it's
// safe for tab-header.tsx to render this unconditionally.
//
// TODO: replace the sparkle icon with the final Gluno mascot asset once
// it exists — this is a placeholder so the feature isn't blocked on artwork.
export default function GlunoButton({ onPress }: { onPress: () => void }) {
  const { handlePressIn, handlePressOut, animatedStyle } = useScalePress({ scale: 0.88 });

  if (!ENABLE_GLUNO_ASSISTANT) return null;

  return (
    <Animated.View style={animatedStyle}>
      <TouchableOpacity
        style={styles.button}
        activeOpacity={0.85}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Open Gluno assistant"
        accessibilityHint="Opens the Gluno AI assistant panel">
        <Ionicons name="sparkles" size={20} color={COLORS.primary} />
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.bgLight,
  },
});
