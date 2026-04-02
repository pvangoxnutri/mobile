import { router } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useAuth } from '@/components/auth-provider';

export default function AuthCallbackScreen() {
  const { refreshProfile } = useAuth();

  useEffect(() => {
    void (async () => {
      try {
        const profile = await refreshProfile();
        router.replace(profile ? '/(tabs)' : '/(auth)/login');
      } finally {
        return;
      }
    })();
  }, [refreshProfile]);

  return (
    <View style={styles.screen}>
      <ActivityIndicator size="large" color="#ff4f74" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
});
