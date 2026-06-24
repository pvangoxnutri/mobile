import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import RangeDatePicker, { formatRangeDisplay } from '@/components/range-date-picker';
import { useI18n } from '@/components/i18n-provider';
import { UnsavedChangesModal, useUnsavedChanges } from '@/components/unsaved-changes';
import { useAuth } from '@/components/auth-provider';
import { BigHeroCard, type TripMember, type TripWithEvent } from '@/components/big-hero-card';
import { apiFetch, apiJson } from '@/lib/api';
import { invalidateCache } from '@/lib/cache';
import type { Quest } from '@/lib/types';
import { SPACING, TYPOGRAPHY, COLORS, RADIUS, SHADOWS } from '@/constants/design-tokens';
import { useKeyboardFocusScroll } from '@/hooks/useKeyboardFocusScroll';

type MessageState = { type: 'success' | 'error'; text: string } | null;

// BigHeroCard renders the title on 2 lines at 28px bold — beyond ~40 chars it
// has to ellipsize. The destination renders in a single-line pill capped at
// 70% of the card width, which fits far less text — ~28 chars before it would
// need to ellipsize.
const TITLE_MAX_LENGTH = 40;
const DESTINATION_MAX_LENGTH = 28;

export default function CreateTripScreen() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [now] = useState(() => new Date());
  const [title, setTitle] = useState('');
  const [destination, setDestination] = useState('');
  // startDate / endDate hold internal defaults so the RangeDatePicker has an
  // initial range to render, but they are NOT displayed anywhere in the UI
  // until hasUserSelectedDates flips to true.
  const [startDate, setStartDate] = useState(getDefaultStartDate());
  const [endDate, setEndDate] = useState(getDefaultEndDate());
  const [hasUserSelectedDates, setHasUserSelectedDates] = useState(false);
  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [inviteCode] = useState(() => createInviteCode());
  const [rangePickerOpen, setRangePickerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<MessageState>(null);
  const { scrollRef, onFocusField, scrollViewProps } = useKeyboardFocusScroll();
  const titleRef = useRef<TextInput>(null);
  const destinationRef = useRef<TextInput>(null);

  const contentBottomPadding = useMemo(() => Math.max(insets.bottom, 18) + 32, [insets.bottom]);

  const isDirty = Boolean(
    title.trim() ||
    destination.trim() ||
    coverImage ||
    hasUserSelectedDates
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

  async function saveTrip(): Promise<Quest | null> {
    const normalizedTitle = title.trim();
    const normalizedDestination = destination.trim();

    // Only title + destination are required. Dates are optional — when the
    // user has not explicitly picked a range, the internal startDate /
    // endDate defaults are still sent to the backend (which requires the
    // fields) but the UI never showed them. The user can edit dates later
    // from Trip Detail.
    if (!normalizedTitle) {
      setMessage({ type: 'error', text: t('trip.error.emptyName') });
      return null;
    }

    if (!normalizedDestination) {
      setMessage({ type: 'error', text: t('trip.error.emptyDestination') });
      return null;
    }

    setSubmitting(true);
    setMessage(null);

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
          countries: [],
        }),
      });

      // Trip list cached by home/calendar is now stale — drop it so the
      // next tab focus shows the freshly created trip without waiting for
      // the 30s TTL.
      invalidateCache('/api/trips');

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
  // Preview falls back to polished placeholders when fields are empty so the
  // BigHeroCard always feels intentional. The placeholders only affect the
  // preview render — the real save in handleCreateTrip uses the raw title /
  // destination state, so we never persist a placeholder string.
  const previewTitle = title.trim() || t('trip.preview.titlePlaceholder');
  const previewDestination = destination.trim() || t('trip.preview.destinationPlaceholder');

  // When the user has not picked dates yet, pass empty strings through to
  // BigHeroCard. getTripDayInfo / formatTimeLeft both return null on empty,
  // which makes the LIVE / UPCOMING pill and "Day X of Y" line render
  // nothing — exactly the "no date" hero look we want.
  const previewStartDate = hasUserSelectedDates ? startDate : '';
  const previewEndDate = hasUserSelectedDates ? endDate : '';

  const previewTrip: TripWithEvent = useMemo(() => ({
    quest: {
      id: 'preview',
      title: previewTitle,
      description: null,
      destination: previewDestination,
      startDate: previewStartDate,
      endDate: previewEndDate,
      imageUrl: coverImage,
      spotifyUrl: null,
      ownerId: user?.id ?? 'preview',
      ownerIds: user?.id ? [user.id] : [],
      visibility: 'public',
      isRevealed: true,
      teaser: null,
      inviteCode,
      countries: [],
      shareCode: null,
    } as Quest,
    nextEventDate: new Date(`${previewStartDate || getDefaultStartDate()}T12:00:00`),
    nextEventLabel: previewTitle,
    upcomingEvents: [],
    isOngoing: (() => {
      if (!previewStartDate || !previewEndDate) return false;
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const s = new Date(`${previewStartDate}T12:00:00`);
      const e = new Date(`${previewEndDate}T12:00:00`);
      return s.getTime() <= today.getTime() && e.getTime() >= today.getTime();
    })(),
  }), [previewTitle, previewDestination, previewStartDate, previewEndDate, coverImage, inviteCode, user, now]);

  const previewMembers: TripMember[] = useMemo(() => {
    if (!user?.id) return [];
    return [{ id: user.id, name: user.name ?? 'You', avatarUrl: user.avatarUrl ?? null, isOwner: true }];
  }, [user]);

  const previewCardHeight = Math.min((screenWidth - 44) * 0.7, screenHeight * 0.25, 240);

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingTop: Math.max(insets.top, 14) + 6, paddingBottom: contentBottomPadding }]}
        showsVerticalScrollIndicator={false}
        {...scrollViewProps}>
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

        {/* Cover pill: visible only when no image. Hero is already tappable. */}
        {!coverImage ? (
          <TouchableOpacity activeOpacity={0.85} style={styles.coverHint} onPress={() => void handlePickCover()}>
            <Ionicons name="camera-outline" size={16} color={COLORS.primary} />
            <Text style={[styles.coverHintText, { color: COLORS.primary }]}>
              {t('trip.add_cover')}
            </Text>
          </TouchableOpacity>
        ) : null}

        {/* Caption-style title input. Borderless, large, left-aligned. */}
        <Text style={styles.fieldLabel}>
          {t('trip.what_to_call')} <Text style={styles.requiredAsterisk}>*</Text>
        </Text>
        <TextInput
          ref={titleRef}
          value={title}
          onChangeText={setTitle}
          placeholder={t('trip.trip_name_placeholder')}
          placeholderTextColor={COLORS.placeholderText}
          style={styles.titleInput}
          maxLength={TITLE_MAX_LENGTH}
          onFocus={onFocusField(titleRef)}
          returnKeyType="next"
          onSubmitEditing={() => destinationRef.current?.focus()}
        />
        <Text style={styles.charCounter}>{title.length}/{TITLE_MAX_LENGTH}</Text>

        {/* Caption-style destination input. Borderless, smaller. */}
        <Text style={styles.fieldLabel}>
          {t('trip.where_going')} <Text style={styles.requiredAsterisk}>*</Text>
        </Text>
        <TextInput
          ref={destinationRef}
          value={destination}
          onChangeText={setDestination}
          placeholder={t('trip.destination_placeholder')}
          placeholderTextColor={COLORS.placeholderText}
          style={styles.destinationInput}
          maxLength={DESTINATION_MAX_LENGTH}
          onFocus={onFocusField(destinationRef)}
          returnKeyType="done"
          onSubmitEditing={() => Keyboard.dismiss()}
        />
        <Text style={styles.charCounter}>{destination.length}/{DESTINATION_MAX_LENGTH}</Text>

        {/* Optional date chip. Small pill, centered, secondary affordance. */}
        <View style={styles.dateChipWrap}>
          <Pressable style={styles.dateChip} onPress={() => setRangePickerOpen(true)}>
            <Ionicons name="calendar-outline" size={15} color={COLORS.primary} />
            <Text style={styles.dateChipValue} numberOfLines={1}>
              {hasUserSelectedDates ? formatRangeDisplay(startDate, endDate) : t('trip.add_dates')}
            </Text>
          </Pressable>
        </View>

        {message ? (
          <View style={[styles.messageBanner, message.type === 'success' ? styles.messageBannerSuccess : styles.messageBannerError]}>
            <Ionicons name={message.type === 'success' ? 'checkmark-circle' : 'alert-circle'} size={18} color={message.type === 'success' ? '#16734d' : '#a52617'} />
            <Text style={[styles.messageText, message.type === 'success' ? styles.messageTextSuccess : styles.messageTextError]}>
              {message.text}
            </Text>
          </View>
        ) : null}

        {/* Primary CTA — always clickable. Validation handled in saveTrip. */}
        <TouchableOpacity
          activeOpacity={0.9}
          style={[styles.primaryButton, { backgroundColor: COLORS.primary, shadowColor: COLORS.primary }]}
          onPress={() => void handleCreateTrip()}>
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
          setHasUserSelectedDates(true);
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
    marginTop: SPACING.sm,
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
  // Small uppercase label shown above each caption input so the field's
  // purpose stays visible even after the placeholder disappears (first-time
  // users shouldn't have to guess from a placeholder alone).
  fieldLabel: {
    marginTop: SPACING.md,
    ...TYPOGRAPHY.eyebrow,
    fontWeight: '800',
    color: COLORS.textMeta,
  },
  requiredAsterisk: {
    color: COLORS.error,
  },
  charCounter: {
    marginTop: SPACING.xs,
    alignSelf: 'flex-end',
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textMeta,
  },
  // Caption-style inputs (NOT form boxes). Borderless, left-aligned, sized
  // like editable title + subtitle of the hero card. Mental model: the user
  // is captioning the trip, not filling in a form.
  titleInput: {
    marginTop: SPACING.xs,
    color: COLORS.textPrimary,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.6,
    paddingVertical: SPACING.xs,
  },
  destinationInput: {
    marginTop: SPACING.xs,
    color: COLORS.textSecondary,
    fontSize: 16,
    fontWeight: '500',
    letterSpacing: -0.2,
    paddingVertical: SPACING.xs,
  },
  // Small pill (optional, secondary affordance). Not full-width, not a row.
  // Sits below the captions, visually subordinate.
  dateChipWrap: {
    marginTop: SPACING.sm,
    alignItems: 'flex-start',
  },
  dateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.circle,
    backgroundColor: COLORS.bgLight,
    borderWidth: 1,
    borderColor: COLORS.borderPrimary,
  },
  dateChipValue: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.1,
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
    marginTop: SPACING.md,
    height: 72,
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
  primaryButtonText: {
    ...TYPOGRAPHY.buttonLarge,
    fontWeight: '900',
    color: COLORS.white,
  },
});
