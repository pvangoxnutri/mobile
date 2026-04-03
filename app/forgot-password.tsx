import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
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
import { getPasswordResetRedirectUrl, isExpoGo } from '@/lib/auth-redirect';
import { supabase } from '@/lib/supabase';

export default function ForgotPasswordScreen() {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);

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
      setLoading(true);
      setError('');
      setMessage('');

      if (cooldownSeconds > 0) {
        setError(`Please wait ${cooldownSeconds}s before sending another reset email.`);
        return;
      }

      const redirectTo = getPasswordResetRedirectUrl();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo,
      });

      if (resetError) {
        throw resetError;
      }

      setCooldownUntil(Date.now() + 60_000);
      setMessage('If that account exists, a reset link is on its way.');
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : 'Could not send reset email.';
      if (isRateLimitError(message)) {
        setCooldownUntil(Date.now() + 60_000);
        setError('Too many reset emails were requested. Wait a moment before trying again.');
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
        contentContainerStyle={[
          styles.content,
          { paddingTop: Math.max(insets.top, 18) + 10, paddingBottom: Math.max(insets.bottom, 24) + 20 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color="#111217" />
        </Pressable>

        <View style={styles.logoWrap}>
          <BrandMark size="md" />
        </View>

        <View style={styles.card}>
          <Text style={styles.heading}>Reset password</Text>
          <Text style={styles.copy}>Enter your email and we&apos;ll send you a link to choose a new password.</Text>
          {isExpoGo() ? (
            <Text style={styles.helper}>
              In Expo Go, the reset link needs a public web URL or a dev build. If the email still points to localhost, set `EXPO_PUBLIC_WEB_URL`.
            </Text>
          ) : null}

          {message ? <Text style={styles.success}>{message}</Text> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {cooldownSeconds > 0 ? (
            <Text style={styles.cooldownText}>You can request another reset link in {cooldownSeconds}s.</Text>
          ) : null}

          <TextInput
            style={styles.input}
            placeholder="Email address"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            value={email}
            onChangeText={setEmail}
          />

          <Pressable
            style={[styles.primaryButton, loading || cooldownSeconds > 0 ? styles.primaryButtonDisabled : null]}
            onPress={() => void handleSubmit()}
            disabled={loading || cooldownSeconds > 0}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Send reset link</Text>}
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
  helper: {
    marginTop: 10,
    color: '#a05a6a',
    fontSize: 13,
    lineHeight: 20,
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
