import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import * as WebBrowser from 'expo-web-browser';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
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
import PasswordStrengthMeter from '@/components/password-strength-meter';
import { supabase } from '@/lib/supabase';
import { PRIMARY_COLOR } from '@/constants/colors';
import { useKeyboardFocusScroll } from '@/hooks/useKeyboardFocusScroll';

export default function LoginScreen() {
  const { signIn, signUp } = useAuth();
  const { language, setLanguage, t } = useI18n();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ reset?: string }>();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<AppLanguage>(language);
  // Tracks whether the user explicitly changed the language on the login
  // screen. We only push the picker value to user_metadata when this is true,
  // so we don't overwrite a returning user's saved preference with the
  // device-locale default they never touched.
  const [userChangedLanguage, setUserChangedLanguage] = useState(false);
  const { scrollRef, onFocusField, scrollViewProps } = useKeyboardFocusScroll();
  const nameRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmPasswordRef = useRef<TextInput>(null);

  useEffect(() => {
    setSelectedLanguage(language);
  }, [language]);

  function handleLanguageChange(next: AppLanguage) {
    setSelectedLanguage(next);
    setUserChangedLanguage(true);
    void setLanguage(next);
  }

  // `now` exists purely to force a re-render every tick — cooldownSeconds is
  // derived from it instead of calling Date.now() straight in the render
  // body, which would only ever recompute when something else re-rendered
  // and otherwise just sit frozen until the cooldown silently expired.
  const [now, setNow] = useState(Date.now());
  const cooldownSeconds = cooldownUntil ? Math.max(0, Math.ceil((cooldownUntil - now) / 1000)) : 0;

  useEffect(() => {
    if (!cooldownUntil) {
      return;
    }

    const interval = setInterval(() => {
      if (cooldownUntil <= Date.now()) {
        setCooldownUntil(null);
      } else {
        setNow(Date.now());
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [cooldownUntil]);

  async function handleSubmit() {
    try {
      setBusy(true);
      setError('');
      setNotice('');

      if (mode === 'signin') {
        const profile = await signIn(email.trim(), password);
        if (userChangedLanguage) {
          // Persist the picker value to Supabase user_metadata so the
          // preference syncs across devices on the next sign-in.
          await supabase.auth.updateUser({ data: { language: selectedLanguage } }).catch(() => {});
          await setLanguage(selectedLanguage);
        }
        router.replace(profile && !profile.hasCompletedOnboarding ? '/onboarding' : '/(tabs)');
        return;
      }

      if (cooldownSeconds > 0) {
        setError(t('auth.wait_before_retry', { seconds: cooldownSeconds }));
        return;
      }

      // Name is what every social surface shows ("X gick med i resan",
      // chat, members) — an empty one cascades into blank names everywhere.
      if (name.trim() === '') {
        setError(t('auth.name_required'));
        return;
      }

      if (password !== confirmPassword) {
        setError(t('auth.passwords_mismatch'));
        return;
      }

      await signUp(name.trim(), email.trim(), password, selectedLanguage);
      await setLanguage(selectedLanguage);
      setCooldownUntil(Date.now() + 60_000);
      setNotice(t('auth.notice_check_email'));
      setMode('signin');
    } catch (err) {
      const message = err instanceof Error ? err.message : t('auth.generic_error');
      if (message === 'banned') {
        setError(t('auth.account_suspended'));
      } else if (mode === 'signup' && isRateLimitError(message)) {
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

  return (
    <KeyboardAvoidingView style={styles.screen} behavior="padding">
      <View style={styles.backgroundGlowTop} />
      <View style={styles.backgroundGlowBottom} />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: Math.max(insets.top, 18) + 24, paddingBottom: Math.max(insets.bottom, 18) + 32 },
        ]}
        showsVerticalScrollIndicator={false}
        {...scrollViewProps}>
      <View style={styles.hero}>
        <BrandMark size="md" />
        <Text style={styles.tagline}>{t('auth.tagline')}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.heading}>{mode === 'signin' ? t('auth.welcome') : t('auth.create_account')}</Text>
        <Text style={styles.formIntro}>
          {mode === 'signin'
            ? t('auth.intro_signin')
            : t('auth.intro_signup')}
        </Text>
        <View style={styles.fieldBlock}>
          <LanguagePicker
            label={t('auth.language')}
            value={selectedLanguage}
            onChange={handleLanguageChange}
          />
        </View>
        {mode === 'signup' ? (
          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>{t('auth.full_name')}</Text>
            <TextInput
              ref={nameRef}
              style={styles.input}
              placeholder={t('auth.full_name_placeholder')}
              value={name}
              onChangeText={setName}
              onFocus={onFocusField(nameRef)}
              returnKeyType="next"
              onSubmitEditing={() => emailRef.current?.focus()}
            />
          </View>
        ) : null}
        <View style={styles.fieldBlock}>
          <Text style={styles.fieldLabel}>{t('auth.email')}</Text>
          <TextInput
            ref={emailRef}
            style={styles.input}
            placeholder={t('auth.email_placeholder')}
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
            onFocus={onFocusField(emailRef)}
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
          />
        </View>
        <View style={styles.fieldBlock}>
          <Text style={styles.fieldLabel}>{t('auth.password')}</Text>
          <TextInput
            ref={passwordRef}
            style={styles.input}
            placeholder={mode === 'signin' ? t('auth.password_signin_placeholder') : t('auth.password_signup_placeholder')}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            // Explicit content types prevent the iOS QuickType "Use strong
            // password" suggestion from locking up the field after dismissal.
            // signin → fetch saved passwords; signup → new password slot so
            // Keychain can save it after sign-up.
            textContentType={mode === 'signin' ? 'password' : 'newPassword'}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            passwordRules={mode === 'signup' ? 'minlength: 6;' : undefined}
            value={password}
            onChangeText={setPassword}
            onFocus={onFocusField(passwordRef)}
            returnKeyType={mode === 'signup' ? 'next' : 'done'}
            onSubmitEditing={() => (mode === 'signup' ? confirmPasswordRef.current?.focus() : Keyboard.dismiss())}
          />
          {mode === 'signup' ? <PasswordStrengthMeter password={password} /> : null}
        </View>
        {mode === 'signup' ? (
          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>{t('auth.password_confirm')}</Text>
            <TextInput
              ref={confirmPasswordRef}
              style={styles.input}
              placeholder={t('auth.password_confirm_placeholder')}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="newPassword"
              autoComplete="new-password"
              passwordRules="minlength: 6;"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              onFocus={onFocusField(confirmPasswordRef)}
              returnKeyType="done"
              onSubmitEditing={() => Keyboard.dismiss()}
            />
          </View>
        ) : null}

        {resetMessage ? <Text style={styles.success}>{resetMessage}</Text> : null}
        {notice ? <Text style={styles.success}>{notice}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {mode === 'signup' && cooldownSeconds > 0 ? (
          <Text style={styles.cooldownText}>{t('auth.cooldown', { seconds: cooldownSeconds })}</Text>
        ) : null}

        {mode === 'signup' ? (
          <View style={styles.checkboxRow}>
            <Pressable
              style={[styles.checkbox, termsAccepted && styles.checkboxChecked]}
              onPress={() => setTermsAccepted((v) => !v)}
              hitSlop={8}>
              {termsAccepted ? <Ionicons name="checkmark" size={13} color="#fff" /> : null}
            </Pressable>
            <Text style={styles.checkboxLabel}>
              {t('auth.terms_agree_prefix')}{' '}
              <Text style={styles.legalLink} onPress={() => void WebBrowser.openBrowserAsync(`https://sidequesttravel.app/terms?lang=${selectedLanguage}`)}>
                {t('auth.terms_of_service')}
              </Text>
              {', '}
              <Text style={styles.legalLink} onPress={() => void WebBrowser.openBrowserAsync(`https://sidequesttravel.app/privacy?lang=${selectedLanguage}`)}>
                {t('auth.privacy_policy')}
              </Text>
              {' '}{t('auth.legal_consent_and')}{' '}
              <Text style={styles.legalLink} onPress={() => void WebBrowser.openBrowserAsync(`https://sidequesttravel.app/community-guidelines?lang=${selectedLanguage}`)}>
                {t('auth.community_guidelines')}
              </Text>
              {'.'}
            </Text>
          </View>
        ) : null}

        <Pressable
          style={[
            styles.primaryButton,
            { backgroundColor: PRIMARY_COLOR },
            busy || (mode === 'signup' && (cooldownSeconds > 0 || name.trim() === '' || password === '' || confirmPassword === '' || password !== confirmPassword || !termsAccepted))
              ? styles.primaryButtonDisabled
              : null,
          ]}
          onPress={() => void handleSubmit()}
          disabled={busy || (mode === 'signup' && (cooldownSeconds > 0 || name.trim() === '' || password === '' || confirmPassword === '' || password !== confirmPassword || !termsAccepted))}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>{mode === 'signin' ? t('auth.btn_signin') : t('auth.btn_signup')}</Text>}
        </Pressable>

        {mode === 'signin' ? (
          <Pressable style={styles.secondaryButton} onPress={() => router.push('/forgot-password')}>
            <Text style={[styles.forgotButtonText, { color: PRIMARY_COLOR }]}>{t('auth.forgot_password')}</Text>
          </Pressable>
        ) : null}

        <Pressable style={styles.secondaryButton} onPress={() => { setMode((current) => (current === 'signin' ? 'signup' : 'signin')); setTermsAccepted(false); }}>
          <Text style={styles.secondaryButtonText}>
            {mode === 'signin' ? t('auth.need_account') : t('auth.have_account')}
          </Text>
        </Pressable>

        {mode === 'signin' ? (
          <View style={styles.legalConsent}>
            <Text style={styles.legalConsentText}>
              {t('auth.legal_consent_prefix')}{' '}
              <Text style={styles.legalLink} onPress={() => void WebBrowser.openBrowserAsync(`https://sidequesttravel.app/privacy?lang=${selectedLanguage}`)}>
                {t('auth.privacy_policy')}
              </Text>
              {' '}{t('auth.legal_consent_and')}{' '}
              <Text style={styles.legalLink} onPress={() => void WebBrowser.openBrowserAsync(`https://sidequesttravel.app/terms?lang=${selectedLanguage}`)}>
                {t('auth.terms_of_service')}
              </Text>
              {'.'}
            </Text>
          </View>
        ) : null}
      </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function isRateLimitError(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes('rate limit') || normalized.includes('too many requests') || normalized.includes('email rate limit');
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#fffaf8',
  },
  backgroundGlowTop: {
    position: 'absolute',
    top: -140,
    left: -80,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: 'rgba(255, 109, 123, 0.14)',
  },
  backgroundGlowBottom: {
    position: 'absolute',
    right: -120,
    bottom: 80,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(13, 144, 168, 0.10)',
  },
  scrollContent: {
    // No flexGrow/justifyContent:center here — those stretch the content
    // container to exactly fill the visible frame whenever the form is
    // shorter than the screen, which leaves zero scrollable overflow for
    // useKeyboardFocusScroll to scroll into (matches the padding-only
    // pattern used by create-trip.tsx / sidequest-form.tsx).
    paddingHorizontal: 24,
  },
  hero: {
    alignItems: 'center',
    marginBottom: 18,
  },
  logoRow: {
    justifyContent: 'center',
  },
  tagline: {
    marginTop: 14,
    textAlign: 'center',
    color: '#7f8694',
    fontSize: 16,
    lineHeight: 24,
  },
  card: {
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderWidth: 1,
    borderColor: '#efe5e8',
    padding: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 30,
    elevation: 6,
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
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#eadfe3',
    backgroundColor: '#fffdfd',
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
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 14,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#d0d4dd',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  checkboxChecked: {
    borderColor: PRIMARY_COLOR,
    backgroundColor: PRIMARY_COLOR,
  },
  checkboxLabel: {
    flex: 1,
    color: '#4b515d',
    fontSize: 13,
    lineHeight: 20,
  },
  legalConsent: {
    marginTop: 18,
    paddingHorizontal: 8,
  },
  legalConsentText: {
    textAlign: 'center',
    color: '#8a909b',
    fontSize: 12,
    lineHeight: 18,
  },
  legalLink: {
    color: '#20222a',
    textDecorationLine: 'underline',
  },
});
