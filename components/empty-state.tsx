/**
 * EMPTY STATE COMPONENT
 * Creates warm, inviting empty state feelings
 *
 * Emotional intent:
 * - Feels calm and safe (not sad or utilitarian)
 * - Creates curiosity and anticipation
 * - Warm, conversational copy tone
 * - Gentle idle motion (only when appropriate)
 * - Maintains product personality
 *
 * Important: Empty states should feel like:
 * - An invitation, not a failure
 * - A blank canvas waiting for creation
 * - Warm and welcoming, not cold and empty
 *
 * NOT: Overillustrated, gamified, or childish
 */

import { Animated, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useBob } from '@/hooks/useMotion';
import { COLORS, SPACING, TYPOGRAPHY } from '@/constants/design-tokens';

interface EmptyStateProps {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  description: string;
  hint?: string;
  motion?: boolean;
}

export default function EmptyState({ icon, title, description, hint, motion = true }: EmptyStateProps) {
  const { animatedStyle } = useBob({
    distance: motion ? 3 : 0,
    duration: 2400,
    autoStart: motion,
  });

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.iconContainer, animatedStyle]}>
        <View style={styles.iconCircle}>
          <Ionicons name={icon} size={40} color={COLORS.textMeta} />
        </View>
      </Animated.View>

      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>

      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xxl,
    paddingHorizontal: SPACING.xl,
  },
  iconContainer: {
    marginBottom: SPACING.lg,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.bgLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...TYPOGRAPHY.pageHeading,
    color: COLORS.textPrimary,
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  description: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.lg,
    lineHeight: 22,
  },
  hint: {
    ...TYPOGRAPHY.meta,
    color: COLORS.textMeta,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
