import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { cropToPreview, ImagePositionerModal } from '@/components/image-positioner-modal';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Component, forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode, type Ref } from 'react';
import {
  Alert,
  Animated,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { apiFetch, apiJson } from '@/lib/api';
import { useKeyboardFocusScroll } from '@/hooks/useKeyboardFocusScroll';
import { invalidateCache } from '@/lib/cache';
import { CATEGORY_VALUES, getCategorySymbol, type ActivityCategoryValue } from '@/lib/category-symbol';
import { fetchPlaceSuggestions, type PlaceAutocompleteSuggestion } from '@/lib/maps-api';
import { type StoredMapPlace, withLocationMarker } from '@/lib/sidequest-location';
import { withFlightMarkers } from '@/lib/flight-route';
import { DEFAULT_BLUR, MAX_BLUR, MIN_BLUR, withBlurMarker } from '@/lib/activity-blur';
import type { SideQuestActivity } from '@/lib/types';
import { uploadImageIfNeeded } from '@/lib/uploads';
import { maybeRequestPushPermission } from '@/lib/push-notifications';
import { useI18n } from '@/components/i18n-provider';
import { PRIMARY_COLOR, PRIMARY_08, PRIMARY_20, SECONDARY_COLOR } from '@/constants/colors';
import { MOTION_TIMING, MOTION_SPRING, MOTION_TRANSLATE, MOTION_STAGGER } from '@/MOTION_CONSTANTS';
import { useListItemStagger } from '@/hooks/useMotion';

type PickerTarget = 'date' | 'time' | 'revealDate' | 'revealTime' | null;
type MessageState = { type: 'success' | 'error'; text: string } | null;

export type SideQuestFormValues = {
  title: string;
  description: string;
  category: string | null;
  locationQuery: string;
  locationPlace: StoredMapPlace | null;
  flightFrom: string;
  flightTo: string;
  date: string;
  time: string;
  visibility: 'public' | 'hidden';
  revealDate: string;
  revealTime: string;
  teaser: string;
  teaserOffsetMinutes: number | null;
  imageUrl: string | null;
  blurAmount: number;
};

// Category values now come from the shared category visual system
// (lib/category-symbol.ts). Labels are localized via i18n; icons + colors
// come from getCategorySymbol(value).
//
// "sidequest" is excluded from the user-facing chip row — it's no longer a
// category the user picks directly. It's set automatically (see
// applySideQuestToggle below) when "Make this a SideQuest" is switched on,
// and the rest of the app (cards, previews, the detail screen) already
// renders it correctly via getCategorySymbol('sidequest') with no further
// changes, since that's the exact same value this form used to let people
// choose by hand.
const NON_SIDEQUEST_CATEGORY_VALUES = CATEGORY_VALUES.filter((value) => value !== 'sidequest');

/**
 * Strips a leading emoji + optional space from i18n strings like "✈️ Flight"
 * so we can render the Ionicons icon next to a clean text label.
 */
function stripLeadingEmoji(text: string): string {
  return text.replace(/^\p{Extended_Pictographic}️?\s*/u, '');
}

type Props = {
  mode: 'create' | 'edit';
  tripId: string;
  sideQuestId?: string;
  tripStartDate?: string | null;
  tripEndDate?: string | null;
  initialValues?: Partial<SideQuestFormValues>;
  initialImageUrl?: string | null;
  onDirtyChange?: (dirty: boolean) => void;
  // Called the instant a save succeeds, before router.replace navigates.
  // Lets the parent screen tell its unsaved-changes guard that this nav
  // is intentional so the guard doesn't pop the modal (which would also
  // re-trigger save and create the duplicate the user reported).
  onSaved?: () => void;
};

export type SideQuestFormHandle = {
  submitSilently: () => Promise<boolean>;
};

// Title shows single-line (ellipsized) in the trip timeline row; teaser shows
// 2-line in the hidden-activity blur preview card during creation. Both caps
// keep that text from needing to truncate in normal use.
const TITLE_MAX_LENGTH = 45;
const TEASER_MAX_LENGTH = 35;

const TEASER_OPTIONS = [
  { labelKey: 'sidequest.form.teaserOffset2h', value: 120 },
  { labelKey: 'sidequest.form.teaserOffset12h', value: 720 },
  { labelKey: 'sidequest.form.teaserOffset1d', value: 1440 },
];

function SideQuestFormInner({
  mode,
  tripId,
  sideQuestId,
  tripStartDate,
  tripEndDate,
  initialValues,
  initialImageUrl,
  onDirtyChange,
  onSaved,
}: Props, ref: Ref<SideQuestFormHandle>) {
  const insets = useSafeAreaInsets();
  const { t, language } = useI18n();
  const { width: screenWidth } = useWindowDimensions();
  const containerWidth = screenWidth - 44; // content paddingHorizontal: 22 × 2
  const locale = language === 'sv' ? 'sv-SE' : 'en-US';
  const [title, setTitle] = useState(initialValues?.title ?? '');
  const [description, setDescription] = useState(initialValues?.description ?? '');
  const [category, setCategory] = useState<string | null>(initialValues?.category ?? null);
  const [locationQuery, setLocationQuery] = useState(initialValues?.locationQuery ?? '');
  const [locationPlace, setLocationPlace] = useState<StoredMapPlace | null>(initialValues?.locationPlace ?? null);
  const [flightFrom, setFlightFrom] = useState(initialValues?.flightFrom ?? '');
  const [flightTo, setFlightTo] = useState(initialValues?.flightTo ?? '');
  const [locationSuggestions, setLocationSuggestions] = useState<PlaceAutocompleteSuggestion[]>([]);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState('');
  // Default the activity date INTO the trip range. Previously it defaulted to
  // "today", which let you create an activity before the trip even starts
  // (e.g. trip starts the 29th but the activity landed on today's date).
  const [date, setDate] = useState(initialValues?.date ?? defaultActivityDate(tripStartDate, tripEndDate));
  const [time, setTime] = useState(initialValues?.time ?? '');
  const [visibility, setVisibility] = useState<'public' | 'hidden'>(initialValues?.visibility ?? 'public');
  const [revealDate, setRevealDate] = useState(initialValues?.revealDate ?? getDefaultDate());
  const [revealTime, setRevealTime] = useState(initialValues?.revealTime ?? '18:00');
  const [teaser, setTeaser] = useState(initialValues?.teaser ?? '');
  const [teaserOffsetMinutes, setTeaserOffsetMinutes] = useState<number | null>(initialValues?.teaserOffsetMinutes ?? 120);
  const [imageUrl, setImageUrl] = useState<string | null>(initialValues?.imageUrl ?? initialImageUrl ?? null);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [imagePanOffset, setImagePanOffset] = useState({ x: 0, y: 0 });
  const [imagePanScale, setImagePanScale] = useState(1);
  const [positioningImage, setPositioningImage] = useState(false);
  const [blurAmount, setBlurAmount] = useState<number>(initialValues?.blurAmount ?? DEFAULT_BLUR);
  // SideQuest mode is a UI-level concept layered on top of the existing
  // category + visibility fields — no new backend field. An activity is
  // "a SideQuest" if it was tagged category=sidequest OR is hidden (hidden
  // activities are inherently SideQuest moments regardless of how their
  // category happened to be set before this toggle existed).
  const [sideQuestMode, setSideQuestMode] = useState<boolean>(
    (initialValues?.category ?? null) === 'sidequest' || (initialValues?.visibility ?? 'public') === 'hidden',
  );
  // Remembers the category the user had selected (flight/food/sight/other/
  // none) from before SideQuest mode was switched on, so turning it back off
  // restores their original tag instead of leaving it blank.
  const previousCategoryRef = useRef<string | null>(
    (initialValues?.category ?? null) === 'sidequest' ? null : (initialValues?.category ?? null),
  );
  const [pickerTarget, setPickerTarget] = useState<PickerTarget>(null);
  const [message, setMessage] = useState<MessageState>(null);
  const [submitting, setSubmitting] = useState(false);
  // Locks the form's ScrollView for the duration of a SideQuestSlideToActivate
  // drag — belt-and-suspenders alongside that control's own PanResponder
  // gesture-claiming (onPanResponderTerminationRequest: () => false), since
  // Android's native scroll responder can otherwise still win the gesture
  // race in a way a JS-only PanResponder claim doesn't always prevent.
  const [slideToActivateDragging, setSlideToActivateDragging] = useState(false);
  const { scrollRef, onFocusField, scrollViewProps } = useKeyboardFocusScroll();
  const titleRef = useRef<TextInput>(null);
  const flightFromRef = useRef<TextInput>(null);
  const flightToRef = useRef<TextInput>(null);
  const descriptionRef = useRef<TextInput>(null);
  const locationQueryRef = useRef<TextInput>(null);
  const teaserRef = useRef<TextInput>(null);

  // Applies the actual state change once we know it's safe to (i.e. the
  // turn-off-while-hidden confirmation, if needed, has already been accepted).
  function applySideQuestToggle(next: boolean) {
    if (next) {
      previousCategoryRef.current = category === 'sidequest' ? null : category;
      setCategory('sidequest');
    } else {
      setCategory(previousCategoryRef.current);
      setVisibility('public');
    }
    setSideQuestMode(next);
  }

  function handleToggleSideQuest(next: boolean) {
    if (!next && visibility === 'hidden') {
      // Turning SideQuest off while Hidden is selected would silently make
      // the activity public and drop its reveal/teaser settings — surface
      // that consequence before it happens instead of doing it quietly.
      Alert.alert(
        t('sidequest.turnOffConfirmTitle'),
        t('sidequest.turnOffConfirmBody'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('sidequest.turnOff'), style: 'destructive', onPress: () => applySideQuestToggle(false) },
        ],
      );
      return;
    }
    applySideQuestToggle(next);
  }

  // Soft expand + fade + slight upward motion for the Visible/Hidden choice
  // revealed under the toggle. Mirrors useRevealAnimation's hand-built
  // Animated.Value pattern (no layout-height measuring needed, since this is
  // a fade+translate, not an actual height animation) — kept local to this
  // form rather than a shared hook since nothing else needs this exact shape.
  const [sideQuestSectionVisible, setSideQuestSectionVisible] = useState(sideQuestMode);
  const sideQuestSectionOpacity = useRef(new Animated.Value(sideQuestMode ? 1 : 0)).current;
  const sideQuestSectionTranslateY = useRef(new Animated.Value(sideQuestMode ? 0 : MOTION_TRANSLATE.smallY)).current;
  const sideQuestHasMountedRef = useRef(false);
  // Very slight stagger between the two revealed options so the transition
  // reads as intentional rather than everything popping in at once.
  const visibilityOptionStagger = useListItemStagger({
    itemCount: 2,
    gap: MOTION_STAGGER.tight,
    duration: MOTION_TIMING.standard,
    autoStart: false,
    initialValue: sideQuestMode ? 1 : 0,
  });

  useEffect(() => {
    // Skip the entrance animation on initial mount — an activity opened in
    // edit mode that's already a SideQuest shouldn't animate in every time
    // the screen opens, only in direct response to the user toggling it.
    if (!sideQuestHasMountedRef.current) {
      sideQuestHasMountedRef.current = true;
      return;
    }

    if (sideQuestMode) {
      setSideQuestSectionVisible(true);
      Animated.parallel([
        Animated.timing(sideQuestSectionOpacity, { toValue: 1, duration: MOTION_TIMING.standard, useNativeDriver: true }),
        Animated.timing(sideQuestSectionTranslateY, { toValue: 0, duration: MOTION_TIMING.standard, useNativeDriver: true }),
      ]).start();
      visibilityOptionStagger.start();
    } else {
      // Calm collapse — quicker than the reveal, no bounce, no layout yank
      // (it fades + slides down slightly before actually unmounting).
      Animated.parallel([
        Animated.timing(sideQuestSectionOpacity, { toValue: 0, duration: MOTION_TIMING.quick, useNativeDriver: true }),
        Animated.timing(sideQuestSectionTranslateY, { toValue: MOTION_TRANSLATE.smallY, duration: MOTION_TIMING.quick, useNativeDriver: true }),
      ]).start(() => setSideQuestSectionVisible(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sideQuestMode]);

  // Matches create-trip.tsx's identical "cover + fields + primary button"
  // layout convention (insets.bottom + 32) — this form previously used +60,
  // which left a noticeable dead-space gap below the button when scrolled
  // all the way down, making it feel like the button wasn't really at the
  // bottom.
  const bottomPadding = useMemo(() => Math.max(insets.bottom, 18) + 32, [insets.bottom]);
  const revealAtPreview = visibility === 'hidden' ? formatRevealPreview(revealDate, revealTime, locale, t) : t('sidequest.form.revealsNow');
  const tripRangeText =
    tripStartDate && tripEndDate ? `${formatShortDate(tripStartDate, locale)} – ${formatShortDate(tripEndDate, locale)}` : t('sidequest.form.loadingTripDates');
  const today = getDefaultDate();
  const selectedDateBeforeToday = isDateInputValid(date) && date < today;
  const selectedDateOutOfRange =
    tripStartDate && tripEndDate ? !isWithinRange(date, tripStartDate, tripEndDate) : false;
  const revealRange = useMemo(() => getRevealRange(tripStartDate, tripEndDate, date), [date, tripEndDate, tripStartDate]);
  const revealDateOutOfRange =
    visibility === 'hidden' ? !isWithinRange(revealDate, revealRange.min, revealRange.max) : false;
  const revealIsPast =
    visibility === 'hidden' && localDateTime(revealDate, revealTime).getTime() <= Date.now();

  // Keep the activity date inside the trip range once the trip dates are
  // known. Without this, a default/initial date outside the range stays in
  // state while the picker DISPLAYS a clamped value — so tapping the shown
  // (already-clamped) day fires no onChange and the stale out-of-range date
  // gets saved. Clamping state to match what's shown fixes that desync.
  useEffect(() => {
    if (!tripStartDate || !tripEndDate) return;
    if (!isWithinRange(date, tripStartDate, tripEndDate)) {
      setDate(defaultActivityDate(tripStartDate, tripEndDate));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripStartDate, tripEndDate]);

  // Only clamp revealDate when transitioning into Hidden, or when the valid
  // range shifts (e.g. user picked a different activity date). Skip re-runs
  // triggered by our own setRevealDate so the value doesn't bounce visibly.
  const prevVisibilityRef = useRef(visibility);
  const prevRangeRef = useRef(`${revealRange.min}|${revealRange.max}`);
  useEffect(() => {
    if (visibility !== 'hidden') {
      prevVisibilityRef.current = visibility;
      return;
    }
    const visibilityChanged = prevVisibilityRef.current !== 'hidden';
    const rangeKey = `${revealRange.min}|${revealRange.max}`;
    const rangeChanged = prevRangeRef.current !== rangeKey;
    prevVisibilityRef.current = visibility;
    prevRangeRef.current = rangeKey;
    if (!visibilityChanged && !rangeChanged) return;

    if (!isDateInputValid(revealDate) || revealDate < revealRange.min) {
      setRevealDate(revealRange.min);
    } else if (revealDate > revealRange.max) {
      setRevealDate(revealRange.max);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibility, revealRange.min, revealRange.max]);

  useEffect(() => {
    const query = locationQuery.trim();
    if (query.length < 2) {
      setLocationSuggestions([]);
      setLocationLoading(false);
      setLocationError('');
      return;
    }

    if (locationPlace && buildPlaceDisplay(locationPlace) === query) {
      setLocationSuggestions([]);
      setLocationLoading(false);
      setLocationError('');
      return;
    }

    setLocationLoading(true);
    const handle = setTimeout(() => {
      void fetchPlaceSuggestions(query)
        .then((items) => {
          setLocationSuggestions(items);
          setLocationError('');
        })
        .catch((err) => {
          setLocationSuggestions([]);
          setLocationError(err instanceof Error ? err.message : t('sidequest.form.placeSuggestionsFailed'));
        })
        .finally(() => setLocationLoading(false));
    }, 260);

    return () => clearTimeout(handle);
  }, [locationPlace, locationQuery, t]);

  async function handlePickImage() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setMessage({ type: 'error', text: t('sidequest.form.photoPermissionRequired') });
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.92,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setImageUrl(asset.uri);
      const iw = asset.width, ih = asset.height;
      setImageSize({ width: iw, height: ih });
      // Compute the centred initial pan offset so submit-without-pan
      // still crops correctly (cover-scale the image, centre in frame).
      const fW = screenWidth;
      const fH = Math.round(screenWidth * POSITIONER_PREVIEW_H / (screenWidth - POSITIONER_FORM_W_PADDING));
      const coverScale = Math.max(fW / iw, fH / ih);
      const sw = iw * coverScale, sh = ih * coverScale;
      setImagePanOffset({
        x: Math.min(0, fW - sw) / 2,
        y: Math.min(0, fH - sh) / 2,
      });
      setPositioningImage(true);
      setMessage(null);
    }
  }

  async function handlePickPlace(suggestion: PlaceAutocompleteSuggestion) {
    try {
      const place: StoredMapPlace = {
        placeId: suggestion.placeId,
        name: suggestion.primaryText,
        address: suggestion.secondaryText ?? null,
        latitude: suggestion.latitude ?? null,
        longitude: suggestion.longitude ?? null,
        googleMapsUri: suggestion.googleMapsUri ?? null,
      };
      const label = buildPlaceDisplay(place);
      setLocationPlace(place);
      setLocationQuery(label);
      setLocationSuggestions([]);
      setLocationError('');
      setMessage(null);
    } catch {
      setLocationError(t('sidequest.form.placeDetailsFailed'));
    }
  }

  function handleDateChange(event: DateTimePickerEvent, selectedDate?: Date) {
    if (Platform.OS !== 'ios') {
      setPickerTarget(null);
    }

    if (event.type !== 'set' || !selectedDate || !pickerTarget) {
      return;
    }

    if (pickerTarget === 'date') {
      const selectedDateStr = toDateInput(selectedDate);
      const today = getDefaultDate();
      if (selectedDateStr < today) {
        setMessage({ type: 'error', text: t('sidequest.form.dateNotInPast') });
        return;
      }
      setDate(selectedDateStr);
      setMessage(null);
      return;
    }

    if (pickerTarget === 'revealDate') {
      setRevealDate(toDateInput(selectedDate));
      return;
    }

    if (pickerTarget === 'time') {
      setTime(toTimeInput(selectedDate));
      return;
    }

    setRevealTime(toTimeInput(selectedDate));
  }

  function handleActivityDateInput(value: string) {
    const today = getDefaultDate();
    if (isDateInputValid(value) && value < today) {
      setMessage({ type: 'error', text: t('sidequest.form.dateNotInPast') });
      return;
    }
    setDate(value);
    setMessage(null);
  }

  async function saveActivity(): Promise<{ id: string } | null> {
    const normalizedTitle = title.trim();

    if (!normalizedTitle && visibility !== 'hidden') {
      setMessage({ type: 'error', text: t('sidequest.form.emptyTitle') });
      return null;
    }

    const today = getDefaultDate();
    if (date < today) {
      setMessage({ type: 'error', text: t('sidequest.form.dateNotInPast') });
      return null;
    }

    // The activity must fall inside the trip's date range — otherwise it
    // shows up on the calendar before the trip even starts.
    if (tripStartDate && tripEndDate && !isWithinRange(date, tripStartDate, tripEndDate)) {
      setMessage({ type: 'error', text: t('sidequest.form.outsideTripRange', { range: `${formatShortDate(tripStartDate, locale)} – ${formatShortDate(tripEndDate, locale)}` }) });
      return null;
    }

    // A hidden activity with a reveal time in the past would be revealed
    // instantly — which defeats the purpose. Activity DATE may be in the past
    // (history), but the reveal MOMENT must be in the future.
    if (visibility === 'hidden') {
      const revealMs = localDateTime(revealDate, revealTime).getTime();
      if (!Number.isFinite(revealMs) || revealMs <= Date.now()) {
        setMessage({ type: 'error', text: t('sidequest.form.revealMustBeFuture') });
        return null;
      }
    }

    setSubmitting(true);
    setMessage(null);

    try {
      const frameW = screenWidth;
      const frameH = Math.round(screenWidth * POSITIONER_PREVIEW_H / (screenWidth - POSITIONER_FORM_W_PADDING));
      const localUri = imageUrl && !imageUrl.startsWith('http') && imageSize
        ? await cropToPreview(imageUrl, imageSize, imagePanOffset, imagePanScale, frameW, frameH)
        : null;
      const uploadedImageUrl = await uploadImageIfNeeded(localUri ?? imageUrl, 'sidequest');
      const revealAt = visibility === 'hidden' ? combineDateAndTime(revealDate, revealTime) : null;

      // Compose description: location markers first, then flight markers
      // (only when the category is flight). Both are hidden markers parsed
      // back out on read — no backend/DB change required.
      const descriptionWithLocation = withLocationMarker(description.trim() || null, locationQuery.trim() || null, locationPlace);
      const descriptionWithFlight = category === 'flight'
        ? withFlightMarkers(descriptionWithLocation, flightFrom, flightTo)
        : descriptionWithLocation;
      // Store the chosen blur only for hidden activities that actually have a
      // cover image (nothing to blur otherwise).
      const finalDescription = visibility === 'hidden' && uploadedImageUrl
        ? withBlurMarker(descriptionWithFlight, blurAmount)
        : descriptionWithFlight;

      const payload = {
        title: normalizedTitle,
        description: finalDescription,
        category: category || null,
        date,
        // Empty string (not null) so PATCH correctly clears a previously-set
        // time when the user removes it on edit — see UpdateActivityDto.Time.
        time: time.trim(),
        visibility,
        revealAt,
        teaser: visibility === 'hidden' ? teaser.trim() || null : null,
        teaserOffsetMinutes: visibility === 'hidden' && teaser.trim() ? teaserOffsetMinutes : null,
        imageUrl: uploadedImageUrl,
      };

      if (mode === 'edit' && sideQuestId) {
        const response = await apiFetch(`/api/trips/${tripId}/activities/${sideQuestId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...payload,
            clearRevealAt: visibility !== 'hidden',
            clearTeaser: visibility !== 'hidden' || !teaser.trim(),
            clearTeaserOffset: visibility !== 'hidden' || !teaser.trim(),
            clearImage: !uploadedImageUrl,
          }),
        });

        if (!response.ok) {
          throw new Error((await response.text()) || t('sidequest.form.updateFailed'));
        }

        // Activities list for this trip just changed — invalidate the
        // home/calendar cache so the next tab focus reflects the edit.
        invalidateCache(`/api/trips/${tripId}/activities`);

        return { id: sideQuestId };
      } else {
        const response = await apiJson<SideQuestActivity>(`/api/trips/${tripId}/activities`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        invalidateCache(`/api/trips/${tripId}/activities`);

        return { id: response.id };
      }
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : t('sidequest.form.saveFailed') });
      return null;
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit() {
    const saved = await saveActivity();
    if (saved) {
      // Contextual permission prompt: creating your first hidden SideQuest
      // is the moment teaser/reveal pushes become meaningful — no point
      // asking before that, and we only ever actually show the OS dialog
      // once across the app's lifetime regardless of how many times this
      // fires.
      if (mode === 'create' && visibility === 'hidden') {
        void maybeRequestPushPermission();
      }

      // Notify the parent screen so it can flip its unsaved-changes guard
      // off before we navigate. Without this the guard pops "Unsaved
      // changes" mid-save and ends up re-firing save → duplicate activity.
      onSaved?.();
      if (mode === 'edit' && router.canGoBack()) {
        // Editing: return to where Edit was tapped (the activity detail).
        router.back();
      } else {
        // Creating: go forward to the freshly created activity.
        router.replace(`/trip/${tripId}/sidequest/${saved.id}`);
      }
    }
  }

  useImperativeHandle(ref, () => ({
    submitSilently: async () => {
      const saved = await saveActivity();
      return saved !== null;
    },
  }));

  const initialDateForDirty = initialValues?.date ?? '';
  const initialTitleForDirty = initialValues?.title ?? '';
  const initialDescForDirty = initialValues?.description ?? '';
  const initialCategoryForDirty = initialValues?.category ?? null;
  const initialVisibilityForDirty = initialValues?.visibility ?? 'public';
  const initialTeaserForDirty = initialValues?.teaser ?? '';
  const initialImageForDirty = initialValues?.imageUrl ?? initialImageUrl ?? null;
  const initialLocationQueryForDirty = initialValues?.locationQuery ?? '';
  const initialFlightFromForDirty = initialValues?.flightFrom ?? '';
  const initialFlightToForDirty = initialValues?.flightTo ?? '';
  const initialBlurForDirty = initialValues?.blurAmount ?? DEFAULT_BLUR;

  const dirty = mode === 'edit'
    ? (
        title.trim() !== initialTitleForDirty.trim() ||
        description.trim() !== initialDescForDirty.trim() ||
        category !== initialCategoryForDirty ||
        visibility !== initialVisibilityForDirty ||
        teaser.trim() !== initialTeaserForDirty.trim() ||
        (imageUrl ?? null) !== (initialImageForDirty ?? null) ||
        locationQuery.trim() !== initialLocationQueryForDirty.trim() ||
        flightFrom.trim() !== initialFlightFromForDirty.trim() ||
        flightTo.trim() !== initialFlightToForDirty.trim() ||
        (visibility === 'hidden' && !!imageUrl && blurAmount !== initialBlurForDirty) ||
        date !== initialDateForDirty
      )
    : (
        title.trim() !== '' ||
        description.trim() !== '' ||
        category !== null ||
        teaser.trim() !== '' ||
        imageUrl !== null ||
        locationQuery.trim() !== '' ||
        flightFrom.trim() !== '' ||
        flightTo.trim() !== ''
      );

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const pickerValue = useMemo(() => {
    if (pickerTarget === 'date') {
      // Clamp to the trip range so the picker never gets a value outside
      // [minimumDate, maximumDate] — that combination hard-crashes the native
      // iOS picker.
      const v = new Date(`${date}T12:00:00`);
      const min = tripStartDate && isDateInputValid(tripStartDate) ? new Date(`${tripStartDate}T12:00:00`) : undefined;
      const max = tripEndDate && isDateInputValid(tripEndDate) ? new Date(`${tripEndDate}T12:00:00`) : undefined;
      return clampDate(v, min, max);
    }

    if (pickerTarget === 'revealDate') {
      // Clamp to the reveal range for the same crash-safety reason. After
      // changing the activity date the stored revealDate can fall outside the
      // newly computed range until the clamp effect catches up.
      const v = new Date(`${(isDateInputValid(revealDate) ? revealDate : revealRange.min)}T12:00:00`);
      const min = new Date(`${revealRange.min}T12:00:00`);
      const max = new Date(`${revealRange.max}T12:00:00`);
      return clampDate(v, min, max);
    }

    // Time spinner: the date component is irrelevant in mode="time", so use
    // TODAY + the chosen time, built from local components. Parsing a bare
    // "YYYY-MM-DDTHH:mm" string can be interpreted as UTC by Hermes, which
    // makes the spinner drift by the timezone offset (e.g. picking 23:00
    // snaps back to 01:00 in CEST). Avoiding revealDate here also keeps the
    // value clear of any out-of-range date edge cases.
    return localDateTime(getDefaultDate(), revealTime);
  }, [date, pickerTarget, revealDate, revealRange.min, revealRange.max, revealTime, tripStartDate, tripEndDate]);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView
      ref={scrollRef}
      style={styles.scroll}
      contentContainerStyle={[styles.content, { paddingBottom: bottomPadding }]}
      showsVerticalScrollIndicator={false}
      scrollEnabled={!slideToActivateDragging}
      {...scrollViewProps}>
      <TouchableOpacity activeOpacity={0.9} style={styles.coverCard} onPress={() => void handlePickImage()}>
        {imageUrl ? <Image source={{ uri: imageUrl }} style={styles.coverImage} /> : null}
        {!imageUrl ? <View style={styles.coverPlaceholderLayer} /> : null}
        {sideQuestMode && visibility === 'public' ? (
          <View style={styles.sideQuestCoverBadge}>
            <Ionicons name="compass" size={13} color="#fff" />
            <Text style={styles.coverBadgeText}>SideQuest</Text>
          </View>
        ) : null}
        {!imageUrl ? (
          <View style={styles.coverContent}>
            <View style={styles.coverIconCircle}>
              <Ionicons name="image-outline" size={30} color="#fff" />
            </View>
            <Text style={styles.coverTitle}>{t('sidequest.form.addCoverTitle')}</Text>
            <Text style={styles.coverCopy}>{t('sidequest.form.addCoverCopy')}</Text>
          </View>
        ) : (
          <View style={styles.coverBadgeRow}>
            <View style={styles.coverBadge}>
              <Ionicons name="camera-outline" size={14} color="#fff" />
              <Text style={styles.coverBadgeText}>{t('sidequest.form.changeImage')}</Text>
            </View>
            <TouchableOpacity
              activeOpacity={0.88}
              style={[styles.coverBadge, styles.coverBadgeGhost]}
              onPress={() => { setImageUrl(null); setImageSize(null); }}>
              <Ionicons name="trash-outline" size={14} color="#fff" />
              <Text style={styles.coverBadgeText}>{t('common.remove')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>

      <View style={styles.block}>
        <Text style={styles.label}>{t('sidequest.form.titleLabel')} <Text style={styles.labelRequired}>*</Text></Text>
        <TextInput
          ref={titleRef}
          value={title}
          onChangeText={setTitle}
          placeholder={t('sidequest.form.titlePlaceholder')}
          placeholderTextColor="#b7bcc7"
          style={styles.titleInput}
          maxLength={TITLE_MAX_LENGTH}
          onFocus={onFocusField(titleRef)}
          returnKeyType="next"
          onSubmitEditing={() => (category === 'flight' ? flightFromRef.current?.focus() : descriptionRef.current?.focus())}
        />
        <Text style={styles.charCounter}>{title.length}/{TITLE_MAX_LENGTH}</Text>
      </View>

      {!sideQuestMode ? (
        <View style={styles.block}>
          <Text style={styles.label}>{t('sidequest.form.categoryLabel')} <Text style={styles.labelOptional}>{t('common.optionalSuffix')}</Text></Text>
          <View style={styles.categoryRow}>
            {NON_SIDEQUEST_CATEGORY_VALUES.map((value) => {
              const symbol = getCategorySymbol(value);
              const active = category === value;
              const label = stripLeadingEmoji(t(symbol.labelKey));
              return (
                <TouchableOpacity
                  key={value}
                  activeOpacity={0.8}
                  style={[styles.categoryChip, active && { borderColor: PRIMARY_COLOR, backgroundColor: PRIMARY_08 }]}
                  onPress={() => setCategory(active ? null : value)}>
                  <Ionicons
                    name={symbol.icon}
                    size={16}
                    color={active ? PRIMARY_COLOR : symbol.iconColor}
                    style={{ marginRight: 6 }}
                  />
                  <Text style={[styles.categoryLabel, active && { color: PRIMARY_COLOR, fontWeight: '600' }]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ) : null}

      {category === 'flight' ? (
        <View style={styles.block}>
          <Text style={styles.label}>{t('sidequest.form.flightRouteLabel')} <Text style={styles.labelOptional}>{t('common.optionalSuffix')}</Text></Text>
          <View style={styles.flightRow}>
            <View style={styles.flightField}>
              <Text style={styles.flightFieldLabel}>{t('sidequest.form.flightFrom')}</Text>
              <TextInput
                ref={flightFromRef}
                value={flightFrom}
                onChangeText={setFlightFrom}
                placeholder="CPH"
                placeholderTextColor="#b7bcc7"
                autoCapitalize="characters"
                style={styles.flightInput}
                onFocus={onFocusField(flightFromRef)}
                returnKeyType="next"
                onSubmitEditing={() => flightToRef.current?.focus()}
              />
            </View>
            <View style={styles.flightArrow}>
              <Ionicons name="airplane" size={18} color={SECONDARY_COLOR} />
            </View>
            <View style={styles.flightField}>
              <Text style={styles.flightFieldLabel}>{t('sidequest.form.flightTo')}</Text>
              <TextInput
                ref={flightToRef}
                value={flightTo}
                onChangeText={setFlightTo}
                placeholder="HND"
                placeholderTextColor="#b7bcc7"
                autoCapitalize="characters"
                style={styles.flightInput}
                onFocus={onFocusField(flightToRef)}
                returnKeyType="next"
                onSubmitEditing={() => descriptionRef.current?.focus()}
              />
            </View>
          </View>
          {flightFrom.trim() || flightTo.trim() ? (
            <View style={styles.flightPreview}>
              <Ionicons name="airplane-outline" size={15} color={SECONDARY_COLOR} />
              <Text style={styles.flightPreviewText}>
                {flightFrom.trim() && flightTo.trim()
                  ? `${flightFrom.trim()} → ${flightTo.trim()}`
                  : flightFrom.trim() || flightTo.trim()}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={styles.block}>
        <Text style={styles.label}>{t('sidequest.form.descriptionLabel')} <Text style={styles.labelOptional}>{t('common.optionalSuffix')}</Text></Text>
        <TextInput
          ref={descriptionRef}
          value={description}
          onChangeText={setDescription}
          placeholder={t('sidequest.form.descriptionPlaceholder')}
          placeholderTextColor="#b7bcc7"
          multiline
          textAlignVertical="top"
          style={styles.textArea}
          onFocus={onFocusField(descriptionRef)}
        />
      </View>

      <View style={styles.block}>
        <Text style={styles.label}>{t('sidequest.form.locationLabel')} <Text style={styles.labelOptional}>{t('common.optionalSuffix')}</Text></Text>
        <TextInput
          ref={locationQueryRef}
          value={locationQuery}
          onChangeText={(value) => {
            setLocationQuery(value);
            if (locationPlace && buildPlaceDisplay(locationPlace) !== value.trim()) {
              setLocationPlace(null);
            }
          }}
          placeholder={t('sidequest.form.locationPlaceholder')}
          placeholderTextColor="#b7bcc7"
          style={styles.input}
          onFocus={onFocusField(locationQueryRef)}
          returnKeyType="done"
          onSubmitEditing={() => Keyboard.dismiss()}
        />
        <Text style={styles.helperText}>{t('sidequest.form.locationHelper')}</Text>
        {locationLoading ? <Text style={styles.locationStatus}>{t('sidequest.form.searchingPlaces')}</Text> : null}
        {locationError ? <Text style={styles.locationError}>{locationError}</Text> : null}
        {locationSuggestions.length > 0 ? (
          <View style={styles.locationSuggestions}>
            {locationSuggestions.map((item) => (
              <TouchableOpacity
                key={item.placeId}
                activeOpacity={0.9}
                style={styles.locationSuggestionRow}
                onPress={() => void handlePickPlace(item)}>
                <Ionicons name="location-outline" size={16} color={SECONDARY_COLOR} />
                <View style={styles.locationSuggestionCopy}>
                  <Text style={styles.locationSuggestionTitle}>{item.primaryText}</Text>
                  {item.secondaryText ? <Text style={styles.locationSuggestionSubtitle}>{item.secondaryText}</Text> : null}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
      </View>

      <View style={styles.block}>
        <Text style={styles.label}>{t('sidequest.form.whenLabel')} <Text style={styles.labelRequired}>*</Text></Text>
        <View style={styles.revealRow}>
          {Platform.OS === 'web' ? (
            <View style={[styles.selectionCard, styles.revealCard, selectedDateOutOfRange || selectedDateBeforeToday ? styles.selectionCardError : null]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.selectionEyebrow}>{t('sidequest.form.activityDateEyebrow')}</Text>
                <TextInput
                  value={date}
                  onChangeText={handleActivityDateInput}
                  placeholder="ÅÅÅÅ-MM-DD"
                  placeholderTextColor="#b7bcc7"
                  style={styles.webDateInput}
                  keyboardType="numbers-and-punctuation"
                  maxLength={10}
                />
                <Text style={styles.selectionHint}>{t('sidequest.form.withinRange', { range: tripRangeText })}</Text>
              </View>
              <Ionicons name="calendar-outline" size={22} color="#5f6570" />
            </View>
          ) : (
            <TouchableOpacity
              activeOpacity={0.92}
              style={[
                styles.selectionCard,
                styles.revealCard,
                pickerTarget === 'date' ? styles.selectionCardActive : null,
                selectedDateOutOfRange || selectedDateBeforeToday ? styles.selectionCardError : null,
              ]}
              onPress={() => setPickerTarget('date')}>
              <View style={{ flex: 1 }}>
                <Text style={styles.selectionEyebrow}>{t('sidequest.form.activityDateEyebrow')}</Text>
                <Text style={styles.selectionValue} numberOfLines={1}>{formatLongDate(date, locale)}</Text>
                <Text style={styles.selectionHint}>{t('sidequest.form.withinRange', { range: tripRangeText })}</Text>
              </View>
              <Ionicons name="calendar-outline" size={22} color="#5f6570" />
            </TouchableOpacity>
          )}
          {Platform.OS === 'web' ? (
            <View style={[styles.selectionCard, styles.revealCard]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.selectionEyebrow}>{t('sidequest.form.activityTimeEyebrow')} <Text style={styles.labelOptional}>{t('common.optionalSuffix')}</Text></Text>
                <TextInput
                  value={time}
                  onChangeText={setTime}
                  placeholder="HH:MM"
                  placeholderTextColor="#b7bcc7"
                  style={styles.webDateInput}
                  maxLength={5}
                />
              </View>
              <Ionicons name="time-outline" size={22} color="#5f6570" />
            </View>
          ) : (
            <TouchableOpacity
              activeOpacity={0.92}
              style={[styles.selectionCard, styles.revealCard, pickerTarget === 'time' ? styles.selectionCardActive : null]}
              onPress={() => setPickerTarget('time')}>
              <View style={{ flex: 1 }}>
                <Text style={styles.selectionEyebrow}>{t('sidequest.form.activityTimeEyebrow')} <Text style={styles.labelOptional}>{t('common.optionalSuffix')}</Text></Text>
                <Text style={styles.selectionValue} numberOfLines={1}>{time ? formatTime(time) : t('sidequest.form.activityTimeEmpty')}</Text>
              </View>
              {time ? (
                <TouchableOpacity
                  activeOpacity={0.7}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  onPress={(e) => {
                    e.stopPropagation();
                    setTime('');
                  }}>
                  <Ionicons name="close-circle" size={22} color="#b7bcc7" />
                </TouchableOpacity>
              ) : (
                <Ionicons name="time-outline" size={22} color="#5f6570" />
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.block}>
        {sideQuestMode ? (
          <SideQuestActiveStatusRow onTurnOff={() => handleToggleSideQuest(false)} />
        ) : (
          <SideQuestSlideToActivate onActivate={() => applySideQuestToggle(true)} onDragStateChange={setSlideToActivateDragging} />
        )}
        {sideQuestSectionVisible ? (
          <Animated.View
            style={{
              marginTop: 20,
              opacity: sideQuestSectionOpacity,
              transform: [{ translateY: sideQuestSectionTranslateY }],
            }}>
            <Text style={styles.label}>{t('sidequest.form.visibilityLabel')}</Text>
            <View style={styles.segmented}>
              <Animated.View style={visibilityOptionStagger.getAnimatedStyle(0)}>
                <VisibilityOption
                  label={t('sidequest.form.visiblePublicLabel')}
                  subtitle={t('sidequest.form.visiblePublicSubtitle')}
                  active={visibility === 'public'}
                  onPress={() => {
                    setVisibility('public');
                    setPickerTarget(null);
                  }}
                />
              </Animated.View>
              <Animated.View style={visibilityOptionStagger.getAnimatedStyle(1)}>
                <VisibilityOption
                  label={t('sidequest.form.visibleHiddenLabel')}
                  subtitle={t('sidequest.form.visibleHiddenSubtitle')}
                  active={visibility === 'hidden'}
                  onPress={() => setVisibility('hidden')}
                />
              </Animated.View>
            </View>
          </Animated.View>
        ) : null}
      </View>

      {visibility === 'hidden' ? (
        <>
          <View style={styles.block}>
            <Text style={styles.label}>{t('sidequest.form.revealScheduleLabel')} <Text style={styles.labelRequired}>*</Text></Text>
            <View style={styles.revealRow}>
              {Platform.OS === 'web' ? (
                <View style={[styles.selectionCard, styles.revealCard, revealDateOutOfRange ? styles.selectionCardError : null]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.selectionEyebrow}>{t('sidequest.form.revealDateEyebrow')}</Text>
                    <TextInput
                      value={revealDate}
                      onChangeText={setRevealDate}
                      placeholder="ÅÅÅÅ-MM-DD"
                      placeholderTextColor="#b7bcc7"
                      style={styles.webDateInput}
                      keyboardType="numbers-and-punctuation"
                      maxLength={10}
                    />
                    <Text style={styles.selectionHint} numberOfLines={1}>{`${formatShortDate(revealRange.min, locale)} – ${formatShortDate(revealRange.max, locale)}`}</Text>
                  </View>
                  <Ionicons name="calendar-outline" size={22} color="#5f6570" />
                </View>
              ) : (
                <TouchableOpacity
                  activeOpacity={0.92}
                  style={[
                    styles.selectionCard,
                    styles.revealCard,
                    pickerTarget === 'revealDate' ? styles.selectionCardActive : null,
                    revealDateOutOfRange ? styles.selectionCardError : null,
                  ]}
                  onPress={() => setPickerTarget('revealDate')}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.selectionEyebrow}>{t('sidequest.form.revealDateEyebrow')}</Text>
                    <Text style={styles.selectionValue} numberOfLines={1}>{formatShortDate(revealDate, locale)}</Text>
                    <Text style={styles.selectionHint} numberOfLines={1}>{`${formatShortDate(revealRange.min, locale)} – ${formatShortDate(revealRange.max, locale)}`}</Text>
                  </View>
                  <Ionicons name="calendar-outline" size={22} color="#5f6570" />
                </TouchableOpacity>
              )}
              {Platform.OS === 'web' ? (
                <View style={[styles.selectionCard, styles.revealCard]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.selectionEyebrow}>{t('sidequest.form.revealTimeEyebrow')}</Text>
                    <TextInput
                      value={revealTime}
                      onChangeText={setRevealTime}
                      placeholder="HH:MM"
                      placeholderTextColor="#b7bcc7"
                      style={styles.webDateInput}
                      maxLength={5}
                    />
                  </View>
                  <Ionicons name="time-outline" size={22} color="#5f6570" />
                </View>
              ) : (
                <TouchableOpacity activeOpacity={0.92} style={[styles.selectionCard, styles.revealCard, pickerTarget === 'revealTime' ? styles.selectionCardActive : null]} onPress={() => setPickerTarget('revealTime')}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.selectionEyebrow}>{t('sidequest.form.revealTimeEyebrow')}</Text>
                    <Text style={styles.selectionValue} numberOfLines={1}>{formatTime(revealTime)}</Text>
                  </View>
                  <Ionicons name="time-outline" size={22} color="#5f6570" />
                </TouchableOpacity>
              )}
            </View>
            <View style={[styles.revealSummary, revealIsPast ? styles.revealSummaryWarn : null]}>
              <Ionicons
                name={revealIsPast ? 'alert-circle-outline' : 'sparkles-outline'}
                size={16}
                color={revealIsPast ? '#a52617' : PRIMARY_COLOR}
              />
              <Text style={[styles.revealSummaryText, revealIsPast ? styles.revealSummaryTextWarn : null]} numberOfLines={2}>
                {revealIsPast ? t('sidequest.form.revealTimePast') : revealAtPreview}
              </Text>
            </View>
          </View>

          <View style={styles.block}>
            <Text style={styles.label}>{t('sidequest.form.teaserLabel')} <Text style={styles.labelOptional}>{t('common.optionalSuffix')}</Text></Text>
            <TextInput
              ref={teaserRef}
              value={teaser}
              onChangeText={setTeaser}
              placeholder={t('sidequest.form.teaserPlaceholder')}
              placeholderTextColor="#b7bcc7"
              style={styles.input}
              maxLength={TEASER_MAX_LENGTH}
              onFocus={onFocusField(teaserRef)}
              returnKeyType="done"
              onSubmitEditing={() => Keyboard.dismiss()}
            />
            <Text style={styles.charCounter}>{teaser.length}/{TEASER_MAX_LENGTH}</Text>
            {teaser.trim() ? (
              <View style={styles.teaserOptions}>
                {TEASER_OPTIONS.map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    activeOpacity={0.9}
                    style={[styles.teaserChip, teaserOffsetMinutes === option.value ? styles.teaserChipActive : null]}
                    onPress={() => setTeaserOffsetMinutes(option.value)}>
                    <Text style={[styles.teaserChipText, teaserOffsetMinutes === option.value ? styles.teaserChipTextActive : null]}>
                      {t(option.labelKey)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <Text style={styles.helperText}>{t('sidequest.form.teaserHelper')}</Text>
            )}
          </View>

          {imageUrl ? (
            <View style={styles.block}>
              <Text style={styles.label}>{t('sidequest.form.previewLabel')}</Text>
              <Text style={styles.helperText}>{t('sidequest.form.previewHelper')}</Text>
              <View style={styles.blurPreviewCard}>
                <Image source={{ uri: imageUrl }} style={styles.blurPreviewImage} blurRadius={blurAmount} />
                <View style={styles.blurPreviewOverlay} />
                <View style={styles.blurPreviewBadge}>
                  <Ionicons name="eye-off-outline" size={14} color="#fff" />
                  <Text style={styles.blurPreviewBadgeText}>{t('sidequest.form.hiddenUntilReveal')}</Text>
                </View>
                {teaser.trim() ? (
                  <Text style={styles.blurPreviewTeaser} numberOfLines={2}>{teaser.trim()}</Text>
                ) : null}
              </View>
              <BlurSlider value={blurAmount} min={MIN_BLUR} max={MAX_BLUR} onChange={setBlurAmount} />
              <View style={styles.blurSliderLabels}>
                <Text style={styles.blurSliderLabel}>{t('sidequest.form.lessBlur')}</Text>
                <Text style={styles.blurSliderLabel}>{t('sidequest.form.moreBlur')}</Text>
              </View>
            </View>
          ) : null}
        </>
      ) : null}

      {message ? (
        <View style={[styles.messageBanner, message.type === 'success' ? styles.messageBannerSuccess : styles.messageBannerError]}>
          <Ionicons name={message.type === 'success' ? 'checkmark-circle' : 'alert-circle'} size={18} color={message.type === 'success' ? '#16734d' : '#a52617'} />
          <Text style={[styles.messageText, message.type === 'success' ? styles.messageTextSuccess : styles.messageTextError]}>{message.text}</Text>
        </View>
      ) : null}

      <TouchableOpacity activeOpacity={0.92} style={[styles.primaryButton, { backgroundColor: PRIMARY_COLOR, shadowColor: PRIMARY_COLOR }, submitting ? styles.primaryButtonDisabled : null]} disabled={submitting} onPress={() => void handleSubmit()}>
        <Text style={styles.primaryButtonText}>{submitting ? t('sidequest.form.saving') : mode === 'edit' ? t('sidequest.form.saveChanges') : t('sidequest.form.addActivity')}</Text>
      </TouchableOpacity>

      {Platform.OS !== 'web' ? (
        <PickerSheet
          visible={pickerTarget !== null}
          title={getPickerTitle(pickerTarget, t)}
          subtitle={
            pickerTarget === 'date' ? t('sidequest.form.allowedRange', { range: tripRangeText })
              : pickerTarget === 'time' ? t('sidequest.form.chooseActivityTime')
              : pickerTarget === 'revealDate' ? t('sidequest.form.chooseRevealMoment')
              : t('sidequest.form.chooseRevealTime')
          }
          onClose={() => setPickerTarget(null)}>
          {pickerTarget === 'revealTime' || pickerTarget === 'time' ? (
            // Custom on-brand time wheel. Avoids the native time picker, whose
            // spinner display hard-crashes under the New Architecture (Fabric)
            // that Expo Go force-enables, and whose 'default' display looks
            // out of place inside this sheet.
            <TimeWheel
              value={pickerTarget === 'time' ? time : revealTime}
              onChange={pickerTarget === 'time' ? setTime : setRevealTime}
            />
          ) : pickerTarget ? (
            <DateTimePicker
              // Force a fresh native picker view per target so Fabric never
              // reuses one native view and mutates its mode/display/value.
              key={pickerTarget}
              value={pickerValue}
              mode="date"
              // Inline shows the calendar immediately on iOS. Safe now that
              // time uses the custom wheel — there's no native date→time mode
              // switch left to crash Fabric.
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              minimumDate={
                pickerTarget === 'date'
                  ? tripStartDate ? new Date(`${tripStartDate}T12:00:00`) : undefined
                  : pickerTarget === 'revealDate' ? new Date(`${revealRange.min}T12:00:00`) : undefined
              }
              maximumDate={
                pickerTarget === 'date'
                  ? tripEndDate ? new Date(`${tripEndDate}T12:00:00`) : undefined
                  : pickerTarget === 'revealDate' ? new Date(`${revealRange.max}T12:00:00`) : undefined
              }
              themeVariant="light"
              accentColor={PRIMARY_COLOR}
              textColor="#161821"
              onChange={handleDateChange}
            />
          ) : null}
        </PickerSheet>
      ) : null}
    </ScrollView>

    {imageUrl && imageSize ? (
      <ImagePositionerModal
        visible={positioningImage}
        uri={imageUrl}
        imageSize={imageSize}
        screenWidth={screenWidth}
        insetTop={insets.top}
        insetBottom={insets.bottom}
        cardAspectRatio={(screenWidth - POSITIONER_FORM_W_PADDING) / POSITIONER_PREVIEW_H}
        onConfirm={(offset, scale) => { setImagePanOffset(offset); setImagePanScale(scale); setPositioningImage(false); }}
        onCancel={() => { setImageUrl(null); setImageSize(null); setPositioningImage(false); }}
        confirmLabel={t('common.confirm') || 'Confirm'}
      />
    ) : null}

    </KeyboardAvoidingView>
  );
}

// ── Custom time wheel ───────────────────────────────────────────────────────
// Two snap-scrolling columns (hours / minutes) styled with the app's design
// language. Replaces the native time picker, which crashes on Fabric and looks
// out of place here. Minute precision is 5 minutes (plenty for reveal timing).

const WHEEL_ITEM_HEIGHT = 46;
const WHEEL_VISIBLE = 5; // odd number so one item sits centered
const WHEEL_HEIGHT = WHEEL_ITEM_HEIGHT * WHEEL_VISIBLE;
const WHEEL_PAD = (WHEEL_HEIGHT - WHEEL_ITEM_HEIGHT) / 2;
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);

function parseRevealTime(value: string): { hour: number; minute: number } {
  const [hRaw, mRaw] = (value || '18:00').split(':');
  let hour = parseInt(hRaw, 10);
  let minute = parseInt(mRaw, 10);
  if (!Number.isFinite(hour)) hour = 18;
  if (!Number.isFinite(minute)) minute = 0;
  hour = Math.max(0, Math.min(23, hour));
  // Snap minute to the nearest 5 so it aligns with a wheel slot.
  minute = Math.max(0, Math.min(55, Math.round(minute / 5) * 5));
  return { hour, minute };
}

function WheelColumn({ data, selected, onSelect }: { data: number[]; selected: number; onSelect: (value: number) => void }) {
  const scrollRef = useRef<ScrollView>(null);
  const didInit = useRef(false);
  const selectedIndex = Math.max(0, data.indexOf(selected));

  const scrollToIndex = (index: number, animated: boolean) => {
    scrollRef.current?.scrollTo({ y: index * WHEEL_ITEM_HEIGHT, animated });
  };

  const handleMomentumEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    // snapToInterval already settles the offset on a slot; just read it.
    const index = Math.round(event.nativeEvent.contentOffset.y / WHEEL_ITEM_HEIGHT);
    const clamped = Math.max(0, Math.min(data.length - 1, index));
    const value = data[clamped];
    if (value !== selected) onSelect(value);
  };

  return (
    <View style={styles.wheelColumn}>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={WHEEL_ITEM_HEIGHT}
        decelerationRate="fast"
        contentContainerStyle={{ paddingVertical: WHEEL_PAD }}
        onLayout={() => {
          if (!didInit.current) {
            didInit.current = true;
            scrollToIndex(selectedIndex, false);
          }
        }}
        onMomentumScrollEnd={handleMomentumEnd}>
        {data.map((value) => {
          const active = value === selected;
          return (
            <TouchableOpacity
              key={value}
              activeOpacity={0.7}
              style={styles.wheelItem}
              onPress={() => {
                onSelect(value);
                scrollToIndex(data.indexOf(value), true);
              }}>
              <Text style={[styles.wheelItemText, active ? styles.wheelItemTextActive : null]}>
                {String(value).padStart(2, '0')}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

function TimeWheel({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const { hour, minute } = parseRevealTime(value);

  const update = (nextHour: number, nextMinute: number) => {
    onChange(`${String(nextHour).padStart(2, '0')}:${String(nextMinute).padStart(2, '0')}`);
  };

  return (
    <View style={styles.wheelWrap}>
      {/* Center highlight band sits behind both columns */}
      <View pointerEvents="none" style={styles.wheelHighlight} />
      <WheelColumn data={HOURS} selected={hour} onSelect={(h) => update(h, minute)} />
      <Text style={styles.wheelColon}>:</Text>
      <WheelColumn data={MINUTES} selected={minute} onSelect={(m) => update(hour, m)} />
    </View>
  );
}

// ── Blur slider ─────────────────────────────────────────────────────────────
// Lightweight horizontal slider built on PanResponder (no extra package, no
// native view to crash on Fabric). Maps touch position on the track to a value.

function BlurSlider({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (next: number) => void }) {
  const trackRef = useRef<View>(null);
  // Absolute page-X of the track's left edge + its width. Using absolute
  // screen coordinates (gestureState.moveX) avoids the jumpiness you get from
  // locationX, which flips reference frames when the finger crosses the
  // thumb/fill child views.
  const geom = useRef({ x: 0, width: 0 });

  const measureTrack = () => {
    trackRef.current?.measure((_x, _y, width, _h, pageX) => {
      geom.current = { x: pageX, width };
    });
  };

  const setFromAbsoluteX = (absoluteX: number) => {
    const { x, width } = geom.current;
    if (width <= 0) return;
    const rel = Math.max(0, Math.min(width, absoluteX - x));
    onChange(Math.round(min + (rel / width) * (max - min)));
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (_evt, gesture) => setFromAbsoluteX(gesture.x0),
      onPanResponderMove: (_evt, gesture) => setFromAbsoluteX(gesture.moveX),
    }),
  ).current;

  const pct = max > min ? Math.max(0, Math.min(1, (value - min) / (max - min))) : 0;

  return (
    // Tall, invisible touch area (full width) makes the thin track easy to
    // grab. We measure this same view, and the visible track inside spans the
    // same horizontal extent, so the value mapping stays aligned.
    <View
      ref={trackRef}
      style={styles.sliderTouchArea}
      onLayout={measureTrack}
      {...responder.panHandlers}>
      <View pointerEvents="none" style={styles.sliderTrack}>
        <View style={[styles.sliderFill, { width: `${pct * 100}%` }]} />
        <View style={[styles.sliderThumb, { left: `${pct * 100}%` }]} />
      </View>
    </View>
  );
}

// Catches render-time errors from the native date/time picker so a bad value
// surfaces as an on-screen message instead of taking down the whole app.
class PickerErrorBoundary extends Component<{ children: ReactNode; t: (key: string, vars?: Record<string, string | number>) => string }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <Text style={{ color: '#a52617', fontSize: 13, padding: 16, textAlign: 'center' }}>
          {this.props.t('sidequest.form.timePickerFailed', { message: this.state.error.message })}
        </Text>
      );
    }
    return this.props.children;
  }
}

function PickerSheet({
  visible,
  title,
  subtitle,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  subtitle: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={onClose} />
        <View style={styles.modalCard}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>{title}</Text>
          <Text style={styles.modalSubtitle}>{subtitle}</Text>
          <View style={styles.modalPickerWrap}>
            <PickerErrorBoundary t={t}>{children}</PickerErrorBoundary>
          </View>
          <TouchableOpacity activeOpacity={0.9} style={[styles.doneButton, { backgroundColor: PRIMARY_COLOR }]} onPress={onClose}>
            <Text style={styles.doneButtonText}>{t('common.done')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function VisibilityOption({
  label,
  subtitle,
  active,
  onPress,
}: {
  label: string;
  subtitle: string;
  active: boolean;
  onPress: () => void;
}) {  return (
    <TouchableOpacity activeOpacity={0.92} style={[styles.segmentOption, active && { borderColor: PRIMARY_20, backgroundColor: PRIMARY_08 }]} onPress={onPress}>
      <Text style={[styles.segmentTitle, active && { color: PRIMARY_COLOR }]}>{label}</Text>
      <Text style={[styles.segmentSubtitle, active && { color: PRIMARY_20 }]}>{subtitle}</Text>
    </TouchableOpacity>
  );
}

// ── SideQuest mode toggle ───────────────────────────────────────────────────
// A normal activity is "made into" a SideQuest here, at Visibility — not
// chosen as a category up front. Uses the same compass glyph as
// getCategorySymbol('sidequest') so the toggle's steady-state icon matches
// every card/preview that will render this activity once saved. The brief
// sparkle pop on activation is the "unlock" moment; turning off never plays
// it in reverse — just a calm fade, per the brief.

const SIDEQUEST_ICON_COLOR_ON = '#7c3aed'; // matches CATEGORY_SYMBOLS.sidequest.iconColor
const SIDEQUEST_ICON_COLOR_OFF = '#b7bcc7';

// ── Slide-to-activate (OFF state) ───────────────────────────────────────────
// A phone-unlock-style drag, not a flip switch — SideQuest is the app's
// signature feature, so turning it on gets its own small ceremony. Built on
// the same hand-rolled PanResponder approach as BlurSlider above (no new
// gesture dependency), but deliberately does NOT claim the responder on
// touch-start the way BlurSlider does: BlurSlider's touch target is a thin
// track where that's harmless, but this control is full-width and tall, so
// claiming every touch-down would eat vertical scroll gestures that happen
// to start on top of it. Only claiming once a move is clearly horizontal
// (see onMoveShouldSetPanResponder) keeps the ScrollView free to scroll.
const SLIDE_TRACK_HEIGHT = 54;
const SLIDE_THUMB_SIZE = 46;
const SLIDE_TRACK_PADDING = 4;
// Was 0.82 — needing the thumb dragged almost flush against the far edge
// read as "stuck"/unresponsive. 0.62 still feels deliberate (not an
// accidental flick) without demanding the very last few pixels of travel.
const SLIDE_COMPLETION_THRESHOLD = 0.62;
const SLIDE_HAPTIC_THRESHOLD = 0.35;
// Bold, saturated gradient backdrop — deliberately more vivid than the rest
// of the form's pastel palette, since this one control is meant to stand out
// as the app's signature moment rather than blend in. Built from the app's
// own brand colors (secondary teal → primary pink) rather than an unrelated
// palette, so it still reads as "this app" instead of a generic gradient.
const SLIDE_TRACK_GRADIENT_COLORS = [SECONDARY_COLOR, PRIMARY_COLOR] as const;

// Scattered, independently-timed glints across the track — an idle ambient
// loop, unrelated to drag progress, so it keeps going at rest. Positions/
// delays/durations are hand-picked (not randomized at runtime) so they're
// stable across re-renders and don't all happen to sync up.
const TRACK_SPARKLES = [
  { left: '6%', topOffset: -7, delay: 0, duration: 2200 },
  { left: '18%', topOffset: 5, delay: 750, duration: 2000 },
  { left: '30%', topOffset: 6, delay: 600, duration: 2600 },
  { left: '41%', topOffset: -6, delay: 1400, duration: 2300 },
  { left: '52%', topOffset: -5, delay: 1200, duration: 1900 },
  { left: '63%', topOffset: 7, delay: 200, duration: 2500 },
  { left: '72%', topOffset: 7, delay: 300, duration: 2400 },
  { left: '80%', topOffset: -6, delay: 1050, duration: 2100 },
  { left: '88%', topOffset: -4, delay: 900, duration: 2100 },
  { left: '95%', topOffset: 5, delay: 450, duration: 2350 },
] as const;

function TrackSparkle({ left, topOffset, delay, duration }: { left: `${number}%`; topOffset: number; delay: number; duration: number }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(opacity, { toValue: 1, duration: duration * 0.35, useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1, duration: duration * 0.35, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(opacity, { toValue: 0, duration: duration * 0.45, useNativeDriver: true }),
          Animated.timing(scale, { toValue: 0.5, duration: duration * 0.45, useNativeDriver: true }),
        ]),
        Animated.delay(duration * 0.4),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [delay, duration, opacity, scale]);

  return (
    <Animated.View
      style={[
        styles.trackSparkle,
        { left, top: SLIDE_TRACK_HEIGHT / 2 - 2 + topOffset, opacity, transform: [{ scale }] },
      ]}
    />
  );
}

function SideQuestSlideToActivate({
  onActivate,
  onDragStateChange,
}: {
  onActivate: () => void;
  // Lets the parent ScrollView lock scrollEnabled for the drag's duration —
  // see the slideToActivateDragging comment at this component's call site.
  onDragStateChange?: (dragging: boolean) => void;
}) {
  const { t } = useI18n();
  const [trackWidth, setTrackWidth] = useState(0);
  const progressAnim = useRef(new Animated.Value(0)).current; // 0..1, JS-driven (drives width + translateX)
  const sparkOpacity = useRef(new Animated.Value(0)).current;
  const hapticFiredRef = useRef(false);
  // PanResponder.create() below runs ONCE (it's memoized in a useRef), so its
  // callbacks close over whatever maxTranslate was on that first render —
  // which is computed from trackWidth before onLayout has ever measured
  // anything (0). Without this ref, every drag would divide by that stale,
  // near-zero value and "complete" after a couple of pixels. Reading a ref
  // inside the callback (instead of a plain closed-over number) means the
  // callback sees whatever the latest layout measured, not the first one.
  const maxTranslateRef = useRef(1);
  const maxTranslate = Math.max(1, trackWidth - SLIDE_THUMB_SIZE - SLIDE_TRACK_PADDING * 2);
  maxTranslateRef.current = maxTranslate;

  function springBack() {
    Animated.spring(progressAnim, { toValue: 0, useNativeDriver: false, ...MOTION_SPRING.smooth }).start();
  }

  function completeActivation() {
    Animated.timing(progressAnim, { toValue: 1, duration: 120, useNativeDriver: false }).start(() => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Animated.sequence([
        Animated.timing(sparkOpacity, { toValue: 1, duration: 100, useNativeDriver: true }),
        Animated.timing(sparkOpacity, { toValue: 0, duration: 160, useNativeDriver: true }),
      ]).start();
      onActivate();
    });
  }

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      // Was dx > 6 && dx > dy * 1.5 — needed an almost perfectly straight
      // drag to even start, which combined with the thumb-only touch target
      // (see panHandlers placement below) made the very first pixels of a
      // real-thumb drag get ignored. Loosened on both axes now that the
      // whole track is the touch target, not just the small thumb.
      onMoveShouldSetPanResponder: (_evt, gesture) =>
        Math.abs(gesture.dx) > 3 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.1,
      onPanResponderGrant: () => {
        hapticFiredRef.current = false;
        onDragStateChange?.(true);
      },
      onPanResponderMove: (_evt, gesture) => {
        const progress = Math.max(0, Math.min(1, gesture.dx / maxTranslateRef.current));
        progressAnim.setValue(progress);
        if (!hapticFiredRef.current && progress >= SLIDE_HAPTIC_THRESHOLD) {
          hapticFiredRef.current = true;
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        }
      },
      onPanResponderRelease: (_evt, gesture) => {
        onDragStateChange?.(false);
        const progress = Math.max(0, Math.min(1, gesture.dx / maxTranslateRef.current));
        if (progress >= SLIDE_COMPLETION_THRESHOLD) {
          completeActivation();
        } else {
          springBack();
        }
      },
      // Without this, the surrounding ScrollView can reclaim the gesture
      // mid-drag the moment the finger drifts even slightly off-axis (which
      // is normal for a real thumb — fingers don't move in a perfectly
      // straight line), and RN hands control back to the scroll view via
      // onPanResponderTerminate, snapping the thumb back. Once we've been
      // granted the gesture, keep it until the finger actually lifts.
      onPanResponderTerminationRequest: () => false,
      onPanResponderTerminate: () => {
        onDragStateChange?.(false);
        springBack();
      },
    }),
  ).current;

  const thumbTranslate = progressAnim.interpolate({ inputRange: [0, 1], outputRange: [0, maxTranslate] });
  const labelOpacity = progressAnim.interpolate({ inputRange: [0, 0.3], outputRange: [1, 0], extrapolate: 'clamp' });
  const lockOpacity = progressAnim.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 0.15, 0], extrapolate: 'clamp' });
  const compassOpacity = progressAnim.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0, 0.85, 1], extrapolate: 'clamp' });

  return (
    <View
      style={styles.slideTrack}
      onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
      accessible
      accessibilityRole="button"
      accessibilityLabel={t('sidequest.activateAccessibleLabel')}
      accessibilityHint={t('sidequest.activateAccessibleHint')}
      onAccessibilityTap={completeActivation}
      // The drag surface is the whole track, not just the small thumb —
      // grabbing a precise 46px target was the main reason this felt hard
      // to use. Matches how iOS/Android's own slide-to-unlock sliders work:
      // touch anywhere along the track and drag: progress still tracks
      // relative finger movement (gesture.dx), so this is a pure expansion
      // of *where* a drag can start, not a change to how far it must travel.
      {...responder.panHandlers}>
      <LinearGradient
        colors={SLIDE_TRACK_GRADIENT_COLORS}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFillObject}
      />
      <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
        {TRACK_SPARKLES.map((s, i) => (
          <TrackSparkle key={i} left={s.left} topOffset={s.topOffset} delay={s.delay} duration={s.duration} />
        ))}
      </View>
      <View style={[StyleSheet.absoluteFillObject, { justifyContent: 'center' }]} importantForAccessibility="no-hide-descendants">
        <Animated.Text style={[styles.slideTrackLabel, { opacity: labelOpacity }]} numberOfLines={1}>
          {t('sidequest.slideToActivate')}
        </Animated.Text>
        <Animated.View style={[styles.slideThumb, { transform: [{ translateX: thumbTranslate }] }]}>
          <Animated.View style={[StyleSheet.absoluteFillObject, styles.slideThumbIconLayer, { opacity: lockOpacity }]}>
            <Ionicons name="lock-closed" size={18} color={SIDEQUEST_ICON_COLOR_ON} />
          </Animated.View>
          <Animated.View style={[styles.slideThumbIconLayer, { opacity: compassOpacity }]}>
            <Ionicons name="compass" size={18} color={SIDEQUEST_ICON_COLOR_ON} />
          </Animated.View>
          <Animated.View pointerEvents="none" style={[styles.sideQuestSpark, { opacity: sparkOpacity }]}>
            <Ionicons name="sparkles" size={13} color={SIDEQUEST_ICON_COLOR_ON} />
          </Animated.View>
        </Animated.View>
      </View>
    </View>
  );
}

// ── Enabled status row (ON state) ───────────────────────────────────────────
// Replaces the slide control entirely once active — per the brief, the
// activated state is calm and permanent-feeling, not a switch left sitting
// in the "on" position.
function SideQuestActiveStatusRow({ onTurnOff }: { onTurnOff: () => void }) {
  const { t } = useI18n();
  return (
    <View style={styles.sideQuestStatusRow}>
      <View style={styles.sideQuestToggleIconWrap}>
        <Ionicons name="compass" size={20} color={SIDEQUEST_ICON_COLOR_ON} />
      </View>
      <View style={styles.sideQuestToggleCopy}>
        <Text style={styles.sideQuestToggleLabel}>{t('sidequest.activeStatusLabel')}</Text>
        <Text style={styles.sideQuestToggleHelper}>{t('sidequest.activeStatusHelper')}</Text>
      </View>
      <TouchableOpacity activeOpacity={0.7} onPress={onTurnOff} hitSlop={8}>
        <Text style={styles.sideQuestTurnOffText}>{t('sidequest.turnOff')}</Text>
      </TouchableOpacity>
    </View>
  );
}

function toDateInput(date: Date) {
  return formatDateParts(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

function toTimeInput(date: Date) {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function isDateInputValid(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function getDefaultDate() {
  const now = new Date();
  return formatDateParts(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

// Picks a sensible default activity date that's inside the trip range:
// today if it falls within the trip, otherwise the trip start (or end).
function defaultActivityDate(tripStartDate?: string | null, tripEndDate?: string | null): string {
  const today = getDefaultDate();
  const start = tripStartDate && isDateInputValid(tripStartDate) ? tripStartDate : null;
  const end = tripEndDate && isDateInputValid(tripEndDate) ? tripEndDate : null;
  if (!start || !end) return today;
  if (today < start) return start;
  if (today > end) return end;
  return today;
}

function formatDateParts(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function formatLongDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${value}T12:00:00`));
}

function formatShortDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${value}T12:00:00`));
}

function formatTime(value: string) {
  // value is already "HH:MM" (24h). Format directly — parsing it through Date
  // risks a UTC-vs-local drift in Hermes that would show the wrong hour.
  const [h, m] = value.split(':');
  return `${(h ?? '00').padStart(2, '0')}:${(m ?? '00').padStart(2, '0')}`;
}

// Clamps a Date into [min, max]. Guards the native iOS DateTimePicker, which
// hard-crashes when given a `value` outside its minimum/maximum bounds, and
// falls back to a sane value if `value` is somehow Invalid Date.
function clampDate(value: Date, min?: Date, max?: Date): Date {
  let t = value.getTime();
  if (Number.isNaN(t)) {
    t = (min ?? max ?? new Date()).getTime();
  }
  if (min && t < min.getTime()) t = min.getTime();
  if (max && t > max.getTime()) t = max.getTime();
  return new Date(t);
}

// Builds a LOCAL-time Date from "YYYY-MM-DD" + "HH:MM" component strings.
// Avoids the Hermes quirk where `new Date("YYYY-MM-DDTHH:mm")` may be parsed
// as UTC, which shifts the time by the device timezone offset.
function localDateTime(date: string, time: string): Date {
  const [y, mo, d] = (date ?? '').split('-').map((n) => parseInt(n, 10));
  const [h, mi] = (time ?? '').split(':').map((n) => parseInt(n, 10));
  return new Date(
    Number.isFinite(y) ? y : 2000,
    Number.isFinite(mo) ? mo - 1 : 0,
    Number.isFinite(d) ? d : 1,
    Number.isFinite(h) ? h : 0,
    Number.isFinite(mi) ? mi : 0,
    0,
    0,
  );
}

function formatRevealPreview(date: string, time: string, locale: string, t: (key: string, vars?: Record<string, string | number>) => string) {
  return t('sidequest.form.revealsAt', { date: formatShortDate(date, locale), time: formatTime(time) });
}

function combineDateAndTime(date: string, time: string) {
  // Interpret the picked date+time as LOCAL, then convert to UTC ISO for the
  // backend. Constructing from components (not string parsing) keeps the saved
  // reveal moment matching what the user actually chose in their timezone.
  return localDateTime(date, time).toISOString();
}

function isWithinRange(value: string, min: string, max: string) {
  const current = new Date(`${value}T12:00:00`).getTime();
  const start = new Date(`${min}T12:00:00`).getTime();
  const end = new Date(`${max}T12:00:00`).getTime();
  return current >= start && current <= end;
}

function getPickerTitle(target: PickerTarget, t: (key: string, vars?: Record<string, string | number>) => string) {
  if (target === 'date') return t('sidequest.form.pickActivityDate');
  if (target === 'time') return t('sidequest.form.pickActivityTime');
  if (target === 'revealDate') return t('sidequest.form.pickRevealDate');
  if (target === 'revealTime') return t('sidequest.form.pickRevealTime');
  return t('sidequest.form.pickDate');
}

function getRevealRange(tripStartDate?: string | null, tripEndDate?: string | null, sideQuestDate?: string | null) {
  const today = getDefaultDate();
  // A reveal can never happen in the past, so the earliest selectable reveal
  // date is today — even if the trip already started.
  const rawMin = tripStartDate && isDateInputValid(tripStartDate) ? tripStartDate : today;
  const min = rawMin < today ? today : rawMin;
  const maxCandidate = sideQuestDate && isDateInputValid(sideQuestDate) ? sideQuestDate : tripEndDate && isDateInputValid(tripEndDate) ? tripEndDate : min;
  const tripMax = tripEndDate && isDateInputValid(tripEndDate) ? tripEndDate : maxCandidate;
  const cappedMax = maxCandidate <= tripMax ? maxCandidate : tripMax;
  // Guard against an inverted range (e.g. a past activity date): max never
  // earlier than min.
  const max = cappedMax < min ? min : cappedMax;
  return { min, max };
}

function buildPlaceDisplay(place: StoredMapPlace) {
  return place.name?.trim() || '';
}

const SideQuestForm = forwardRef<SideQuestFormHandle, Props>(SideQuestFormInner);
export default SideQuestForm;

// Sidequest cover card dimensions — used to compute the card's aspect ratio
// for ImagePositionerModal and the initial centred offset.
const POSITIONER_PREVIEW_H = 240;
const POSITIONER_FORM_W_PADDING = 44;

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 22,
    paddingTop: 12,
  },
  labelOptional: {
    fontSize: 13,
    color: '#9298a4',
    fontWeight: '400',
  },
  labelRequired: {
    fontSize: 18,
    color: '#ff4f74',
    fontWeight: '900',
  },
  charCounter: {
    marginTop: 6,
    alignSelf: 'flex-end',
    fontSize: 11,
    fontWeight: '600',
    color: '#9298a4',
  },
  categoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#e2e5eb',
    backgroundColor: '#fafbfc',
  },
  categoryChipActive: {
    borderColor: '#ff4f74',
    backgroundColor: '#fff0f3',
  },
  categoryEmoji: {
    fontSize: 16,
  },
  categoryLabel: {
    fontSize: 14,
    color: '#5a6072',
    fontWeight: '500',
  },
  categoryLabelActive: {
    color: '#ff4f74',
    fontWeight: '600',
  },
  coverCard: {
    height: 240,
    borderRadius: 32,
    overflow: 'hidden',
    backgroundColor: '#eef3f5',
    justifyContent: 'flex-end',
  },
  coverImage: {
    ...StyleSheet.absoluteFillObject,
  },
  coverPlaceholderLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(205,226,229,0.82)',
  },
  coverContent: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 34,
    paddingHorizontal: 24,
  },
  coverIconCircle: {
    width: 78,
    height: 78,
    borderRadius: 39,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.75)',
  },
  coverTitle: {
    marginTop: 16,
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  coverCopy: {
    marginTop: 8,
    color: 'rgba(255,255,255,0.92)',
    fontSize: 14,
    textAlign: 'center',
  },
  coverBadgeRow: {
    position: 'absolute',
    right: 16,
    top: 16,
    flexDirection: 'row',
    gap: 8,
  },
  coverBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: 'rgba(18,22,29,0.46)',
  },
  coverBadgeGhost: {
    backgroundColor: 'rgba(18,22,29,0.28)',
  },
  coverBadgeText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  sideQuestCoverBadge: {
    position: 'absolute',
    left: 16,
    top: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: 'rgba(124,58,237,0.55)',
  },
  block: {
    marginTop: 24,
  },
  label: {
    color: '#161821',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.6,
    marginBottom: 12,
  },
  titleInput: {
    minHeight: 66,
    borderRadius: 24,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#eaedf2',
    paddingHorizontal: 18,
    color: '#161821',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.8,
  },
  textArea: {
    minHeight: 126,
    borderRadius: 24,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#eaedf2',
    paddingHorizontal: 18,
    paddingVertical: 18,
    color: '#1f232c',
    fontSize: 16,
    lineHeight: 24,
  },
  input: {
    minHeight: 58,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#eaedf2',
    paddingHorizontal: 16,
    color: '#1f232c',
    fontSize: 16,
  },
  selectionCard: {
    minHeight: 84,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: '#eaedf2',
    backgroundColor: '#fff',
    paddingHorizontal: 18,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectionCardActive: {
    borderColor: '#ff9db0',
    shadowColor: '#ff4f74',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 4,
  },
  selectionEyebrow: {
    color: '#8a909b',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  webDateInput: {
    marginTop: 6,
    color: '#161821',
    fontSize: 17,
    fontWeight: '700',
    paddingVertical: 2,
    borderBottomWidth: 1.5,
    borderBottomColor: '#e2e5eb',
    minWidth: 100,
  },
  selectionValue: {
    marginTop: 8,
    color: '#161821',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.8,
  },
  selectionValueSmall: {
    marginTop: 8,
    color: '#161821',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  selectionHint: {
    marginTop: 6,
    color: '#868d99',
    fontSize: 13,
    fontWeight: '600',
  },
  selectionCardError: {
    borderColor: '#ffb0bd',
    backgroundColor: '#fff7f9',
  },
  doneButton: {
    borderRadius: 999,
    backgroundColor: '#ff4f74',
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  sideQuestStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#eaedf2',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  sideQuestToggleIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f3ff',
  },
  sideQuestSpark: {
    position: 'absolute',
    top: -4,
    right: -4,
  },
  sideQuestToggleCopy: {
    flex: 1,
  },
  sideQuestToggleLabel: {
    color: '#161821',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  sideQuestToggleHelper: {
    marginTop: 3,
    color: '#7d8491',
    fontSize: 13,
    lineHeight: 18,
  },
  sideQuestTurnOffText: {
    color: '#9298a4',
    fontSize: 14,
    fontWeight: '700',
  },
  // Slide-to-activate track. Height/padding chosen to match this form's
  // other interactive rows (selectionCard etc. sit around 84px tall with
  // 16-18px internal padding) while staying within the 52-56px ask for this
  // specific control.
  slideTrack: {
    height: SLIDE_TRACK_HEIGHT,
    borderRadius: SLIDE_TRACK_HEIGHT / 2,
    backgroundColor: '#f5f3ff',
    overflow: 'hidden',
    justifyContent: 'center',
  },
  slideTrackLabel: {
    textAlign: 'center',
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.18)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  trackSparkle: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#fff',
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.95,
    shadowRadius: 3,
  },
  slideThumb: {
    position: 'absolute',
    left: SLIDE_TRACK_PADDING,
    top: SLIDE_TRACK_PADDING,
    width: SLIDE_THUMB_SIZE,
    height: SLIDE_THUMB_SIZE,
    borderRadius: SLIDE_THUMB_SIZE / 2,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.16,
    shadowRadius: 6,
    elevation: 3,
  },
  slideThumbIconLayer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmented: {
    gap: 10,
  },
  segmentOption: {
    borderRadius: 26,
    borderWidth: 1,
    borderColor: '#eaedf2',
    backgroundColor: '#fff',
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  segmentOptionActive: {
    borderColor: '#ff8ca0',
    backgroundColor: '#fff7f9',
  },
  segmentTitle: {
    color: '#161821',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  segmentTitleActive: {
    color: '#cf295f',
  },
  segmentSubtitle: {
    marginTop: 6,
    color: '#7d8491',
    fontSize: 14,
    lineHeight: 20,
  },
  segmentSubtitleActive: {
    color: '#8c5363',
  },
  revealRow: {
    flexDirection: 'column',
    gap: 10,
  },
  revealCard: {
    flex: 1,
    minHeight: 94,
  },
  revealSummary: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 18,
    backgroundColor: '#fff3f6',
    borderWidth: 1,
    borderColor: '#ffd8e1',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  revealSummaryText: {
    flex: 1,
    color: '#af2f59',
    fontSize: 14,
    fontWeight: '700',
  },
  revealSummaryWarn: {
    backgroundColor: '#ffefeb',
    borderColor: '#ffd0c3',
  },
  revealSummaryTextWarn: {
    color: '#a52617',
  },
  teaserOptions: {
    marginTop: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  teaserChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e6e9ee',
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  teaserChipActive: {
    borderColor: '#ff8ca0',
    backgroundColor: '#fff4f7',
  },
  teaserChipText: {
    color: '#666d79',
    fontSize: 13,
    fontWeight: '700',
  },
  teaserChipTextActive: {
    color: '#cf295f',
  },
  helperText: {
    marginTop: 10,
    color: '#7d8491',
    fontSize: 14,
    lineHeight: 21,
  },
  locationStatus: {
    marginTop: 8,
    color: '#7f8894',
    fontSize: 13,
    fontWeight: '600',
  },
  locationError: {
    marginTop: 8,
    color: '#b6321f',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
  },
  locationSuggestions: {
    marginTop: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e4e8ef',
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  locationSuggestionRow: {
    minHeight: 52,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eef1f5',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  locationSuggestionCopy: {
    flex: 1,
  },
  locationSuggestionTitle: {
    color: '#151a22',
    fontSize: 14,
    fontWeight: '700',
  },
  locationSuggestionSubtitle: {
    marginTop: 2,
    color: '#7f8793',
    fontSize: 12,
  },
  messageBanner: {
    marginTop: 22,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  messageBannerSuccess: {
    backgroundColor: '#e9f8f1',
    borderWidth: 1,
    borderColor: '#bfe9d2',
  },
  messageBannerError: {
    backgroundColor: '#ffefeb',
    borderWidth: 1,
    borderColor: '#ffd0c3',
  },
  messageText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  messageTextSuccess: {
    color: '#16734d',
  },
  messageTextError: {
    color: '#a52617',
  },
  primaryButton: {
    marginTop: 28,
    minHeight: 70,
    borderRadius: 999,
    backgroundColor: '#ff4f74',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#ff4f74',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.24,
    shadowRadius: 26,
    elevation: 9,
  },
  primaryButtonDisabled: {
    opacity: 0.72,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(10,12,18,0.28)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 24,
  },
  modalHandle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#d8dce4',
  },
  modalTitle: {
    marginTop: 14,
    color: '#151821',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.7,
  },
  modalSubtitle: {
    marginTop: 8,
    color: '#7c8390',
    fontSize: 14,
    lineHeight: 21,
  },
  modalPickerWrap: {
    marginTop: 10,
    marginBottom: 12,
    borderRadius: 22,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#eef1f5',
    overflow: 'hidden',
  },
  wheelWrap: {
    height: WHEEL_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  wheelHighlight: {
    position: 'absolute',
    left: 16,
    right: 16,
    // Matches wheelColumn's effective top (0, not paddingTop) — wheelColumn
    // is as tall as wheelWrap itself, so wheelWrap's centering collapses its
    // own paddingVertical to nothing instead of shifting the column down by it.
    top: WHEEL_PAD,
    height: WHEEL_ITEM_HEIGHT,
    borderRadius: 16,
    backgroundColor: PRIMARY_08,
  },
  wheelColumn: {
    width: 78,
    height: WHEEL_HEIGHT,
  },
  wheelItem: {
    height: WHEEL_ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelItemText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#b7bcc7',
    letterSpacing: -0.4,
  },
  wheelItemTextActive: {
    color: PRIMARY_COLOR,
    fontWeight: '900',
    fontSize: 24,
  },
  wheelColon: {
    fontSize: 24,
    fontWeight: '900',
    color: '#161821',
    marginHorizontal: 4,
  },
  blurPreviewCard: {
    marginTop: 12,
    height: 180,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#eef3f5',
    justifyContent: 'flex-end',
  },
  blurPreviewImage: {
    ...StyleSheet.absoluteFillObject,
  },
  blurPreviewOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(20,24,31,0.28)',
  },
  blurPreviewBadge: {
    position: 'absolute',
    top: 14,
    left: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(18,22,29,0.55)',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  blurPreviewBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  blurPreviewTeaser: {
    margin: 16,
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  sliderTouchArea: {
    marginTop: 12,
    height: 44,
    justifyContent: 'center',
  },
  sliderTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: '#e6e9ee',
    justifyContent: 'center',
  },
  sliderFill: {
    position: 'absolute',
    left: 0,
    height: 8,
    borderRadius: 999,
    backgroundColor: PRIMARY_COLOR,
  },
  sliderThumb: {
    position: 'absolute',
    top: -9,
    width: 26,
    height: 26,
    marginLeft: -13,
    borderRadius: 13,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: PRIMARY_COLOR,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 3,
  },
  blurSliderLabels: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  blurSliderLabel: {
    color: '#868d99',
    fontSize: 12,
    fontWeight: '700',
  },
  flightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  flightField: {
    flex: 1,
  },
  flightFieldLabel: {
    color: '#8a909b',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  flightInput: {
    minHeight: 58,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#eaedf2',
    paddingHorizontal: 16,
    color: '#161821',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  flightArrow: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eaf6f9',
    marginTop: 22,
  },
  flightPreview: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    borderRadius: 999,
    backgroundColor: '#eaf6f9',
    borderWidth: 1,
    borderColor: '#cfe9ef',
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  flightPreviewText: {
    color: '#0d7d92',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});

