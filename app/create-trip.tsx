import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useMemo, useRef, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import RangeDatePicker, { formatRangeDisplay } from '@/components/range-date-picker';
import CountryPicker from '@/components/travel-tracker/country-picker';
import { useI18n } from '@/components/i18n-provider';
import { UnsavedChangesModal, useUnsavedChanges } from '@/components/unsaved-changes';
import { useAuth } from '@/components/auth-provider';
import { BigHeroCard, type TripMember, type TripWithEvent } from '@/components/big-hero-card';
import { apiFetch, apiJson } from '@/lib/api';
import { invalidateCache } from '@/lib/cache';
import type { Quest } from '@/lib/types';
import { SPACING, TYPOGRAPHY, COLORS, RADIUS, SHADOWS, OPACITIES } from '@/constants/design-tokens';

type MessageState = { type: 'success' | 'error'; text: string } | null;

export default function CreateTripScreen() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [now] = useState(() => new Date());
  const [title, setTitle] = useState('');
  const [destination, setDestination] = useState('');
  const [tripCountries, setTripCountries] = useState<string[]>([]);
  const [startDate, setStartDate] = useState(getDefaultStartDate());
  const [endDate, setEndDate] = useState(getDefaultEndDate());
  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [inviteCode] = useState(() => createInviteCode());
  const [rangePickerOpen, setRangePickerOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [pendingInvites, setPendingInvites] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<MessageState>(null);
  const initialStartDate = useRef(startDate);
  const initialEndDate = useRef(endDate);

  const contentBottomPadding = useMemo(() => Math.max(insets.bottom, 18) + 32, [insets.bottom]);

  const isDirty = Boolean(
    title.trim() ||
    destination.trim() ||
    tripCountries.length > 0 ||
    coverImage ||
    pendingInvites.length > 0 ||
    startDate !== initialStartDate.current ||
    endDate !== initialEndDate.current
  );

  async function handlePickCover() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [16, 10],
      quality: 0.9,
    });

    if (!result.canceled && result.assets[0]) {
      setCoverImage(result.assets[0].uri);
    }
  }

  function handleAddInvite() {
    const normalizedEmail = inviteEmail.trim().toLowerCase();

    if (!normalizedEmail) {
      setMessage({ type: 'error', text: t('trip.error.emptyEmail') });
      return;
    }

    if (!looksLikeEmail(normalizedEmail)) {
      setMessage({ type: 'error', text: t('trip.error.invalidEmail') });
      return;
    }

    if (pendingInvites.includes(normalizedEmail)) {
      setMessage({ type: 'error', text: t('trip.error.emailAlreadyInvited') });
      return;
    }

    setPendingInvites((current) => [...current, normalizedEmail]);
    setInviteEmail('');
    setMessage(null);
  }

  function handleRemoveInvite(email: string) {
    setPendingInvites((current) => current.filter((entry) => entry !== email));
  }

  async function handleCopyInviteCode() {
    await Clipboard.setStringAsync(inviteCode);
    setMessage({ type: 'success', text: t('trip.success.codeCopied', { code: inviteCode }) });
  }

  async function handleShareInviteCode() {
    await Share.share({
      message: `Join my SideQuest with code ${inviteCode}.`,
      title: 'Join my SideQuest',
      url: coverImage ?? undefined,
    });
  }

  async function saveTrip(): Promise<Quest | null> {
    const normalizedTitle = title.trim();
    const normalizedDestination = destination.trim();

    if (!normalizedTitle) {
      setMessage({ type: 'error', text: t('trip.error.emptyName') });
      return null;
    }

    if (!normalizedDestination) {
      setMessage({ type: 'error', text: t('trip.error.emptyDestination') });
      return null;
    }

    if (!isDateInputValid(startDate) || !isDateInputValid(endDate)) {
      setMessage({ type: 'error', text: t('trip.error.invalidDateFormat') });
      return null;
    }

    if (new Date(`${endDate}T12:00:00`).getTime() < new Date(`${startDate}T12:00:00`).getTime()) {
      setMessage({ type: 'error', text: t('trip.error.endBeforeStart') });
      return null;
    }

    setSubmitting(true);
    setMessage(null);

    console.log('[CREATE-TRIP] submitting...');
    try {
      let uploadedImageUrl: string | null = null;

      if (coverImage) {
        uploadedImageUrl = await uploadImageIfNeeded(coverImage);
      }

      const trip = await apiJson<Quest>('/api/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: normalizedTitle,
          destination: normalizedDestination,
          description: null,
          imageUrl: uploadedImageUrl,
          startDate,
          endDate,
          inviteCode,
          countries: tripCountries,
        }),
      });

      // Trip list cached by home/calendar is now stale — drop it so the
      // next tab focus shows the freshly created trip without waiting for
      // the 30s TTL.
      invalidateCache('/api/trips');

      if (pendingInvites.length > 0) {
        await Promise.allSettled(
          pendingInvites.map((email) =>
            apiJson(`/api/trips/${trip.id}/invites`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email }),
            }),
          ),
        );
      }

      return trip;
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : t('trip.error.createFailed') });
      return null;
    } finally {
      setSubmitting(false);
    }
  }

  const unsaved = useUnsavedChanges({
    isDirty,
    onSave: async () => {
      const trip = await saveTrip();
      return trip !== null;
    },
  });

  async function handleCreateTrip() {
    const trip = await saveTrip();
    if (trip) {
      // Tell the unsaved-changes guard we just saved on purpose, so it
      // doesn't pop the modal and trigger a second save when we navigate.
      unsaved.markSaved();
      router.replace(`/trip/${trip.id}`);
    }
  }

  // Build a fake TripWithEvent from the current form state so the
  // BigHeroCard preview renders EXACTLY like the trip will look on the
  // home tab once it's saved. The user is the only known member at this
  // point (more come via invites after creation).
  const previewTrip: TripWithEvent = useMemo(() => ({
    quest: {
      id: 'preview',
      title: title.trim() || null,
      description: null,
      destination: destination.trim() || null,
      startDate: startDate || getDefaultStartDate(),
      endDate: endDate || getDefaultEndDate(),
      imageUrl: coverImage,
      spotifyUrl: null,
      ownerId: user?.id ?? 'preview',
      ownerIds: user?.id ? [user.id] : [],
      visibility: 'public',
      isRevealed: true,
      teaser: null,
      inviteCode,
      countries: tripCountries,
      shareCode: null,
    } as Quest,
    nextEventDate: new Date(`${startDate || getDefaultStartDate()}T12:00:00`),
    nextEventLabel: title.trim() || 'Adventure preview',
    upcomingEvents: [],
    isOngoing: (() => {
      // Mirror the home logic: today is between start and end (inclusive).
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const s = new Date(`${startDate}T12:00:00`);
      const e = new Date(`${endDate}T12:00:00`);
      return s.getTime() <= today.getTime() && e.getTime() >= today.getTime();
    })(),
  }), [title, destination, startDate, endDate, coverImage, inviteCode, tripCountries, user, now]);

  const previewMembers: TripMember[] = useMemo(() => {
    if (!user?.id) return [];
    return [{ id: user.id, name: user.name ?? 'You', avatarUrl: user.avatarUrl ?? null, isOwner: true }];
  }, [user]);

  const previewCardHeight = Math.min((screenWidth - 44) * 0.92, screenHeight * 0.36, 320);

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingTop: Math.max(insets.top, 14) + 6, paddingBottom: contentBottomPadding }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} activeOpacity={0.8} onPress={unsaved.requestBack}>
            <Ionicons name="arrow-back" size={28} color={COLORS.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('trip.title')}</Text>
        </View>

        {/* Live preview — renders the exact same BigHeroCard the trip will
            show on home once saved. Updates as the user types title /
            destination / picks dates / uploads a cover. Tapping the
            preview also opens the image picker so it doubles as a cover
            affordance. */}
        <Text style={styles.previewLabel}>{t('trip.preview_label')}</Text>
        <BigHeroCard
          trip={previewTrip}
          width={screenWidth - 44}
          cardHeight={previewCardHeight}
          members={previewMembers}
          now={now}
          t={t}
          hideEnterButton
          onPress={() => void handlePickCover()}
        />

        {/* The BigHeroCard preview above is now also the cover-photo
            picker — tapping it opens the image library. A small hint
            below directs first-time users. */}
        <TouchableOpacity activeOpacity={0.85} style={styles.coverHint} onPress={() => void handlePickCover()}>
          <Ionicons name={coverImage ? 'camera-reverse-outline' : 'camera-outline'} size={16} color={COLORS.primary} />
          <Text style={[styles.coverHintText, { color: COLORS.primary }]}>
            {coverImage ? t('trip.change_photo') : t('trip.add_cover')}
          </Text>
        </TouchableOpacity>

        <Text style={styles.prompt}>{t('trip.what_to_call')}</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder={t('trip.trip_name_placeholder')}
          placeholderTextColor={COLORS.placeholderText}
          style={styles.titleInput}
        />

        <Text style={styles.secondaryPrompt}>{t('trip.where_going')}</Text>
        <TextInput
          value={destination}
          onChangeText={setDestination}
          placeholder={t('trip.destination_placeholder')}
          placeholderTextColor={COLORS.placeholderText}
          style={styles.destinationInput}
        />

        <CountryPicker value={tripCountries} onChange={setTripCountries} label={t('trip.add_countries')} />

        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="calendar-outline" size={18} color={COLORS.textMeta} />
            <Text style={styles.sectionTitle}>{t('trip.when_going')}</Text>
          </View>

          <Pressable style={styles.dateRangeCard} onPress={() => setRangePickerOpen(true)}>
            <View style={styles.dateRangeCopy}>
              <Text style={styles.dateRangeEyebrow}>{t('trip.select_dates')}</Text>
              <Text style={styles.dateRangeValue}>{formatRangeDisplay(startDate, endDate)}</Text>
              <Text style={styles.dateRangeHint}>{t('trip.dates_hint')}</Text>
            </View>
            <View style={[styles.dateRangeIcon, { backgroundColor: COLORS.primaryLight12, borderColor: COLORS.primaryLight20 }]}>
              <Ionicons name="calendar-outline" size={22} color={COLORS.primary} />
            </View>
          </Pressable>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="key-outline" size={18} color={COLORS.textMeta} />
            <Text style={styles.sectionTitle}>{t('trip.invite_code_section')}</Text>
          </View>

          <View style={styles.codeCard}>
            <View>
              <Text style={styles.codeLabel}>{t('trip.share_code')}</Text>
              <Text style={styles.codeValue}>{inviteCode}</Text>
            </View>

            <View style={styles.codeActions}>
              <TouchableOpacity activeOpacity={0.86} style={[styles.codeActionButton, { borderColor: COLORS.primaryLight20 }]} onPress={() => void handleCopyInviteCode()}>
                <Ionicons name="copy-outline" size={16} color={COLORS.primary} />
                <Text style={[styles.codeActionText, { color: COLORS.primary }]}>{t('common.copy')}</Text>
              </TouchableOpacity>
              <TouchableOpacity activeOpacity={0.86} style={[styles.codeActionButton, { borderColor: COLORS.primaryLight20 }]} onPress={() => void handleShareInviteCode()}>
                <Ionicons name="share-social-outline" size={16} color={COLORS.primary} />
                <Text style={[styles.codeActionText, { color: COLORS.primary }]}>{t('common.share')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="mail-open-outline" size={18} color={COLORS.textMeta} />
            <Text style={styles.sectionTitle}>{t('trip.invited_waiting')}</Text>
          </View>

          <Text style={styles.inviteHelper}>{t('trip.invite_hint')}</Text>

          <View style={styles.inviteComposer}>
            <TextInput
              value={inviteEmail}
              onChangeText={setInviteEmail}
              placeholder={t('trip.invites.placeholder')}
              placeholderTextColor={COLORS.placeholderText}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.inviteInput}
            />
            <TouchableOpacity activeOpacity={0.88} style={[styles.inviteAddButton, { backgroundColor: COLORS.primary }]} onPress={handleAddInvite}>
              <Text style={styles.inviteAddButtonText}>{t('common.add')}</Text>
            </TouchableOpacity>
          </View>

          {pendingInvites.length > 0 ? (
            <View style={styles.pendingWrap}>
              {pendingInvites.map((email) => (
                <View key={email} style={styles.pendingChip}>
                  <Text style={styles.pendingChipText}>{email}</Text>
                  <TouchableOpacity activeOpacity={0.8} onPress={() => handleRemoveInvite(email)}>
                    <Ionicons name="close" size={16} color={COLORS.textSecondary} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.pendingEmpty}>
              <Ionicons name="time-outline" size={18} color={COLORS.textMeta} />
              <Text style={styles.pendingEmptyText}>{t('trip.no_invites')}</Text>
            </View>
          )}
        </View>

        {message ? (
          <View style={[styles.messageBanner, message.type === 'success' ? styles.messageBannerSuccess : styles.messageBannerError]}>
            <Ionicons name={message.type === 'success' ? 'checkmark-circle' : 'alert-circle'} size={18} color={message.type === 'success' ? '#16734d' : '#a52617'} />
            <Text style={[styles.messageText, message.type === 'success' ? styles.messageTextSuccess : styles.messageTextError]}>
              {message.text}
            </Text>
          </View>
        ) : null}

        <TouchableOpacity activeOpacity={0.9} style={[styles.primaryButton, { backgroundColor: COLORS.primary, shadowColor: COLORS.primary }, submitting ? styles.primaryButtonDisabled : null]} disabled={submitting} onPress={() => void handleCreateTrip()}>
          <Text style={styles.primaryButtonText}>{submitting ? t('trip.starting') : t('trip.start_adventure')}</Text>
        </TouchableOpacity>
      </ScrollView>

      <RangeDatePicker
        visible={rangePickerOpen}
        title={t('trip.datePicker.title')}
        subtitle={t('trip.datePicker.subtitle')}
        startDate={startDate}
        endDate={endDate}
        minDate={getDefaultStartDate()}
        confirmLabel={t('trip.datePicker.confirmLabel')}
        onChange={(nextStartDate, nextEndDate) => {
          setStartDate(nextStartDate);
          setEndDate(nextEndDate);
        }}
        onClose={() => setRangePickerOpen(false)}
      />

      <UnsavedChangesModal
        visible={unsaved.modalOpen}
        busy={unsaved.busy}
        hasSave={true}
        onSave={unsaved.handleSave}
        onDiscard={unsaved.handleDiscard}
        onCancel={unsaved.handleCancel}
      />
    </KeyboardAvoidingView>
  );
}

async function uploadImageIfNeeded(uri: string) {
  if (!uri || uri.startsWith('http://') || uri.startsWith('https://')) {
    return uri;
  }

  const formData = new FormData();
  formData.append('file', {
    uri,
    name: `cover-${Date.now()}.jpg`,
    type: 'image/jpeg',
  } as never);

  const response = await apiFetch('/api/images/upload', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error((await response.text()) || 'Could not upload the cover image.');
  }

  const data = (await response.json()) as { url?: string };
  return data.url ?? null;
}

function looksLikeEmail(value: string) {
  return /\S+@\S+\.\S+/.test(value);
}

function isDateInputValid(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function createInviteCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function getDefaultStartDate() {
  return new Date().toISOString().slice(0, 10);
}

function getDefaultEndDate() {
  const date = new Date();
  date.setDate(date.getDate() + 3);
  return date.toISOString().slice(0, 10);
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: SPACING.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.lg,
    paddingBottom: SPACING.sm,
    marginBottom: SPACING.md,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    ...TYPOGRAPHY.pageHeading,
    fontWeight: '900',
    color: COLORS.textPrimary,
  },
  previewLabel: {
    marginTop: SPACING.sm,
    marginBottom: SPACING.sm,
    ...TYPOGRAPHY.eyebrow,
    fontWeight: '800',
    color: COLORS.textMeta,
  },
  coverHint: {
    marginTop: SPACING.lg,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.circle,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.primaryLight20,
  },
  coverHintText: {
    ...TYPOGRAPHY.label,
    fontWeight: '700',
  },
  coverCard: {
    height: 300,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    backgroundColor: COLORS.bgLight,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  coverImage: {
    ...StyleSheet.absoluteFillObject,
  },
  coverGlow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(225,240,242,0.78)',
  },
  coverAccent: {
    position: 'absolute',
    left: -8,
    top: -10,
    bottom: 58,
    width: 78,
    borderRadius: 40,
    borderWidth: 4,
    borderColor: 'rgba(22,167,198,0.5)',
  },
  coverShadow: {
    position: 'absolute',
    bottom: 18,
    width: 132,
    height: 18,
    borderRadius: RADIUS.circle,
    backgroundColor: COLORS.gradientDark12,
    opacity: 0.35,
  },
  coverOverlay: {
    alignItems: 'center',
  },
  coverIconCircle: {
    width: 92,
    height: 92,
    borderRadius: 46,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.65)',
  },
  coverPlusBadge: {
    position: 'absolute',
    right: SPACING.xl,
    top: SPACING.xl,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.32)',
  },
  coverLabel: {
    marginTop: SPACING.lg,
    color: COLORS.white,
    fontSize: 18,
    fontWeight: '500',
    letterSpacing: -0.4,
  },
  coverEditBadge: {
    position: 'absolute',
    right: SPACING.lg,
    top: SPACING.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.circle,
    backgroundColor: COLORS.pillDark42,
  },
  coverEditBadgeText: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  prompt: {
    marginTop: SPACING.xxxl,
    textAlign: 'center',
    color: COLORS.textSecondary,
    ...TYPOGRAPHY.cardTitle,
  },
  titleInput: {
    marginTop: SPACING.lg,
    textAlign: 'center',
    color: COLORS.textPrimary,
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -1.2,
    paddingVertical: SPACING.md,
  },
  secondaryPrompt: {
    marginTop: SPACING.sm,
    textAlign: 'center',
    color: COLORS.textSecondary,
    ...TYPOGRAPHY.cardTitle,
  },
  destinationInput: {
    marginTop: SPACING.md,
    textAlign: 'center',
    color: COLORS.textPrimary,
    fontSize: 20,
    fontWeight: '600',
    letterSpacing: -0.6,
    paddingVertical: SPACING.md,
  },
  section: {
    marginTop: SPACING.xxxl,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  sectionTitle: {
    ...TYPOGRAPHY.sectionHeader,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  dateRangeCard: {
    marginTop: SPACING.lg,
    minHeight: 118,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.borderPrimary,
    backgroundColor: COLORS.white,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...SHADOWS.subtle,
  },
  dateRangeCopy: {
    flex: 1,
  },
  dateRangeEyebrow: {
    ...TYPOGRAPHY.eyebrow,
    fontWeight: '800',
    color: COLORS.textMeta,
  },
  dateRangeValue: {
    marginTop: SPACING.md,
    ...TYPOGRAPHY.sectionHeader,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  dateRangeHint: {
    marginTop: SPACING.md,
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
  },
  dateRangeIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primaryLight12,
    borderWidth: 1,
    borderColor: COLORS.primaryLight20,
    marginLeft: SPACING.md,
  },
  codeCard: {
    marginTop: SPACING.lg,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.borderPrimary,
    backgroundColor: COLORS.white,
    padding: SPACING.lg,
    ...SHADOWS.subtle,
  },
  codeLabel: {
    ...TYPOGRAPHY.eyebrow,
    fontWeight: '700',
    color: COLORS.textMeta,
  },
  codeValue: {
    marginTop: SPACING.sm,
    ...TYPOGRAPHY.pageHeading,
    fontWeight: '900',
    color: COLORS.textPrimary,
    letterSpacing: 3,
  },
  codeActions: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING.lg,
  },
  codeActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    borderRadius: RADIUS.circle,
    borderWidth: 1,
    borderColor: COLORS.primaryLight20,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
  },
  codeActionText: {
    ...TYPOGRAPHY.label,
    fontWeight: '700',
    color: COLORS.primary,
  },
  inviteHelper: {
    marginTop: SPACING.lg,
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
  },
  inviteComposer: {
    marginTop: SPACING.lg,
    flexDirection: 'row',
    gap: SPACING.md,
    alignItems: 'center',
  },
  inviteInput: {
    flex: 1,
    minHeight: 56,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.borderInput,
    paddingHorizontal: SPACING.lg,
    color: COLORS.textPrimary,
    ...TYPOGRAPHY.body,
    backgroundColor: COLORS.bgLightest,
  },
  inviteAddButton: {
    minHeight: 56,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
  },
  inviteAddButtonText: {
    color: COLORS.white,
    ...TYPOGRAPHY.buttonLarge,
    fontWeight: '800',
  },
  pendingWrap: {
    marginTop: SPACING.lg,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
  },
  pendingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    borderRadius: RADIUS.circle,
    backgroundColor: COLORS.bgLight,
    borderWidth: 1,
    borderColor: COLORS.borderPrimary,
    paddingLeft: SPACING.md,
    paddingRight: SPACING.sm,
    paddingVertical: SPACING.md,
  },
  pendingChipText: {
    ...TYPOGRAPHY.body,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  pendingEmpty: {
    marginTop: SPACING.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  pendingEmptyText: {
    ...TYPOGRAPHY.body,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  messageBanner: {
    marginTop: SPACING.xl,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  messageBannerSuccess: {
    backgroundColor: COLORS.successLight,
    borderWidth: 1,
    borderColor: COLORS.successBorder,
  },
  messageBannerError: {
    backgroundColor: COLORS.errorLight,
    borderWidth: 1,
    borderColor: COLORS.errorBorder,
  },
  messageText: {
    flex: 1,
    ...TYPOGRAPHY.body,
    fontWeight: '600',
  },
  messageTextSuccess: {
    color: COLORS.success,
  },
  messageTextError: {
    color: COLORS.error,
  },
  primaryButton: {
    marginTop: SPACING.xxxl,
    height: 82,
    borderRadius: RADIUS.circle,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.28,
    shadowRadius: 28,
    elevation: 10,
  },
  primaryButtonDisabled: {
    opacity: OPACITIES.disabled,
  },
  primaryButtonText: {
    ...TYPOGRAPHY.buttonLarge,
    fontWeight: '900',
    color: COLORS.white,
  },
});
