import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { SPACING, TYPOGRAPHY, EMPTY_STATE } from '@/constants/design-tokens';
import { useTheme } from '@/components/theme-provider';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { AppTheme } from '@/constants/themes';
import { Button } from './button';

interface EmptyStateProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description?: string;
  action?: {
    label: string;
    onPress: () => void;
  };
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <Ionicons
          name={icon}
          size={EMPTY_STATE.iconSize}
          color={theme.colors.textMuted}
        />
      </View>
      <Text style={styles.title}>{title}</Text>
      {description && (
        <Text style={styles.description}>{description}</Text>
      )}
      {action && (
        <View style={{ marginTop: SPACING.lg }}>
          <Button
            label={action.label}
            onPress={action.onPress}
            size="md"
          />
        </View>
      )}
    </View>
  );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: EMPTY_STATE.containerVerticalPadding,
    gap: EMPTY_STATE.spacing,
  },
  iconContainer: {
    width: EMPTY_STATE.iconContainerSize,
    height: EMPTY_STATE.iconContainerSize,
    borderRadius: EMPTY_STATE.iconContainerSize / 2,
    backgroundColor: theme.colors.bgLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...TYPOGRAPHY.pageHeading,
    fontWeight: '900',
    color: theme.colors.textPrimary,
    textAlign: 'center',
  },
  description: {
    ...TYPOGRAPHY.body,
    fontWeight: '500',
    color: theme.colors.textSecondary,
    textAlign: 'center',
    maxWidth: 240,
  },
});
