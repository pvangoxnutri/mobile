/**
 * ACTIVITY IMAGE FALLBACK
 * Premium category-based placeholder visuals for activities without images
 *
 * Emotional intent:
 * - Designed absence, not missing content
 * - Category-specific personality
 * - Premium minimal aesthetic
 * - Emotionally warm and intentional
 * - Consistent with app's visual language
 */

import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS } from '@/constants/design-tokens';

interface ActivityImageFallbackProps {
  category?: string | null;
  size?: 'small' | 'medium' | 'large';
  style?: any;
}

type CategoryConfig = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  backgroundColor: string;
  iconColor: string;
};

const CATEGORY_CONFIGS: Record<string, CategoryConfig> = {
  flight: {
    icon: 'airplane',
    backgroundColor: '#e0f2fe', // Soft sky blue
    iconColor: '#0284c7',       // Sky blue
  },
  sidequest: {
    icon: 'compass',
    backgroundColor: '#f5f3ff', // Soft purple
    iconColor: '#7c3aed',       // Purple
  },
  food: {
    icon: 'restaurant',
    backgroundColor: '#fef3c7', // Warm cream
    iconColor: '#d97706',       // Warm orange
  },
  sight: {
    icon: 'images',
    backgroundColor: '#f3f4f6', // Soft neutral
    iconColor: '#6b7280',       // Medium gray
  },
  other: {
    icon: 'star',
    backgroundColor: '#fce7f3', // Soft rose
    iconColor: '#ec4899',       // Rose
  },
};

const DEFAULT_CONFIG: CategoryConfig = {
  icon: 'sparkles',
  backgroundColor: '#f0f9ff', // Light blue
  iconColor: '#0369a1',       // Medium blue
};

function getCategoryConfig(category?: string | null): CategoryConfig {
  if (!category) return DEFAULT_CONFIG;
  return CATEGORY_CONFIGS[category] || DEFAULT_CONFIG;
}

function getSizeStyles(size: 'small' | 'medium' | 'large') {
  switch (size) {
    case 'small':
      return {
        container: { width: 42, height: 42 },
        borderRadius: RADIUS.xs,
        iconSize: 18,
      };
    case 'large':
      return {
        container: { width: 160, height: 160 },
        borderRadius: RADIUS.md,
        iconSize: 40,
      };
    case 'medium':
    default:
      return {
        container: { width: 80, height: 80 },
        borderRadius: RADIUS.sm,
        iconSize: 28,
      };
  }
}

export default function ActivityImageFallback({
  category,
  size = 'medium',
  style,
}: ActivityImageFallbackProps) {
  const config = getCategoryConfig(category);
  const sizeStyle = getSizeStyles(size);

  return (
    <View
      style={[
        {
          ...sizeStyle.container,
          borderRadius: sizeStyle.borderRadius,
          backgroundColor: config.backgroundColor,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}>
      <Ionicons name={config.icon} size={sizeStyle.iconSize} color={config.iconColor} />
    </View>
  );
}

export { getCategoryConfig };
