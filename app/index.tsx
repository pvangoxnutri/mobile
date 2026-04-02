import { router } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BrandMark from '@/components/brand-mark';
import { useAuth } from '@/components/auth-provider';

export default function SplashRoute() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    const timeout = setTimeout(() => {
      router.replace(user ? '/(tabs)' : '/(auth)/login');
    }, 1200);

    return () => clearTimeout(timeout);
  }, [user]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 12, paddingBottom: Math.max(insets.bottom, 24) + 12 }]}>
      <BrandMark size="lg" />
      <Text style={styles.tagline}>The journey begins here</Text>
    </View>
  );
}

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
