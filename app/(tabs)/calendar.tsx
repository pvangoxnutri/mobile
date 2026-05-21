import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import TopAlertsButton from '@/components/top-alerts-button';
import { useI18n } from '@/components/i18n-provider';
import { apiJson } from '@/lib/api';
import type { Quest, SideQuestActivity } from '@/lib/types';
import { PRIMARY_COLOR, PRIMARY_08, PRIMARY_12, SECONDARY_COLOR } from '@/constants/colors';

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
};

const BG = '#F7F3EC';

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

  const monthPlans = useMemo(
    () => visibleDates.reduce((sum, key) => sum + (dayItemsMap.get(key)?.length ?? 0), 0),
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
      router.push(`/trip/${trip.id}/sidequest/new`);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
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
            <Ionicons name="chevron-back" size={18} color="#1B1E28" />
          </TouchableOpacity>
          <Text style={styles.monthTitle}>{monthTitle}</Text>
          <TouchableOpacity activeOpacity={0.84} style={styles.monthSwitchButton} onPress={() => setMonthDate((current) => addMonths(current, 1))}>
            <Ionicons name="chevron-forward" size={18} color="#1B1E28" />
          </TouchableOpacity>
        </View>

        {/* Active trip card */}
        {activeTrip ? (
          <TouchableOpacity activeOpacity={0.9} style={styles.activeCard} onPress={() => router.push(`/trip/${activeTrip.id}`)}>
            <View style={[styles.activeIcon, { backgroundColor: PRIMARY_COLOR }]}>
              <Ionicons name="airplane" size={16} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.activeLabel}>ACTIVE TRIP</Text>
              <Text style={styles.activeTitle} numberOfLines={1}>
                {activeTrip.title ?? 'Trip'} · {formatTripRange(activeTrip.startDate, activeTrip.endDate)}
              </Text>
            </View>
            {activeTripDay ? (
              <View style={[styles.dayBadge, { backgroundColor: PRIMARY_COLOR }]}>
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
                  <Text style={[styles.dateChipWeekday, isSelected && { color: PRIMARY_COLOR }]}>
                    {new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(date).toUpperCase()}
                  </Text>
                  <Text style={[styles.dateChipDay, isSelected && { color: PRIMARY_COLOR }]}>{date.getDate()}</Text>
                  <View style={styles.dateChipDots}>
                    {getCalendarDots(items).map((tone, index) => (
                      <View
                        key={`${dateKey}-${tone}-${index}`}
                        style={[
                          styles.dateChipDot,
                          tone === 'trip' ? { backgroundColor: SECONDARY_COLOR } : tone === 'hidden' ? { backgroundColor: '#47505d' } : { backgroundColor: PRIMARY_COLOR },
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
            <Ionicons name="calendar-clear-outline" size={28} color="#b1b7c2" />
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
                    <TouchableOpacity activeOpacity={0.85} style={[styles.tripBadge, { backgroundColor: SECONDARY_COLOR }]} onPress={() => router.push(`/trip/${tripStartItem.tripId}`)}>
                      <Ionicons name="airplane" size={11} color="#fff" />
                      <Text style={styles.tripBadgeText}>{tripStartItem.title} starts</Text>
                    </TouchableOpacity>
                  ) : null}
                  {tripEndItem ? (
                    <TouchableOpacity activeOpacity={0.85} style={[styles.tripBadge, { backgroundColor: SECONDARY_COLOR }]} onPress={() => router.push(`/trip/${tripEndItem.tripId}`)}>
                      <Ionicons name="flag" size={11} color="#fff" />
                      <Text style={styles.tripBadgeText}>{tripEndItem.title} ends</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : null}
            </View>
            <TouchableOpacity style={styles.addButton} activeOpacity={0.85} onPress={handleAddPress}>
              <Ionicons name="add" size={18} color="#fff" />
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
                const iconName: keyof typeof Ionicons.glyphMap = item.hidden ? 'lock-closed' : 'sparkles';
                const iconBg = item.hidden ? '#1B1E28' : PRIMARY_COLOR;
                const subtitle =
                  item.hidden && item.revealAt && !item.isRevealed
                    ? `Reveals at ${formatRevealTimeShort(item.revealAt)}`
                    : item.ownerName?.trim() || item.meta;

                return (
                  <TouchableOpacity key={item.id} activeOpacity={0.85} style={styles.planRow} onPress={onPress}>
                    <Text style={styles.planTime} numberOfLines={1}>{timeText}</Text>
                    <View style={styles.planTimeDivider} />
                    <View style={[styles.planIcon, { backgroundColor: iconBg }]}>
                      <Ionicons name={iconName} size={16} color="#fff" />
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
              <Ionicons name="calendar-clear-outline" size={26} color="#b1b7c2" />
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
    paddingHorizontal: 20,
  },

  // Header
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 18,
  },
  // Absolute-positioned so the alerts icon sits at the exact same X/Y on
  // every tab that uses it, independent of per-page header layout.
  alertsAnchor: {
    position: 'absolute',
    right: 20,
    zIndex: 10,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '800',
    color: PRIMARY_COLOR,
    letterSpacing: 2.2,
    marginBottom: 6,
  },
  bigTitle: {
    fontSize: 38,
    fontWeight: '900',
    color: '#141720',
    lineHeight: 44,
    letterSpacing: -1,
    marginBottom: 6,
  },
  titleCopy: {
    color: '#737883',
    fontSize: 13,
    lineHeight: 19,
    maxWidth: 240,
  },

  // Month switcher
  monthSwitchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 28,
    paddingHorizontal: 8,
    paddingVertical: 8,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
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
    color: '#1B1E28',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },

  // Active trip card
  activeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#1B1E28',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 14,
    elevation: 6,
  },
  activeIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#9AA2AE',
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  activeTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.2,
  },
  dayBadge: {
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  dayBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.2,
  },

  // Section header
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    color: '#9AA2AE',
    letterSpacing: 1.8,
  },
  sectionMeta: {
    fontSize: 12,
    color: '#9AA2AE',
    fontWeight: '600',
  },

  // Date grid
  dateChipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 22,
  },
  dateChip: {
    width: '31.5%',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#ECE7DD',
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  dateChipSelected: {
    backgroundColor: '#FFE9F0',
    borderColor: '#FFC7D7',
  },
  dateChipWeekday: {
    color: '#8a919d',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  dateChipDay: {
    marginTop: 2,
    color: '#171821',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  dateChipDots: {
    marginTop: 6,
    minHeight: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dateChipDot: {
    width: 5,
    height: 5,
    borderRadius: 999,
  },
  emptyMonthState: {
    borderRadius: 22,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 26,
    paddingHorizontal: 18,
    marginBottom: 22,
  },
  emptyMonthText: {
    marginTop: 10,
    color: '#7c8290',
    fontSize: 14,
    textAlign: 'center',
  },

  // Selected day card
  planCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#ECE7DD',
    backgroundColor: '#fff',
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  planHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  planEyebrow: {
    color: PRIMARY_COLOR,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.6,
    marginBottom: 2,
  },
  planDayRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
  },
  planDayBig: {
    color: '#141720',
    fontSize: 38,
    fontWeight: '900',
    letterSpacing: -1.3,
  },
  planDayMeta: {
    color: '#7c8290',
    fontSize: 13,
    fontWeight: '600',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#1B1E28',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.2,
  },
  planList: {
    marginTop: 12,
    gap: 8,
  },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 10,
  },
  planTime: {
    width: 62,
    color: '#161821',
    fontSize: 13,
    fontWeight: '700',
  },
  tripBadgeRow: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tripBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  tripBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  planTimeDivider: {
    width: 1,
    height: 28,
    backgroundColor: '#ECE7DD',
  },
  planIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planCopyWrap: {
    flex: 1,
    minWidth: 0,
  },
  planRowTitle: {
    color: '#171821',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  planRowMeta: {
    marginTop: 2,
    color: '#7c8290',
    fontSize: 12,
    fontWeight: '500',
  },
  emptyDayState: {
    marginTop: 12,
    borderRadius: 18,
    backgroundColor: '#FAF7F1',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    paddingHorizontal: 18,
  },
  emptyDayText: {
    marginTop: 8,
    color: '#7c8290',
    fontSize: 13,
    textAlign: 'center',
  },
  errorText: {
    marginTop: 14,
    color: '#d53d18',
    textAlign: 'center',
  },
});
