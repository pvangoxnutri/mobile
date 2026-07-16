/**
 * Invite deep-link screen — opened by https://sidequesttravel.app/invite/CODE
 * (universal/app link) or sidequest://invite/CODE from the invite web page.
 *
 * Signed in  → confirm-and-join card; joining navigates straight into the trip.
 * Signed out → sign-in prompt; the code is stashed in AsyncStorage and the
 *              home screen redeems it right after login/onboarding, so the
 *              invite survives the auth detour (most invitees are new users).
 */
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import BrandMark from '@/components/brand-mark';
import { useAuth } from '@/components/auth-provider';
import { useI18n } from '@/components/i18n-provider';
import { useTheme } from '@/components/theme-provider';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { AppTheme } from '@/constants/themes';
import { apiFetch } from '@/lib/api';
import { setPendingInviteCode } from '@/lib/pending-invite';

export default function InviteScreen() {
  const { t } = useI18n();
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { code } = useLocalSearchParams<{ code: string }>();
  const inviteCode = (code ?? '').trim().toUpperCase();

  const [joining, setJoining] = useState(false);
  const [result, setResult] = useState<'already_member' | 'invalid' | 'error' | null>(null);

  async function handleJoin() {
    if (!inviteCode || joining) return;
    setJoining(true);
    setResult(null);
    try {
      const res = await apiFetch('/api/trips/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: inviteCode }),
      });
      if (res.status === 409) {
        setResult('already_member');
        return;
      }
      if (res.status === 404 || res.status === 400) {
        setResult('invalid');
        return;
      }
      if (!res.ok) {
        setResult('error');
        return;
      }
      const joined = (await res.json()) as { tripId?: string };
      if (joined.tripId) {
        router.replace(`/trip/${joined.tripId}`);
      } else {
        router.replace('/(tabs)');
      }
    } catch {
      setResult('error');
    } finally {
      setJoining(false);
    }
  }

  async function handleSignIn() {
    // Redeemed by the home screen after login/onboarding completes.
    await setPendingInviteCode(inviteCode);
    router.replace('/(auth)/login');
  }

  const resultText =
    result === 'already_member' ? t('invite.alreadyMember')
    : result === 'invalid' ? t('invite.invalidCode')
    : result === 'error' ? t('invite.error')
    : null;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 24, paddingBottom: Math.max(insets.bottom, 24) }]}>
      {/* Host surface follows the theme → the wordmark needs its adaptive
          (white-on-dark) rendition. */}
      <BrandMark size="sm" tone="adaptive" />

      <View style={styles.card}>
        <View style={styles.iconCircle}>
          <Ionicons name="mail-open-outline" size={34} color={theme.colors.primary} />
        </View>
        <Text style={styles.title}>{t('invite.title')}</Text>
        <Text style={styles.subtitle}>{t('invite.subtitle')}</Text>

        {inviteCode ? (
          <View style={styles.codePill}>
            <Text style={styles.codeLabel}>{t('invite.codeLabel')}</Text>
            <Text style={styles.codeValue}>{inviteCode}</Text>
          </View>
        ) : null}

        {resultText ? <Text style={[styles.resultText, result !== 'already_member' ? styles.resultTextError : null]}>{resultText}</Text> : null}

        {user ? (
          result === 'already_member' || result === 'invalid' ? (
            <TouchableOpacity style={styles.primaryButton} activeOpacity={0.85} onPress={() => router.replace('/(tabs)')}>
              <Text style={styles.primaryButtonText}>{t('invite.goHome')}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.primaryButton, joining && { opacity: 0.7 }]}
              activeOpacity={0.85}
              disabled={joining || !inviteCode}
              onPress={() => void handleJoin()}>
              {joining ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.primaryButtonText}>{t('invite.join')}</Text>
              )}
            </TouchableOpacity>
          )
        ) : (
          <>
            <Text style={styles.signInHint}>{t('invite.signInFirst')}</Text>
            <TouchableOpacity style={styles.primaryButton} activeOpacity={0.85} onPress={() => void handleSignIn()}>
              <Text style={styles.primaryButtonText}>{t('invite.signIn')}</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  screen: {
    flex: 1,
    // Warm parchment welcome surface in light (exact pre-theming value);
    // the standard page background in dark.
    backgroundColor: theme.isDark ? theme.colors.bgPrimary : '#F7F3EC',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    marginTop: 32,
    borderRadius: 28,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: theme.isDark ? StyleSheet.hairlineWidth : 0,
    borderColor: theme.colors.borderPrimary,
    paddingHorizontal: 24,
    paddingVertical: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: theme.isDark ? 0.4 : 0.08,
    shadowRadius: 22,
    elevation: theme.isDark ? 0 : 5,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: theme.colors.primaryLight12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  title: {
    fontSize: 26,
    fontWeight: '900',
    color: theme.isDark ? theme.colors.textPrimary : '#141720',
    letterSpacing: -0.6,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: theme.isDark ? theme.colors.textSecondary : '#6B7280',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 20,
  },
  codePill: {
    alignItems: 'center',
    borderRadius: 16,
    backgroundColor: theme.isDark ? theme.colors.bgLight : '#F5F6FA',
    paddingHorizontal: 22,
    paddingVertical: 12,
    marginBottom: 20,
  },
  codeLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.isDark ? theme.colors.textMeta : '#9AA2AE',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  codeValue: {
    fontSize: 22,
    fontWeight: '900',
    color: theme.isDark ? theme.colors.textPrimary : '#141720',
    letterSpacing: 3,
  },
  resultText: {
    fontSize: 14,
    color: theme.isDark ? theme.colors.textSecondary : '#6B7280',
    textAlign: 'center',
    marginBottom: 16,
  },
  // Invalid/expired/error outcomes read as semantic errors in dark, where
  // the neutral gray would understate them; light keeps its original quiet
  // gray treatment.
  resultTextError: {
    color: theme.isDark ? theme.colors.error : '#6B7280',
  },
  signInHint: {
    fontSize: 14,
    color: theme.isDark ? theme.colors.textSecondary : '#6B7280',
    textAlign: 'center',
    marginBottom: 16,
  },
  primaryButton: {
    minWidth: 220,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    backgroundColor: theme.colors.primary,
    paddingVertical: 15,
    paddingHorizontal: 28,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
});
