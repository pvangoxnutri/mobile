import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ModalSheet from '@/components/modal-sheet';
import { useI18n } from '@/components/i18n-provider';
import { useTheme } from '@/components/theme-provider';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { GlunoDayPlanRow, GlunoProposal } from '@/lib/gluno';
import type { AppTheme } from '@/constants/themes';

// ──────────────────────────────────────────────────────────────────────────
// GLUNO — reviewing a proposal before it becomes real.
//
// This screen exists because Gluno must never change an Adventure on its own.
// Everything it suggests lands here first, as editable fields the user can
// correct, trim or reorder, and nothing is written until they tap apply.
//
// Deliberately NOT a JSON editor and deliberately NOT the full Activity form.
// The former would expose the machinery; the latter carries images, hidden
// SideQuest settings and visibility rules that have no meaning for a
// suggestion. What is here is the set of fields a person actually wants to
// adjust before saying yes — the same field vocabulary the Activity form uses,
// in a smaller shape.
//
// The payload the user leaves with is re-validated server-side at apply. This
// is a review step, not a validation boundary.
// ──────────────────────────────────────────────────────────────────────────

type DayPlanRow = GlunoDayPlanRow;

type Props = {
  proposal: GlunoProposal | null;
  visible: boolean;
  applying: boolean;
  onClose: () => void;
  /** Applies the (possibly edited) payload. */
  onApply: (payload: Record<string, unknown>) => void;
  /**
   * Sends an edited day plan back to be re-laid by the schedule engine.
   *
   * Moving a stop or stretching one by an hour changes every travel time after
   * it. Recomputing that here would mean a second scheduler in the app that
   * could disagree with the server's — so the server does it, and this screen
   * renders the answer.
   */
  onRevalidate?: (payload: Record<string, unknown>) => void;
  /** True while a re-validation is in flight. */
  revalidating?: boolean;
  onDismiss: () => void;
};

function asText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function isoToDate(iso: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return new Date();
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function dateToIso(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export default function GlunoProposalReview({
  proposal,
  visible,
  applying,
  onClose,
  onApply,
  onRevalidate,
  revalidating = false,
  onDismiss,
}: Props) {
  const styles = useThemedStyles(createStyles);
  const { theme } = useTheme();
  const { t, language } = useI18n();
  const insets = useSafeAreaInsets();

  // Local edit state, seeded from the proposal each time it opens. Nothing
  // here touches the server until apply.
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [time, setTime] = useState('');
  const [label, setLabel] = useState('');
  const [locationLabel, setLocationLabel] = useState('');
  const [primaryDate, setPrimaryDate] = useState('');
  const [secondaryDate, setSecondaryDate] = useState('');
  const [clearEndDate, setClearEndDate] = useState(false);
  const [replaceMainLocation, setReplaceMainLocation] = useState(false);
  const [rows, setRows] = useState<DayPlanRow[]>([]);
  const [datePickerFor, setDatePickerFor] = useState<'primary' | 'secondary' | null>(null);

  const payload = useMemo(
    () => (proposal?.payload ?? {}) as Record<string, unknown>,
    [proposal],
  );

  useEffect(() => {
    if (!visible || !proposal) return;

    setTitle(asText(payload.title));
    setDescription(asText(payload.description));
    setTime(asText(payload.time) || asText(payload.toTime));
    setLabel(asText(payload.label));
    setLocationLabel(asText(payload.locationLabel));
    setClearEndDate(payload.clearEndDate === true);
    setReplaceMainLocation(payload.replaceExisting === true);
    setDatePickerFor(null);

    // Each kind has a different "main" date, so they are normalised into one
    // pair of slots rather than five parallel pieces of state.
    if (proposal.kind === 'activity_move') {
      setPrimaryDate(asText(payload.toDate));
      setSecondaryDate('');
    } else if (proposal.kind === 'trip_dates') {
      setPrimaryDate(asText(payload.startDate));
      setSecondaryDate(asText(payload.endDate));
    } else {
      setPrimaryDate(asText(payload.date));
      setSecondaryDate(asText(payload.endDate));
    }

    setRows(
      Array.isArray(payload.activities)
        ? (payload.activities as Record<string, unknown>[]).map((row) => ({
            title: asText(row.title),
            time: asText(row.time),
            endTime: asText(row.endTime) || undefined,
            description: asText(row.description) || undefined,
            category: asText(row.category) || undefined,
            durationMinutes: typeof row.durationMinutes === 'number' ? row.durationMinutes : undefined,
            durationSource: asText(row.durationSource) || undefined,
            isFixed: row.isFixed === true,
            existingActivityId: asText(row.existingActivityId) || null,
            latitude: typeof row.latitude === 'number' ? row.latitude : null,
            longitude: typeof row.longitude === 'number' ? row.longitude : null,
            travelFromPrevious: (row.travelFromPrevious ?? null) as DayPlanRow['travelFromPrevious'],
            openingHours: (row.openingHours ?? null) as DayPlanRow['openingHours'],
            warnings: Array.isArray(row.warnings) ? (row.warnings as string[]) : [],
          }))
        : [],
    );
  }, [visible, proposal, payload]);

  if (!proposal) return null;

  const isDayPlan = proposal.kind === 'day_plan';
  const isMove = proposal.kind === 'activity_move';
  const isTripDates = proposal.kind === 'trip_dates';
  const isDayLocation = proposal.kind === 'day_location';
  const isActivity = proposal.kind === 'activity';

  // "Apply to Adventure" for things that create something; "Apply change" for
  // things that only move or edit what is already there.
  const primaryLabel = isMove || isTripDates
    ? t('gluno.proposal.applyChange')
    : t('gluno.proposal.applyToAdventure');

  // The day's own numbers, straight from the schedule the server produced.
  // Nothing here is recomputed in the app — a second scheduler that disagreed
  // with the server's would be worse than no scheduler at all.
  const feasible = payload.feasible !== false;
  const routingVerified = payload.routingVerified === true;
  const droppedStops = Array.isArray(payload.dropped)
    ? (payload.dropped as { title?: string; reason?: string }[])
    : [];
  const transportModeLabel = asText(payload.transportModeLabel);
  const transportMode = asText(payload.transportMode) || 'walking';

  function moveRow(index: number, delta: number) {
    const next = [...rows];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setRows(next);
    // Reordering changes every travel time after the swap, so the schedule is
    // re-laid rather than left showing the old ones.
    requestRevalidation(next);
  }

  function removeRow(index: number) {
    const next = rows.filter((_, i) => i !== index);
    setRows(next);
    requestRevalidation(next);
  }

  function requestRevalidation(nextRows: DayPlanRow[]) {
    if (!isDayPlan || !onRevalidate) return;
    onRevalidate({ ...payload, date: primaryDate, activities: serialiseRows(nextRows) });
  }

  function serialiseRows(source: DayPlanRow[]) {
    return source
      .filter((row) => row.title.trim().length > 0)
      .map((row) => ({
        ...row,
        title: row.title.trim(),
        // A time the user typed IS fixed — the engine honours it instead of
        // helpfully re-deriving one.
        time: row.time.trim() || null,
        description: row.description ?? null,
        category: row.category ?? null,
      }));
  }

  function buildPayload(): Record<string, unknown> {
    // Start from the original so fields the review does not expose (ids,
    // coordinates, the moved activity's title) survive untouched.
    const next: Record<string, unknown> = { ...payload };

    if (isActivity) {
      next.title = title.trim();
      next.description = description.trim() || null;
      next.time = time.trim() || null;
      next.locationLabel = locationLabel.trim() || null;
      next.date = primaryDate;
      if (secondaryDate) next.endDate = secondaryDate;
    } else if (isDayPlan) {
      next.date = primaryDate;
      next.activities = serialiseRows(rows);
    } else if (isDayLocation) {
      next.label = label.trim();
      next.date = primaryDate;
      next.replaceExisting = replaceMainLocation;
    } else if (isMove) {
      next.toDate = primaryDate;
      next.toTime = time.trim() || null;
    } else if (isTripDates) {
      next.startDate = primaryDate;
      next.clearEndDate = clearEndDate;
      next.endDate = clearEndDate ? null : secondaryDate || null;
    }

    return next;
  }

  const canApply =
    !applying &&
    !revalidating &&
    (isDayPlan
      // A day with an unresolved clash cannot be saved. The server refuses it
      // too — this is the visible half of the same rule, so the user finds out
      // before tapping rather than after.
      ? feasible && rows.some((row) => row.title.trim().length > 0)
      : isDayLocation
        ? label.trim().length > 0
        : isActivity
          ? title.trim().length > 0
          : true);

  function handleDateChange(event: DateTimePickerEvent, selected?: Date) {
    const slot = datePickerFor;
    if (Platform.OS !== 'ios') setDatePickerFor(null);
    if (event.type === 'dismissed' || !selected || !slot) return;

    const iso = dateToIso(selected);
    if (slot === 'primary') setPrimaryDate(iso);
    else {
      setSecondaryDate(iso);
      setClearEndDate(false);
    }
  }

  function formatDate(iso: string) {
    if (!iso) return t('gluno.proposal.openEnded');
    try {
      return isoToDate(iso).toLocaleDateString(language === 'sv' ? 'sv-SE' : 'en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return iso;
    }
  }

  return (
    <ModalSheet visible={visible} onClose={onClose} autoHeight slowEntry>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <View style={styles.headerCopy}>
              {/* Provenance is stated, not implied: the user should never be
                  unsure whether they wrote this or Gluno did. */}
              <Text style={styles.eyebrow}>{t('gluno.proposal.suggestedByGluno')}</Text>
              <Text style={styles.title} numberOfLines={2}>{proposal.summary}</Text>
            </View>
            <TouchableOpacity
              style={styles.closeButton}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={t('common.cancel')}
              onPress={onClose}>
              <Ionicons name="close" size={19} color={theme.colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <Text style={styles.hint}>{t('gluno.proposal.reviewHint')}</Text>

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            {isActivity && (
              <>
                <Field label={t('gluno.proposal.field.what')} styles={styles}>
                  <TextInput
                    value={title}
                    onChangeText={setTitle}
                    style={styles.input}
                    placeholderTextColor={theme.colors.placeholderText}
                    keyboardAppearance={theme.keyboardAppearance}
                  />
                </Field>
                <DateField
                  label={t('gluno.proposal.field.day')}
                  value={formatDate(primaryDate)}
                  onPress={() => setDatePickerFor('primary')}
                  styles={styles}
                  theme={theme}
                />
                <Field label={t('gluno.proposal.field.when')} styles={styles}>
                  <TextInput
                    value={time}
                    onChangeText={setTime}
                    placeholder="HH:MM"
                    style={styles.input}
                    placeholderTextColor={theme.colors.placeholderText}
                    keyboardAppearance={theme.keyboardAppearance}
                  />
                </Field>
                <Field label={t('gluno.proposal.field.place')} styles={styles}>
                  <TextInput
                    value={locationLabel}
                    onChangeText={setLocationLabel}
                    style={styles.input}
                    placeholderTextColor={theme.colors.placeholderText}
                    keyboardAppearance={theme.keyboardAppearance}
                  />
                </Field>
                <Field label={t('gluno.proposal.field.notes')} styles={styles}>
                  <TextInput
                    value={description}
                    onChangeText={setDescription}
                    style={[styles.input, styles.inputMultiline]}
                    multiline
                    placeholderTextColor={theme.colors.placeholderText}
                    keyboardAppearance={theme.keyboardAppearance}
                  />
                </Field>
              </>
            )}

            {isDayPlan && (
              <>
                <DateField
                  label={t('gluno.proposal.field.day')}
                  value={formatDate(primaryDate)}
                  onPress={() => setDatePickerFor('primary')}
                  styles={styles}
                  theme={theme}
                />

                {/* How they're getting around. Changing it re-routes the whole
                    day, so it re-lays rather than just relabelling. */}
                <View style={styles.modeRow}>
                  {(['walking', 'transit', 'driving', 'cycling'] as const).map((mode) => {
                    const active = transportMode === mode;
                    return (
                      <TouchableOpacity
                        key={mode}
                        style={[styles.modeChip, active && styles.modeChipActive]}
                        activeOpacity={0.85}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        onPress={() => {
                          if (active || !onRevalidate) return;
                          onRevalidate({
                            ...payload,
                            date: primaryDate,
                            transportMode: mode,
                            activities: serialiseRows(rows),
                          });
                        }}>
                        <Text style={[styles.modeChipText, active && styles.modeChipTextActive]}>
                          {t(`gluno.proposal.mode.${mode}`)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Stated plainly: are the travel times below measured, or
                    SideQuest's own estimate? */}
                <View style={styles.planMeta}>
                  <Text style={styles.planMetaText}>
                    {routingVerified
                      ? t('gluno.proposal.travelVerified')
                      : t('gluno.proposal.travelEstimated')}
                  </Text>
                  {transportModeLabel ? (
                    <Text style={styles.planMetaText}>{transportModeLabel}</Text>
                  ) : null}
                </View>

                {!feasible && (
                  <View style={styles.blockingBanner}>
                    <Ionicons name="alert-circle" size={17} color={theme.colors.error} />
                    <Text style={styles.blockingText}>{t('gluno.proposal.scheduleClash')}</Text>
                  </View>
                )}

                {/* Grounding, stated once at the top rather than repeated on
                    every row. What the plan rests on is a property of the plan;
                    a per-row badge would be noise on a phone. */}
                {rows.some((row) => row.openingHours?.warning === 'unknown_hours' || !row.openingHours) ? (
                  <Text style={styles.groundingNote}>{t('gluno.proposal.hoursUnverified')}</Text>
                ) : null}

                {routingVerified ? (
                  <Text style={styles.groundingNote}>{t('gluno.proposal.routeFromCurrentData')}</Text>
                ) : null}

                {rows.map((row, index) => (
                  <View key={index}>
                    {/* Travel sits BETWEEN rows, never as a row of its own —
                        it is not an Activity and is not saved as one. */}
                    {row.travelFromPrevious ? (
                      <View style={styles.travelRow}>
                        <Ionicons name="arrow-down" size={13} color={theme.colors.textMuted} />
                        <Text style={styles.travelText}>
                          {row.travelFromPrevious.modeLabel} · {row.travelFromPrevious.minutes} min
                          {row.travelFromPrevious.verified
                            ? ''
                            : ` · ${t('gluno.proposal.estimatedShort')}`}
                        </Text>
                      </View>
                    ) : null}

                    <View style={styles.row}>
                      <View style={styles.rowHeader}>
                        <Text style={styles.rowIndex}>{index + 1}</Text>
                        <View style={styles.rowActions}>
                          <TouchableOpacity
                            style={styles.rowButton}
                            disabled={index === 0}
                            accessibilityRole="button"
                            accessibilityLabel={t('gluno.proposal.moveUp')}
                            onPress={() => moveRow(index, -1)}>
                            <Ionicons
                              name="chevron-up"
                              size={16}
                              color={index === 0 ? theme.colors.textMuted : theme.colors.textPrimary}
                            />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.rowButton}
                            disabled={index === rows.length - 1}
                            accessibilityRole="button"
                            accessibilityLabel={t('gluno.proposal.moveDown')}
                            onPress={() => moveRow(index, 1)}>
                            <Ionicons
                              name="chevron-down"
                              size={16}
                              color={index === rows.length - 1 ? theme.colors.textMuted : theme.colors.textPrimary}
                            />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.rowButton}
                            accessibilityRole="button"
                            accessibilityLabel={t('gluno.proposal.removeRow')}
                            onPress={() => removeRow(index)}>
                            <Ionicons name="trash-outline" size={16} color={theme.colors.error} />
                          </TouchableOpacity>
                        </View>
                      </View>

                      <TextInput
                        value={row.title}
                        onChangeText={(next) =>
                          setRows((current) => current.map((entry, i) => (i === index ? { ...entry, title: next } : entry)))
                        }
                        style={styles.input}
                        placeholderTextColor={theme.colors.placeholderText}
                        keyboardAppearance={theme.keyboardAppearance}
                      />

                      <View style={styles.rowFields}>
                        <View style={styles.rowFieldGroup}>
                          <Text style={styles.rowFieldLabel}>{t('gluno.proposal.field.when')}</Text>
                          <TextInput
                            value={row.time}
                            onChangeText={(next) =>
                              setRows((current) => current.map((entry, i) => (i === index ? { ...entry, time: next } : entry)))
                            }
                            onBlur={() => requestRevalidation(rows)}
                            placeholder="HH:MM"
                            style={[styles.input, styles.inputCompact]}
                            placeholderTextColor={theme.colors.placeholderText}
                            keyboardAppearance={theme.keyboardAppearance}
                          />
                        </View>
                        <View style={styles.rowFieldGroup}>
                          <Text style={styles.rowFieldLabel}>{t('gluno.proposal.field.duration')}</Text>
                          <TextInput
                            value={row.durationMinutes ? String(row.durationMinutes) : ''}
                            onChangeText={(next) =>
                              setRows((current) =>
                                current.map((entry, i) =>
                                  i === index
                                    ? { ...entry, durationMinutes: Number(next.replace(/\D/g, '')) || undefined }
                                    : entry,
                                ),
                              )
                            }
                            onBlur={() => requestRevalidation(rows)}
                            placeholder="min"
                            keyboardType="number-pad"
                            style={[styles.input, styles.inputCompact]}
                            placeholderTextColor={theme.colors.placeholderText}
                            keyboardAppearance={theme.keyboardAppearance}
                          />
                        </View>
                      </View>

                      {/* A duration SideQuest assumed is labelled as an
                          assumption, so nobody reads it as a fact about the
                          place. */}
                      {row.durationSource === 'category_estimate' ? (
                        <Text style={styles.rowNote}>{t('gluno.proposal.durationEstimate')}</Text>
                      ) : null}

                      {row.openingHours?.warning && row.openingHours.warning !== 'unknown_hours' ? (
                        <Text style={styles.rowWarning}>
                          {t(`gluno.proposal.hours.${row.openingHours.warning}`)}
                          {row.openingHours.opensAt ? ` (${row.openingHours.opensAt}–${row.openingHours.closesAt ?? ''})` : ''}
                        </Text>
                      ) : null}

                      {row.warnings?.includes('overlaps_previous_fixed') ||
                      row.warnings?.includes('overlaps_previous') ? (
                        <Text style={styles.rowWarning}>{t('gluno.proposal.overlapWarning')}</Text>
                      ) : null}

                      {row.existingActivityId ? (
                        <Text style={styles.rowNote}>{t('gluno.proposal.alreadyPlanned')}</Text>
                      ) : null}
                    </View>
                  </View>
                ))}

                {/* What did not fit is stated, never quietly dropped. */}
                {droppedStops.length > 0 && (
                  <View style={styles.droppedBox}>
                    <Text style={styles.droppedTitle}>{t('gluno.proposal.didNotFit')}</Text>
                    {droppedStops.map((stop, index) => (
                      <Text key={index} style={styles.droppedItem}>
                        · {stop.title}
                      </Text>
                    ))}
                  </View>
                )}
              </>
            )}

            {isDayLocation && (
              <>
                <DateField
                  label={t('gluno.proposal.field.day')}
                  value={formatDate(primaryDate)}
                  onPress={() => setDatePickerFor('primary')}
                  styles={styles}
                  theme={theme}
                />
                <Field label={t('gluno.proposal.field.place')} styles={styles}>
                  <TextInput
                    value={label}
                    onChangeText={setLabel}
                    style={styles.input}
                    placeholderTextColor={theme.colors.placeholderText}
                    keyboardAppearance={theme.keyboardAppearance}
                  />
                </Field>
                {/* Main location versus extra stop is what the day's
                    carry-forward rule turns on — only the main location rolls
                    onward to later days — so it is an explicit choice here,
                    not something inferred from position. */}
                <TouchableOpacity
                  style={styles.toggleRow}
                  activeOpacity={0.85}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: replaceMainLocation }}
                  onPress={() => setReplaceMainLocation((current) => !current)}>
                  <Ionicons
                    name={replaceMainLocation ? 'checkbox' : 'square-outline'}
                    size={19}
                    color={replaceMainLocation ? theme.colors.primary : theme.colors.textMuted}
                  />
                  <Text style={styles.toggleText}>{t('gluno.proposal.dayLocationSetMain')}</Text>
                </TouchableOpacity>
                <Text style={styles.note}>
                  {replaceMainLocation
                    ? t('gluno.proposal.dayLocationMain')
                    : t('gluno.proposal.dayLocationExtra')}
                </Text>
              </>
            )}

            {isMove && (
              <>
                <View style={styles.readonlyRow}>
                  <Text style={styles.readonlyLabel}>{t('gluno.proposal.field.from')}</Text>
                  <Text style={styles.readonlyValue}>
                    {formatDate(asText(payload.fromDate))}
                    {asText(payload.fromTime) ? ` · ${asText(payload.fromTime)}` : ''}
                  </Text>
                </View>
                <DateField
                  label={t('gluno.proposal.field.to')}
                  value={formatDate(primaryDate)}
                  onPress={() => setDatePickerFor('primary')}
                  styles={styles}
                  theme={theme}
                />
                <Field label={t('gluno.proposal.field.when')} styles={styles}>
                  <TextInput
                    value={time}
                    onChangeText={setTime}
                    placeholder="HH:MM"
                    style={styles.input}
                    placeholderTextColor={theme.colors.placeholderText}
                    keyboardAppearance={theme.keyboardAppearance}
                  />
                </Field>
              </>
            )}

            {isTripDates && (
              <>
                <DateField
                  label={t('gluno.proposal.field.start')}
                  value={formatDate(primaryDate)}
                  onPress={() => setDatePickerFor('primary')}
                  styles={styles}
                  theme={theme}
                />
                <DateField
                  label={t('gluno.proposal.field.end')}
                  value={clearEndDate ? t('gluno.proposal.openEnded') : formatDate(secondaryDate)}
                  onPress={() => setDatePickerFor('secondary')}
                  styles={styles}
                  theme={theme}
                />
                <TouchableOpacity
                  style={styles.toggleRow}
                  activeOpacity={0.85}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: clearEndDate }}
                  onPress={() => setClearEndDate((current) => !current)}>
                  <Ionicons
                    name={clearEndDate ? 'checkbox' : 'square-outline'}
                    size={19}
                    color={clearEndDate ? theme.colors.primary : theme.colors.textMuted}
                  />
                  <Text style={styles.toggleText}>{t('gluno.proposal.makeOpenEnded')}</Text>
                </TouchableOpacity>
              </>
            )}

            {datePickerFor ? (
              <DateTimePicker
                value={isoToDate(datePickerFor === 'primary' ? primaryDate : secondaryDate)}
                mode="date"
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                onChange={handleDateChange}
                themeVariant={theme.isDark ? 'dark' : 'light'}
              />
            ) : null}
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.secondaryButton, applying && styles.buttonDisabled]}
              activeOpacity={0.85}
              disabled={applying}
              accessibilityRole="button"
              onPress={onDismiss}>
              <Text style={styles.secondaryText}>{t('gluno.proposal.dismiss')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.primaryButton, !canApply && styles.buttonDisabled]}
              activeOpacity={0.85}
              // Disabled while applying — the request is in flight and a
              // second tap must not start another one.
              disabled={!canApply}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canApply, busy: applying }}
              onPress={() => onApply(buildPayload())}>
              {applying ? (
                <>
                  <ActivityIndicator size="small" color={theme.colors.white} />
                  <Text style={styles.primaryText}>{t('gluno.proposal.applying')}</Text>
                </>
              ) : (
                <Text style={styles.primaryText}>{primaryLabel}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </ModalSheet>
  );
}

function Field({
  label,
  children,
  styles,
}: {
  label: string;
  children: React.ReactNode;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function DateField({
  label,
  value,
  onPress,
  styles,
  theme,
}: {
  label: string;
  value: string;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
  theme: AppTheme;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TouchableOpacity style={styles.dateButton} activeOpacity={0.85} onPress={onPress} accessibilityRole="button">
        <Text style={styles.dateText}>{value}</Text>
        <Ionicons name="calendar-outline" size={17} color={theme.colors.textMeta} />
      </TouchableOpacity>
    </View>
  );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  flex: {
    flex: 1,
  },
  sheet: {
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.sheetHandle,
    marginBottom: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  headerCopy: {
    flex: 1,
  },
  eyebrow: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: theme.colors.primary,
  },
  title: {
    marginTop: 3,
    fontSize: 17,
    fontWeight: '800',
    color: theme.colors.textPrimary,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bgLight,
  },
  hint: {
    marginTop: 8,
    fontSize: 12.5,
    lineHeight: 18,
    color: theme.colors.textSecondary,
  },
  body: {
    marginTop: 14,
  },
  bodyContent: {
    paddingBottom: 12,
  },
  field: {
    marginBottom: 14,
  },
  fieldLabel: {
    marginBottom: 6,
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.textMeta,
  },
  input: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.borderInput,
    backgroundColor: theme.colors.bgLight,
    paddingHorizontal: 13,
    paddingVertical: 11,
    fontSize: 14.5,
    color: theme.colors.textPrimary,
  },
  inputMultiline: {
    minHeight: 78,
    textAlignVertical: 'top',
  },
  inputCompact: {
    marginTop: 8,
    maxWidth: 120,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.borderInput,
    backgroundColor: theme.colors.bgLight,
    paddingHorizontal: 13,
    paddingVertical: 12,
  },
  dateText: {
    fontSize: 14.5,
    color: theme.colors.textPrimary,
  },
  row: {
    marginBottom: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.borderPrimary,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  rowIndex: {
    fontSize: 12,
    fontWeight: '800',
    color: theme.colors.textMeta,
  },
  rowActions: {
    flexDirection: 'row',
    gap: 4,
  },
  rowFields: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  rowFieldGroup: {
    flex: 1,
  },
  rowFieldLabel: {
    marginBottom: 5,
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.textMeta,
  },
  rowNote: {
    marginTop: 7,
    fontSize: 11.5,
    lineHeight: 16,
    color: theme.colors.textMuted,
  },
  rowWarning: {
    marginTop: 7,
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: '600',
    color: theme.colors.error,
  },
  modeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  modeChip: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: theme.colors.bgLight,
  },
  modeChipActive: {
    backgroundColor: theme.colors.primary,
  },
  modeChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.textSecondary,
  },
  modeChipTextActive: {
    color: theme.colors.white,
  },
  groundingNote: {
    marginBottom: 10,
    fontSize: 11.5,
    lineHeight: 16,
    color: theme.colors.textMuted,
  },
  planMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 12,
  },
  planMetaText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: theme.colors.textMeta,
  },
  blockingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 11,
    marginBottom: 12,
    borderRadius: 12,
    backgroundColor: theme.colors.bgLight,
  },
  blockingText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 17,
    color: theme.colors.error,
  },
  travelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 12,
    paddingVertical: 4,
    marginBottom: 4,
  },
  travelText: {
    fontSize: 11.5,
    color: theme.colors.textMuted,
  },
  droppedBox: {
    marginTop: 4,
    marginBottom: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: theme.colors.bgLight,
  },
  droppedTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: theme.colors.textSecondary,
  },
  droppedItem: {
    marginTop: 4,
    fontSize: 12.5,
    color: theme.colors.textMeta,
  },
  rowButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bgLight,
  },
  readonlyRow: {
    marginBottom: 14,
  },
  readonlyLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.textMeta,
  },
  readonlyValue: {
    marginTop: 4,
    fontSize: 14.5,
    color: theme.colors.textPrimary,
  },
  note: {
    marginTop: -4,
    fontSize: 12,
    lineHeight: 17,
    color: theme.colors.textMeta,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 6,
  },
  toggleText: {
    fontSize: 13.5,
    color: theme.colors.textPrimary,
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.borderPrimary,
  },
  secondaryButton: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bgLight,
  },
  secondaryText: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.textSecondary,
  },
  primaryButton: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primary,
  },
  primaryText: {
    fontSize: 14.5,
    fontWeight: '800',
    color: theme.colors.white,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
});
