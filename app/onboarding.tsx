import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/components/auth-provider';
import { useI18n, type AppLanguage } from '@/components/i18n-provider';
import LanguagePicker from '@/components/language-picker';
import { apiFetch } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { PRIMARY_COLOR, PRIMARY_08 } from '@/constants/colors';

// ─── Constants ────────────────────────────────────────────────────────────────

const TOTAL_STEPS = 2;

// Values are stored on the backend so they stay in English; only the display
// label is run through i18n.
const FOUND_VIA: { value: string; labelKey: string }[] = [
  { value: 'Friend', labelKey: 'onboarding.foundVia.friend' },
  { value: 'TikTok', labelKey: 'onboarding.foundVia.tiktok' },
  { value: 'Instagram', labelKey: 'onboarding.foundVia.instagram' },
  { value: 'App Store', labelKey: 'onboarding.foundVia.appStore' },
  { value: 'Other', labelKey: 'onboarding.foundVia.other' },
];

const PURPOSES: { value: string; labelKey: string; emoji: string }[] = [
  { value: 'plan_trips', labelKey: 'onboarding.purpose.planTrips', emoji: '✈️' },
  { value: 'surprise', labelKey: 'onboarding.purpose.surprise', emoji: '🎁' },
  { value: 'discover', labelKey: 'onboarding.purpose.discover', emoji: '🌍' },
  { value: 'work', labelKey: 'onboarding.purpose.work', emoji: '💼' },
  { value: 'exploring', labelKey: 'onboarding.purpose.exploring', emoji: '🧭' },
  { value: 'other', labelKey: 'onboarding.purpose.other', emoji: '✨' },
];

// ─── Main Component ───────────────────────────────────────────────────────────

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { refreshProfile, user } = useAuth();
  const { language, setLanguage, t } = useI18n();

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const progressAnim = useRef(new Animated.Value(1)).current;

  async function handleLanguageChange(next: AppLanguage) {
    await setLanguage(next);
    await supabase.auth.updateUser({ data: { language: next } }).catch(() => {});
  }

  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);

  // Step 1 state
  const [foundVia, setFoundVia] = useState<string | null>(null);
  const [purpose, setPurpose] = useState<string | null>(null);
  const [purposeOther, setPurposeOther] = useState('');

  // Step 2 state
  const [bio, setBio] = useState(user?.bio ?? '');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.avatarUrl ?? null);
  const [uploadBusy, setUploadBusy] = useState(false);

  // Animate progress bar when step changes
  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: step,
      duration: 320,
      useNativeDriver: false,
    }).start();
  }, [step, progressAnim]);

  function changeStep(next: number) {
    Animated.timing(fadeAnim, { toValue: 0, duration: 120, useNativeDriver: true }).start(() => {
      setStep(next);
      Animated.timing(fadeAnim, { toValue: 1, duration: 240, useNativeDriver: true }).start();
    });
  }

  async function handleAvatarPick() {
    try {
      setUploadBusy(true);
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) return;

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });

      if (result.canceled || !result.assets[0]) return;

      const asset = result.assets[0];
      const formData = new FormData();
      formData.append('file', {
        uri: asset.uri,
        name: asset.fileName ?? `avatar-${Date.now()}.jpg`,
        type: asset.mimeType ?? 'image/jpeg',
      } as unknown as Blob);

      const uploadRes = await apiFetch('/api/images/upload', { method: 'POST', body: formData });
      if (!uploadRes.ok) return;

      const { url } = (await uploadRes.json()) as { url: string };
      setAvatarUrl(url);
    } finally {
      setUploadBusy(false);
    }
  }

  async function finish(skip = false) {
    setBusy(true);
    try {
      const payload: Record<string, unknown> = { hasCompletedOnboarding: true };

      // Always save whatever has been filled in, regardless of skip
      if (foundVia) payload.foundVia = foundVia;
      if (purpose) payload.purpose = purpose;
      if (purpose === 'other' && purposeOther.trim()) payload.purposeOtherText = purposeOther.trim();

      // Only save step 2 data if we actually reached step 2 (or finished it)
      if (!skip || step === 2) {
        if (bio.trim()) payload.bio = bio.trim();
        if (avatarUrl) payload.avatarUrl = avatarUrl;
      }

      await apiFetch('/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      await refreshProfile();
    } catch {
      // navigate anyway — don't block the user
    } finally {
      setBusy(false);
    }
    router.replace('/(tabs)');
  }

  const initials = getInitials(user?.name);

  const progressWidth = progressAnim.interpolate({
    inputRange: [1, TOTAL_STEPS],
    outputRange: ['33.3%', '100%'],
  });

  return (
    <>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
      <KeyboardAvoidingView style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* ── Top bar ─────────────────────────────────────── */}
        <View style={styles.topBar}>
          <View style={styles.stepPill}>
            <Text style={styles.stepPillText}>
              {t('onboarding.stepOf', { current: step, total: TOTAL_STEPS })}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => void finish(true)}
            disabled={busy}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.skipText}>{t('onboarding.skip')}</Text>
          </TouchableOpacity>
        </View>

        {/* ── Language ────────────────────────────────────── */}
        <View style={styles.languageRow}>
          <LanguagePicker
            label={t('auth.language')}
            value={language}
            onChange={(next) => void handleLanguageChange(next)}
            searchPlaceholder={language === 'sv' ? 'Sök språk' : 'Search language'}
          />
        </View>

        {/* ── Progress bar ────────────────────────────────── */}
        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressFill, { width: progressWidth, backgroundColor: PRIMARY_COLOR }]} />
        </View>

        {/* ── Step content ────────────────────────────────── */}
        <Animated.View style={[styles.contentWrap, { opacity: fadeAnim }]}>
          <ScrollView
            contentContainerStyle={[styles.scrollContent, { paddingBottom: 32 }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled">
            {step === 1 && (
              <StepDiscovery
                foundVia={foundVia}
                setFoundVia={setFoundVia}
                purpose={purpose}
                setPurpose={setPurpose}
                purposeOther={purposeOther}
                setPurposeOther={setPurposeOther}
                t={t}
              />
            )}
            {step === 2 && (
              <StepProfile
                bio={bio}
                setBio={setBio}
                avatarUrl={avatarUrl}
                initials={initials}
                uploadBusy={uploadBusy}
                onPickAvatar={() => void handleAvatarPick()}
                t={t}
              />
            )}
          </ScrollView>
        </Animated.View>

        {/* ── Footer button ───────────────────────────────── */}
        <View style={styles.footer}>
          <Pressable
            style={({ pressed }) => [styles.nextButton, { backgroundColor: PRIMARY_COLOR, shadowColor: PRIMARY_COLOR }, pressed && styles.nextButtonPressed]}
            disabled={busy}
            onPress={() => (step < TOTAL_STEPS ? changeStep(step + 1) : void finish(false))}>
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.nextButtonText}>
                {step < TOTAL_STEPS ? `${t('onboarding.next')}  →` : `${t('onboarding.finish')}  ✓`}
              </Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </>
  );
}

// ─── Step 1: Discovery ────────────────────────────────────────────────────────

function StepDiscovery({
  foundVia,
  setFoundVia,
  purpose,
  setPurpose,
  purposeOther,
  setPurposeOther,
  t,
}: {
  foundVia: string | null;
  setFoundVia: (v: string | null) => void;
  purpose: string | null;
  setPurpose: (v: string | null) => void;
  purposeOther: string;
  setPurposeOther: (v: string) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  return (
    <View>
      <Text style={styles.stepHeading}>{t('onboarding.discovery.heading')} 👋</Text>
      <Text style={styles.stepSubtitle}>{t('onboarding.discovery.subtitle')}</Text>

      <View style={styles.chipRow}>
        {FOUND_VIA.map((opt) => (
          <TouchableOpacity
            key={opt.value}
            style={[styles.chip, foundVia === opt.value && { borderColor: PRIMARY_COLOR, backgroundColor: PRIMARY_08 }]}
            activeOpacity={0.75}
            onPress={() => setFoundVia(foundVia === opt.value ? null : opt.value)}>
            <Text style={[styles.chipText, foundVia === opt.value && { color: PRIMARY_COLOR, fontWeight: '700' }]}>{t(opt.labelKey)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.sectionDivider} />

      <Text style={styles.sectionLabel}>{t('onboarding.purpose.heading')}</Text>
      <View style={styles.purposeGrid}>
        {PURPOSES.map((opt) => (
          <TouchableOpacity
            key={opt.value}
            style={[styles.purposeCard, purpose === opt.value && { borderColor: PRIMARY_COLOR, backgroundColor: PRIMARY_08 }]}
            activeOpacity={0.78}
            onPress={() => setPurpose(purpose === opt.value ? null : opt.value)}>
            <Text style={styles.purposeEmoji}>{opt.emoji}</Text>
            <Text style={[styles.purposeLabel, purpose === opt.value && { color: PRIMARY_COLOR }]}>
              {t(opt.labelKey)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {purpose === 'other' ? (
        <TextInput
          style={styles.otherInput}
          placeholder={t('onboarding.purpose.otherPlaceholder')}
          placeholderTextColor="#b2b7c2"
          value={purposeOther}
          onChangeText={setPurposeOther}
        />
      ) : null}
    </View>
  );
}

// ─── Step 2: Profile ─────────────────────────────────────────────────────────

function StepProfile({
  bio,
  setBio,
  avatarUrl,
  initials,
  uploadBusy,
  onPickAvatar,
  t,
}: {
  bio: string;
  setBio: (v: string) => void;
  avatarUrl: string | null;
  initials: string;
  uploadBusy: boolean;
  onPickAvatar: () => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  return (
    <View>
      <Text style={styles.stepHeading}>{t('onboarding.profile.heading')} 🙌</Text>
      <Text style={styles.stepSubtitle}>{t('onboarding.profile.subtitle')}</Text>

      {/* Avatar upload */}
      <View style={styles.avatarSection}>
        <TouchableOpacity style={[styles.avatarRing, { borderColor: PRIMARY_COLOR }]} activeOpacity={0.82} onPress={onPickAvatar}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={styles.avatar}>
              <Text style={styles.avatarInitials}>{initials}</Text>
            </View>
          )}
          <View style={[styles.avatarCamera, { backgroundColor: PRIMARY_COLOR }]}>
            {uploadBusy ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="camera" size={17} color="#fff" />
            )}
          </View>
        </TouchableOpacity>
        <Text style={styles.avatarHint}>{t('onboarding.profile.avatarHint')}</Text>
      </View>

      {/* Bio input */}
      <View style={styles.bioBlock}>
        <Text style={styles.bioLabel}>{t('onboarding.profile.bioLabel')}</Text>
        <TextInput
          style={styles.bioInput}
          placeholder={t('onboarding.profile.bioPlaceholder')}
          placeholderTextColor="#b2b7c2"
          value={bio}
          onChangeText={setBio}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />
        <Text style={styles.bioOptional}>{t('onboarding.profile.bioOptional')}</Text>
      </View>
    </View>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name?: string | null) {
  if (!name) return 'SQ';
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase()).join('') || 'SQ';
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#fff',
  },

  // ─ Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingTop: 14,
    paddingBottom: 10,
  },
  stepPill: {
    backgroundColor: '#f3f4f8',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  stepPillText: {
    color: '#5c6270',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  skipText: {
    color: '#9499a5',
    fontSize: 15,
    fontWeight: '700',
  },

  // ─ Progress
  languageRow: {
    paddingHorizontal: 22,
    paddingTop: 6,
    paddingBottom: 14,
  },
  progressTrack: {
    height: 3,
    backgroundColor: '#eef0f4',
    marginHorizontal: 22,
    borderRadius: 2,
    marginBottom: 4,
  },
  progressFill: {
    height: 3,
    backgroundColor: PRIMARY_COLOR,
    borderRadius: 2,
  },

  // ─ Content
  contentWrap: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 22,
    paddingTop: 26,
  },

  // ─ Footer
  footer: {
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: '#f0f2f6',
  },
  nextButton: {
    height: 56,
    borderRadius: 18,
    backgroundColor: PRIMARY_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: PRIMARY_COLOR,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
    elevation: 6,
  },
  nextButtonPressed: {
    opacity: 0.88,
  },
  nextButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },

  // ─ Step headings
  stepHeading: {
    fontSize: 28,
    fontWeight: '900',
    color: '#111317',
    letterSpacing: -1,
    marginBottom: 6,
  },
  stepSubtitle: {
    color: '#79808c',
    fontSize: 16,
    lineHeight: 23,
    marginBottom: 28,
  },

  // ─ Step 1: chips
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 4,
  },
  chip: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: '#e2e5ee',
    backgroundColor: '#fafbfc',
  },
  chipSelected: {
    borderColor: PRIMARY_COLOR,
    backgroundColor: PRIMARY_08,
  },
  chipText: {
    color: '#4b515e',
    fontSize: 14,
    fontWeight: '600',
  },
  chipTextSelected: {
    color: PRIMARY_COLOR,
    fontWeight: '700',
  },
  sectionDivider: {
    height: 1,
    backgroundColor: '#f0f2f6',
    marginVertical: 24,
  },
  sectionLabel: {
    color: '#111317',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 16,
  },

  // ─ Step 1: purpose cards
  purposeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  purposeCard: {
    width: '47%',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#e2e5ee',
    backgroundColor: '#fafbfc',
    paddingVertical: 18,
    paddingHorizontal: 16,
  },
  purposeCardSelected: {
    borderColor: PRIMARY_COLOR,
    backgroundColor: PRIMARY_08,
  },
  purposeEmoji: {
    fontSize: 28,
    marginBottom: 10,
  },
  purposeLabel: {
    color: '#2a2f3e',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  purposeLabelSelected: {
    color: PRIMARY_COLOR,
  },
  otherInput: {
    marginTop: 16,
    height: 50,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#e2e5ee',
    backgroundColor: '#fafbfc',
    paddingHorizontal: 16,
    fontSize: 15,
    color: '#1b1e28',
  },

  // ─ Step 2: themes
  themeLoading: {
    marginTop: 40,
    alignItems: 'center',
  },
  themeList: {
    gap: 16,
  },
  themeCard: {
    borderRadius: 22,
    borderWidth: 2,
    borderColor: '#e2e5ee',
    backgroundColor: '#fafbfc',
    overflow: 'hidden',
  },
  themeCardSelected: {
    borderColor: PRIMARY_COLOR,
    backgroundColor: '#fff',
  },
  themeColorStrip: {
    flexDirection: 'row',
    height: 90,
  },
  themeColorBlock: {
    flex: 1,
  },
  themeMockup: {
    flex: 1.4,
    justifyContent: 'center',
    paddingHorizontal: 14,
    gap: 8,
  },
  themeMockupBar: {
    height: 9,
    borderRadius: 5,
  },
  themeMockupDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    marginTop: 2,
  },
  themeCardInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  themeSwatchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  themeSwatch: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  themeNameBlock: {
    flex: 1,
    paddingLeft: 4,
  },
  themeName: {
    color: '#111317',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  themeColorCodes: {
    color: '#9499a6',
    fontSize: 11,
    marginTop: 2,
    letterSpacing: 0.2,
  },
  themeCheck: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: PRIMARY_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
  },
  themeCheckEmpty: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#d8dbe6',
  },
  themeHint: {
    marginTop: 16,
    color: '#a8adb8',
    fontSize: 13,
    textAlign: 'center',
  },

  // ─ Step 3: profile
  avatarSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  avatarRing: {
    width: 124,
    height: 124,
    borderRadius: 62,
    borderWidth: 3,
    borderColor: PRIMARY_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: '#d8c1a3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -0.8,
  },
  avatarCamera: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: PRIMARY_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: '#fff',
  },
  avatarHint: {
    marginTop: 12,
    color: '#8a909e',
    fontSize: 14,
  },
  bioBlock: {
    gap: 0,
  },
  bioLabel: {
    color: '#111317',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginBottom: 10,
  },
  bioInput: {
    minHeight: 110,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#e2e5ee',
    backgroundColor: '#fafbfc',
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: '#1b1e28',
    lineHeight: 23,
  },
  bioOptional: {
    marginTop: 8,
    color: '#a6acb8',
    fontSize: 12,
  },
});
