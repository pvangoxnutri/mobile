import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BrandMark from '@/components/brand-mark';
import { supabase } from '@/lib/supabase';

export default function ResetPasswordScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<Record<string, string | string[]>>();
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  const initialUrl = useMemo(() => buildUrlFromParams(params), [params]);

  useEffect(() => {
    let cancelled = false;

    async function prepareReset() {
      try {
        setError('');
        const liveUrl = (await Linking.getInitialURL()) || initialUrl;
        const authParams = readAuthParams(liveUrl);
        const code = authParams.get('code');
        const accessToken = authParams.get('access_token');
        const refreshToken = authParams.get('refresh_token');
        const authError = authParams.get('error_description') ?? authParams.get('error');

        if (authError) {
          throw new Error(authError);
        }

        if (accessToken && refreshToken) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (sessionError) {
            throw sessionError;
          }
        } else if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) {
            throw exchangeError;
          }
        } else {
          throw new Error('This reset link is invalid or expired. Please request a new one.');
        }

        if (!cancelled) {
          setReady(true);
        }
      } catch (exchangeError) {
        if (!cancelled) {
          setError(exchangeError instanceof Error ? exchangeError.message : 'This reset link is invalid or expired.');
        }
      }
    }

    void prepareReset();

    return () => {
      cancelled = true;
    };
  }, [initialUrl]);

  async function handleSubmit() {
    try {
      setLoading(true);
      setError('');
      setMessage('');

      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        throw updateError;
      }

      setMessage('Your password has been updated.');
      await supabase.auth.signOut();

      setTimeout(() => {
        router.replace('/(auth)/login?reset=1');
      }, 1200);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not reset password.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: Math.max(insets.top, 18) + 10, paddingBottom: Math.max(insets.bottom, 24) + 20 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <Pressable style={styles.backButton} onPress={() => router.replace('/(auth)/login')}>
          <Ionicons name="arrow-back" size={22} color="#111217" />
        </Pressable>

        <View style={styles.logoWrap}>
          <BrandMark size="md" />
        </View>

        <View style={styles.card}>
          <Text style={styles.heading}>Choose a new password</Text>
          <Text style={styles.copy}>Pick a new password for your SideQuest account.</Text>

          {message ? <Text style={styles.success}>{message}</Text> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TextInput
            style={styles.input}
            placeholder="New password"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            value={password}
            onChangeText={setPassword}
          />

          <Pressable style={styles.primaryButton} onPress={() => void handleSubmit()} disabled={loading || !ready}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Update password</Text>}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function buildUrlFromParams(params: Record<string, string | string[]>) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        query.append(key, item);
      }
    } else if (value) {
      query.set(key, value);
    }
  }

  const queryString = query.toString();
  return queryString ? `sidequest://reset-password?${queryString}` : 'sidequest://reset-password';
}

function readAuthParams(url: string | null) {
  const params = new URLSearchParams();
  if (!url) return params;

  const [, queryPart = ''] = url.split('?');
  const [queryString, hashString = ''] = queryPart.split('#');

  const appendAll = (source: URLSearchParams) => {
    for (const [key, value] of source.entries()) {
      params.set(key, value);
    }
  };

  appendAll(new URLSearchParams(queryString));
  appendAll(new URLSearchParams(hashString));

  return params;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#fff7f8',
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.8)',
  },
  logoWrap: {
    marginTop: 28,
  },
  card: {
    marginTop: 26,
    borderRadius: 28,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#eceef2',
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.06,
    shadowRadius: 24,
    elevation: 5,
  },
  heading: {
    fontSize: 26,
    fontWeight: '800',
    color: '#14161d',
    letterSpacing: -0.8,
  },
  copy: {
    marginTop: 10,
    color: '#8b8f9b',
    fontSize: 15,
    lineHeight: 23,
  },
  success: {
    marginTop: 16,
    borderRadius: 18,
    backgroundColor: '#eefaf1',
    borderWidth: 1,
    borderColor: '#d6eedb',
    color: '#24613d',
    paddingHorizontal: 14,
    paddingVertical: 12,
    overflow: 'hidden',
  },
  error: {
    marginTop: 16,
    borderRadius: 18,
    backgroundColor: '#fff4f7',
    borderWidth: 1,
    borderColor: '#ffd5dd',
    color: '#b4234b',
    paddingHorizontal: 14,
    paddingVertical: 12,
    overflow: 'hidden',
  },
  input: {
    marginTop: 18,
    height: 54,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e4e7ee',
    backgroundColor: '#f9fafc',
    paddingHorizontal: 16,
    fontSize: 16,
  },
  primaryButton: {
    marginTop: 16,
    height: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ff4f74',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
});
