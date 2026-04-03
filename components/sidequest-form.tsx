import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Image,
  Modal,
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
import type { SideQuestActivity } from '@/lib/types';
import { uploadImageIfNeeded } from '@/lib/uploads';

type PickerTarget = 'date' | 'revealDate' | 'revealTime' | null;
type MessageState = { type: 'success' | 'error'; text: string } | null;

export type SideQuestFormValues = {
  title: string;
  description: string;
  date: string;
  visibility: 'public' | 'hidden';
  revealDate: string;
  revealTime: string;
  teaser: string;
  teaserOffsetMinutes: number | null;
  imageUrl: string | null;
};

type Props = {
  mode: 'create' | 'edit';
  tripId: string;
  sideQuestId?: string;
  tripStartDate?: string | null;
  tripEndDate?: string | null;
  initialValues?: Partial<SideQuestFormValues>;
  initialImageUrl?: string | null;
};

const TEASER_OPTIONS = [
  { label: '2h before', value: 120 },
  { label: '12h before', value: 720 },
  { label: '1 day before', value: 1440 },
];

export default function SideQuestForm({
  mode,
  tripId,
  sideQuestId,
  tripStartDate,
  tripEndDate,
  initialValues,
  initialImageUrl,
}: Props) {
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState(initialValues?.title ?? '');
  const [description, setDescription] = useState(initialValues?.description ?? '');
  const [date, setDate] = useState(initialValues?.date ?? getDefaultDate());
  const [visibility, setVisibility] = useState<'public' | 'hidden'>(initialValues?.visibility ?? 'public');
  const [revealDate, setRevealDate] = useState(initialValues?.revealDate ?? getDefaultDate());
  const [revealTime, setRevealTime] = useState(initialValues?.revealTime ?? '18:00');
  const [teaser, setTeaser] = useState(initialValues?.teaser ?? '');
  const [teaserOffsetMinutes, setTeaserOffsetMinutes] = useState<number | null>(initialValues?.teaserOffsetMinutes ?? 120);
  const [imageUrl, setImageUrl] = useState<string | null>(initialValues?.imageUrl ?? initialImageUrl ?? null);
  const [pickerTarget, setPickerTarget] = useState<PickerTarget>(null);
  const [message, setMessage] = useState<MessageState>(null);
  const [submitting, setSubmitting] = useState(false);

  const bottomPadding = useMemo(() => Math.max(insets.bottom, 18) + 60, [insets.bottom]);
  const revealAtPreview = visibility === 'hidden' ? formatRevealPreview(revealDate, revealTime) : 'Reveal instantly';
  const tripRangeText =
    tripStartDate && tripEndDate ? `${formatShortDate(tripStartDate)} - ${formatShortDate(tripEndDate)}` : 'Trip dates loading';
  const selectedDateOutOfRange =
    tripStartDate && tripEndDate ? !isWithinRange(date, tripStartDate, tripEndDate) : false;
  const revealRange = useMemo(() => getRevealRange(tripStartDate, tripEndDate, date), [date, tripEndDate, tripStartDate]);
  const revealDateOutOfRange =
    visibility === 'hidden' ? !isWithinRange(revealDate, revealRange.min, revealRange.max) : false;

  useEffect(() => {
    if (visibility !== 'hidden') {
      return;
    }

    if (!isDateInputValid(revealDate) || revealDate < revealRange.min) {
      setRevealDate(revealRange.min);
      return;
    }

    if (revealDate > revealRange.max) {
      setRevealDate(revealRange.max);
    }
  }, [revealDate, revealRange.max, revealRange.min, visibility]);

  async function handlePickImage() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setMessage({ type: 'error', text: 'Photo permission is needed to add an image.' });
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

  function handleDateChange(event: DateTimePickerEvent, selectedDate?: Date) {
    if (Platform.OS !== 'ios') {
      setPickerTarget(null);
    }

    if (event.type !== 'set' || !selectedDate || !pickerTarget) {
      return;
    }

    if (pickerTarget === 'date') {
      setDate(toDateInput(selectedDate));
      return;
    }

    if (pickerTarget === 'revealDate') {
      setRevealDate(toDateInput(selectedDate));
      return;
    }

    setRevealTime(toTimeInput(selectedDate));
  }

  async function handleSubmit() {
    const normalizedTitle = title.trim();

    if (!normalizedTitle) {
      setMessage({ type: 'error', text: 'Give the SideQuest a title first.' });
      return;
    }

    if (!isDateInputValid(date)) {
      setMessage({ type: 'error', text: 'Choose a valid date for the SideQuest.' });
      return;
    }

    if (tripStartDate && tripEndDate && !isWithinRange(date, tripStartDate, tripEndDate)) {
      setMessage({ type: 'error', text: `Pick a SideQuest date inside the trip range: ${tripRangeText}.` });
      return;
    }

    if (visibility === 'hidden') {
      if (!isDateInputValid(revealDate)) {
        setMessage({ type: 'error', text: 'Choose a valid reveal date.' });
        return;
      }

      if (!isWithinRange(revealDate, revealRange.min, revealRange.max)) {
        setMessage({
          type: 'error',
          text: `Reveal date must stay between ${formatShortDate(revealRange.min)} and ${formatShortDate(revealRange.max)}.`,
        });
        return;
      }

      if (!isTimeInputValid(revealTime)) {
        setMessage({ type: 'error', text: 'Choose a valid reveal time.' });
        return;
      }

      if (teaser.trim() && !teaserOffsetMinutes) {
        setMessage({ type: 'error', text: 'Choose when the teaser should appear.' });
        return;
      }
    }

    setSubmitting(true);
    setMessage(null);

    try {
      const uploadedImageUrl = await uploadImageIfNeeded(imageUrl, 'sidequest');
      const revealAt = visibility === 'hidden' ? combineDateAndTime(revealDate, revealTime) : null;

      const payload = {
        title: normalizedTitle,
        description: description.trim() || null,
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
          throw new Error((await response.text()) || 'Unable to update the SideQuest right now.');
        }

        router.replace(`/trip/${tripId}/sidequest/${sideQuestId}`);
      } else {
        const response = await apiJson<SideQuestActivity>(`/api/trips/${tripId}/activities`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        router.replace(`/trip/${tripId}/sidequest/${response.id}`);
      }
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Unable to save SideQuest right now.' });
    } finally {
      setSubmitting(false);
    }
  }

  const pickerValue = useMemo(() => {
    if (pickerTarget === 'date') {
      return new Date(`${date}T12:00:00`);
    }

    if (pickerTarget === 'revealDate') {
      return new Date(`${(isDateInputValid(revealDate) ? revealDate : revealRange.min)}T12:00:00`);
    }

    return new Date(`2026-01-01T${revealTime}:00`);
  }, [date, pickerTarget, revealDate, revealRange.min, revealTime]);

  return (
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
            <Text style={styles.coverTitle}>Add an optional cover</Text>
            <Text style={styles.coverCopy}>Make the SideQuest feel exciting in the feed.</Text>
          </View>
        ) : (
          <View style={styles.coverBadgeRow}>
            <View style={styles.coverBadge}>
              <Ionicons name="camera-outline" size={14} color="#fff" />
              <Text style={styles.coverBadgeText}>Change photo</Text>
            </View>
            <TouchableOpacity
              activeOpacity={0.88}
              style={[styles.coverBadge, styles.coverBadgeGhost]}
              onPress={() => setImageUrl(null)}>
              <Ionicons name="trash-outline" size={14} color="#fff" />
              <Text style={styles.coverBadgeText}>Remove</Text>
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>

      <View style={styles.block}>
        <Text style={styles.label}>Title</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. Rooftop ramen mission"
          placeholderTextColor="#b7bcc7"
          style={styles.titleInput}
        />
      </View>

      <View style={styles.block}>
        <Text style={styles.label}>Description</Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="A little hint, vibe, or secret plan for the group."
          placeholderTextColor="#b7bcc7"
          multiline
          textAlignVertical="top"
          style={styles.textArea}
        />
      </View>

      <View style={styles.block}>
        <Text style={styles.label}>When does it happen?</Text>
        <TouchableOpacity
          activeOpacity={0.92}
          style={[
            styles.selectionCard,
            pickerTarget === 'date' ? styles.selectionCardActive : null,
            selectedDateOutOfRange ? styles.selectionCardError : null,
          ]}
          onPress={() => setPickerTarget('date')}>
          <View>
            <Text style={styles.selectionEyebrow}>SIDEQUEST DATE</Text>
            <Text style={styles.selectionValue}>{formatLongDate(date)}</Text>
            <Text style={styles.selectionHint}>Only inside {tripRangeText}</Text>
          </View>
          <Ionicons name="calendar-outline" size={22} color="#5f6570" />
        </TouchableOpacity>
      </View>

      <View style={styles.block}>
        <Text style={styles.label}>Visibility</Text>
        <View style={styles.segmented}>
          <VisibilityOption
            label="Public"
            subtitle="Everyone sees it right away"
            active={visibility === 'public'}
            onPress={() => {
              setVisibility('public');
              setPickerTarget(null);
            }}
          />
          <VisibilityOption
            label="Hidden"
            subtitle="Keep it secret until reveal"
            active={visibility === 'hidden'}
            onPress={() => setVisibility('hidden')}
          />
        </View>
      </View>

      {visibility === 'hidden' ? (
        <>
          <View style={styles.block}>
            <Text style={styles.label}>Reveal schedule</Text>
            <View style={styles.revealRow}>
              <TouchableOpacity
                activeOpacity={0.92}
                style={[
                  styles.selectionCard,
                  styles.revealCard,
                  pickerTarget === 'revealDate' ? styles.selectionCardActive : null,
                  revealDateOutOfRange ? styles.selectionCardError : null,
                ]}
                onPress={() => setPickerTarget('revealDate')}>
                <Text style={styles.selectionEyebrow}>REVEAL DATE</Text>
                <Text style={styles.selectionValueSmall}>{formatShortDate(revealDate)}</Text>
                <Text style={styles.selectionHint}>{`${formatShortDate(revealRange.min)} - ${formatShortDate(revealRange.max)}`}</Text>
              </TouchableOpacity>
              <TouchableOpacity activeOpacity={0.92} style={[styles.selectionCard, styles.revealCard, pickerTarget === 'revealTime' ? styles.selectionCardActive : null]} onPress={() => setPickerTarget('revealTime')}>
                <Text style={styles.selectionEyebrow}>REVEAL TIME</Text>
                <Text style={styles.selectionValueSmall}>{formatTime(revealTime)}</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.revealSummary}>
              <Ionicons name="sparkles-outline" size={16} color="#ff4f74" />
              <Text style={styles.revealSummaryText}>{revealAtPreview}</Text>
            </View>
          </View>

          <View style={styles.block}>
            <Text style={styles.label}>Teaser</Text>
            <TextInput
              value={teaser}
              onChangeText={setTeaser}
              placeholder="Optional clue for the group before reveal"
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
              <Text style={styles.helperText}>Add a teaser only if you want to drip-feed suspense before reveal.</Text>
            )}
          </View>
        </>
      ) : null}

      {message ? (
        <View style={[styles.messageBanner, message.type === 'success' ? styles.messageBannerSuccess : styles.messageBannerError]}>
          <Ionicons name={message.type === 'success' ? 'checkmark-circle' : 'alert-circle'} size={18} color={message.type === 'success' ? '#16734d' : '#a52617'} />
          <Text style={[styles.messageText, message.type === 'success' ? styles.messageTextSuccess : styles.messageTextError]}>{message.text}</Text>
        </View>
      ) : null}

      <TouchableOpacity activeOpacity={0.92} style={[styles.primaryButton, submitting ? styles.primaryButtonDisabled : null]} disabled={submitting} onPress={() => void handleSubmit()}>
        <Text style={styles.primaryButtonText}>{submitting ? 'Saving...' : mode === 'edit' ? 'Save changes' : 'Create SideQuest'}</Text>
      </TouchableOpacity>

      <PickerSheet
        visible={pickerTarget !== null}
        title={getPickerTitle(pickerTarget)}
        subtitle={pickerTarget === 'date' ? `Allowed range: ${tripRangeText}` : pickerTarget === 'revealDate' ? 'Choose when the hidden SideQuest should unlock.' : 'Choose the reveal time.'}
        onClose={() => setPickerTarget(null)}>
        {pickerTarget ? (
          <DateTimePicker
            value={pickerValue}
            mode={pickerTarget === 'revealTime' ? 'time' : 'date'}
            display={Platform.OS === 'ios' ? (pickerTarget === 'revealTime' ? 'spinner' : 'inline') : 'default'}
            minimumDate={
              pickerTarget === 'date'
                ? tripStartDate
                  ? new Date(`${tripStartDate}T12:00:00`)
                  : undefined
                : pickerTarget === 'revealDate'
                  ? new Date(`${revealRange.min}T12:00:00`)
                  : undefined
            }
            maximumDate={
              pickerTarget === 'date'
                ? tripEndDate
                  ? new Date(`${tripEndDate}T12:00:00`)
                  : undefined
                : pickerTarget === 'revealDate'
                  ? new Date(`${revealRange.max}T12:00:00`)
                  : undefined
            }
            themeVariant="light"
            accentColor="#ff4f74"
            textColor="#161821"
            onChange={handleDateChange}
          />
        ) : null}
      </PickerSheet>
    </ScrollView>
  );
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
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={onClose} />
        <View style={styles.modalCard}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>{title}</Text>
          <Text style={styles.modalSubtitle}>{subtitle}</Text>
          <View style={styles.modalPickerWrap}>{children}</View>
          <TouchableOpacity activeOpacity={0.9} style={styles.doneButton} onPress={onClose}>
            <Text style={styles.doneButtonText}>Done</Text>
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
}) {
  return (
    <TouchableOpacity activeOpacity={0.92} style={[styles.segmentOption, active ? styles.segmentOptionActive : null]} onPress={onPress}>
      <Text style={[styles.segmentTitle, active ? styles.segmentTitleActive : null]}>{label}</Text>
      <Text style={[styles.segmentSubtitle, active ? styles.segmentSubtitleActive : null]}>{subtitle}</Text>
    </TouchableOpacity>
  );
}

function toDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function toTimeInput(date: Date) {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function isDateInputValid(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isTimeInputValid(value: string) {
  return /^\d{2}:\d{2}$/.test(value);
}

function getDefaultDate() {
  return new Date().toISOString().slice(0, 10);
}

function formatLongDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'long', day: 'numeric' }).format(new Date(`${value}T12:00:00`));
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${value}T12:00:00`));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(`2026-01-01T${value}:00`));
}

function formatRevealPreview(date: string, time: string) {
  return `Reveals ${formatShortDate(date)} at ${formatTime(time)}`;
}

function combineDateAndTime(date: string, time: string) {
  const combined = new Date(`${date}T${time}:00`);
  return combined.toISOString();
}

function isWithinRange(value: string, min: string, max: string) {
  const current = new Date(`${value}T12:00:00`).getTime();
  const start = new Date(`${min}T12:00:00`).getTime();
  const end = new Date(`${max}T12:00:00`).getTime();
  return current >= start && current <= end;
}

function getPickerTitle(target: PickerTarget) {
  if (target === 'date') return 'Choose SideQuest date';
  if (target === 'revealDate') return 'Choose reveal date';
  if (target === 'revealTime') return 'Choose reveal time';
  return 'Choose date';
}

function getRevealRange(tripStartDate?: string | null, tripEndDate?: string | null, sideQuestDate?: string | null) {
  const min = tripStartDate && isDateInputValid(tripStartDate) ? tripStartDate : getDefaultDate();
  const maxCandidate = sideQuestDate && isDateInputValid(sideQuestDate) ? sideQuestDate : tripEndDate && isDateInputValid(tripEndDate) ? tripEndDate : min;
  const tripMax = tripEndDate && isDateInputValid(tripEndDate) ? tripEndDate : maxCandidate;
  const max = maxCandidate <= tripMax ? maxCandidate : tripMax;
  return { min, max };
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 22,
    paddingTop: 12,
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
    flexDirection: 'row',
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
});
