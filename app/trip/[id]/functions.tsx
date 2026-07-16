import { FontAwesome, Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import { useRef, useState } from 'react';
import {
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ModalSheet from '@/components/modal-sheet';
import { useI18n } from '@/components/i18n-provider';
import { useTheme } from '@/components/theme-provider';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { AppTheme } from '@/constants/themes';
import { apiFetch, apiJson } from '@/lib/api';

// Spotify's brand green — a deliberate third-party brand accent, identical in
// both themes (never remapped to the app's semantic success green).
const SPOTIFY_GREEN = '#1cb35b';

type TripData = { spotifyUrl?: string | null };

export default function FunctionsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useI18n();
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();

  const [spotifyUrl, setSpotifyUrl] = useState<string | null | undefined>(undefined);
  const [spotifyModalOpen, setSpotifyModalOpen] = useState(false);
  const [spotifyUrlDraft, setSpotifyUrlDraft] = useState('');
  const [spotifySaving, setSpotifySaving] = useState(false);
  const [spotifyMessage, setSpotifyMessage] = useState('');
  const spotifyUrlOpacityRef = useRef(new Animated.Value(0.5)).current;

  // Lazy-load spotify URL when opening the modal
  async function ensureSpotifyUrl() {
    if (spotifyUrl !== undefined) return;
    try {
      const trip = await apiJson<TripData>(`/api/trips/${id}`);
      setSpotifyUrl(trip.spotifyUrl ?? null);
    } catch {
      setSpotifyUrl(null);
    }
  }

  async function handleSaveTripSpotify(value: string | null) {
    try {
      setSpotifySaving(true);
      setSpotifyMessage('');
      const response = await apiFetch(`/api/trips/${id}/spotify`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(value && value.trim() ? { spotifyUrl: value.trim() } : { clearSpotifyUrl: true }),
      });
      if (!response.ok) throw new Error((await response.text()) || t('trip.error.spotifySaveFailed'));
      const updated = await response.json() as TripData;
      setSpotifyUrl(updated.spotifyUrl ?? null);
      setSpotifyUrlDraft(updated.spotifyUrl ?? '');
      setSpotifyModalOpen(false);
      setSpotifyMessage(updated.spotifyUrl ? t('trip.spotify.updated') : t('trip.spotify.removed'));
    } catch (err) {
      setSpotifyMessage(err instanceof Error ? err.message : t('trip.error.spotifySaveFailed'));
    } finally {
      setSpotifySaving(false);
    }
  }

  async function openSpotifyLink(url: string) {
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) await Linking.openURL(url);
  }

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 18) + 4 }]}>
        <TouchableOpacity style={styles.backButton} activeOpacity={0.88} onPress={() => router.back()}>
          {/* Light: exact pre-theming ink (#11131a, slightly deeper than textPrimary). */}
          <Ionicons name="arrow-back" size={24} color={theme.isDark ? theme.colors.textPrimary : '#11131a'} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('trip.functions.title')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 20) + 24 }]}
        showsVerticalScrollIndicator={false}>

        {/* Spotify card */}
        <View style={styles.featureCard}>
          <View style={styles.spotifyRowIcon}>
            <FontAwesome name="spotify" size={20} color={theme.colors.white} />
          </View>
          <View style={styles.featureCardBody}>
            <Text style={styles.featureCardTitle}>Spotify</Text>
            <Text style={styles.featureCardSubtitle}>
              {spotifyUrl ? t('trip.spotify.linked') : t('trip.spotify.notLinked')}
            </Text>
          </View>
          <View style={styles.featureCardActions}>
            {spotifyUrl ? (
              <>
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[styles.featureBtn, styles.featureBtnGreen]}
                  onPress={() => void openSpotifyLink(spotifyUrl)}>
                  <Ionicons name="play" size={11} color={SPOTIFY_GREEN} />
                  <Text style={styles.featureBtnGreenText}>{t('common.open')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[styles.featureBtn, styles.featureBtnGhost]}
                  onPress={() => {
                    setSpotifyUrlDraft(spotifyUrl ?? '');
                    setSpotifyMessage('');
                    setSpotifyModalOpen(true);
                  }}>
                  <Ionicons name="pencil" size={11} color={theme.colors.textPrimary} />
                  <Text style={styles.featureBtnGhostText}>{t('common.change')}</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                activeOpacity={0.85}
                style={[styles.featureBtn, styles.featureBtnGreen]}
                onPress={() => {
                  void ensureSpotifyUrl();
                  setSpotifyUrlDraft('');
                  setSpotifyMessage('');
                  setSpotifyModalOpen(true);
                }}>
                <Ionicons name="add" size={13} color={SPOTIFY_GREEN} />
                <Text style={styles.featureBtnGreenText}>{t('common.add')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
        {spotifyMessage ? <Text style={styles.featureMessage}>{spotifyMessage}</Text> : null}

        {/* Cost Split card */}
        <TouchableOpacity
          style={styles.featureCard}
          activeOpacity={0.86}
          onPress={() => router.push(`/trip/${id}/split`)}>
          {/* Light: exact pre-theming pink wash; dark: brand-pink tint token. */}
          <View style={[styles.featureIconCircle, { backgroundColor: theme.isDark ? theme.colors.primaryLight12 : '#fff0f4' }]}>
            <Ionicons name="calculator-outline" size={20} color={theme.colors.primary} />
          </View>
          <View style={styles.featureCardBody}>
            <Text style={styles.featureCardTitle}>{t('trip.costSplit')}</Text>
            <Text style={styles.featureCardSubtitle}>{t('trip.functions.costSplitSubtitle')}</Text>
          </View>
          {/* Light: exact pre-theming chevron gray (#b2b7c0, no matching token). */}
          <Ionicons name="chevron-forward" size={20} color={theme.isDark ? theme.colors.textMuted : '#b2b7c0'} />
        </TouchableOpacity>

        {/* Packing List card */}
        <TouchableOpacity
          style={styles.featureCard}
          activeOpacity={0.86}
          onPress={() => router.push(`/trip/${id}/packing-list`)}>
          {/* Deliberate packing-list blue accent (#3b82f6) — kept in both themes;
              light keeps its exact wash, dark gets the same blue as a tint. */}
          <View style={[styles.featureIconCircle, { backgroundColor: theme.isDark ? 'rgba(59,130,246,0.16)' : '#eef4ff' }]}>
            <Ionicons name="checkmark-done-outline" size={20} color="#3b82f6" />
          </View>
          <View style={styles.featureCardBody}>
            <Text style={styles.featureCardTitle}>{t('trip.packingList.title')}</Text>
            <Text style={styles.featureCardSubtitle}>{t('trip.functions.packingListSubtitle')}</Text>
          </View>
          {/* Light: exact pre-theming chevron gray (#b2b7c0, no matching token). */}
          <Ionicons name="chevron-forward" size={20} color={theme.isDark ? theme.colors.textMuted : '#b2b7c0'} />
        </TouchableOpacity>

      </ScrollView>

      {/* Spotify modal */}
      <ModalSheet visible={spotifyModalOpen} onClose={() => setSpotifyModalOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={[styles.sheetContent, { paddingBottom: Math.max(insets.bottom, 18) + 12 }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.sheetEyebrow}>{t('trip.sharedSpotifyEyebrow')}</Text>
                <Text style={styles.sheetTitle}>{t('trip.spotifyForEvent')}</Text>
              </View>
              <TouchableOpacity style={styles.sheetCloseButton} activeOpacity={0.88} onPress={() => setSpotifyModalOpen(false)}>
                <Ionicons name="close" size={20} color={theme.colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <View style={styles.spotifySheetBody}>
              <Text style={styles.spotifySheetCopy}>{t('trip.spotifyPasteHint')}</Text>
              <Animated.View style={{ opacity: spotifyUrlOpacityRef }}>
                <TextInput
                  value={spotifyUrlDraft}
                  onChangeText={setSpotifyUrlDraft}
                  onFocus={() => Animated.timing(spotifyUrlOpacityRef, { toValue: 1, duration: 300, useNativeDriver: false }).start()}
                  onBlur={() => Animated.timing(spotifyUrlOpacityRef, { toValue: 0.5, duration: 300, useNativeDriver: false }).start()}
                  placeholder="https://open.spotify.com/..."
                  // Light: exact pre-theming placeholder gray (#a3a9b4, no matching token).
                  placeholderTextColor={theme.isDark ? theme.colors.placeholderText : '#a3a9b4'}
                  keyboardAppearance={theme.keyboardAppearance}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  style={styles.spotifyInput}
                  returnKeyType="done"
                  onSubmitEditing={() => Keyboard.dismiss()}
                />
              </Animated.View>
              <View style={styles.spotifySheetButtons}>
                <TouchableOpacity activeOpacity={0.88} style={styles.spotifySheetSecondaryButton} onPress={() => void handleSaveTripSpotify(null)}>
                  <Text style={styles.spotifySheetSecondaryButtonText}>{t('common.remove')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.9}
                  style={[styles.spotifySheetPrimaryButton, spotifySaving ? styles.spotifySheetPrimaryButtonDisabled : null]}
                  disabled={spotifySaving}
                  onPress={() => void handleSaveTripSpotify(spotifyUrlDraft)}>
                  <Text style={styles.spotifySheetPrimaryButtonText}>
                    {spotifySaving ? t('trip.saving') : t('trip.saveLink')}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </ModalSheet>
    </View>
  );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  // Light literals below are the exact pre-theming values (several sit just
  // off the shared tokens — #f7f8fa page, #eceef2 hairlines, #11131a ink), so
  // they stay verbatim behind isDark ternaries instead of being remapped.
  screen: {
    flex: 1,
    backgroundColor: theme.isDark ? theme.colors.bgPrimary : '#f7f8fa',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: theme.isDark ? theme.colors.bgPrimary : '#f7f8fa',
    borderBottomWidth: 1,
    borderBottomColor: theme.isDark ? theme.colors.borderPrimary : '#eceef2',
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.isDark ? theme.colors.borderPrimary : '#eceef2',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '800',
    color: theme.isDark ? theme.colors.textPrimary : '#11131a',
    letterSpacing: -0.4,
  },
  headerSpacer: { width: 40 },
  content: { padding: 16, gap: 12 },
  featureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 22,
    // Light already draws a 1px #eceef2 border (cards on this screen are
    // border-defined, not shadow-defined), so only the color adapts in dark.
    borderWidth: 1,
    borderColor: theme.isDark ? theme.colors.borderPrimary : '#eceef2',
    backgroundColor: theme.colors.surface,
  },
  spotifyRowIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: SPOTIFY_GREEN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureCardBody: { flex: 1 },
  featureCardTitle: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  featureCardSubtitle: {
    marginTop: 2,
    // Light: exact pre-theming meta gray (#8a909d, one off the textMeta token).
    color: theme.isDark ? theme.colors.textMeta : '#8a909d',
    fontSize: 12.5,
    fontWeight: '600',
  },
  featureCardActions: { flexDirection: 'row', gap: 6 },
  featureBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  // Spotify-green chip: exact pre-theming mint in light; the same brand green
  // as a translucent tint on the dark card surface.
  featureBtnGreen: { backgroundColor: theme.isDark ? 'rgba(28,179,91,0.16)' : '#e7f8ef' },
  featureBtnGreenText: { color: SPOTIFY_GREEN, fontSize: 12, fontWeight: '800' },
  featureBtnGhost: {
    backgroundColor: theme.isDark ? theme.colors.surfaceElevated : '#fff',
    borderWidth: 1,
    // Light: exact pre-theming button hairline (#e4e7ee, no matching token).
    borderColor: theme.isDark ? theme.colors.borderInput : '#e4e7ee',
  },
  featureBtnGhostText: { color: theme.colors.textPrimary, fontSize: 12, fontWeight: '700' },
  featureMessage: {
    marginTop: -4,
    marginLeft: 6,
    fontSize: 12,
    // Confirmation-green: exact pre-theming deep green in light; the shared
    // semantic success green reads better on the dark page.
    color: theme.isDark ? theme.colors.success : '#4e8c6a',
    fontWeight: '600',
  },
  sheetContent: { paddingHorizontal: 20 },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2,
    // Light: exact pre-theming handle gray (#dde1e8, just off the sheetHandle token).
    backgroundColor: theme.isDark ? theme.colors.sheetHandle : '#dde1e8',
    alignSelf: 'center', marginBottom: 20,
  },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'flex-start',
    justifyContent: 'space-between', marginBottom: 18,
  },
  sheetEyebrow: {
    fontSize: 10, fontWeight: '800', letterSpacing: 1.2,
    // Light: exact pre-theming eyebrow gray (#a3a9b4, no matching token).
    color: theme.isDark ? theme.colors.textMeta : '#a3a9b4',
    textTransform: 'uppercase', marginBottom: 4,
  },
  sheetTitle: {
    fontSize: 22, fontWeight: '900',
    // Light: exact pre-theming sheet ink (#14161d, just off textPrimary).
    color: theme.isDark ? theme.colors.textPrimary : '#14161d',
    letterSpacing: -0.8,
  },
  sheetCloseButton: {
    width: 36, height: 36, borderRadius: 18,
    // Light: exact pre-theming pale circle (#f4f6fa, no matching token).
    backgroundColor: theme.isDark ? theme.colors.bgLight : '#f4f6fa',
    alignItems: 'center', justifyContent: 'center',
  },
  spotifySheetBody: { gap: 12 },
  spotifySheetCopy: {
    fontSize: 14,
    // Light: exact pre-theming body gray (#5c6370, no matching token).
    color: theme.isDark ? theme.colors.textSecondary : '#5c6370',
    lineHeight: 20,
  },
  spotifyInput: {
    height: 52, borderRadius: 18, borderWidth: 1,
    // Light: exact pre-theming warm input border/fill/ink (#eadfe3 / #fffdfd / #14161d).
    borderColor: theme.isDark ? theme.colors.borderInput : '#eadfe3',
    backgroundColor: theme.isDark ? theme.colors.bgLightest : '#fffdfd',
    paddingHorizontal: 16, fontSize: 15,
    color: theme.isDark ? theme.colors.textPrimary : '#14161d',
  },
  spotifySheetButtons: { flexDirection: 'row', gap: 10, marginTop: 4 },
  spotifySheetSecondaryButton: {
    flex: 1, height: 48, borderRadius: 14, borderWidth: 1.5,
    // Light: exact pre-theming button hairline (#e4e7ee, no matching token).
    borderColor: theme.isDark ? theme.colors.borderInput : '#e4e7ee',
    alignItems: 'center', justifyContent: 'center',
  },
  spotifySheetSecondaryButtonText: {
    fontSize: 14, fontWeight: '700',
    // Light: exact pre-theming label gray (#7b828e, no matching token).
    color: theme.isDark ? theme.colors.textSecondary : '#7b828e',
  },
  spotifySheetPrimaryButton: {
    flex: 2, height: 48, borderRadius: 14,
    backgroundColor: SPOTIFY_GREEN, alignItems: 'center', justifyContent: 'center',
  },
  spotifySheetPrimaryButtonDisabled: { opacity: 0.6 },
  // Stays white in both themes — label on the solid Spotify-green button.
  spotifySheetPrimaryButtonText: { fontSize: 15, fontWeight: '800', color: theme.colors.white },
});
