import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { RADIUS, CARD_PADDING } from '@/constants/design-tokens';
import { useTheme } from '@/components/theme-provider';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { AppTheme } from '@/constants/themes';

interface CardProps {
  children: React.ReactNode;
  variant?: 'subtle' | 'medium' | 'strong';
  padding?: 'compact' | 'standard' | 'large';
  borderRadius?: 'sm' | 'md' | 'lg' | 'xl';
  onPress?: () => void;
  style?: any;
}

export function Card({
  children,
  variant = 'subtle',
  padding = 'standard',
  borderRadius = 'md',
  onPress,
  style,
}: CardProps) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const radiusMap = {
    sm: RADIUS.sm,
    md: RADIUS.md,
    lg: RADIUS.lg,
    xl: RADIUS.xl,
  };

  const shadowMap = {
    subtle: theme.shadows.subtle,
    medium: theme.shadows.medium,
    strong: theme.shadows.strong,
  };

  const paddingMap = {
    compact: CARD_PADDING.compact,
    standard: CARD_PADDING.standard,
    large: CARD_PADDING.large,
  };

  const cardStyle = {
    padding: paddingMap[padding],
    borderRadius: radiusMap[borderRadius],
    ...shadowMap[variant],
  };

  const content = (
    <View style={[styles.card, cardStyle, style]}>
      {children}
    </View>
  );

  return onPress ? (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
      {content}
    </TouchableOpacity>
  ) : (
    content
  );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    // Dark elevation comes from surface contrast + a hairline border, not
    // shadows — light mode stays borderless and pixel-identical.
    borderWidth: theme.isDark ? StyleSheet.hairlineWidth : 0,
    borderColor: theme.colors.borderPrimary,
  },
});
