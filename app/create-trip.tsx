import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
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
import { fetchPlaceDetails, fetchPlaceSuggestions, type PlaceAutocompleteSuggestion } from '@/lib/maps-api';
import type { Quest } from '@/lib/types';
import { SPACING, TYPOGRAPHY, RADIUS } from '@/constants/design-tokens';
import { useKeyboardFocusScroll } from '@/hooks/useKeyboardFocusScroll';
import { ImagePositionerModal, cropToPreview } from '@/components/image-positioner-modal';
import { useTheme } from '@/components/theme-provider';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { AppTheme } from '@/constants/themes';

type MessageState = { type: 'success' | 'error'; text: string } | null;

// BigHeroCard renders the title on 2 lines at 28px bold — beyond ~40 chars it
// has to ellipsize. The destination renders in a single-line pill capped at
// 70% of the card width, which fits far less text — ~28 chars before it would
// need to ellipsize.
const TITLE_MAX_LENGTH = 40;
const DESTINATION_MAX_LENGTH = 28;

export default function CreateTripScreen() {
  const { t } = useI18n();
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { user } = useAuth();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [now] = useState(() => new Date());
  const [title, setTitle] = useState('');
  const [destination, setDestination] = useState('');
  // Coordinates ride along only when the user picked a place suggestion —
  // free text stays coordinate-less (weather then reports no_coordinates).
  const [destinationSuggestions, setDestinationSuggestions] = useState<PlaceAutocompleteSuggestion[]>([]);
  const [destinationPlace, setDestinationPlace] = useState<{ placeId: string | null; latitude: number; longitude: number } | null>(null);
  const pickedDestinationLabelRef = useRef<string | null>(null);
  // Bumped on every pick AND every manual edit that clears a pick. The async
  // coordinate lookup captures the token at start and only applies its
  // result if the token is still current — so a fast re-type or a second
  // pick started before the first one's network request lands can never
  // clobber a newer selection with stale coordinates (or resurrect a
  // cleared one).
  const destinationSelectionTokenRef = useRef(0);
  // startDate / endDate hold internal defaults so the RangeDatePicker has an
  // initial range to render, but they are NOT displayed anywhere in the UI
  // until hasUserSelectedDates flips to true.
  const [startDate, setStartDate] = useState(getDefaultStartDate());
  const [endDate, setEndDate] = useState(getDefaultEndDate());
  const [hasUserSelectedDates, setHasUserSelectedDates] = useState(false);
  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [coverImageSize, setCoverImageSize] = useState<{ width: number; height: number } | null>(null);
  const [coverPanOffset, setCoverPanOffset] = useState({ x: 0, y: 0 });
  const [coverPanScale, setCoverPanScale] = useState(1);
  const [positioningCover, setPositioningCover] = useState(false);
  const [inviteCode] = useState(() => createInviteCode());
  // Slideshow cover — on by default for new adventures.
  const [slideshowEnabled, setSlideshowEnabled] = useState(true);
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

  // Destination autocomplete (same backend proxy as activity locations).
  // Debounced; never re-opens for the exact label the user just picked.
  useEffect(() => {
    const query = destination.trim();
    if (query.length < 2 || query === pickedDestinationLabelRef.current) {
      setDestinationSuggestions([]);
      return;
    }
    const handle = setTimeout(() => {
      void fetchPlaceSuggestions(query)
        .then((items) => setDestinationSuggestions(items.slice(0, 5)))
        .catch(() => setDestinationSuggestions([]));
    }, 350);
    return () => clearTimeout(handle);
  }, [destination]);

  function handleDestinationChange(value: string) {
    const next = value.slice(0, DESTINATION_MAX_LENGTH);
    setDestination(next);
    // Re-typed text no longer describes the picked place — drop coordinates
    // AND invalidate any coordinate lookup still in flight for the pick
    // being edited away from, so it can never apply late.
    if (pickedDestinationLabelRef.current && next.trim() !== pickedDestinationLabelRef.current) {
      pickedDestinationLabelRef.current = null;
      destinationSelectionTokenRef.current += 1;
      setDestinationPlace(null);
    }
  }

  function handlePickDestination(suggestion: PlaceAutocompleteSuggestion) {
    const label = suggestion.primaryText.slice(0, DESTINATION_MAX_LENGTH).trim();
    pickedDestinationLabelRef.current = label;
    destinationSelectionTokenRef.current += 1;
    const token = destinationSelectionTokenRef.current;
    setDestination(label);
    setDestinationSuggestions([]);
    setDestinationPlace(null);
    void (async () => {
      try {
        // OSM-fallback suggestions carry coordinates; Google ones need one
        // details lookup via the backend proxy.
        let latitude = suggestion.latitude ?? null;
        let longitude = suggestion.longitude ?? null;
        if ((latitude == null || longitude == null) && !suggestion.placeId.startsWith('osm:')) {
          const details = await fetchPlaceDetails(suggestion.placeId);
          latitude = details.latitude ?? null;
          longitude = details.longitude ?? null;
        }
        // Only apply if nothing newer (a re-type or another pick) has
        // superseded this lookup while it was in flight.
        if (latitude != null && longitude != null && destinationSelectionTokenRef.current === token) {
          setDestinationPlace({ placeId: suggestion.placeId, latitude, longitude });
        }
      } catch {
        // Coordinates are an optional bonus — the text destination stands
        // alone. A failed lookup must never pretend to have succeeded, so
        // destinationPlace simply stays null (the hint keeps reflecting
        // reality); nothing to clean up here since we never set it.
      }
    })();
  }

  async function handlePickCover() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setCoverImage(asset.uri);
      setCoverImageSize({ width: asset.width, height: asset.height });
      setCoverPanOffset({ x: 0, y: 0 });
      setCoverPanScale(1);
      setPositioningCover(true);
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
        let uriToUpload = coverImage;
        if (coverImageSize && !coverImage.startsWith('http')) {
          const frameW = screenWidth;
          const frameH = Math.round(screenWidth / ((screenWidth - 44) / previewCardHeight));
          uriToUpload = await cropToPreview(coverImage, coverImageSize, coverPanOffset, coverPanScale, frameW, frameH);
        }
        uploadedImageUrl = await uploadImageIfNeeded(uriToUpload);
      }

      const trip = await apiJson<Quest>('/api/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: normalizedTitle,
          destination: normalizedDestination,
          destinationLatitude: destinationPlace?.latitude ?? null,
          destinationLongitude: destinationPlace?.longitude ?? null,
          destinationPlaceId: destinationPlace?.placeId ?? null,
          description: null,
          imageUrl: uploadedImageUrl,
          startDate,
          endDate,
          inviteCode,
          countries: [],
          slideshowEnabled,
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
    <KeyboardAvoidingView style={styles.screen} behavior="padding">
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingTop: Math.max(insets.top, 14) + 6, paddingBottom: contentBottomPadding }]}
        showsVerticalScrollIndicator={false}
        {...scrollViewProps}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} activeOpacity={0.8} onPress={unsaved.requestBack}>
            <Ionicons name="arrow-back" size={28} color={theme.colors.primary} />
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
            <Ionicons name="camera-outline" size={16} color={theme.colors.primary} />
            <Text style={[styles.coverHintText, { color: theme.colors.primary }]}>
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
          // Slice instead of native maxLength — iOS rejects the entire paste
          // when the clipboard is longer than maxLength (e.g. from Notes);
          // slicing keeps the first chars instead of pasting nothing.
          onChangeText={(v) => setTitle(v.slice(0, TITLE_MAX_LENGTH))}
          placeholder={t('trip.trip_name_placeholder')}
          placeholderTextColor={theme.colors.placeholderText}
          keyboardAppearance={theme.keyboardAppearance}
          style={styles.titleInput}
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
          onChangeText={handleDestinationChange}
          placeholder={t('trip.destination_placeholder')}
          placeholderTextColor={theme.colors.placeholderText}
          keyboardAppearance={theme.keyboardAppearance}
          style={styles.destinationInput}
          onFocus={onFocusField(destinationRef)}
          returnKeyType="done"
          onSubmitEditing={() => Keyboard.dismiss()}
        />
        <Text style={styles.charCounter}>{destination.length}/{DESTINATION_MAX_LENGTH}</Text>
        {destinationSuggestions.length > 0 ? (
          <View style={styles.destinationSuggestions}>
            {destinationSuggestions.map((item) => (
              <TouchableOpacity
                key={item.placeId}
                activeOpacity={0.9}
                style={styles.destinationSuggestionRow}
                onPress={() => handlePickDestination(item)}>
                <Ionicons name="location-outline" size={16} color={theme.colors.primary} />
                <View style={styles.destinationSuggestionCopy}>
                  <Text style={styles.destinationSuggestionTitle} numberOfLines={1}>{item.primaryText}</Text>
                  {item.secondaryText ? (
                    <Text style={styles.destinationSuggestionSubtitle} numberOfLines={1}>{item.secondaryText}</Text>
                  ) : null}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
        {/* Free text saves fine — the hint just explains what a picked
            suggestion unlocks. Gone as soon as a place is chosen. */}
        {destination.trim() && !destinationPlace ? (
          <Text style={styles.destinationHint}>{t('trip.destinationWeatherHint')}</Text>
        ) : null}

        {/* Optional date chip. Small pill, centered, secondary affordance. */}
        <View style={styles.dateChipWrap}>
          <Pressable style={styles.dateChip} onPress={() => setRangePickerOpen(true)}>
            <Ionicons name="calendar-outline" size={15} color={theme.colors.primary} />
            <Text style={styles.dateChipValue} numberOfLines={1}>
              {hasUserSelectedDates ? formatRangeDisplay(startDate, endDate) : t('trip.add_dates')}
            </Text>
          </Pressable>
        </View>

        {/* Slideshow cover toggle — enabled by default for new adventures. */}
        <View style={styles.slideshowRow}>
          <View style={styles.slideshowCopy}>
            <Text style={styles.slideshowTitle}>{t('trip.slideshow_label')}</Text>
            <Text style={styles.slideshowSubtitle}>{t('trip.slideshow_hint')}</Text>
          </View>
          <Switch
            value={slideshowEnabled}
            onValueChange={setSlideshowEnabled}
            trackColor={{ false: theme.isDark ? theme.colors.textMuted : '#dfe3e8', true: theme.isDark ? theme.colors.primaryLight20 : theme.colors.primary }}
            thumbColor="#fff"
            ios_backgroundColor={theme.isDark ? theme.colors.textMuted : '#dfe3e8'}
          />
        </View>

        {message ? (
          <View style={[styles.messageBanner, message.type === 'success' ? styles.messageBannerSuccess : styles.messageBannerError]}>
            {/* Light keeps the original deep-tinted icon colors; on the dark
                translucent banner fills those would vanish, so dark uses the
                bright semantic tokens instead. */}
            <Ionicons name={message.type === 'success' ? 'checkmark-circle' : 'alert-circle'} size={18} color={message.type === 'success' ? (theme.isDark ? theme.colors.success : '#16734d') : (theme.isDark ? theme.colors.error : '#a52617')} />
            <Text style={[styles.messageText, message.type === 'success' ? styles.messageTextSuccess : styles.messageTextError]}>
              {message.text}
            </Text>
          </View>
        ) : null}

        {/* Primary CTA — always clickable. Validation handled in saveTrip. */}
        <TouchableOpacity
          activeOpacity={0.9}
          style={[styles.primaryButton, { backgroundColor: theme.colors.primary, shadowColor: theme.colors.primary }]}
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

      {coverImage && coverImageSize ? (
        <ImagePositionerModal
          visible={positioningCover}
          uri={coverImage}
          imageSize={coverImageSize}
          cardAspectRatio={(screenWidth - 44) / previewCardHeight}
          screenWidth={screenWidth}
          insetTop={insets.top}
          insetBottom={insets.bottom}
          confirmLabel={t('common.confirm') || 'Confirm'}
          hintLabel={t('common.dragToPinch') || 'Drag to position · Pinch to zoom'}
          onConfirm={(offset, scale) => {
            setCoverPanOffset(offset);
            setCoverPanScale(scale);
            setPositioningCover(false);
          }}
          onCancel={() => {
            setCoverImage(null);
            setCoverImageSize(null);
            setPositioningCover(false);
          }}
        />
      ) : null}
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

const createStyles = (theme: AppTheme) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.bgPrimary,
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
    color: theme.colors.textPrimary,
  },
  previewLabel: {
    marginTop: SPACING.sm,
    marginBottom: SPACING.sm,
    ...TYPOGRAPHY.eyebrow,
    fontWeight: '800',
    color: theme.colors.textMeta,
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
    // Light: a white pill floating on the white page (the pink border does
    // the work). Dark: one surface step above the page so the pill still
    // reads as a chip.
    backgroundColor: theme.isDark ? theme.colors.surface : '#fff',
    borderWidth: 1,
    borderColor: theme.colors.primaryLight20,
  },
  coverHintText: {
    ...TYPOGRAPHY.label,
    fontWeight: '700',
  },
  coverCard: {
    height: 300,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    backgroundColor: theme.colors.bgLight,
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
    backgroundColor: theme.colors.gradientDark12,
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
    color: theme.colors.white,
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
    backgroundColor: theme.colors.pillDark42,
  },
  coverEditBadgeText: {
    color: theme.colors.white,
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
    color: theme.colors.textMeta,
  },
  requiredAsterisk: {
    color: theme.colors.error,
  },
  charCounter: {
    marginTop: SPACING.xs,
    alignSelf: 'flex-end',
    fontSize: 11,
    fontWeight: '600',
    color: theme.colors.textMeta,
  },
  // Caption-style inputs (NOT form boxes). Borderless, left-aligned, sized
  // like editable title + subtitle of the hero card. Mental model: the user
  // is captioning the trip, not filling in a form.
  titleInput: {
    marginTop: SPACING.xs,
    color: theme.colors.textPrimary,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.6,
    paddingVertical: SPACING.xs,
  },
  destinationInput: {
    marginTop: SPACING.xs,
    color: theme.colors.textSecondary,
    fontSize: 16,
    fontWeight: '500',
    letterSpacing: -0.2,
    paddingVertical: SPACING.xs,
  },
  destinationSuggestions: {
    marginTop: SPACING.xs,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: theme.colors.borderPrimary,
    backgroundColor: theme.colors.bgLight,
    overflow: 'hidden',
  },
  destinationSuggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
  },
  destinationSuggestionCopy: {
    flex: 1,
  },
  destinationSuggestionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textPrimary,
  },
  destinationSuggestionSubtitle: {
    fontSize: 12,
    color: theme.colors.textMeta,
    marginTop: 1,
  },
  destinationHint: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 16,
    color: theme.colors.textMeta,
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
    backgroundColor: theme.colors.bgLight,
    borderWidth: 1,
    borderColor: theme.colors.borderPrimary,
  },
  dateChipValue: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  slideshowRow: {
    marginTop: SPACING.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.sm,
    backgroundColor: theme.colors.bgLight,
    borderWidth: 1,
    borderColor: theme.colors.borderPrimary,
  },
  slideshowCopy: { flex: 1 },
  slideshowTitle: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  slideshowSubtitle: {
    marginTop: 3,
    color: theme.colors.textMeta,
    fontSize: 12.5,
    lineHeight: 18,
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
    backgroundColor: theme.colors.successLight,
    borderWidth: 1,
    borderColor: theme.colors.successBorder,
  },
  messageBannerError: {
    backgroundColor: theme.colors.errorLight,
    borderWidth: 1,
    borderColor: theme.colors.errorBorder,
  },
  messageText: {
    flex: 1,
    ...TYPOGRAPHY.body,
    fontWeight: '600',
  },
  messageTextSuccess: {
    color: theme.colors.success,
  },
  messageTextError: {
    color: theme.colors.error,
  },
  primaryButton: {
    marginTop: SPACING.md,
    height: 72,
    borderRadius: RADIUS.circle,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    // Brand-pink glow: the colored shadowColor stays in both themes (iOS
    // keeps a stronger glow in dark); Android elevation is zeroed in dark —
    // it renders as a muddy gray box there.
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: theme.isDark ? 0.45 : 0.28,
    shadowRadius: 28,
    elevation: theme.isDark ? 0 : 10,
  },
  primaryButtonText: {
    ...TYPOGRAPHY.buttonLarge,
    fontWeight: '900',
    color: theme.colors.white,
  },
});
