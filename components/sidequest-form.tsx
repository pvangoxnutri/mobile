import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { Component, forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode, type Ref } from 'react';
import {
  Image,
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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { apiFetch, apiJson } from '@/lib/api';
import { invalidateCache } from '@/lib/cache';
import { CATEGORY_VALUES, getCategorySymbol, type ActivityCategoryValue } from '@/lib/category-symbol';
import { fetchPlaceSuggestions, type PlaceAutocompleteSuggestion } from '@/lib/maps-api';
import { type StoredMapPlace, withLocationMarker } from '@/lib/sidequest-location';
import { withFlightMarkers } from '@/lib/flight-route';
import { DEFAULT_BLUR, MAX_BLUR, MIN_BLUR, withBlurMarker } from '@/lib/activity-blur';
import type { SideQuestActivity } from '@/lib/types';
import { uploadImageIfNeeded } from '@/lib/uploads';
import { useI18n } from '@/components/i18n-provider';
import { PRIMARY_COLOR, PRIMARY_08, PRIMARY_20, SECONDARY_COLOR } from '@/constants/colors';

type PickerTarget = 'date' | 'revealDate' | 'revealTime' | null;
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

const TEASER_OPTIONS = [
  { label: '2h innan', value: 120 },
  { label: '12h innan', value: 720 },
  { label: '1 dag innan', value: 1440 },
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
  const { t } = useI18n();
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
  const [date, setDate] = useState(initialValues?.date ?? getDefaultDate());
  const [visibility, setVisibility] = useState<'public' | 'hidden'>(initialValues?.visibility ?? 'public');
  const [revealDate, setRevealDate] = useState(initialValues?.revealDate ?? getDefaultDate());
  const [revealTime, setRevealTime] = useState(initialValues?.revealTime ?? '18:00');
  const [teaser, setTeaser] = useState(initialValues?.teaser ?? '');
  const [teaserOffsetMinutes, setTeaserOffsetMinutes] = useState<number | null>(initialValues?.teaserOffsetMinutes ?? 120);
  const [imageUrl, setImageUrl] = useState<string | null>(initialValues?.imageUrl ?? initialImageUrl ?? null);
  const [blurAmount, setBlurAmount] = useState<number>(initialValues?.blurAmount ?? DEFAULT_BLUR);
  const [pickerTarget, setPickerTarget] = useState<PickerTarget>(null);
  const [message, setMessage] = useState<MessageState>(null);
  const [submitting, setSubmitting] = useState(false);

  const bottomPadding = useMemo(() => Math.max(insets.bottom, 18) + 60, [insets.bottom]);
  const revealAtPreview = visibility === 'hidden' ? formatRevealPreview(revealDate, revealTime) : 'Avslöjas direkt';
  const tripRangeText =
    tripStartDate && tripEndDate ? `${formatShortDate(tripStartDate)} – ${formatShortDate(tripEndDate)}` : 'Laddar resans datum';
  const today = getDefaultDate();
  const selectedDateBeforeToday = isDateInputValid(date) && date < today;
  const selectedDateOutOfRange =
    tripStartDate && tripEndDate ? !isWithinRange(date, tripStartDate, tripEndDate) : false;
  const revealRange = useMemo(() => getRevealRange(tripStartDate, tripEndDate, date), [date, tripEndDate, tripStartDate]);
  const revealDateOutOfRange =
    visibility === 'hidden' ? !isWithinRange(revealDate, revealRange.min, revealRange.max) : false;
  const revealIsPast =
    visibility === 'hidden' && localDateTime(revealDate, revealTime).getTime() <= Date.now();

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
          setLocationError(err instanceof Error ? err.message : 'Kunde inte ladda kartförslag.');
        })
        .finally(() => setLocationLoading(false));
    }, 260);

    return () => clearTimeout(handle);
  }, [locationPlace, locationQuery]);

  async function handlePickImage() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setMessage({ type: 'error', text: 'Fototillstånd krävs för att lägga till en bild.' });
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [16, 10],
      quality: 0.92,
    });

    if (!result.canceled && result.assets[0]) {
      setImageUrl(result.assets[0].uri);
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
      setLocationError('Kunde inte ladda detaljer för platsen.');
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
        setMessage({ type: 'error', text: 'Aktiviteter kan inte vara tidigare än dagens datum.' });
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

    setRevealTime(toTimeInput(selectedDate));
  }

  function handleActivityDateInput(value: string) {
    const today = getDefaultDate();
    if (isDateInputValid(value) && value < today) {
      setMessage({ type: 'error', text: 'Aktiviteter kan inte vara tidigare än dagens datum.' });
      return;
    }
    setDate(value);
    setMessage(null);
  }

  async function saveActivity(): Promise<{ id: string } | null> {
    const normalizedTitle = title.trim();

    if (!normalizedTitle && visibility !== 'hidden') {
      setMessage({ type: 'error', text: 'Ange en titel för aktiviteten.' });
      return null;
    }

    const today = getDefaultDate();
    if (date < today) {
      setMessage({ type: 'error', text: 'Aktiviteter kan inte vara tidigare än dagens datum.' });
      return null;
    }

    // A hidden activity with a reveal time in the past would be revealed
    // instantly — which defeats the purpose. Activity DATE may be in the past
    // (history), but the reveal MOMENT must be in the future.
    if (visibility === 'hidden') {
      const revealMs = localDateTime(revealDate, revealTime).getTime();
      if (!Number.isFinite(revealMs) || revealMs <= Date.now()) {
        setMessage({ type: 'error', text: 'Avslöjandetiden måste vara i framtiden — annars syns aktiviteten direkt.' });
        return null;
      }
    }

    setSubmitting(true);
    setMessage(null);

    try {
      const uploadedImageUrl = await uploadImageIfNeeded(imageUrl, 'sidequest');
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
          throw new Error((await response.text()) || 'Kunde inte uppdatera aktiviteten.');
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
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Kunde inte spara aktiviteten.' });
      return null;
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit() {
    const saved = await saveActivity();
    if (saved) {
      // Notify the parent screen so it can flip its unsaved-changes guard
      // off before we navigate. Without this the guard pops "Unsaved
      // changes" mid-save and ends up re-firing save → duplicate activity.
      onSaved?.();
      router.replace(`/trip/${tripId}/sidequest/${saved.id}`);
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
      style={styles.scroll}
      contentContainerStyle={[styles.content, { paddingBottom: bottomPadding }]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}>
      <TouchableOpacity activeOpacity={0.9} style={styles.coverCard} onPress={() => void handlePickImage()}>
        {imageUrl ? <Image source={{ uri: imageUrl }} style={styles.coverImage} /> : null}
        {!imageUrl ? <View style={styles.coverPlaceholderLayer} /> : null}
        {!imageUrl ? (
          <View style={styles.coverContent}>
            <View style={styles.coverIconCircle}>
              <Ionicons name="image-outline" size={30} color="#fff" />
            </View>
            <Text style={styles.coverTitle}>Lägg till omslag (valfritt)</Text>
            <Text style={styles.coverCopy}>Få aktiviteten att kännas spännande i flödet.</Text>
          </View>
        ) : (
          <View style={styles.coverBadgeRow}>
            <View style={styles.coverBadge}>
              <Ionicons name="camera-outline" size={14} color="#fff" />
              <Text style={styles.coverBadgeText}>Ändra bild</Text>
            </View>
            <TouchableOpacity
              activeOpacity={0.88}
              style={[styles.coverBadge, styles.coverBadgeGhost]}
              onPress={() => setImageUrl(null)}>
              <Ionicons name="trash-outline" size={14} color="#fff" />
              <Text style={styles.coverBadgeText}>Ta bort</Text>
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>

      <View style={styles.block}>
        <Text style={styles.label}>Titel</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="t.ex. Ramen på taket"
          placeholderTextColor="#b7bcc7"
          style={styles.titleInput}
        />
      </View>

      <View style={styles.block}>
        <Text style={styles.label}>Kategori <Text style={styles.labelOptional}>(valfritt)</Text></Text>
        <View style={styles.categoryRow}>
          {CATEGORY_VALUES.map((value) => {
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

      {category === 'flight' ? (
        <View style={styles.block}>
          <Text style={styles.label}>Flygrutt <Text style={styles.labelOptional}>(valfritt)</Text></Text>
          <View style={styles.flightRow}>
            <View style={styles.flightField}>
              <Text style={styles.flightFieldLabel}>FRÅN</Text>
              <TextInput
                value={flightFrom}
                onChangeText={setFlightFrom}
                placeholder="CPH"
                placeholderTextColor="#b7bcc7"
                autoCapitalize="characters"
                style={styles.flightInput}
              />
            </View>
            <View style={styles.flightArrow}>
              <Ionicons name="airplane" size={18} color={SECONDARY_COLOR} />
            </View>
            <View style={styles.flightField}>
              <Text style={styles.flightFieldLabel}>TILL</Text>
              <TextInput
                value={flightTo}
                onChangeText={setFlightTo}
                placeholder="HND"
                placeholderTextColor="#b7bcc7"
                autoCapitalize="characters"
                style={styles.flightInput}
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
        <Text style={styles.label}>Beskrivning</Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="En ledtråd, känsla eller hemlig plan för gruppen."
          placeholderTextColor="#b7bcc7"
          multiline
          textAlignVertical="top"
          style={styles.textArea}
        />
      </View>

      <View style={styles.block}>
        <Text style={styles.label}>Plats</Text>
        <TextInput
          value={locationQuery}
          onChangeText={(value) => {
            setLocationQuery(value);
            if (locationPlace && buildPlaceDisplay(locationPlace) !== value.trim()) {
              setLocationPlace(null);
            }
          }}
          placeholder="t.ex. Sagrada Familia, Barcelona"
          placeholderTextColor="#b7bcc7"
          style={styles.input}
        />
        <Text style={styles.helperText}>Sök och välj en plats från Google Maps.</Text>
        {locationLoading ? <Text style={styles.locationStatus}>Söker platser...</Text> : null}
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
        <Text style={styles.label}>När händer det?</Text>
        {Platform.OS === 'web' ? (
          <View style={[styles.selectionCard, selectedDateOutOfRange || selectedDateBeforeToday ? styles.selectionCardError : null]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.selectionEyebrow}>AKTIVITETSDATUM</Text>
              <TextInput
                value={date}
                onChangeText={handleActivityDateInput}
                placeholder="ÅÅÅÅ-MM-DD"
                placeholderTextColor="#b7bcc7"
                style={styles.webDateInput}
                keyboardType="numbers-and-punctuation"
                maxLength={10}
              />
              <Text style={styles.selectionHint}>Inom {tripRangeText}</Text>
            </View>
            <Ionicons name="calendar-outline" size={22} color="#5f6570" />
          </View>
        ) : (
          <TouchableOpacity
            activeOpacity={0.92}
            style={[
              styles.selectionCard,
              pickerTarget === 'date' ? styles.selectionCardActive : null,
              selectedDateOutOfRange || selectedDateBeforeToday ? styles.selectionCardError : null,
            ]}
            onPress={() => setPickerTarget('date')}>
            <View>
              <Text style={styles.selectionEyebrow}>AKTIVITETSDATUM</Text>
              <Text style={styles.selectionValue}>{formatLongDate(date)}</Text>
              <Text style={styles.selectionHint}>Inom {tripRangeText}</Text>
            </View>
            <Ionicons name="calendar-outline" size={22} color="#5f6570" />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.block}>
        <Text style={styles.label}>Synlighet</Text>
        <View style={styles.segmented}>
          <VisibilityOption
            label="Synlig"
            subtitle="Alla ser den direkt"
            active={visibility === 'public'}
            onPress={() => {
              setVisibility('public');
              setPickerTarget(null);
            }}
          />
          <VisibilityOption
            label="Dold"
            subtitle="Hemlig tills avslöjandet"
            active={visibility === 'hidden'}
            onPress={() => setVisibility('hidden')}
          />
        </View>
      </View>

      {visibility === 'hidden' ? (
        <>
          <View style={styles.block}>
            <Text style={styles.label}>Avslöjandeschema</Text>
            <View style={styles.revealRow}>
              {Platform.OS === 'web' ? (
                <View style={[styles.selectionCard, styles.revealCard, revealDateOutOfRange ? styles.selectionCardError : null]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.selectionEyebrow}>AVSLÖJANDEDATUM</Text>
                    <TextInput
                      value={revealDate}
                      onChangeText={setRevealDate}
                      placeholder="ÅÅÅÅ-MM-DD"
                      placeholderTextColor="#b7bcc7"
                      style={styles.webDateInput}
                      keyboardType="numbers-and-punctuation"
                      maxLength={10}
                    />
                    <Text style={styles.selectionHint} numberOfLines={1}>{`${formatShortDate(revealRange.min)} – ${formatShortDate(revealRange.max)}`}</Text>
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
                    <Text style={styles.selectionEyebrow}>AVSLÖJANDEDATUM</Text>
                    <Text style={styles.selectionValue} numberOfLines={1}>{formatShortDate(revealDate)}</Text>
                    <Text style={styles.selectionHint} numberOfLines={1}>{`${formatShortDate(revealRange.min)} – ${formatShortDate(revealRange.max)}`}</Text>
                  </View>
                  <Ionicons name="calendar-outline" size={22} color="#5f6570" />
                </TouchableOpacity>
              )}
              {Platform.OS === 'web' ? (
                <View style={[styles.selectionCard, styles.revealCard]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.selectionEyebrow}>AVSLÖJANDETID</Text>
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
                    <Text style={styles.selectionEyebrow}>AVSLÖJANDETID</Text>
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
                {revealIsPast ? 'Avslöjandetiden har redan passerat — välj en tid i framtiden.' : revealAtPreview}
              </Text>
            </View>
          </View>

          <View style={styles.block}>
            <Text style={styles.label}>Teaser</Text>
            <TextInput
              value={teaser}
              onChangeText={setTeaser}
              placeholder="Frivillig ledtråd till gruppen innan avslöjandet"
              placeholderTextColor="#b7bcc7"
              style={styles.input}
            />
            {teaser.trim() ? (
              <View style={styles.teaserOptions}>
                {TEASER_OPTIONS.map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    activeOpacity={0.9}
                    style={[styles.teaserChip, teaserOffsetMinutes === option.value ? styles.teaserChipActive : null]}
                    onPress={() => setTeaserOffsetMinutes(option.value)}>
                    <Text style={[styles.teaserChipText, teaserOffsetMinutes === option.value ? styles.teaserChipTextActive : null]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <Text style={styles.helperText}>Lägg bara till en ledtråd om du vill bygga spänning innan avslöjandet.</Text>
            )}
          </View>

          {imageUrl ? (
            <View style={styles.block}>
              <Text style={styles.label}>Förhandsvisning</Text>
              <Text style={styles.helperText}>Så här ser bilden ut för gruppen innan avslöjandet. Dra för mer eller mindre oskärpa.</Text>
              <View style={styles.blurPreviewCard}>
                <Image source={{ uri: imageUrl }} style={styles.blurPreviewImage} blurRadius={blurAmount} />
                <View style={styles.blurPreviewOverlay} />
                <View style={styles.blurPreviewBadge}>
                  <Ionicons name="eye-off-outline" size={14} color="#fff" />
                  <Text style={styles.blurPreviewBadgeText}>Dold tills avslöjandet</Text>
                </View>
                {teaser.trim() ? (
                  <Text style={styles.blurPreviewTeaser} numberOfLines={2}>{teaser.trim()}</Text>
                ) : null}
              </View>
              <BlurSlider value={blurAmount} min={MIN_BLUR} max={MAX_BLUR} onChange={setBlurAmount} />
              <View style={styles.blurSliderLabels}>
                <Text style={styles.blurSliderLabel}>Mindre oskärpa</Text>
                <Text style={styles.blurSliderLabel}>Mer oskärpa</Text>
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
        <Text style={styles.primaryButtonText}>{submitting ? 'Sparar...' : mode === 'edit' ? 'Spara ändringar' : 'Lägg till aktivitet'}</Text>
      </TouchableOpacity>

      {Platform.OS !== 'web' ? (
        <PickerSheet
          visible={pickerTarget !== null}
          title={getPickerTitle(pickerTarget)}
          subtitle={pickerTarget === 'date' ? `Tillåtet intervall: ${tripRangeText}` : pickerTarget === 'revealDate' ? 'Välj när aktiviteten ska avslöjas.' : 'Välj avslöjandetid.'}
          onClose={() => setPickerTarget(null)}>
          {pickerTarget === 'revealTime' ? (
            // Custom on-brand time wheel. Avoids the native time picker, whose
            // spinner display hard-crashes under the New Architecture (Fabric)
            // that Expo Go force-enables, and whose 'default' display looks
            // out of place inside this sheet.
            <TimeWheel value={revealTime} onChange={setRevealTime} />
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
  const widthRef = useRef(0);

  const setFromX = (x: number) => {
    const w = widthRef.current;
    if (w <= 0) return;
    const clampedX = Math.max(0, Math.min(w, x));
    const ratio = clampedX / w;
    onChange(Math.round(min + ratio * (max - min)));
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => setFromX(evt.nativeEvent.locationX),
      onPanResponderMove: (evt) => setFromX(evt.nativeEvent.locationX),
    }),
  ).current;

  const pct = max > min ? Math.max(0, Math.min(1, (value - min) / (max - min))) : 0;

  return (
    <View
      style={styles.sliderTrack}
      onLayout={(e) => {
        widthRef.current = e.nativeEvent.layout.width;
      }}
      {...responder.panHandlers}>
      <View style={[styles.sliderFill, { width: `${pct * 100}%` }]} />
      <View style={[styles.sliderThumb, { left: `${pct * 100}%` }]} />
    </View>
  );
}

// Catches render-time errors from the native date/time picker so a bad value
// surfaces as an on-screen message instead of taking down the whole app.
class PickerErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <Text style={{ color: '#a52617', fontSize: 13, padding: 16, textAlign: 'center' }}>
          Tidsväljaren kunde inte öppnas: {this.state.error.message}
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
}) {  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={onClose} />
        <View style={styles.modalCard}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>{title}</Text>
          <Text style={styles.modalSubtitle}>{subtitle}</Text>
          <View style={styles.modalPickerWrap}>
            <PickerErrorBoundary>{children}</PickerErrorBoundary>
          </View>
          <TouchableOpacity activeOpacity={0.9} style={[styles.doneButton, { backgroundColor: PRIMARY_COLOR }]} onPress={onClose}>
            <Text style={styles.doneButtonText}>Klar</Text>
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

function formatDateParts(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function formatLongDate(value: string) {
  return new Intl.DateTimeFormat('sv-SE', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${value}T12:00:00`));
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${value}T12:00:00`));
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

function formatRevealPreview(date: string, time: string) {
  return `Avslöjas ${formatShortDate(date)} kl ${formatTime(time)}`;
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

function getPickerTitle(target: PickerTarget) {
  if (target === 'date') return 'Välj aktivitetsdatum';
  if (target === 'revealDate') return 'Välj avslöjandedatum';
  if (target === 'revealTime') return 'Välj avslöjandetid';
  return 'Välj datum';
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
    top: WHEEL_PAD + 8,
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
  sliderTrack: {
    marginTop: 18,
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
    width: 24,
    height: 24,
    marginLeft: -12,
    borderRadius: 12,
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

