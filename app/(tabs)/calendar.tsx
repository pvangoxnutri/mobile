import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import TopAlertsButton from '@/components/top-alerts-button';
import { useI18n } from '@/components/i18n-provider';
import { apiJson } from '@/lib/api';
import { getCategorySymbol } from '@/lib/category-symbol';
import type { Quest, SideQuestActivity } from '@/lib/types';
import { SPACING, TYPOGRAPHY, COLORS, RADIUS, SHADOWS } from '@/constants/design-tokens';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type CalendarItem = {
  id: string;
  kind: 'trip' | 'activity';
  tripId: string;
  activityId?: string;
  title: string;
  date: string;
  time?: string | null;
  meta: string;
  hidden?: boolean;
  imageUrl?: string | null;
  description?: string | null;
  teaser?: string | null;
  teaserVisible?: boolean;
  revealAt?: string | null;
  isRevealed?: boolean;
  ownerName?: string | null;
  tripPhase?: 'start' | 'end';
  category?: string | null;
};

export default function CalendarScreen() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView | null>(null);
  const [quests, setQuests] = useState<Quest[]>([]);
  const [activities, setActivities] = useState<SideQuestActivity[]>([]);
  const [monthDate, setMonthDate] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(toDateKey(new Date()));
  const [error, setError] = useState('');

  const loadCalendar = useCallback(() => {
    let active = true;

    void apiJson<Quest[]>('/api/trips')
      .then(async (data) => {
        if (!active) return;
        const tripList = Array.isArray(data) ? data : [];
        setQuests(tripList);

        const activityGroups = await Promise.all(
          tripList.map(async (trip) => {
            try {
              return await apiJson<SideQuestActivity[]>(`/api/trips/${trip.id}/activities`);
            } catch {
              return [];
            }
          }),
        );

        if (!active) return;
        setActivities(activityGroups.flat());
        setError('');
      })
      .catch((err: Error) => {
        if (!active) return;
        setError(err.message || 'Unable to load calendar.');
      });

    return () => {
      active = false;
    };
  }, []);

  useFocusEffect(loadCalendar);

  const dayItemsMap = useMemo(() => buildDayItemsMap(quests, activities, t), [activities, quests, t]);
  const monthTitle = useMemo(
    () => new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(monthDate),
    [monthDate],
  );
  const visibleDates = useMemo(
    () =>
      Array.from(dayItemsMap.keys())
        .filter((key) => {
          const date = parseDateKey(key);
          return date.getMonth() === monthDate.getMonth() && date.getFullYear() === monthDate.getFullYear();
        })
        .sort((left, right) => parseDateKey(left).getTime() - parseDateKey(right).getTime()),
    [dayItemsMap, monthDate],
  );
  const selectedItems = useMemo(() => {
    const items = dayItemsMap.get(selectedDate) ?? [];
    return [...items].sort(sortCalendarItems);
  }, [dayItemsMap, selectedDate]);

  // Count ONLY activity items, not the trip-start/trip-end markers that
  // also live in dayItemsMap. A "plan" is something the user scheduled —
  // the trip starting/ending isn't a plan in their head.
  const monthPlans = useMemo(
    () =>
      visibleDates.reduce((sum, key) => {
        const items = dayItemsMap.get(key) ?? [];
        return sum + items.filter((item) => item.kind === 'activity').length;
      }, 0),
    [visibleDates, dayItemsMap],
  );

  const activeTrip = useMemo(() => {
    const today = toDateKey(new Date());
    return quests.find((q) => q.startDate <= today && q.endDate >= today) ?? null;
  }, [quests]);

  const activeTripDay = useMemo(() => {
    if (!activeTrip) return null;
    const today = new Date();
    const start = new Date(`${activeTrip.startDate}T12:00:00`);
    const diff = Math.floor((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(1, diff + 1);
  }, [activeTrip]);

  useEffect(() => {
    if (visibleDates.length === 0) return;
    if (!visibleDates.includes(selectedDate)) {
      setSelectedDate(visibleDates[0]);
    }
  }, [selectedDate, visibleDates]);

  function jumpToSelectedDay(dateKey: string) {
    setSelectedDate(dateKey);
    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 10);
  }

  function handleAddPress() {
    const trip =
      quests.find((q) => q.startDate <= selectedDate && q.endDate >= selectedDate) ??
      activeTrip ??
      quests[0];
    if (trip) {
      router.push(`/trip/${trip.id}/sidequest/new?initialDate=${selectedDate}`);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.white }}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.screen, { paddingTop: Math.max(insets.top, 16) + 8, paddingBottom: Math.max(insets.bottom, 20) + 140 }]}
        showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.headerTopRow}>
          <View style={{ flex: 1, paddingRight: 60 }}>
            <Text style={styles.eyebrow}>YOUR PLAN</Text>
            <Text style={styles.bigTitle}>Calendar</Text>
            <Text style={styles.titleCopy}>Everything planned across your trips, hidden moments included.</Text>
          </View>
        </View>
        <View style={[styles.alertsAnchor, { top: Math.max(insets.top, 16) + 8 }]}>
          <TopAlertsButton />
        </View>

        {/* Month switcher */}
        <View style={styles.monthSwitchRow}>
          <TouchableOpacity activeOpacity={0.84} style={styles.monthSwitchButton} onPress={() => setMonthDate((current) => addMonths(current, -1))}>
            <Ionicons name="chevron-back" size={18} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.monthTitle}>{monthTitle}</Text>
          <TouchableOpacity activeOpacity={0.84} style={styles.monthSwitchButton} onPress={() => setMonthDate((current) => addMonths(current, 1))}>
            <Ionicons name="chevron-forward" size={18} color={COLORS.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* Active trip card */}
        {activeTrip ? (
          <TouchableOpacity activeOpacity={0.9} style={styles.activeCard} onPress={() => router.push(`/trip/${activeTrip.id}`)}>
            <View style={[styles.activeIcon, { backgroundColor: COLORS.primary }]}>
              <Ionicons name="airplane" size={16} color={COLORS.white} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.activeLabel}>ACTIVE TRIP</Text>
              <Text style={styles.activeTitle} numberOfLines={1}>
                {activeTrip.title ?? 'Trip'} · {formatTripRange(activeTrip.startDate, activeTrip.endDate)}
              </Text>
            </View>
            {activeTripDay ? (
              <View style={[styles.dayBadge, { backgroundColor: COLORS.primary }]}>
                <Text style={styles.dayBadgeText}>Day {activeTripDay}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        ) : null}

        {/* Section header */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionEyebrow}>EVENT DATES THIS MONTH</Text>
          {visibleDates.length > 0 ? (
            <Text style={styles.sectionMeta}>{visibleDates.length} days · {monthPlans} plans</Text>
          ) : null}
        </View>

        {/* Date grid */}
        {visibleDates.length > 0 ? (
          <View style={styles.dateChipGrid}>
            {visibleDates.map((dateKey) => {
              const items = dayItemsMap.get(dateKey) ?? [];
              const isSelected = dateKey === selectedDate;
              const date = parseDateKey(dateKey);

              return (
                <Pressable
                  key={dateKey}
                  style={[styles.dateChip, isSelected && styles.dateChipSelected]}
                  onPress={() => jumpToSelectedDay(dateKey)}>
                  <Text style={[styles.dateChipWeekday, isSelected && { color: COLORS.primary }]}>
                    {new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(date).toUpperCase()}
                  </Text>
                  <Text style={[styles.dateChipDay, isSelected && { color: COLORS.primary }]}>{date.getDate()}</Text>
                  <View style={styles.dateChipDots}>
                    {getCalendarDots(items).map((tone, index) => (
                      <View
                        key={`${dateKey}-${tone}-${index}`}
                        style={[
                          styles.dateChipDot,
                          tone === 'trip' ? { backgroundColor: COLORS.secondary } : tone === 'hidden' ? { backgroundColor: COLORS.textMuted } : { backgroundColor: COLORS.primary },
                        ]}
                      />
                    ))}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <View style={styles.emptyMonthState}>
            <Ionicons name="calendar-clear-outline" size={28} color={COLORS.textMuted} />
            <Text style={styles.emptyMonthText}>{t('calendar.empty.noEventDates')}</Text>
          </View>
        )}

        {/* Selected day card */}
        {(() => {
          const tripStartItem = selectedItems.find((i) => i.kind === 'trip' && i.tripPhase === 'start');
          const tripEndItem = selectedItems.find((i) => i.kind === 'trip' && i.tripPhase === 'end');
          const activityItems = selectedItems.filter((i) => i.kind === 'activity');
          return (
        <View style={styles.planCard}>
          <View style={styles.planHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.planEyebrow}>{formatSelectedDateEyebrow(selectedDate)}</Text>
              <View style={styles.planDayRow}>
                <Text style={styles.planDayBig}>{parseDateKey(selectedDate).getDate()}</Text>
                <Text style={styles.planDayMeta}>{activityItems.length} {activityItems.length === 1 ? 'plan' : 'plans'}</Text>
              </View>
              {(tripStartItem || tripEndItem) ? (
                <View style={styles.tripBadgeRow}>
                  {tripStartItem ? (
                    <TouchableOpacity activeOpacity={0.85} style={[styles.tripBadge, { backgroundColor: COLORS.secondary }]} onPress={() => router.push(`/trip/${tripStartItem.tripId}`)}>
                      <Ionicons name="airplane" size={11} color={COLORS.white} />
                      <Text style={styles.tripBadgeText}>{tripStartItem.title} starts</Text>
                    </TouchableOpacity>
                  ) : null}
                  {tripEndItem ? (
                    <TouchableOpacity activeOpacity={0.85} style={[styles.tripBadge, { backgroundColor: COLORS.secondary }]} onPress={() => router.push(`/trip/${tripEndItem.tripId}`)}>
                      <Ionicons name="flag" size={11} color={COLORS.white} />
                      <Text style={styles.tripBadgeText}>{tripEndItem.title} ends</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : null}
            </View>
            <TouchableOpacity style={styles.addButton} activeOpacity={0.85} onPress={handleAddPress}>
              <Ionicons name="add" size={18} color={COLORS.white} />
              <Text style={styles.addButtonText}>Add</Text>
            </TouchableOpacity>
          </View>

          {activityItems.length > 0 ? (
            <View style={styles.planList}>
              {activityItems.map((item) => {
                const onPress = () => {
                  const sidequestId = item.activityId ?? item.id;
                  router.push(`/trip/${encodeURIComponent(item.tripId)}/sidequest/${encodeURIComponent(sidequestId)}`);
                };
                const timeText = item.time?.trim() || t('calendar.time.anytime');
                const symbol = getCategorySymbol(item.category);
                const iconName: keyof typeof Ionicons.glyphMap = item.hidden ? 'lock-closed' : symbol.icon;
                const iconBg = item.hidden ? COLORS.textPrimary : symbol.backgroundColor;
                const iconColor = item.hidden ? COLORS.white : symbol.iconColor;
                const subtitle =
                  item.hidden && item.revealAt && !item.isRevealed
                    ? `Reveals at ${formatRevealTimeShort(item.revealAt)}`
                    : item.ownerName?.trim() || item.meta;

                return (
                  <TouchableOpacity key={item.id} activeOpacity={0.85} style={styles.planRow} onPress={onPress}>
                    <Text style={styles.planTime} numberOfLines={1}>{timeText}</Text>
                    <View style={styles.planTimeDivider} />
                    <View style={[styles.planIcon, { backgroundColor: iconBg }]}>
                      <Ionicons name={iconName} size={16} color={iconColor} />
                    </View>
                    <View style={styles.planCopyWrap}>
                      <Text style={styles.planRowTitle} numberOfLines={1}>
                        {item.hidden ? t('calendar.activity.hidden') : item.title}
                      </Text>
                      <Text style={styles.planRowMeta} numberOfLines={1}>{subtitle}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : !tripStartItem && !tripEndItem ? (
            <View style={styles.emptyDayState}>
              <Ionicons name="calendar-clear-outline" size={26} color={COLORS.textMuted} />
              <Text style={styles.emptyDayText}>{t('calendar.empty.nothingPlanned')}</Text>
            </View>
          ) : null}
        </View>
          );
        })()}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </ScrollView>
    </View>
  );
}

function buildDayItemsMap(quests: Quest[], activities: SideQuestActivity[], t: (key: string) => string) {
  const map = new Map<string, CalendarItem[]>();

  for (const quest of quests) {
    const startKey = quest.startDate?.slice(0, 10);
    const endKey = quest.endDate?.slice(0, 10);
    if (!startKey) continue;

    const title = quest.title ?? t('calendar.untitledAdventure');

    const startItems = map.get(startKey) ?? [];
    startItems.push({
      id: `trip-${quest.id}-start`,
      kind: 'trip',
      tripId: quest.id,
      title,
      date: startKey,
      meta: 'Trip starts',
      tripPhase: 'start',
    });
    map.set(startKey, startItems);

    if (endKey && endKey !== startKey) {
      const endItems = map.get(endKey) ?? [];
      endItems.push({
        id: `trip-${quest.id}-end`,
        kind: 'trip',
        tripId: quest.id,
        title,
        date: endKey,
        meta: 'Trip ends',
        tripPhase: 'end',
      });
      map.set(endKey, endItems);
    }
  }

  for (const activity of activities) {
    const items = map.get(activity.date) ?? [];
    items.push({
      id: activity.id,
      kind: 'activity',
      tripId: activity.tripId,
      activityId: activity.id,
      title: activity.visibility === 'hidden' ? t('calendar.activity.hidden') : activity.title ?? 'Untitled plan',
      date: activity.date,
      time: activity.time,
      meta: activity.category?.trim() || (activity.visibility === 'hidden' ? 'Hidden SideQuest' : 'SideQuest'),
      hidden: activity.visibility === 'hidden',
      imageUrl: activity.imageUrl,
      description: activity.description,
      teaser: activity.teaser,
      teaserVisible: activity.teaserVisible,
      revealAt: activity.revealAt,
      isRevealed: activity.isRevealed,
      ownerName: activity.ownerName,
      category: activity.category,
    });
    map.set(activity.date, items);
  }

  return map;
}

function sortCalendarItems(left: CalendarItem, right: CalendarItem) {
  if (left.kind !== right.kind) {
    return left.kind === 'activity' ? -1 : 1;
  }

  if (left.time && right.time) {
    return left.time.localeCompare(right.time);
  }

  if (left.time) return -1;
  if (right.time) return 1;

  return left.title.localeCompare(right.title);
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, offset: number) {
  return new Date(date.getFullYear(), date.getMonth() + offset, 1);
}

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateKey(value: string) {
  return new Date(`${value}T12:00:00`);
}

function formatSelectedDateEyebrow(value: string) {
  const d = parseDateKey(value);
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(d).toUpperCase();
  const month = new Intl.DateTimeFormat('en-US', { month: 'long' }).format(d).toUpperCase();
  return `${weekday} · ${month}`;
}

function formatTripRange(start: string, end: string) {
  const s = parseDateKey(start);
  const e = parseDateKey(end);
  const startStr = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(s);
  const endStr = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(e);
  return `${startStr} — ${endStr}`;
}

function formatRevealTimeShort(value: string) {
  return new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
}

function getCalendarDots(items: CalendarItem[]) {
  return items.slice(0, 3).map((item) => {
    if (item.kind === 'trip') return 'trip' as const;
    if (item.hidden) return 'hidden' as const;
    return 'activity' as const;
  });
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: SPACING.xl,
  },

  // Header
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.md,
    marginBottom: SPACING.lg,
  },
  alertsAnchor: {
    position: 'absolute',
    right: SPACING.xl,
    zIndex: 10,
  },
  eyebrow: {
    ...TYPOGRAPHY.sectionHeader,
    fontWeight: '800',
    color: COLORS.textMeta,
    marginBottom: SPACING.sm,
  },
  bigTitle: {
    ...TYPOGRAPHY.pageHeading,
    fontWeight: '900',
    color: COLORS.textPrimary,
    marginBottom: SPACING.sm,
  },
  titleCopy: {
    ...TYPOGRAPHY.body,
    fontWeight: '500',
    color: COLORS.textSecondary,
    maxWidth: 240,
  },

  // Month switcher
  monthSwitchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.lg,
    ...SHADOWS.subtle,
  },
  monthSwitchButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthTitle: {
    flex: 1,
    ...TYPOGRAPHY.cardTitle,
    fontWeight: '700',
    color: COLORS.textPrimary,
    textAlign: 'center',
  },

  // Active trip card (dark background variant)
  activeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.textPrimary,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.lg,
    marginBottom: SPACING.xl,
    ...SHADOWS.medium,
  },
  activeIcon: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeLabel: {
    ...TYPOGRAPHY.eyebrow,
    fontWeight: '700',
    color: COLORS.textMuted,
    marginBottom: SPACING.xs,
  },
  activeTitle: {
    ...TYPOGRAPHY.cardTitle,
    fontWeight: '700',
    color: COLORS.white,
  },
  dayBadge: {
    borderRadius: RADIUS.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
  },
  dayBadgeText: {
    ...TYPOGRAPHY.buttonSmall,
    fontWeight: '800',
    color: COLORS.white,
  },

  // Section header
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  sectionEyebrow: {
    ...TYPOGRAPHY.eyebrow,
    fontWeight: '800',
    color: COLORS.textMeta,
  },
  sectionMeta: {
    ...TYPOGRAPHY.meta,
    fontWeight: '600',
    color: COLORS.textMeta,
  },

  // Date grid (card-based)
  dateChipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
    marginBottom: SPACING.xl,
  },
  dateChip: {
    width: '31.5%',
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    ...SHADOWS.subtle,
  },
  dateChipSelected: {
    backgroundColor: COLORS.primaryLight12,
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  dateChipWeekday: {
    ...TYPOGRAPHY.eyebrow,
    fontWeight: '800',
    color: COLORS.textMeta,
    fontSize: 10,
  },
  dateChipDay: {
    marginTop: SPACING.xs,
    ...TYPOGRAPHY.pageHeading,
    fontWeight: '900',
    color: COLORS.textPrimary,
    fontSize: 22,
  },
  dateChipDots: {
    marginTop: SPACING.md,
    minHeight: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  dateChipDot: {
    width: 5,
    height: 5,
    borderRadius: 999,
  },
  emptyMonthState: {
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xxxl,
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.xl,
    ...SHADOWS.subtle,
  },
  emptyMonthText: {
    marginTop: SPACING.lg,
    ...TYPOGRAPHY.body,
    fontWeight: '500',
    color: COLORS.textSecondary,
    textAlign: 'center',
  },

  // Selected day card
  planCard: {
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.white,
    padding: SPACING.lg,
    marginBottom: SPACING.xl,
    ...SHADOWS.subtle,
  },
  planHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  planEyebrow: {
    ...TYPOGRAPHY.eyebrow,
    fontWeight: '800',
    color: COLORS.textMeta,
    marginBottom: SPACING.xs,
  },
  planDayRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: SPACING.lg,
  },
  planDayBig: {
    ...TYPOGRAPHY.pageHeading,
    fontWeight: '900',
    fontSize: 38,
    color: COLORS.textPrimary,
  },
  planDayMeta: {
    ...TYPOGRAPHY.meta,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  planList: {
    marginTop: SPACING.lg,
    gap: SPACING.md,
  },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    gap: SPACING.lg,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.circle,
  },
  addButtonText: {
    ...TYPOGRAPHY.buttonSmall,
    fontWeight: '800',
    color: COLORS.white,
  },
  planTime: {
    width: 62,
    ...TYPOGRAPHY.label,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  tripBadgeRow: {
    marginTop: SPACING.lg,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
  },
  tripBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    borderRadius: RADIUS.circle,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
  },
  tripBadgeText: {
    ...TYPOGRAPHY.meta,
    fontWeight: '700',
    color: COLORS.white,
  },
  planTimeDivider: {
    width: 1,
    height: 28,
    backgroundColor: COLORS.borderPrimary,
  },
  planIcon: {
    width: 34,
    height: 34,
    borderRadius: RADIUS.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planCopyWrap: {
    flex: 1,
    minWidth: 0,
  },
  planRowTitle: {
    ...TYPOGRAPHY.cardTitle,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  planRowMeta: {
    marginTop: SPACING.xs,
    ...TYPOGRAPHY.meta,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  emptyDayState: {
    marginTop: SPACING.lg,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.bgLight,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xxl,
    paddingHorizontal: SPACING.lg,
  },
  emptyDayText: {
    marginTop: SPACING.md,
    ...TYPOGRAPHY.body,
    fontWeight: '500',
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  errorText: {
    marginTop: SPACING.lg,
    ...TYPOGRAPHY.meta,
    fontWeight: '500',
    color: COLORS.error,
    textAlign: 'center',
  },
});
