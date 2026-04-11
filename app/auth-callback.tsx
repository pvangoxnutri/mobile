import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useAuth } from '@/components/auth-provider';
import { useAppTheme } from '@/contexts/app-theme-context';
import { supabase } from '@/lib/supabase';

export default function AuthCallbackScreen() {
  const theme = useAppTheme();
  const { refreshProfile } = useAuth();

  useEffect(() => {
    void (async () => {
      try {
        const url = await Linking.getInitialURL();
        const params = readAuthParams(url);
        const authError = params.get('error_description') ?? params.get('error');

        if (authError) {
          throw new Error(authError);
        }

        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');
        const code = params.get('code');

        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (error) {
            throw error;
          }
        } else if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            throw error;
          }
        }

        const profile = await refreshProfile();
        router.replace(profile ? '/(tabs)' : '/(auth)/login');
      } finally {
        return;
      }
    })();
  }, [refreshProfile]);

  return (
    <View style={styles.screen}>
      <ActivityIndicator size="large" color={theme.primary} />
    </View>
  );
}

function readAuthParams(url: string | null) {
  const params = new URLSearchParams();
  if (!url) return params;

  const [, queryPart = ''] = url.split('?');
  const [queryString, hashString = ''] = queryPart.split('#');

  for (const [key, value] of new URLSearchParams(queryString).entries()) {
    params.set(key, value);
  }

  for (const [key, value] of new URLSearchParams(hashString).entries()) {
    params.set(key, value);
  }

  return params;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
});
