/**
 * RESCHEDULE ACTIVITIES — shown when editing an adventure's dates would leave
 * existing activities outside the new range.
 *
 * Nothing here mutates anything. The modal owns a working plan (activity id →
 * proposed date) and hands the finished plan back to the caller, which is the
 * only place that talks to the API. Cancelling therefore costs nothing: the
 * trip and its activities are untouched until the caller saves.
 *
 * The board reuses the trip feed's drag model verbatim — DraggableDayList over
 * a flat [day, activity, day, activity…] row list, where an activity's new date
 * is whichever day header it comes to rest under. Every date in the new range
 * is emitted as a header even when empty, so all of them are drop targets.
 */
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DraggableDayList from '@/components/draggable-day-list';
import ModalSheet from '@/components/modal-sheet';
import { useI18n } from '@/components/i18n-provider';
import { useTheme } from '@/components/theme-provider';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { addDaysIso, isStay, stayNights } from '@/lib/stay';
import { effectiveEndDate } from '@/lib/trip-dates';
import type { AppTheme } from '@/constants/themes';
import type { SideQuestActivity } from '@/lib/types';

/** What the caller needs to persist one activity. `endDate` only travels for
 * stays — a single-day activity has none and must not gain one here. */
export type RescheduleAssignment = {
  activity: SideQuestActivity;
  date: string;
  endDate: string | null;
};

type Props = {
  visible: boolean;
  activities: SideQuestActivity[];
  /** The range currently stored on the trip — the baseline the suggested
   * shift is measured from. */
  previousStartDate: string;
  newStartDate: string;
  /** Null when the adventure is open-ended. Reachable here only because a
   * MOVED START can still strand activities that now sit before it — removing
   * an end date alone never opens this modal. */
  newEndDate: string | null;
  saving: boolean;
  /** Surfaced by the caller after a failed save so the user sees it without
   * the modal closing and losing their plan. */
  errorText: string | null;
  onCancel: () => void;
  onConfirm: (assignments: RescheduleAssignment[]) => void;
};

const UNASSIGNED = '__unassigned__';

type Row =
  | { kind: 'day'; date: string }
  | { kind: 'activity'; activity: SideQuestActivity };

function iso(value: string): string {
  return value.slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return Math.round(
    (new Date(`${iso(to)}T12:00:00`).getTime() - new Date(`${iso(from)}T12:00:00`).getTime()) / 86_400_000,
  );
}

function eachDate(start: string, end: string): string[] {
  const out: string[] = [];
  const total = daysBetween(start, end);
  for (let i = 0; i <= total; i++) out.push(addDaysIso(start, i));
  return out;
}

/** An activity is out of range when its own date falls outside the new range,
 * or — for a stay — when its check-out would. A stay that starts inside the
 * range but checks out after it is just as invalid as one that starts before.
 *
 * A null `end` means the adventure is open-ended: there is no upper bound to
 * fall past, so only the start date can strand anything. That is why removing
 * an end date never triggers the reschedule step — it only ever widens. */
export function fallsOutsideRange(activity: SideQuestActivity, start: string, end: string | null): boolean {
  const date = iso(activity.date);
  if (date < start || (end !== null && date > end)) return true;
  if (isStay(activity)) {
    const checkout = iso(activity.endDate!);
    if (checkout < start || (end !== null && checkout > end)) return true;
  }
  return false;
}

export default function RescheduleActivitiesModal({
  visible,
  activities,
  previousStartDate,
  newStartDate,
  newEndDate,
  saving,
  errorText,
  onCancel,
  onConfirm,
}: Props) {
  const styles = useThemedStyles(createStyles);
  const { theme } = useTheme();
  const { t, language } = useI18n();
  const locale = language === 'sv' ? 'sv-SE' : 'en-US';

  // The day rows the user can drop activities onto. An open-ended adventure has
  // no last day, so the list is bounded the same way the feed is: up to today
  // or the furthest activity already planned, whichever is later. Without a
  // bound this loop would not terminate.
  const rangeEnd = useMemo(
    () =>
      newEndDate
        ?? effectiveEndDate(
          newStartDate,
          null,
          activities.reduce<string | null>((latest, a) => {
            const date = iso(a.date);
            return !latest || date > latest ? date : latest;
          }, null),
        )
        ?? newStartDate,
    [newEndDate, newStartDate, activities],
  );

  const rangeDates = useMemo(() => eachDate(newStartDate, rangeEnd), [newStartDate, rangeEnd]);

  const affected = useMemo(
    () => activities.filter((a) => fallsOutsideRange(a, newStartDate, newEndDate)),
    [activities, newStartDate, newEndDate],
  );

  // The suggestion: the same delta the adventure's start moved by. Preserving
  // one delta across every activity is what keeps their relative order and
  // spacing intact — moving each to the nearest valid date would collapse them
  // onto the boundary and lose the shape of the itinerary.
  const suggestedShift = useMemo(
    () => daysBetween(previousStartDate, newStartDate),
    [previousStartDate, newStartDate],
  );

  /** The shifted date, but only when the WHOLE activity (stay included) lands
   * inside the range. A partial fit is not a suggestion, it's a broken stay. */
  function shiftedIfValid(activity: SideQuestActivity, shift: number): string | null {
    const nextDate = addDaysIso(iso(activity.date), shift);
    // The upper bound is the rendered range: a suggestion the user cannot see
    // a row for is not a usable suggestion, open-ended or not.
    if (nextDate < newStartDate || nextDate > rangeEnd) return null;
    if (isStay(activity)) {
      const nextEnd = addDaysIso(nextDate, stayNights(activity));
      if (nextEnd > rangeEnd) return null;
    }
    return nextDate;
  }

  const buildInitialPlan = useMemo(
    () => () => {
      const plan = new Map<string, string>();
      for (const activity of affected) {
        plan.set(activity.id, shiftedIfValid(activity, suggestedShift) ?? UNASSIGNED);
      }
      return plan;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [affected, suggestedShift, newStartDate, rangeEnd],
  );

  const [plan, setPlan] = useState<Map<string, string>>(buildInitialPlan);
  const [showError, setShowError] = useState(false);

  // Re-seed whenever the modal opens or the proposed range changes: a plan
  // built against a different range would silently keep stale dates.
  useEffect(() => {
    if (!visible) return;
    setPlan(buildInitialPlan());
    setShowError(false);
  }, [visible, buildInitialPlan]);

  // Order inside a day: existing sortIndex, so an untouched pair keeps the
  // order it already had in the feed. Drag overrides it by rewriting the list.
  const rows = useMemo<Row[]>(() => {
    const byDate = new Map<string, SideQuestActivity[]>();
    for (const date of rangeDates) byDate.set(date, []);
    for (const activity of affected) {
      const date = plan.get(activity.id);
      if (!date || date === UNASSIGNED) continue;
      byDate.get(date)?.push(activity);
    }
    const out: Row[] = [];
    for (const date of rangeDates) {
      out.push({ kind: 'day', date });
      const dayItems = (byDate.get(date) ?? []).slice().sort((a, b) => a.sortIndex - b.sortIndex);
      for (const activity of dayItems) out.push({ kind: 'activity', activity });
    }
    return out;
  }, [rangeDates, affected, plan]);

  const unassigned = useMemo(
    () => affected.filter((a) => (plan.get(a.id) ?? UNASSIGNED) === UNASSIGNED),
    [affected, plan],
  );

  /** Mirrors trip/index.tsx's handleFeedReorder: walk the reordered rows and
   * attribute each activity to the day header above it. */
  function handleReorder(nextRows: Row[]) {
    const next = new Map(plan);
    let currentDate: string | null = null;

    for (const row of nextRows) {
      if (row.kind === 'day') {
        currentDate = row.date;
        continue;
      }
      // An activity dropped above the very first header belongs to the first
      // date — there is nothing above the range's start.
      next.set(row.activity.id, currentDate ?? rangeDates[0]);
    }
    setPlan(next);
    setShowError(false);
  }

  function assign(activityId: string, date: string) {
    setPlan((prev) => {
      const next = new Map(prev);
      next.set(activityId, date);
      return next;
    });
    setShowError(false);
  }

  function applySuggestion() {
    setPlan(buildInitialPlan());
    setShowError(false);
  }

  function handleConfirm() {
    if (unassigned.length > 0) {
      setShowError(true);
      return;
    }
    const assignments: RescheduleAssignment[] = [];
    for (const activity of affected) {
      const date = plan.get(activity.id);
      if (!date || date === UNASSIGNED) continue;
      assignments.push({
        activity,
        date,
        // Stays keep their length: check-out follows check-in by the same
        // number of nights, so a 3-night stay is still a 3-night stay.
        endDate: isStay(activity) ? addDaysIso(date, stayNights(activity)) : null,
      });
    }
    onConfirm(assignments);
  }

  function formatDay(date: string): string {
    return new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short' }).format(
      new Date(`${date}T12:00:00`),
    );
  }

  function formatWas(date: string): string {
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(
      new Date(`${iso(date)}T12:00:00`),
    );
  }

  function dayCount(days: number): string {
    const abs = Math.abs(days);
    return t(abs === 1 ? 'reschedule.dayCount_one' : 'reschedule.dayCount_other', { count: abs });
  }

  function renderActivityCard(activity: SideQuestActivity, isDragging: boolean) {
    const stay = isStay(activity);
    return (
      <View style={[styles.activityCard, isDragging ? styles.activityCardDragging : null]}>
        <Ionicons name="reorder-three-outline" size={18} color={theme.colors.textSecondary} />
        <View style={styles.activityCopy}>
          <Text style={styles.activityTitle} numberOfLines={1}>
            {activity.title?.trim() || t('trip.activityFallbackTitle')}
          </Text>
          <Text style={styles.activityMeta} numberOfLines={1}>
            {t('reschedule.originalDate', { date: formatWas(activity.date) })}
            {stay ? ` · ${t('reschedule.stayNights', { nights: stayNights(activity) })}` : ''}
          </Text>
        </View>
      </View>
    );
  }

  const shiftLabel =
    suggestedShift === 0
      ? null
      : t(suggestedShift > 0 ? 'reschedule.suggestedShift' : 'reschedule.suggestedShiftBack', {
          days: dayCount(suggestedShift),
        });

  return (
    <ModalSheet visible={visible} onClose={saving ? () => {} : onCancel}>
      <View style={styles.sheet}>
        <Text style={styles.title}>{t('reschedule.title')}</Text>
        <Text style={styles.subtitle}>{t('reschedule.subtitle')}</Text>

        <View style={styles.rangeRow}>
          <Text style={styles.rangeEyebrow}>{t('reschedule.newRange')}</Text>
          <Text style={styles.rangeValue}>
            {formatWas(newStartDate)} – {newEndDate ? formatWas(newEndDate) : t('trip.ongoing')}
          </Text>
        </View>

        {shiftLabel ? (
          <View style={styles.suggestionRow}>
            <Text style={styles.suggestionText}>{shiftLabel}</Text>
            <TouchableOpacity
              activeOpacity={0.8}
              style={styles.suggestionChip}
              accessibilityRole="button"
              onPress={applySuggestion}>
              <Text style={styles.suggestionChipText}>{t('reschedule.applySuggestion')}</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <ScrollView style={styles.board} contentContainerStyle={styles.boardContent}>
          {unassigned.length > 0 ? (
            <View style={styles.unassignedBlock}>
              <Text style={styles.unassignedEyebrow}>{t('reschedule.unassigned')}</Text>
              <Text style={styles.unassignedHint}>{t('reschedule.unassignedHint')}</Text>
              {unassigned.map((activity) => {
                const nights = stayNights(activity);
                // Measured against the RENDERED range: those are the only days
                // that exist as drop targets, open-ended or not.
                const tooLong = isStay(activity) && nights > daysBetween(newStartDate, rangeEnd);
                return (
                  <View key={activity.id} style={styles.unassignedCard}>
                    <Text style={styles.activityTitle} numberOfLines={1}>
                      {activity.title?.trim() || t('trip.activityFallbackTitle')}
                    </Text>
                    <Text style={styles.activityMeta}>
                      {t('reschedule.originalDate', { date: formatWas(activity.date) })}
                      {isStay(activity) ? ` · ${t('reschedule.stayNights', { nights })}` : ''}
                    </Text>
                    {tooLong ? (
                      <Text style={styles.stayTooLong}>{t('reschedule.stayTooLong')}</Text>
                    ) : (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.datePickRow}>
                        {rangeDates
                          // A stay can only start where its whole length fits.
                          .filter((d) => !isStay(activity) || addDaysIso(d, nights) <= rangeEnd)
                          .map((date) => (
                            <TouchableOpacity
                              key={date}
                              activeOpacity={0.8}
                              style={styles.datePickChip}
                              accessibilityRole="button"
                              onPress={() => assign(activity.id, date)}>
                              <Text style={styles.datePickChipText}>{formatDay(date)}</Text>
                            </TouchableOpacity>
                          ))}
                      </ScrollView>
                    )}
                  </View>
                );
              })}
            </View>
          ) : null}

          <Text style={styles.dragHint}>{t('reschedule.dragHint')}</Text>

          <DraggableDayList
            items={rows}
            keyExtractor={(row) => (row.kind === 'day' ? `day-${row.date}` : row.activity.id)}
            enabled={!saving}
            isDraggable={(row) => row.kind === 'activity'}
            onReorder={(nextRows) => handleReorder(nextRows)}
            renderItem={(row, isDragging) =>
              row.kind === 'day' ? (
                <View style={styles.dayHeader}>
                  <Text style={styles.dayHeaderText}>{formatDay(row.date)}</Text>
                </View>
              ) : (
                renderActivityCard(row.activity, isDragging)
              )
            }
          />
        </ScrollView>

        {showError ? <Text style={styles.errorText}>{t('reschedule.errorUnassigned')}</Text> : null}
        {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}

        <View style={styles.actions}>
          <TouchableOpacity
            activeOpacity={0.8}
            style={styles.cancelButton}
            accessibilityRole="button"
            disabled={saving}
            onPress={onCancel}>
            <Text style={styles.cancelText}>{t('reschedule.cancel')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.9}
            style={[styles.confirmButton, saving ? styles.confirmButtonDisabled : null]}
            accessibilityRole="button"
            accessibilityState={{ disabled: saving }}
            disabled={saving}
            onPress={handleConfirm}>
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.confirmText}>{t('reschedule.confirm')}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </ModalSheet>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    sheet: { flex: 1, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, gap: 10 },
    title: { fontSize: 19, fontWeight: '800', color: theme.colors.textPrimary, letterSpacing: -0.3 },
    subtitle: { fontSize: 13, color: theme.colors.textSecondary, lineHeight: 18 },
    rangeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 14,
      backgroundColor: theme.isDark ? theme.colors.bgLightest : '#f7f8fa',
    },
    rangeEyebrow: { fontSize: 11, fontWeight: '800', color: theme.colors.textSecondary, letterSpacing: 0.6 },
    rangeValue: { fontSize: 13, fontWeight: '700', color: theme.colors.textPrimary },
    suggestionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    suggestionText: { flex: 1, fontSize: 13, color: theme.colors.textSecondary },
    suggestionChip: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 20,
      borderWidth: 1.5,
      borderStyle: 'dashed',
      borderColor: theme.isDark ? theme.colors.primaryLight20 : '#ff9cb0',
      backgroundColor: theme.isDark ? theme.colors.primaryLight08 : '#fff0f3',
    },
    suggestionChipText: { fontSize: 13, fontWeight: '700', color: theme.colors.primary },
    board: { flex: 1, marginTop: 4 },
    boardContent: { paddingBottom: 16 },
    dragHint: { fontSize: 12, color: theme.colors.textSecondary, marginBottom: 8 },
    dayHeader: { paddingTop: 12, paddingBottom: 6 },
    dayHeaderText: { fontSize: 12, fontWeight: '800', color: theme.colors.textSecondary, letterSpacing: 0.5 },
    activityCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 12,
      paddingVertical: 11,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.isDark ? theme.colors.borderInput : '#e7e9ee',
      backgroundColor: theme.isDark ? theme.colors.bgLightest : '#fff',
      marginBottom: 8,
    },
    activityCardDragging: { borderColor: theme.colors.primary, opacity: 0.95 },
    activityCopy: { flex: 1 },
    activityTitle: { fontSize: 14, fontWeight: '700', color: theme.colors.textPrimary },
    activityMeta: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 },
    unassignedBlock: {
      padding: 12,
      borderRadius: 14,
      borderWidth: 1.5,
      borderColor: theme.colors.primary,
      backgroundColor: theme.isDark ? theme.colors.primaryLight08 : '#fff0f3',
      marginBottom: 14,
      gap: 6,
    },
    unassignedEyebrow: { fontSize: 11, fontWeight: '800', color: theme.colors.primary, letterSpacing: 0.6 },
    unassignedHint: { fontSize: 12, color: theme.colors.textSecondary },
    unassignedCard: { marginTop: 6, gap: 4 },
    datePickRow: { marginTop: 6 },
    datePickChip: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 20,
      marginRight: 8,
      borderWidth: 1,
      borderColor: theme.isDark ? theme.colors.borderInput : '#e7e9ee',
      backgroundColor: theme.isDark ? theme.colors.bgLightest : '#fff',
    },
    datePickChipText: { fontSize: 12, fontWeight: '700', color: theme.colors.textPrimary },
    stayTooLong: { fontSize: 12, color: theme.colors.error, marginTop: 4 },
    errorText: { fontSize: 13, color: theme.colors.error, fontWeight: '600' },
    actions: { flexDirection: 'row', gap: 10, alignItems: 'center' },
    cancelButton: { paddingHorizontal: 18, paddingVertical: 14 },
    cancelText: { flexShrink: 1, fontSize: 14, fontWeight: '700', color: theme.colors.textSecondary },
    // minHeight, not height: a wrapped label must grow the button rather than
    // be clipped by it.
    confirmButton: {
      flex: 1,
      minHeight: 50,
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 25,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.primary,
    },
    confirmButtonDisabled: { opacity: 0.6 },
    confirmText: { flexShrink: 1, textAlign: 'center', fontSize: 15, fontWeight: '800', color: '#fff' },
  });
