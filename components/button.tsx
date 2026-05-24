/**
 * PREMIUM BUTTON COMPONENT
 * Unified tactile button with scale press feedback
 *
 * Emotional intent:
 * - Feels responsive and physical
 * - Scale feedback shows tactile response (not animation)
 * - Haptic feedback confirms interaction
 * - Ultra-fast response timing (<100ms)
 * - Returns to stillness after press
 *
 * Important: Feedback is restrained, not playful
 */

import { Animated, TouchableOpacityProps, StyleSheet, Text, ViewStyle } from 'react-native';
import { useCallback } from 'react';
import { useScalePress } from '@/hooks/useMotion';
import { COLORS, SPACING, TYPOGRAPHY, RADIUS } from '@/constants/design-tokens';

interface ButtonProps extends TouchableOpacityProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'tertiary';
  size?: 'large' | 'medium' | 'small';
  haptics?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}

export default function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'large',
  haptics = true,
  disabled = false,
  style,
}: ButtonProps) {
  const { handlePressIn, handlePressOut, animatedStyle } = useScalePress({
    scale: 0.94,
    triggerHaptics: haptics && !disabled,
    onPress,
  });

  const buttonStyle = getVariantStyle(variant, disabled);
  const sizeStyle = getSizeStyle(size);

  return (
    <Animated.View style={[animatedStyle]}>
      <TouchableOpacity
        style={[
          styles.button,
          buttonStyle,
          sizeStyle,
          disabled && styles.buttonDisabled,
          style,
        ]}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled}
        activeOpacity={1}>
        <Text
          style={[
            styles.label,
            variant === 'primary' ? styles.labelPrimary : styles.labelSecondary,
            size === 'small' && styles.labelSmall,
          ]}>
          {label}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

function getVariantStyle(variant: string, disabled: boolean) {
  switch (variant) {
    case 'primary':
      return {
        backgroundColor: disabled ? COLORS.borderPrimary : COLORS.primary,
      };
    case 'secondary':
      return {
        backgroundColor: COLORS.bgLight,
        borderWidth: 1,
        borderColor: COLORS.borderPrimary,
      };
    case 'tertiary':
      return {
        backgroundColor: 'transparent',
      };
    default:
      return {};
  }
}

function getSizeStyle(size: string) {
  switch (size) {
    case 'large':
      return {
        paddingVertical: SPACING.md,
        paddingHorizontal: SPACING.lg,
        borderRadius: RADIUS.md,
      };
    case 'medium':
      return {
        paddingVertical: SPACING.sm,
        paddingHorizontal: SPACING.md,
        borderRadius: RADIUS.sm,
      };
    case 'small':
      return {
        paddingVertical: SPACING.xs,
        paddingHorizontal: SPACING.sm,
        borderRadius: RADIUS.xs,
      };
    default:
      return {};
  }
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  label: {
    ...TYPOGRAPHY.buttonLarge,
    fontWeight: '800',
  },
  labelPrimary: {
    color: '#fff',
  },
  labelSecondary: {
    color: COLORS.textPrimary,
  },
  labelSmall: {
    ...TYPOGRAPHY.label,
  },
});
