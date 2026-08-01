import { router } from 'expo-router';
import { Animated, Image, StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import { useAuth } from '@/components/auth-provider';
import BrandMark from '@/components/brand-mark';
import TopAlertsButton from '@/components/top-alerts-button';
// IN DEVELOPMENT — Gluno AI assistant. GlunoButton renders null unless
// ENABLE_GLUNO_ASSISTANT is true (constants/feature-flags.ts), so this
// import is always safe even when the feature is hidden.
import GlunoButton from '@/components/gluno/GlunoButton';
import { GLUNO_SCREENS, type GlunoScreen } from '@/lib/gluno-navigation';
import { SPACING } from '@/constants/design-tokens';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { AppTheme } from '@/constants/themes';

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
  // IN DEVELOPMENT — scopes the Gluno conversation to an Adventure. The tabs
  // that use this header have no single trip in view, so it stays undefined
  // there and Gluno answers globally; a trip screen can pass one to give it
  // the Adventure's plan.
  glunoTripId?: string | null;
  // Which screen this header sits on, as a stable Gluno screen id. Passed
  // through so app-help can answer for where the user already is.
  glunoScreen?: GlunoScreen;
};

export default function TabHeader({
  inviteCount = 0,
  onAvatarPress,
  bellAnimatedStyle,
  avatarAnimatedStyle,
  glunoTripId = null,
  glunoScreen = GLUNO_SCREENS.home,
}: Props) {
  const styles = useThemedStyles(createStyles);
  const { user } = useAuth();
  const handleAvatarPress = onAvatarPress ?? (() => router.push('/(tabs)/profile'));

  // IN DEVELOPMENT — see GlunoButton.tsx / constants/feature-flags.ts.
  // Gluno is a pushed screen rather than a sheet: it needs its own back
  // navigation and a conversation that survives leaving it (app/gluno.tsx).
  // The button only renders when the flag is on, so this handler is
  // unreachable in a shipping build.
  const openGluno = () => {
    // The screen carries through so app-help answers can be shorter — Gluno
    // should not explain how to reach a screen the user is already on.
    const query = new URLSearchParams({ screen: glunoScreen });
    if (glunoTripId) query.set('tripId', glunoTripId);
    router.push(`/gluno?${query.toString()}`);
  };

  return (
    <>
      <View style={styles.topRow}>
        <BrandMark size="sm" tone="adaptive" />
        <View style={styles.rightCluster}>
          <GlunoButton onPress={openGluno} />
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
    </>
  );
}

function getInitials(name?: string | null) {
  if (!name) return 'SQ';
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase()).join('') || 'SQ';
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
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
    backgroundColor: theme.colors.bgLight,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: theme.isDark ? 0.25 : 0.05,
    shadowRadius: 12,
    elevation: theme.isDark ? 0 : 3,
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
    backgroundColor: theme.colors.avatarDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: theme.colors.white,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
});
