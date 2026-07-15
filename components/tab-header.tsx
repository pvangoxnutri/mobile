import { router } from 'expo-router';
import { useState } from 'react';
import { Animated, Image, StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import { useAuth } from '@/components/auth-provider';
import BrandMark from '@/components/brand-mark';
import TopAlertsButton from '@/components/top-alerts-button';
// EXPERIMENTAL — Gluno AI assistant. GlunoButton renders null unless
// ENABLE_GLUNO_ASSISTANT is true (constants/feature-flags.ts), so this
// import is always safe even when the feature is hidden.
import GlunoButton from '@/components/gluno/GlunoButton';
import GlunoAssistant from '@/components/gluno/GlunoAssistant';
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
};

export default function TabHeader({
  inviteCount = 0,
  onAvatarPress,
  bellAnimatedStyle,
  avatarAnimatedStyle,
}: Props) {
  const styles = useThemedStyles(createStyles);
  const { user } = useAuth();
  const handleAvatarPress = onAvatarPress ?? (() => router.push('/(tabs)/profile'));
  // EXPERIMENTAL — see GlunoButton.tsx / constants/feature-flags.ts. This
  // state (and the panel below) only ever does anything once a user can
  // actually press the button, which only renders when the flag is on.
  const [glunoOpen, setGlunoOpen] = useState(false);

  return (
    <>
      <View style={styles.topRow}>
        <BrandMark size="sm" />
        <View style={styles.rightCluster}>
          <GlunoButton onPress={() => setGlunoOpen(true)} />
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
      <GlunoAssistant visible={glunoOpen} onClose={() => setGlunoOpen(false)} />
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
