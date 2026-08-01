import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BrandMark from '@/components/brand-mark';
import { useTheme } from '@/components/theme-provider';

/**
 * The one branded startup surface, shown from the moment the native splash
 * hands off until the first real screen mounts.
 *
 * It exists as a shared component rather than as markup duplicated in two
 * places because AuthGate (while auth resolves) and app/index.tsx (the route
 * that decides where to send the user) both need to paint EXACTLY the same
 * pixels. Any drift between them would read as a flicker at the one moment
 * the app can least afford it.
 *
 * The background deliberately mirrors the native splash from app.json:
 * '#fff7f8' on light, theme.colors.bgPrimary ('#0d0f14') on dark — the very
 * token the native dark splash already uses. That is what makes the hand-off
 * invisible: the native surface is replaced by an identically coloured JS
 * surface, so the only thing that changes is that the wordmark is now ours to
 * animate.
 *
 * There is deliberately NO spinner and no progress indicator. Startup is
 * either fast enough that a spinner would only flash, or it is blocked on the
 * network — and in that case a spinner communicates nothing the wordmark
 * doesn't already imply.
 */
export function StartupScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.screen,
        { backgroundColor: theme.isDark ? theme.colors.bgPrimary : '#fff7f8' },
        { paddingTop: insets.top + 12, paddingBottom: Math.max(insets.bottom, 24) + 12 },
      ]}>
      <BrandMark size="lg" tone="adaptive" />
      <Text style={styles.tagline}>The journey begins here</Text>
    </View>
  );
}

// The tagline colour is intentionally not themed: #8e92a0 clears 4.5:1 on both
// the light pink and the dark background, so theming it would add a surface to
// keep in sync for no visible gain. Same reasoning as the old splash route,
// which this component replaces.
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
