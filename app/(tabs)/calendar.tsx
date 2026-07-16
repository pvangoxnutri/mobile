import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ActivityImageFallback from '@/components/activity-image-fallback';
import TabHeader from '@/components/tab-header';
import { useI18n } from '@/components/i18n-provider';
import { apiJson } from '@/lib/api';
import { getCategorySymbol } from '@/lib/category-symbol';
import type { Quest, SideQuestActivity } from '@/lib/types';
import { isStay, stayNightDates, stayNights } from '@/lib/stay';
import { DEFAULT_BLUR, extractBlur, isSealedInLists } from '@/lib/activity-blur';
import { SPACING, TYPOGRAPHY, RADIUS } from '@/constants/design-tokens';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/components/theme-provider';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { AppTheme } from '@/constants/themes';

type CalendarItem = {
  id: string;
  kind: 'trip' | 'activity';
  tripId: string;
  activityId?: string;
  title: string;
  date: string;
  time?: string | null;
  sortIndex?: number;
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
  const { t, language } = useI18n();
  const locale = language === 'sv' ? 'sv-SE' : 'en-US';
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  // See Home's app/(tabs)/index.tsx for why this is measured — the header
  // floats on top of the ScrollView, so its rendered height (not a guess)
  // is what tells the ScrollView how much paddingTop clears it at rest.
  const [headerHeight, setHeaderHeight] = useState(0);
  const headerTop = Math.max(insets.top, 16) + 8;
  const headerClearance = headerTop + (headerHeight || 76) + 14;
  const scrollRef = useRef<ScrollView | null>(null);
  const selectedDayHeaderRef = useRef<View | null>(null);
  const [quests, setQuests] = useState<Quest[]>([]);
  const [activities, setActivities] = useState<SideQuestActivity[]>([]);
  const [monthDate, setMonthDate] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(toDateKey(new Date()));
  const [now] = useState(() => new Date());
  const [error, setError] = useState('');
  // Only jump the visible month away from "today" once, the first time data
  // loads — never again afterwards, so it doesn't fight the user's own
  // manual month navigation (the chevron buttons) on later re-renders.
  const hasAutoSelectedMonth = useRef(false);

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
        setError(err.message || t('calendar.unableToLoad'));
      });

    return () => {
      active = false;
    };
  }, [t]);

  useFocusEffect(loadCalendar);

  const dayItemsMap = useMemo(() => buildDayItemsMap(quests, activities, t), [activities, quests, t]);

  // If the real-world current month has no trips/activities at all, jump to
  // the nearest month that does — preferring the closest upcoming one (e.g.
  // it's June, nothing's planned until July: open on July instead of an
  // empty June). Falls back to the most recent past month if everything is
  // already over, and never auto-jumps if today's month already has data.
  useEffect(() => {
    if (hasAutoSelectedMonth.current) return;
    if (dayItemsMap.size === 0) return;
    hasAutoSelectedMonth.current = true;

    const currentMonthHasData = Array.from(dayItemsMap.keys()).some((key) => {
      const d = parseDateKey(key);
      return d.getMonth() === monthDate.getMonth() && d.getFullYear() === monthDate.getFullYear();
    });
    if (currentMonthHasData) return;

    const todayKey = toDateKey(new Date());
    const sortedKeys = Array.from(dayItemsMap.keys()).sort();
    const nearestUpcoming = sortedKeys.find((key) => key >= todayKey);
    const fallbackKey = nearestUpcoming ?? sortedKeys[sortedKeys.length - 1];
    if (!fallbackKey) return;

    setMonthDate(startOfMonth(parseDateKey(fallbackKey)));
  }, [dayItemsMap, monthDate]);

  const monthTitle = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(monthDate),
    [monthDate, locale],
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

  // Trip lookup so selected-day cards can show the trip name as social context.
  const tripsById = useMemo(() => {
    const map = new Map<string, Quest>();
    for (const q of quests) map.set(q.id, q);
    return map;
  }, [quests]);

  useEffect(() => {
    if (visibleDates.length === 0) return;
    if (!visibleDates.includes(selectedDate)) {
      setSelectedDate(visibleDates[0]);
    }
  }, [selectedDate, visibleDates]);

  function jumpToSelectedDay(dateKey: string) {
    setSelectedDate(dateKey);
    // Scroll to the selected-day section itself, not the very bottom of the
    // screen — scrollToEnd overshot past short days straight to the blank
    // padding under the content. Measures fresh at tap time (rather than
    // trusting an earlier onLayout) so it can't go stale.
    setTimeout(() => {
      // New-architecture measureLayout requires a ref to the native host
      // component — a findNodeHandle number throws "must be called with a
      // ref to a native component" and the jump silently never happened.
      const scrollHost = scrollRef.current?.getNativeScrollRef();
      if (!scrollHost || !selectedDayHeaderRef.current) return;
      selectedDayHeaderRef.current.measureLayout(
        scrollHost,
        (_left, top) => {
          scrollRef.current?.scrollTo({ y: Math.max(0, top - 12), animated: true });
        },
        () => {},
      );
    }, 50);
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
    <View style={{ flex: 1, backgroundColor: theme.colors.bgPrimary }}>
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={[styles.screen, { paddingTop: headerClearance, paddingBottom: Math.max(insets.bottom, 20) + 140 }]}
        showsVerticalScrollIndicator={false}>

        {/* Month switcher */}
        <View style={styles.monthSwitchRow}>
          <TouchableOpacity activeOpacity={0.84} style={styles.monthSwitchButton} onPress={() => setMonthDate((current) => addMonths(current, -1))}>
            <Ionicons name="chevron-back" size={18} color={theme.colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.monthTitle}>{monthTitle}</Text>
          <TouchableOpacity activeOpacity={0.84} style={styles.monthSwitchButton} onPress={() => setMonthDate((current) => addMonths(current, 1))}>
            <Ionicons name="chevron-forward" size={18} color={theme.colors.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* Active trip card */}
        {activeTrip ? (
          <TouchableOpacity activeOpacity={0.9} style={styles.activeCard} onPress={() => router.push(`/trip/${activeTrip.id}`)}>
            <View style={[styles.activeIcon, { backgroundColor: theme.colors.primary }]}>
              <Ionicons name="airplane" size={16} color={theme.colors.white} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.activeLabel}>{t('calendar.activeTrip')}</Text>
              <Text style={styles.activeTitle} numberOfLines={1}>
                {activeTrip.title ?? t('home.defaultTripName')} · {formatTripRange(activeTrip.startDate, activeTrip.endDate, locale)}
              </Text>
            </View>
            {activeTripDay ? (
              <View style={[styles.dayBadge, { backgroundColor: theme.colors.primary }]}>
                <Text style={styles.dayBadgeText}>{t('trip.dayNumber', { day: activeTripDay })}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        ) : null}

        {/* Section header */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionEyebrow}>{t('calendar.eventDates.heading')}</Text>
          <View style={styles.sectionLine} />
          {visibleDates.length > 0 ? (
            <Text style={styles.sectionMeta}>{t('calendar.eventDates.summary', { days: visibleDates.length, plans: monthPlans })}</Text>
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
                  style={({ pressed }) => [styles.dateChip, isSelected && styles.dateChipSelected, pressed && { opacity: 0.8 }]}
                  onPress={() => jumpToSelectedDay(dateKey)}>
                  <Text style={[styles.dateChipWeekday, isSelected && { color: theme.colors.primary }]}>
                    {new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(date).toUpperCase()}
                  </Text>
                  <Text style={[styles.dateChipDay, isSelected && { color: theme.colors.primary }]}>{date.getDate()}</Text>
                  <View style={styles.dateChipDots}>
                    {getCalendarDots(items).map((tone, index) => (
                      <View
                        key={`${dateKey}-${tone}-${index}`}
                        style={[
                          styles.dateChipDot,
                          tone === 'trip' ? { backgroundColor: theme.colors.secondary } : tone === 'hidden' ? { backgroundColor: theme.colors.textMuted } : { backgroundColor: theme.colors.primary },
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
            <View style={styles.emptyMonthIconCircle}>
              <Ionicons name="calendar-clear-outline" size={40} color={theme.colors.textMuted} />
            </View>
            <Text style={styles.emptyMonthText}>{t('calendar.empty.noEventDates')}</Text>
          </View>
        )}

        {/* Selected day — Home Up Next-style cards for the chosen day */}
        {(() => {
          const tripStartItem = selectedItems.find((i) => i.kind === 'trip' && i.tripPhase === 'start');
          const tripEndItem = selectedItems.find((i) => i.kind === 'trip' && i.tripPhase === 'end');
          const activityItems = selectedItems.filter((i) => i.kind === 'activity');
          return (
            <>
              {/* Section header: eyebrow + hairline + count + Add */}
              <View ref={selectedDayHeaderRef} style={styles.selectedDayHeader}>
                <Text style={styles.sectionEyebrow}>{formatSelectedDateEyebrow(selectedDate, locale)}</Text>
                <View style={styles.sectionLine} />
                {activityItems.length > 0 ? (
                  <Text style={styles.sectionMeta}>
                    {t(activityItems.length === 1 ? 'calendar.selectedDay.plansCount_one' : 'calendar.selectedDay.plansCount_other', { count: activityItems.length })}
                  </Text>
                ) : null}
                <TouchableOpacity style={styles.addButton} activeOpacity={0.85} onPress={handleAddPress}>
                  <Ionicons name="add" size={18} color={theme.colors.white} />
                  <Text style={styles.addButtonText}>{t('calendar.addButton')}</Text>
                </TouchableOpacity>
              </View>

              {/* Trip start/end markers for the selected day, if any */}
              {(tripStartItem || tripEndItem) ? (
                <View style={styles.tripBadgeRow}>
                  {tripStartItem ? (
                    <TouchableOpacity activeOpacity={0.85} style={[styles.tripBadge, { backgroundColor: theme.colors.secondary }]} onPress={() => router.push(`/trip/${tripStartItem.tripId}`)}>
                      <Ionicons name="airplane" size={11} color={theme.colors.white} />
                      <Text style={styles.tripBadgeText}>{t('calendar.tripStarts', { title: tripStartItem.title })}</Text>
                    </TouchableOpacity>
                  ) : null}
                  {tripEndItem ? (
                    <TouchableOpacity activeOpacity={0.85} style={[styles.tripBadge, { backgroundColor: theme.colors.secondary }]} onPress={() => router.push(`/trip/${tripEndItem.tripId}`)}>
                      <Ionicons name="flag" size={11} color={theme.colors.white} />
                      <Text style={styles.tripBadgeText}>{t('calendar.tripEnds', { title: tripEndItem.title })}</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : null}

              {activityItems.length === 0 ? (
                !tripStartItem && !tripEndItem ? (
                  <View style={styles.upcomingEmptyCard}>
                    <View style={styles.upcomingEmptyIcon}>
                      <Ionicons name="sparkles-outline" size={20} color={theme.colors.textMuted} />
                    </View>
                    <Text style={styles.upcomingEmptyText}>{t('calendar.empty.nothingPlanned')}</Text>
                  </View>
                ) : null
              ) : (
                <View style={styles.upcomingRow}>
                  {activityItems.map((item) => {
                    const symbol = getCategorySymbol(item.category);
                    const dateLabel = formatUpcomingDate(item.date, now, t, locale);
                    const timeLabel = item.time ? ` · ${item.time}` : '';
                    const tripTitle = tripsById.get(item.tripId)?.title ?? null;
                    const blurAmount = item.hidden ? extractBlur(item.description) ?? DEFAULT_BLUR : undefined;

                    return (
                      <TouchableOpacity
                        key={item.id}
                        activeOpacity={0.88}
                        onPress={() => router.push(`/trip/${encodeURIComponent(item.tripId)}/sidequest/${encodeURIComponent(item.activityId ?? item.id)}`)}
                        style={[styles.upcomingCard, item.hidden && styles.upcomingCardSealed]}>
                        <View style={[styles.upcomingImageBox, item.hidden && !item.imageUrl && styles.upcomingImageBoxSealed]}>
                          {item.imageUrl ? (
                            <Image
                              source={{ uri: item.imageUrl }}
                              style={styles.upcomingImage}
                              resizeMode="cover"
                              blurRadius={blurAmount}
                            />
                          ) : !item.hidden ? (
                            <ActivityImageFallback category={item.category} size="medium" style={styles.upcomingFallback} />
                          ) : null}
                          <View style={[styles.upcomingIconBadge, item.hidden && !item.imageUrl && styles.upcomingIconBadgeSealed]}>
                            <Ionicons
                              name={item.hidden ? 'lock-closed' : symbol.icon}
                              size={14}
                              color={item.hidden ? theme.colors.textMeta : symbol.iconColor}
                            />
                          </View>
                        </View>
                        <View style={styles.upcomingBody}>
                          <Text style={styles.upcomingDate} numberOfLines={1}>{dateLabel}{timeLabel}</Text>
                          <Text style={styles.upcomingTitle} numberOfLines={1}>
                            {item.hidden ? t('calendar.activity.hidden') : item.title}
                          </Text>
                          {tripTitle ? (
                            <Text style={styles.upcomingTripName} numberOfLines={1}>{tripTitle}</Text>
                          ) : null}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </>
          );
        })()}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </ScrollView>

      <View
        style={[styles.fixedHeader, { top: headerTop }]}
        onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}>
        <TabHeader />
      </View>
    </View>
  );
}

function buildDayItemsMap(quests: Quest[], activities: SideQuestActivity[], t: (key: string, vars?: Record<string, string | number>) => string) {
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
    // Sealed for every viewer (including the creator) — see isSealedInLists.
    const sealed = isSealedInLists(activity);
    items.push({
      id: activity.id,
      kind: 'activity',
      tripId: activity.tripId,
      activityId: activity.id,
      title: sealed ? t('calendar.activity.hidden') : activity.title ?? t('calendar.untitledPlan'),
      date: activity.date,
      time: activity.time,
      sortIndex: activity.sortIndex,
      // Custom categories surface their user-given name here (withheld by the
      // backend for sealed activities, so no reveal leak); built-in behavior
      // is unchanged.
      meta: activity.customCategoryLabel?.trim() || activity.category?.trim() || (sealed ? 'Hidden SideQuest' : 'SideQuest'),
      hidden: sealed,
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

    // Hotel stays also mark every covered NIGHT after check-in (check-out
    // day is not an occupied night). Sealed stays mark nothing extra —
    // coverage would leak the stay's length before reveal.
    if (!sealed && isStay(activity)) {
      const totalNights = stayNights(activity);
      stayNightDates(activity).forEach((nightDate, i) => {
        if (i === 0) return; // check-in day already has the main item
        const nightItems = map.get(nightDate) ?? [];
        nightItems.push({
          id: `${activity.id}-night-${i + 1}`,
          kind: 'activity',
          tripId: activity.tripId,
          activityId: activity.id,
          title: activity.title ?? t('calendar.untitledPlan'),
          date: nightDate,
          time: null,
          sortIndex: activity.sortIndex,
          meta: t('activity.stay.nightOf', { n: i + 1, total: totalNights }),
          hidden: false,
          imageUrl: activity.imageUrl,
          description: activity.description,
          teaser: activity.teaser,
          teaserVisible: activity.teaserVisible,
          revealAt: activity.revealAt,
          isRevealed: activity.isRevealed,
          ownerName: activity.ownerName,
          category: activity.category,
        });
        map.set(nightDate, nightItems);
      });
    }
  }

  return map;
}

function sortCalendarItems(left: CalendarItem, right: CalendarItem) {
  if (left.kind !== right.kind) {
    return left.kind === 'activity' ? -1 : 1;
  }

  // Activities: same manual drag order as the trip's day list (sortIndex),
  // not time/title — a dragged reorder should look identical here.
  if (left.sortIndex != null && right.sortIndex != null) {
    return left.sortIndex - right.sortIndex;
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

function formatSelectedDateEyebrow(value: string, locale: string) {
  const d = parseDateKey(value);
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(d).toUpperCase();
  const month = new Intl.DateTimeFormat(locale, { month: 'long' }).format(d).toUpperCase();
  return `${weekday} · ${month}`;
}

function formatUpcomingDate(value: string, now: Date, t: (key: string) => string, locale: string) {
  const todayStr = toDateKey(now);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = toDateKey(tomorrow);
  if (value === todayStr) return t('home.today');
  if (value === tomorrowStr) return t('home.tomorrow');
  return new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric' }).format(parseDateKey(value));
}

function formatTripRange(start: string, end: string, locale: string) {
  const s = parseDateKey(start);
  const e = parseDateKey(end);
  const startStr = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(s);
  const endStr = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(e);
  return `${startStr} — ${endStr}`;
}

function getCalendarDots(items: CalendarItem[]) {
  return items.slice(0, 3).map((item) => {
    if (item.kind === 'trip') return 'trip' as const;
    if (item.hidden) return 'hidden' as const;
    return 'activity' as const;
  });
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  screen: {
    paddingHorizontal: SPACING.xl,
  },
  // Floats ON TOP of the ScrollView (see Home's app/(tabs)/index.tsx for the
  // full explanation) — same look as the bottom tab bar too (matching the
  // tab bar's dark treatment in (tabs)/_layout.tsx: near-opaque surface pill,
  // hairline ring instead of the drop shadow).
  fixedHeader: {
    position: 'absolute',
    left: 16,
    right: 16,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: theme.colors.surfaceBar,
    borderWidth: theme.isDark ? StyleSheet.hairlineWidth : 0,
    borderColor: theme.colors.borderPrimary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: theme.isDark ? 0.35 : 0.07,
    shadowRadius: 20,
    elevation: theme.isDark ? 0 : 10,
  },

  // Month switcher
  monthSwitchRow: {
    marginTop: SPACING.xxxl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.surface,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.lg,
    ...theme.shadows.subtle,
    // Dark cards separate via hairline border (see components/ui/card.tsx);
    // light stays borderless and pixel-identical.
    borderWidth: theme.isDark ? StyleSheet.hairlineWidth : 0,
    borderColor: theme.colors.borderPrimary,
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
    color: theme.colors.textPrimary,
    textAlign: 'center',
  },

  // Active trip card (dark background variant). Light keeps its exact
  // pre-theming ink surface (COLORS.textPrimary); on dark it becomes an
  // elevated surface with a hairline ring — textPrimary would flip to
  // near-white there and invert the card.
  activeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.lg,
    backgroundColor: theme.isDark ? theme.colors.surfaceElevated : '#161821',
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.xl,
    marginBottom: SPACING.xxl,
    ...theme.shadows.strong,
    borderWidth: theme.isDark ? StyleSheet.hairlineWidth : 0,
    borderColor: theme.colors.borderPrimary,
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
    // Light: exact pre-theming muted gray on the ink card. Dark textMuted is
    // too dim on surfaceElevated, so the eyebrow steps up to textSecondary.
    color: theme.isDark ? theme.colors.textSecondary : '#bbc0c8',
    marginBottom: SPACING.xs,
  },
  activeTitle: {
    ...TYPOGRAPHY.cardTitle,
    fontWeight: '700',
    color: theme.colors.white,
  },
  dayBadge: {
    borderRadius: RADIUS.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
  },
  dayBadgeText: {
    ...TYPOGRAPHY.buttonSmall,
    fontWeight: '800',
    // White on the pink day badge in both themes.
    color: theme.colors.white,
  },

  // Section header
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginBottom: SPACING.md,
  },
  sectionEyebrow: {
    ...TYPOGRAPHY.eyebrow,
    fontWeight: '800',
    color: theme.colors.textMeta,
  },
  sectionLine: {
    flex: 1,
    height: 1,
    backgroundColor: theme.colors.borderPrimary,
  },
  sectionMeta: {
    ...TYPOGRAPHY.meta,
    fontWeight: '600',
    color: theme.colors.textMeta,
  },

  // Date grid (compact calendar-grid feel)
  dateChipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.xl,
  },
  dateChip: {
    width: '22.5%',
    borderRadius: RADIUS.xs,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    ...theme.shadows.subtle,
    // Android: elevation 2 paints a hard grey shadow around each cell (the
    // iOS shadow is a near-invisible 4% wash). Swap it for a hairline border
    // that gives the same subtle cell definition without the grey.
    // (Dark iOS gets the same hairline: dark shadows are elevation 0 there,
    // so the border is what defines the cell — light iOS stays borderless.)
    ...(Platform.OS === 'android'
      ? { elevation: 0, borderWidth: 1, borderColor: theme.isDark ? theme.colors.borderPrimary : '#EEF0F4' }
      : theme.isDark
        ? { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.borderPrimary }
        : null),
  },
  dateChipSelected: {
    // Opaque equivalent of primaryLight12 over the white cell. On Android an
    // elevation shadow renders *through* a translucent background as a grey
    // rectangle in the middle of the cell — opaque kills the artifact and is
    // pixel-identical on iOS (the cell base is white). Dark uses the same
    // trick: dark primaryLight12 (rgba(255,79,116,0.16)) pre-blended over
    // the dark surface (#161922) so it stays opaque too.
    backgroundColor: theme.isDark ? '#3b222f' : '#FFEAEE',
    borderWidth: 2,
    borderColor: theme.colors.primary,
  },
  dateChipWeekday: {
    fontSize: 9,
    fontWeight: '800',
    color: theme.colors.textMeta,
    letterSpacing: 1.0,
    // Strip Android's extra font padding so the weekday/day/dots stack
    // aligns the same as on iOS (the chips looked off on Android otherwise).
    includeFontPadding: false,
  },
  dateChipDay: {
    marginTop: 2,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '900',
    color: theme.colors.textPrimary,
    letterSpacing: -0.6,
    includeFontPadding: false,
    textAlign: 'center',
  },
  dateChipDots: {
    marginTop: SPACING.xs,
    minHeight: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  dateChipDot: {
    width: 4,
    height: 4,
    borderRadius: 999,
  },
  emptyMonthState: {
    borderRadius: RADIUS.xl,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xxxl + SPACING.md,
    paddingHorizontal: SPACING.xl,
    marginBottom: SPACING.xl,
    ...theme.shadows.subtle,
    borderWidth: theme.isDark ? StyleSheet.hairlineWidth : 0,
    borderColor: theme.colors.borderPrimary,
  },
  emptyMonthIconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bgLight,
  },
  emptyMonthText: {
    marginTop: SPACING.xl,
    color: theme.colors.textPrimary,
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '900',
    letterSpacing: -0.8,
    textAlign: 'center',
    maxWidth: 260,
  },

  // Selected day section header (Home pattern: eyebrow + hairline + meta + Add)
  selectedDayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginBottom: SPACING.md,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: theme.colors.primary,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.circle,
  },
  addButtonText: {
    ...TYPOGRAPHY.buttonSmall,
    fontWeight: '800',
    // White on the pink button in both themes.
    color: theme.colors.white,
  },
  tripBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
    marginBottom: SPACING.md,
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
    // White on the teal trip badge in both themes.
    color: theme.colors.white,
  },
  errorText: {
    marginTop: SPACING.lg,
    ...TYPOGRAPHY.meta,
    fontWeight: '500',
    color: theme.colors.error,
    textAlign: 'center',
  },

  // Selected-day activity cards — full-width, stacked vertically (one per row)
  upcomingRow: {
    flexDirection: 'column',
    gap: SPACING.md,
    marginBottom: SPACING.xl,
  },
  upcomingCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: RADIUS.sm,
    overflow: 'hidden',
    ...theme.shadows.subtle,
    borderWidth: theme.isDark ? StyleSheet.hairlineWidth : 0,
    borderColor: theme.colors.borderPrimary,
  },
  // Sealed/hidden cards keep their warm "envelope" parchment identity in
  // both themes — light literals are the exact pre-theming values; dark is
  // the same warmth pre-blended onto the dark surface scale.
  upcomingCardSealed: {
    backgroundColor: theme.colors.sealedSurface,
  },
  upcomingImageBox: {
    height: 76,
    backgroundColor: theme.colors.sealedSurfaceSubtle,
    position: 'relative',
  },
  upcomingImageBoxSealed: {
    backgroundColor: theme.colors.sealedSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  upcomingImage: {
    width: '100%',
    height: '100%',
  },
  upcomingFallback: {
    width: '100%',
    height: '100%',
    borderRadius: 0,
  },
  upcomingIconBadge: {
    position: 'absolute',
    top: SPACING.sm,
    left: SPACING.sm,
    width: 28,
    height: 28,
    borderRadius: 14,
    // Stays white in both themes — it floats on the photo/fallback image and
    // the category icon colors are designed against white.
    backgroundColor: theme.colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
  },
  upcomingIconBadgeSealed: {
    position: 'absolute',
    top: '40%',
    left: '50%',
    transform: [{ translateX: -14 }],
    width: 28,
    height: 28,
    // Sits on the sealed wash (never a photo — sealed variant only applies
    // when there's no image), so dark swaps the near-solid white pill for a
    // frosted one instead of a glaring white disc.
    backgroundColor: theme.isDark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.85)',
  },
  upcomingBody: {
    padding: 9,
  },
  upcomingDate: {
    fontSize: 10,
    fontWeight: '700',
    color: theme.colors.textMeta,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  upcomingTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: theme.colors.textPrimary,
    letterSpacing: -0.2,
  },
  upcomingTripName: {
    fontSize: 11,
    color: theme.colors.textMeta,
    marginTop: 4,
    fontWeight: '500',
  },
  upcomingEmptyCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: theme.colors.borderPrimary,
    borderStyle: 'dashed',
    paddingVertical: SPACING.xl,
    paddingHorizontal: SPACING.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.xl,
  },
  upcomingEmptyIcon: {
    opacity: 0.7,
  },
  upcomingEmptyText: {
    fontSize: 12,
    color: theme.colors.textMeta,
    fontWeight: '500',
    textAlign: 'center',
  },
});
