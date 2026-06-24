import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
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
import { useI18n } from '@/components/i18n-provider';
import PasswordStrengthMeter from '@/components/password-strength-meter';
import { supabase } from '@/lib/supabase';
import { PRIMARY_COLOR } from '@/constants/colors';
import { useKeyboardFocusScroll } from '@/hooks/useKeyboardFocusScroll';

export default function ResetPasswordScreen() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { scrollRef, onFocusField, scrollViewProps } = useKeyboardFocusScroll();
  const passwordRef = useRef<TextInput>(null);
  const confirmPasswordRef = useRef<TextInput>(null);
  const params = useLocalSearchParams<Record<string, string | string[]>>();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const passwordsMatch = password.length > 0 && password === confirmPassword;
  // A primitive string dependency — useLocalSearchParams() can return a new
  // object reference on every render, which would otherwise re-run the
  // effect below (and re-call Supabase with a single-use code) on every
  // unrelated re-render.
  const paramsKey = useMemo(() => {
    const entries = Array.from(flattenSearchParams(params).entries());
    entries.sort(([a], [b]) => a.localeCompare(b));
    return entries.map(([key, value]) => `${key}=${value}`).join('&');
  }, [params]);

  useEffect(() => {
    let cancelled = false;

    async function prepareReset() {
      try {
        setError('');
        // useLocalSearchParams() reflects the deep link that navigated here
        // just now, so it's always fresh. Linking.getInitialURL() only
        // returns a value on a true cold launch — if the app was already
        // running (e.g. testing this flow twice in the same session), it
        // returns null or a STALE URL from an earlier launch. Route params
        // must win; Linking only fills in keys they don't already have
        // (e.g. a #hash fragment a direct, non-website-mediated deep link
        // might carry).
        const authParams = flattenSearchParams(params);
        const liveUrl = await Linking.getInitialURL();
        if (liveUrl) {
          for (const [key, value] of readAuthParams(liveUrl).entries()) {
            if (!authParams.has(key)) authParams.set(key, value);
          }
        }
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
          if (!cancelled) {
            setError(t('auth.reset_password_invalid_link'));
          }
          return;
        }

        if (!cancelled) {
          setReady(true);
        }
      } catch (exchangeError) {
        if (!cancelled) {
          // Supabase's own wording for an already-used or expired link always
          // mentions "invalid"/"expired" — map that case to our translated
          // copy. Anything else (a genuinely unexpected error) falls back to
          // Supabase's raw English message rather than mistranslating it.
          const rawMessage = exchangeError instanceof Error ? exchangeError.message : '';
          setError(
            isExpiredOrInvalidLinkError(rawMessage)
              ? t('auth.reset_password_invalid_link')
              : rawMessage || t('auth.reset_password_generic_error'),
          );
        }
      }
    }

    void prepareReset();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramsKey]);

  async function handleSubmit() {
    try {
      setLoading(true);
      setError('');
      setMessage('');

      if (!passwordsMatch) {
        throw new Error(t('auth.passwords_mismatch'));
      }

      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        throw updateError;
      }

      setMessage(t('auth.reset_password_success'));
      await supabase.auth.signOut();

      setTimeout(() => {
        router.replace('/(auth)/login?reset=1');
      }, 1200);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t('auth.reset_password_generic_error'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[
          styles.content,
          { paddingTop: Math.max(insets.top, 18) + 10, paddingBottom: Math.max(insets.bottom, 18) + 32 },
        ]}
        showsVerticalScrollIndicator={false}
        {...scrollViewProps}>
        <Pressable style={styles.backButton} onPress={() => router.replace('/(auth)/login')}>
          <Ionicons name="arrow-back" size={22} color="#111217" />
        </Pressable>

        <View style={styles.logoWrap}>
          <BrandMark size="md" />
        </View>

        <View style={styles.card}>
          <Text style={styles.heading}>{t('auth.reset_password_heading')}</Text>
          <Text style={styles.copy}>{t('auth.reset_password_copy')}</Text>

          {message ? <Text style={styles.success}>{message}</Text> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TextInput
            ref={passwordRef}
            style={styles.input}
            placeholder={t('auth.reset_password_new_password_placeholder')}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            value={password}
            onChangeText={setPassword}
            onFocus={onFocusField(passwordRef)}
            returnKeyType="next"
            onSubmitEditing={() => confirmPasswordRef.current?.focus()}
          />
          <PasswordStrengthMeter password={password} />

          <TextInput
            ref={confirmPasswordRef}
            style={styles.input}
            placeholder={t('auth.password_confirm_placeholder')}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            onFocus={onFocusField(confirmPasswordRef)}
            returnKeyType="done"
            onSubmitEditing={() => Keyboard.dismiss()}
          />

          {confirmPassword && !passwordsMatch ? <Text style={styles.error}>{t('auth.passwords_mismatch')}</Text> : null}

          <Pressable
            style={[styles.primaryButton, { backgroundColor: PRIMARY_COLOR }, loading || !ready || !passwordsMatch ? styles.primaryButtonDisabled : null]}
            onPress={() => void handleSubmit()}
            disabled={loading || !ready || !passwordsMatch}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>{t('auth.reset_password_button')}</Text>}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function isExpiredOrInvalidLinkError(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes('expired') || normalized.includes('invalid');
}

function flattenSearchParams(params: Record<string, string | string[]>): Map<string, string> {
  const map = new Map<string, string>();

  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      if (value.length > 0) map.set(key, value[value.length - 1]);
    } else if (value) {
      map.set(key, value);
    }
  }

  return map;
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
    // No flexGrow — it stretches the content container to exactly fill the
    // visible frame whenever the form is shorter than the screen, leaving
    // zero scrollable overflow for useKeyboardFocusScroll to scroll into.
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
  primaryButtonDisabled: {
    opacity: 0.62,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
});
