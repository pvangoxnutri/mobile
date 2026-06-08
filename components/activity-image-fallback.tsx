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
 *
 * Uses the shared category visual system: lib/category-symbol.ts
 */

import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RADIUS } from '@/constants/design-tokens';
import { getCategorySymbol } from '@/lib/category-symbol';

interface ActivityImageFallbackProps {
  category?: string | null;
  size?: 'small' | 'medium' | 'large' | 'hero';
  style?: any;
}

function getSizeStyles(size: 'small' | 'medium' | 'large' | 'hero') {
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
    case 'hero':
      // Fills the parent container; large icon for hero-sized fallbacks
      // on screens like SideQuest detail. Width/height override via style prop.
      return {
        container: { width: '100%' as const, height: '100%' as const, minHeight: 360 },
        borderRadius: RADIUS.lg,
        iconSize: 96,
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
  const symbol = getCategorySymbol(category);
  const sizeStyle = getSizeStyles(size);

  return (
    <View
      style={[
        {
          ...sizeStyle.container,
          borderRadius: sizeStyle.borderRadius,
          backgroundColor: symbol.backgroundColor,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}>
      <Ionicons name={symbol.icon} size={sizeStyle.iconSize} color={symbol.iconColor} />
    </View>
  );
}
