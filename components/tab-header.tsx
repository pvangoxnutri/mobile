import { router } from 'expo-router';
import { Animated, Image, StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import { useAuth } from '@/components/auth-provider';
import BrandMark from '@/components/brand-mark';
import TopAlertsButton from '@/components/top-alerts-button';
import { COLORS, SPACING } from '@/constants/design-tokens';

type AnimatedStyle = StyleProp<ViewStyle> | Animated.WithAnimatedValue<ViewStyle>;

type Props = {
  inviteCount?: number;
  onAvatarPress?: () => void;
  // Optional animated styles applied to the bell wrapper and avatar wrapper.
  // Used by Profile for the small-avatar → hero "fake shared transition".
  // When undefined, both wrappers render as static views — Home/Calendar
  // behave exactly as before.
  bellAnimatedStyle?: AnimatedStyle;
  avatarAnimatedStyle?: AnimatedStyle;
};

export default function TabHeader({
  inviteCount = 0,
  onAvatarPress,
  bellAnimatedStyle,
  avatarAnimatedStyle,
}: Props) {
  const { user } = useAuth();
  const handleAvatarPress = onAvatarPress ?? (() => router.push('/(tabs)/profile'));

  return (
    <View style={styles.topRow}>
      <BrandMark size="sm" />
      <View style={styles.rightCluster}>
        <Animated.View style={bellAnimatedStyle}>
          <TopAlertsButton inviteCount={inviteCount} />
        </Animated.View>
        <Animated.View style={avatarAnimatedStyle}>
          <TouchableOpacity style={styles.avatarShell} activeOpacity={0.8} onPress={handleAvatarPress}>
            {user?.avatarUrl && user.avatarUrl.trim() ? (
              <Image source={{ uri: user.avatarUrl }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarCore}>
                <Text style={styles.avatarText}>{getInitials(user?.name)}</Text>
              </View>
            )}
          </TouchableOpacity>
        </Animated.View>
      </View>
    </View>
  );
}

function getInitials(name?: string | null) {
  if (!name) return 'SQ';
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase()).join('') || 'SQ';
}

const styles = StyleSheet.create({
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 50,
    gap: SPACING.md,
  },
  rightCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatarShell: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.bgLight,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarCore: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.avatarDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
});
