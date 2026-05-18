import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '@/components/auth-provider';
import { supabase } from '@/lib/supabase';
import { PRIMARY_COLOR } from '@/constants/colors';

const CALLBACK_TIMEOUT_MS = 10000;

export default function AuthCallbackScreen() {
  const { refreshProfile } = useAuth();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      console.warn('[AUTH_CALLBACK] Timed out after 10s — showing fallback UI');
      setTimedOut(true);
    }, CALLBACK_TIMEOUT_MS);

    void (async () => {
      try {
        const url = await Linking.getInitialURL();
        console.log('[AUTH_CALLBACK] Processing callback URL');
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
          if (error) throw error;
        } else if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        }

        const profile = await refreshProfile();
        console.log('[AUTH_CALLBACK] Success, profile:', profile ? 'found' : 'none');
        router.replace(profile ? '/(tabs)' : '/(auth)/login');
      } catch (err) {
        console.error('[AUTH_CALLBACK] Failed:', err instanceof Error ? err.message : err);
        router.replace('/(auth)/login');
      } finally {
        clearTimeout(timer);
      }
    })();

    return () => clearTimeout(timer);
  }, [refreshProfile]);

  if (timedOut) {
    return (
      <View style={styles.screen}>
        <Text style={styles.timeoutText}>Sign-in is taking too long.</Text>
        <TouchableOpacity style={styles.timeoutButton} onPress={() => router.replace('/(auth)/login')}>
          <Text style={styles.timeoutButtonText}>Back to sign in</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ActivityIndicator size="large" color={PRIMARY_COLOR} />
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
  timeoutText: {
    color: '#666b76',
    fontSize: 16,
    marginBottom: 20,
  },
  timeoutButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: PRIMARY_COLOR,
  },
  timeoutButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
