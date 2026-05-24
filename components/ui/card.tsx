import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { COLORS, RADIUS, CARD_PADDING, SHADOWS } from '@/constants/design-tokens';

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
  const radiusMap = {
    sm: RADIUS.sm,
    md: RADIUS.md,
    lg: RADIUS.lg,
    xl: RADIUS.xl,
  };

  const shadowMap = {
    subtle: SHADOWS.subtle,
    medium: SHADOWS.medium,
    strong: SHADOWS.strong,
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

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.white,
  },
});
