import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BrandMark from '@/components/brand-mark';
import { useAuth } from '@/components/auth-provider';
import { useTheme } from '@/components/theme-provider';

export default function SplashRoute() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  // useFocusEffect, NOT useEffect: when a push-notification deep link
  // cold-starts the app, PushNotificationBootstrap pushes the destination
  // (e.g. the revealed activity's detail) ON TOP of this splash within
  // milliseconds — this route stays mounted underneath, and a plain
  // useEffect timer would fire 1200ms later and router.replace() the
  // user's destination away to the tabs. Focus semantics fix both ends:
  // the timer is torn down the moment something covers the splash, and
  // re-arms if the user ever backs out onto it again.
  useFocusEffect(
    useCallback(() => {
      const timeout = setTimeout(() => {
        if (!user) {
          router.replace('/(auth)/login');
        } else if (!user.hasCompletedOnboarding) {
          router.replace('/onboarding');
        } else {
          router.replace('/(tabs)');
        }
      }, 1200);

      return () => clearTimeout(timeout);
    }, [user]),
  );

  return (
    <View
      style={[
        styles.screen,
        // Dark path only re-points to the SAME token the native dark splash
        // (app.json → dark.backgroundColor) already uses, so the two stay in
        // lockstep by construction — no second place to keep in sync. Light
        // deliberately keeps the fixed brand pink below rather than
        // theme.colors.bgPrimary ('#fff'), since pink is what the native
        // LIGHT splash already uses; switching it would be a needless
        // mismatch in the far more common light-preference case.
        { backgroundColor: theme.isDark ? theme.colors.bgPrimary : '#fff7f8' },
        { paddingTop: insets.top + 12, paddingBottom: Math.max(insets.bottom, 24) + 12 },
      ]}>
      {/* 'adaptive' resolves to ink on light (identical to the previous fixed
          tone) and white on dark — the exact swap BrandMark's tone rules were
          already built for (see brand-mark.tsx). Logo design unchanged. */}
      <BrandMark size="lg" tone="adaptive" />
      <Text style={styles.tagline}>The journey begins here</Text>
    </View>
  );
}

// THEME EXEMPTION, UPDATED: this is the launch splash, handed off from the
// NATIVE splash (app.json), which — as of the dark-splash patch — DOES know
// the OS appearance, but never the in-app manual preference (AsyncStorage,
// resolved only after JS boots). This route sits below ThemeProvider, whose
// own hydration gates all rendering beneath it (see theme-provider.tsx), so
// by the time this component ever paints, `theme` is guaranteed to be the
// FINAL resolved preference — never a temporary default that later swaps.
// Background/wordmark follow that resolved preference (see above); the
// tagline color is intentionally NOT themed — #8e92a0 already reads clearly
// on both the fixed light pink and dark bgPrimary (~6.6:1 contrast on
// '#0d0f14'), so re-theming it would be an unnecessary extra surface to keep
// in sync for zero visible benefit.
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  tagline: {
    marginTop: 20,
    color: '#8e92a0',
    fontSize: 18,
    letterSpacing: -0.4,
  },
});
