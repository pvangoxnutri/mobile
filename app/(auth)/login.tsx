import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
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
import { useAuth } from '@/components/auth-provider';
import { useI18n, type AppLanguage } from '@/components/i18n-provider';
import LanguagePicker from '@/components/language-picker';
import { supabase } from '@/lib/supabase';

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const { signIn, signUp, refreshProfile } = useAuth();
  const { language, setLanguage, t } = useI18n();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ reset?: string }>();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<AppLanguage>(language);

  useEffect(() => {
    setSelectedLanguage(language);
  }, [language]);

  const cooldownSeconds = cooldownUntil ? Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000)) : 0;

  useEffect(() => {
    if (!cooldownUntil || cooldownSeconds <= 0) {
      return;
    }

    const interval = setInterval(() => {
      if (cooldownUntil <= Date.now()) {
        setCooldownUntil(null);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [cooldownSeconds, cooldownUntil]);

  async function handleSubmit() {
    try {
      setBusy(true);
      setError('');
      setNotice('');

      if (mode === 'signin') {
        const profile = await signIn(email.trim(), password);
        router.replace(profile && !profile.hasCompletedOnboarding ? '/onboarding' : '/(tabs)');
        return;
      }

      if (cooldownSeconds > 0) {
        setError(t('auth.wait_before_retry', { seconds: cooldownSeconds }));
        return;
      }

      await signUp(name.trim(), email.trim(), password, selectedLanguage);
      await setLanguage(selectedLanguage);
      setCooldownUntil(Date.now() + 60_000);
      setNotice(t('auth.notice_check_email'));
      setMode('signin');
    } catch (err) {
      const message = err instanceof Error ? err.message : t('auth.generic_error');
      if (mode === 'signup' && isRateLimitError(message)) {
        setCooldownUntil(Date.now() + 60_000);
        setError(t('auth.rate_limit'));
      } else {
        setError(message);
      }
    } finally {
      setBusy(false);
    }
  }

  const resetMessage = params.reset === '1' ? t('auth.reset_done') : '';

  async function handleGoogleLogin() {
    try {
      setGoogleBusy(true);
      setError('');
      setNotice('');

      const redirectTo = Linking.createURL('/auth-callback');
      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          skipBrowserRedirect: true,
        },
      });

      if (oauthError) {
        throw oauthError;
      }

      if (!data?.url) {
        throw new Error(t('auth.google_start_failed'));
      }

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

      if (result.type === 'cancel' || result.type === 'dismiss') {
        return;
      }

      if (result.type !== 'success') {
        throw new Error(t('auth.google_incomplete'));
      }

      const params = readAuthParams(result.url);
      const authError = params.get('error_description') ?? params.get('error');
      if (authError) {
        throw new Error(authError);
      }

      const access_token = params.get('access_token');
      const refresh_token = params.get('refresh_token');
      const code = params.get('code');

      if (access_token && refresh_token) {
        const { error: sessionError } = await supabase.auth.setSession({ access_token, refresh_token });
        if (sessionError) {
          throw sessionError;
        }
      } else if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          throw exchangeError;
        }
      } else {
        throw new Error(t('auth.google_session_incomplete'));
      }

      const profile = await refreshProfile();
      router.replace(profile && !profile.hasCompletedOnboarding ? '/onboarding' : '/(tabs)');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.google_failed'));
    } finally {
      setGoogleBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: Math.max(insets.top, 18) + 10, paddingBottom: Math.max(insets.bottom, 24) + 20 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
      <View style={styles.logoRow}>
        <BrandMark size="md" />
      </View>
      <Text style={styles.tagline}>{t('auth.tagline')}</Text>

      <View style={styles.card}>
        <Text style={styles.heading}>{mode === 'signin' ? t('auth.welcome') : t('auth.create_account')}</Text>
        <Text style={styles.formIntro}>
          {mode === 'signin'
            ? t('auth.intro_signin')
            : t('auth.intro_signup')}
        </Text>
        {mode === 'signup' ? (
          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>{t('auth.full_name')}</Text>
            <TextInput style={styles.input} placeholder={t('auth.full_name_placeholder')} value={name} onChangeText={setName} />
          </View>
        ) : null}
        {mode === 'signup' ? (
          <View style={styles.fieldBlock}>
            <LanguagePicker
              label={t('auth.language')}
              value={selectedLanguage}
              onChange={setSelectedLanguage}
              searchPlaceholder={language === 'sv' ? 'Sök språk' : 'Search language'}
            />
          </View>
        ) : null}
        <View style={styles.fieldBlock}>
          <Text style={styles.fieldLabel}>{t('auth.email')}</Text>
          <TextInput
            style={styles.input}
            placeholder={t('auth.email_placeholder')}
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
          />
        </View>
        <View style={styles.fieldBlock}>
          <Text style={styles.fieldLabel}>{t('auth.password')}</Text>
          <TextInput
            style={styles.input}
            placeholder={mode === 'signin' ? t('auth.password_signin_placeholder') : t('auth.password_signup_placeholder')}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
        </View>

        {resetMessage ? <Text style={styles.success}>{resetMessage}</Text> : null}
        {notice ? <Text style={styles.success}>{notice}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {mode === 'signup' && cooldownSeconds > 0 ? (
          <Text style={styles.cooldownText}>{t('auth.cooldown', { seconds: cooldownSeconds })}</Text>
        ) : null}

        <Pressable
          style={[styles.primaryButton, busy || (mode === 'signup' && cooldownSeconds > 0) ? styles.primaryButtonDisabled : null]}
          onPress={() => void handleSubmit()}
          disabled={busy || (mode === 'signup' && cooldownSeconds > 0)}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>{mode === 'signin' ? t('auth.btn_signin') : t('auth.btn_signup')}</Text>}
        </Pressable>

        {mode === 'signin' ? (
          <Pressable style={styles.secondaryButton} onPress={() => router.push('/forgot-password')}>
            <Text style={styles.forgotButtonText}>{t('auth.forgot_password')}</Text>
          </Pressable>
        ) : null}

        <Pressable style={styles.secondaryButton} onPress={() => setMode((current) => (current === 'signin' ? 'signup' : 'signin'))}>
          <Text style={styles.secondaryButtonText}>
            {mode === 'signin' ? t('auth.need_account') : t('auth.have_account')}
          </Text>
        </Pressable>

        <View style={styles.separatorRow}>
          <View style={styles.separatorLine} />
          <Text style={styles.separatorText}>OR</Text>
          <View style={styles.separatorLine} />
        </View>

        <Pressable style={styles.googleButton} onPress={() => void handleGoogleLogin()} disabled={busy || googleBusy}>
          {googleBusy ? (
            <ActivityIndicator color="#20222a" />
          ) : (
            <>
              <GoogleGlyph />
              <Text style={styles.googleButtonText}>{t('auth.continue_google')}</Text>
            </>
          )}
        </Pressable>
      </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function readAuthParams(url: string) {
  const [, queryPart = ''] = url.split('?');
  const [queryString, hashString = ''] = queryPart.split('#');
  const hashParams = new URLSearchParams(hashString);
  const queryParams = new URLSearchParams(queryString);

  if (hashParams.toString()) {
    return hashParams;
  }

  return queryParams;
}

function GoogleGlyph() {
  return (
    <View style={styles.googleGlyph}>
      <Text style={styles.googleGlyphBlue}>G</Text>
    </View>
  );
}

function isRateLimitError(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes('rate limit') || normalized.includes('too many requests') || normalized.includes('email rate limit');
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#fff7f8',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 28,
  },
  logoRow: {
    justifyContent: 'center',
  },
  tagline: {
    marginTop: 14,
    textAlign: 'center',
    color: '#8f94a2',
    fontSize: 17,
  },
  card: {
    marginTop: 30,
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
    fontSize: 24,
    fontWeight: '800',
    color: '#14161d',
    letterSpacing: -0.7,
    marginBottom: 10,
  },
  formIntro: {
    color: '#7d8491',
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 16,
  },
  fieldBlock: {
    marginBottom: 12,
  },
  fieldLabel: {
    color: '#4b515d',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3,
    marginBottom: 8,
  },
  input: {
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e4e7ee',
    backgroundColor: '#f9fafc',
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#14161d',
  },
  error: {
    color: '#d53d18',
    marginBottom: 10,
    lineHeight: 20,
  },
  success: {
    color: '#16734d',
    marginBottom: 10,
    lineHeight: 20,
  },
  primaryButton: {
    height: 52,
    borderRadius: 16,
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
  cooldownText: {
    color: '#8e5563',
    marginBottom: 10,
    lineHeight: 20,
  },
  secondaryButton: {
    marginTop: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  secondaryButtonText: {
    color: '#6c7280',
    fontSize: 14,
    fontWeight: '600',
  },
  forgotButtonText: {
    color: '#ff4f74',
    fontSize: 14,
    fontWeight: '700',
  },
  separatorRow: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  separatorLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#ececf0',
  },
  separatorText: {
    color: '#a8acb7',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
  },
  googleButton: {
    marginTop: 16,
    height: 54,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e8ebf1',
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  googleButtonText: {
    color: '#20222a',
    fontSize: 15,
    fontWeight: '700',
  },
  googleGlyph: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleGlyphBlue: {
    color: '#4285F4',
    fontSize: 18,
    fontWeight: '900',
  },
});
