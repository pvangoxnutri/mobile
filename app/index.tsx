import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BrandMark from '@/components/brand-mark';
import { useAuth } from '@/components/auth-provider';

export default function SplashRoute() {
  const { user } = useAuth();
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
    <View style={[styles.screen, { paddingTop: insets.top + 12, paddingBottom: Math.max(insets.bottom, 24) + 12 }]}>
      <BrandMark size="lg" />
      <Text style={styles.tagline}>The journey begins here</Text>
    </View>
  );
}

// THEME EXEMPTION (deliberate): this is the launch splash — it renders on the
// same brand-pink surface as the NATIVE splash (app.json), which cannot know
// the in-app theme. Keeping both surfaces identical in BOTH themes makes
// launch one continuous branded moment instead of pink → dark → app; the
// ink wordmark belongs on this fixed light-pink surface (see BrandMark's
// tone rules). Do not migrate these to page tokens.
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#fff7f8',
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
