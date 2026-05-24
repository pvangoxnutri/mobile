import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SPACING, TYPOGRAPHY, COLORS, BUTTON_SIZES, OPACITIES, SHADOWS } from '@/constants/design-tokens';

interface ButtonProps {
  label: string;
  onPress: () => void;
  size?: 'sm' | 'md' | 'lg' | 'icon' | 'icon-lg';
  variant?: 'primary' | 'secondary' | 'outline';
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
  style?: any;
}

export function Button({
  label,
  onPress,
  size = 'md',
  variant = 'primary',
  disabled = false,
  loading = false,
  icon,
  iconPosition = 'left',
  fullWidth = false,
  style,
}: ButtonProps) {
  const sizeConfig = size === 'icon-lg' ? BUTTON_SIZES.iconLarge : BUTTON_SIZES[size as keyof typeof BUTTON_SIZES];

  const variantStyles: Record<string, { bg: string; border: string; text: string }> = {
    primary: { bg: COLORS.primary, border: 'transparent', text: COLORS.white },
    secondary: { bg: COLORS.white, border: COLORS.primary, text: COLORS.primary },
    outline: { bg: 'transparent', border: COLORS.borderPrimary, text: COLORS.textPrimary },
  };

  const variantStyle = variantStyles[variant];

  // Icon-only buttons don't show text
  const isIconOnly = size.includes('icon');

  return (
    <TouchableOpacity
      disabled={disabled || loading}
      activeOpacity={OPACITIES.activeButton}
      onPress={onPress}
      style={[
        styles.button,
        sizeConfig,
        {
          backgroundColor: variantStyle.bg,
          borderColor: variantStyle.border,
        },
        disabled && { opacity: OPACITIES.disabled },
        fullWidth && { width: '100%' },
        style,
        size === 'md' && SHADOWS.subtle,
        size === 'lg' && SHADOWS.subtle,
      ]}>
      {!isIconOnly && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.md }}>
          {icon && iconPosition === 'left' && icon}
          {!loading ? (
            <Text
              style={[
                size === 'lg' ? styles.textLg : size === 'sm' ? styles.textSm : styles.textMd,
                { color: variantStyle.text },
              ]}>
              {label}
            </Text>
          ) : (
            <ActivityIndicator color={variantStyle.text} size="small" />
          )}
          {icon && iconPosition === 'right' && icon}
        </View>
      )}
      {isIconOnly && (
        loading ? (
          <ActivityIndicator color={variantStyle.text} size="small" />
        ) : (
          icon
        )
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  textMd: {
    ...TYPOGRAPHY.buttonLarge,
    fontWeight: '800',
  },
  textLg: {
    ...TYPOGRAPHY.buttonLarge,
    fontWeight: '800',
  },
  textSm: {
    ...TYPOGRAPHY.buttonSmall,
    fontWeight: '800',
  },
});
