import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
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
import { getPasswordResetRedirectUrl } from '@/lib/auth-redirect';
import { supabase } from '@/lib/supabase';
import { PRIMARY_COLOR } from '@/constants/colors';
import { useKeyboardFocusScroll } from '@/hooks/useKeyboardFocusScroll';

export default function ForgotPasswordScreen() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { scrollRef, onFocusField, scrollViewProps } = useKeyboardFocusScroll();
  const emailRef = useRef<TextInput>(null);
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);

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
      setLoading(true);
      setError('');
      setMessage('');

      if (cooldownSeconds > 0) {
        setError(t('auth.forgot_password_wait_before_retry', { seconds: cooldownSeconds }));
        return;
      }

      const redirectTo = getPasswordResetRedirectUrl();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        redirectTo ? { redirectTo } : undefined
      );

      if (resetError) {
        throw resetError;
      }

      setCooldownUntil(Date.now() + 60_000);
      setMessage(t('auth.forgot_password_success'));
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : t('auth.forgot_password_generic_error');
      if (isRateLimitError(message)) {
        setCooldownUntil(Date.now() + 60_000);
        setError(t('auth.forgot_password_rate_limit'));
      } else {
        setError(message);
      }
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
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color="#111217" />
        </Pressable>

        <View style={styles.logoWrap}>
          <BrandMark size="md" />
        </View>

        <View style={styles.card}>
          <Text style={styles.heading}>{t('auth.forgot_password_heading')}</Text>
          <Text style={styles.copy}>{t('auth.forgot_password_copy')}</Text>

          {message ? <Text style={styles.success}>{message}</Text> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {cooldownSeconds > 0 ? (
            <Text style={styles.cooldownText}>{t('auth.forgot_password_cooldown', { seconds: cooldownSeconds })}</Text>
          ) : null}

          <TextInput
            ref={emailRef}
            style={styles.input}
            placeholder={t('auth.forgot_password_email_placeholder')}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            value={email}
            onChangeText={setEmail}
            onFocus={onFocusField(emailRef)}
            returnKeyType="done"
            onSubmitEditing={() => Keyboard.dismiss()}
          />

          <Pressable
            style={[styles.primaryButton, { backgroundColor: PRIMARY_COLOR }, loading || cooldownSeconds > 0 ? styles.primaryButtonDisabled : null]}
            onPress={() => void handleSubmit()}
            disabled={loading || cooldownSeconds > 0}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>{t('auth.forgot_password_send_button')}</Text>}
          </Pressable>
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
  cooldownText: {
    marginTop: 12,
    color: '#8e5563',
    lineHeight: 20,
  },
});
