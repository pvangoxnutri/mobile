import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/contexts/app-theme-context';
import TopAlertsButton from '@/components/top-alerts-button';
import { apiJson } from '@/lib/api';
import type { Quest, SideQuestActivity } from '@/lib/types';

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
};

export default function CalendarScreen() {
  const theme = useAppTheme();
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

  const dayItemsMap = useMemo(() => buildDayItemsMap(quests, activities), [activities, quests]);
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

  return (
    <ScrollView
      ref={scrollRef}
      contentContainerStyle={[styles.screen, { paddingTop: Math.max(insets.top, 18) + 12, paddingBottom: Math.max(insets.bottom, 20) + 140 }]}
      showsVerticalScrollIndicator={false}>
      <View style={styles.headerRow}>
        <View style={styles.headerTopRow}>
          <View>
            <Text style={styles.title}>Calendar</Text>
            <Text style={styles.titleCopy}>Everything planned across your trips, including hidden moments.</Text>
          </View>
          <TopAlertsButton />
        </View>
        <View style={styles.monthSwitchRow}>
          <TouchableOpacity activeOpacity={0.84} style={styles.monthSwitchButton} onPress={() => setMonthDate((current) => addMonths(current, -1))}>
            <Ionicons name="chevron-back" size={18} color="#4f5562" />
          </TouchableOpacity>
          <Text style={styles.monthTitle}>{monthTitle}</Text>
          <TouchableOpacity activeOpacity={0.84} style={styles.monthSwitchButton} onPress={() => setMonthDate((current) => addMonths(current, 1))}>
            <Ionicons name="chevron-forward" size={18} color="#4f5562" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.calendarCard}>
        <Text style={styles.calendarCardTitle}>Event dates this month</Text>
        <Text style={styles.calendarCardCopy}>Only dates with plans are shown here, so selected day is easier to reach.</Text>

        {visibleDates.length > 0 ? (
          <View style={styles.dateChipGrid}>
            {visibleDates.map((dateKey) => {
              const items = dayItemsMap.get(dateKey) ?? [];
              const isSelected = dateKey === selectedDate;
              const date = parseDateKey(dateKey);

              return (
                <Pressable key={dateKey} style={[styles.dateChip, isSelected ? [styles.dateChipSelected, { backgroundColor: theme.primary08, borderColor: theme.primary20 }] : null]} onPress={() => jumpToSelectedDay(dateKey)}>
                  <Text style={[styles.dateChipWeekday, isSelected ? [styles.dateChipWeekdaySelected, { color: theme.primary }] : null]}>
                    {new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(date)}
                  </Text>
                  <Text style={[styles.dateChipDay, isSelected ? [styles.dateChipDaySelected, { color: theme.primary }] : null]}>{date.getDate()}</Text>
                  <View style={styles.dateChipDots}>
                    {getCalendarDots(items).map((tone, index) => (
                      <View
                        key={`${dateKey}-${tone}-${index}`}
                        style={[
                          styles.dateChipDot,
                          tone === 'trip' ? [styles.dateChipDotTrip, { backgroundColor: theme.secondary }] : tone === 'hidden' ? styles.dateChipDotHidden : [styles.dateChipDotActivity, { backgroundColor: theme.primary }],
                          isSelected ? styles.dateChipDotSelected : null,
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
            <Text style={styles.emptyMonthText}>No event dates in this month yet.</Text>
          </View>
        )}
      </View>

      <View style={styles.planCard}>
        <Text style={styles.planEyebrow}>SELECTED DAY</Text>
        <Text style={styles.planTitle}>{formatSelectedDate(selectedDate)}</Text>
        <Text style={styles.planCopy}>Tap any event date above and we jump straight down here.</Text>

        {selectedItems.length > 0 ? (
          <View style={styles.planList}>
            {selectedItems.map((item) =>
              item.kind === 'activity' ? (
                <TouchableOpacity
                  key={item.id}
                  activeOpacity={0.92}
                  style={styles.activityCard}
                  onPress={() => router.push(`/trip/${item.tripId}/sidequest/${item.activityId ?? item.id}`)}>
                  <View style={styles.activityHeader}>
                    <View style={[styles.planTimePill, styles.planTimePillActivity, { backgroundColor: theme.primary08 }]}>
                      <Text style={[styles.planTimeText, styles.planTimeTextActivity, { color: theme.primary }]}>{item.time?.trim() ? item.time : 'Anytime'}</Text>
                    </View>
                    <Text style={styles.activityOwner}>{item.hidden ? 'Hidden' : item.ownerName || 'SideQuest'}</Text>
                  </View>
                  <Text style={styles.activityTitle}>{item.hidden ? 'Hidden' : item.title}</Text>
                  <Text numberOfLines={2} style={styles.activityDescription}>
                    {item.hidden
                      ? item.teaserVisible && item.teaser
                        ? item.teaser
                        : 'Locked until reveal. Tap in to see when it opens up.'
                      : item.description || item.meta}
                  </Text>
                  <View style={styles.activityFooter}>
                    <Text style={styles.activityFooterText}>
                      {item.revealAt && !item.isRevealed ? `Reveals ${formatRevealChip(item.revealAt)}` : item.meta}
                    </Text>
                    <Ionicons name="chevron-forward" size={18} color="#9298a4" />
                  </View>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity key={item.id} activeOpacity={0.86} style={styles.planRow} onPress={() => router.push(`/trip/${item.tripId}`)}>
                  <View style={[styles.planTimePill, styles.planTimePillTrip, { backgroundColor: theme.secondary08 }]}>
                    <Text style={[styles.planTimeText, { color: theme.secondary }]}>{item.time?.trim() ? item.time : 'All day'}</Text>
                  </View>
                  <View style={styles.planCopyWrap}>
                    <Text style={styles.planRowTitle}>{item.title}</Text>
                    <Text style={styles.planRowMeta}>{item.meta}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#8a919d" />
                </TouchableOpacity>
              ),
            )}
          </View>
        ) : (
          <View style={styles.emptyDayState}>
            <Ionicons name="calendar-clear-outline" size={28} color="#b1b7c2" />
            <Text style={styles.emptyDayText}>Nothing planned for this day yet.</Text>
          </View>
        )}
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </ScrollView>
  );
}

function buildDayItemsMap(quests: Quest[], activities: SideQuestActivity[]) {
  const map = new Map<string, CalendarItem[]>();

  for (const quest of quests) {
    const current = new Date(`${quest.startDate}T12:00:00`);
    const end = new Date(`${quest.endDate}T12:00:00`);

    while (current.getTime() <= end.getTime()) {
      const key = toDateKey(current);
      const items = map.get(key) ?? [];
      items.push({
        id: `trip-${quest.id}-${key}`,
        kind: 'trip',
        tripId: quest.id,
        title: quest.title ?? 'Untitled adventure',
        date: key,
        meta: quest.destination?.trim() || 'Adventure day',
      });
      map.set(key, items);
      current.setDate(current.getDate() + 1);
    }
  }

  for (const activity of activities) {
    const items = map.get(activity.date) ?? [];
    items.push({
      id: activity.id,
      kind: 'activity',
      tripId: activity.tripId,
      activityId: activity.id,
      title: activity.visibility === 'hidden' ? 'Hidden' : activity.title ?? 'Untitled plan',
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

function formatSelectedDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(parseDateKey(value));
}

function formatRevealChip(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric' }).format(new Date(value));
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
    backgroundColor: '#fff',
    paddingHorizontal: 20,
  },
  headerRow: {
    marginBottom: 18,
    gap: 14,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 34,
    fontWeight: '900',
    color: '#121317',
    letterSpacing: -1.2,
  },
  titleCopy: {
    marginTop: 8,
    color: '#737883',
    fontSize: 14,
    lineHeight: 20,
    maxWidth: 220,
  },
  monthSwitchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  monthSwitchButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f4f5f7',
  },
  monthTitle: {
    flex: 1,
    color: '#21242d',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  calendarCard: {
    borderRadius: 30,
    borderWidth: 1,
    borderColor: '#ebeef3',
    backgroundColor: '#fff',
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.04,
    shadowRadius: 18,
    elevation: 3,
  },
  calendarCardTitle: {
    color: '#171821',
    fontSize: 18,
    fontWeight: '800',
  },
  calendarCardCopy: {
    marginTop: 6,
    color: '#7c8290',
    fontSize: 14,
    lineHeight: 20,
  },
  dateChipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 16,
  },
  dateChip: {
    width: '31%',
    minWidth: 94,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#edf0f4',
    backgroundColor: '#fcfcfd',
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  dateChipSelected: {
    backgroundColor: '#fff1f5',
    borderColor: '#ffc7d7',
  },
  dateChipWeekday: {
    color: '#8a919d',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  dateChipWeekdaySelected: {
    color: '#cf295f',
  },
  dateChipDay: {
    marginTop: 6,
    color: '#171821',
    fontSize: 24,
    fontWeight: '900',
  },
  dateChipDaySelected: {
    color: '#cf295f',
  },
  dateChipDots: {
    marginTop: 8,
    minHeight: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  dateChipDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  dateChipDotTrip: {
    backgroundColor: '#10c7e8',
  },
  dateChipDotActivity: {
    backgroundColor: '#ff4f74',
  },
  dateChipDotHidden: {
    backgroundColor: '#47505d',
  },
  dateChipDotSelected: {
    transform: [{ scale: 1.05 }],
  },
  emptyMonthState: {
    marginTop: 16,
    borderRadius: 22,
    backgroundColor: '#f9fafc',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 26,
    paddingHorizontal: 18,
  },
  emptyMonthText: {
    marginTop: 10,
    color: '#7c8290',
    fontSize: 14,
    textAlign: 'center',
  },
  planCard: {
    marginTop: 18,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#ebeef3',
    backgroundColor: '#fff',
    padding: 18,
  },
  planEyebrow: {
    color: '#97a0ad',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  planTitle: {
    marginTop: 8,
    color: '#171821',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.7,
  },
  planCopy: {
    marginTop: 8,
    color: '#7c8290',
    fontSize: 14,
    lineHeight: 21,
  },
  planList: {
    marginTop: 14,
    gap: 10,
  },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#edf0f4',
    backgroundColor: '#fcfcfd',
    padding: 14,
  },
  activityCard: {
    borderRadius: 26,
    borderWidth: 1,
    borderColor: '#ebedf2',
    backgroundColor: '#fff',
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.05,
    shadowRadius: 22,
    elevation: 4,
  },
  activityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  activityOwner: {
    flex: 1,
    textAlign: 'right',
    color: '#868d99',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  activityTitle: {
    marginTop: 14,
    color: '#161821',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.6,
  },
  activityDescription: {
    marginTop: 8,
    color: '#6f7683',
    fontSize: 14,
    lineHeight: 20,
  },
  activityFooter: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  activityFooterText: {
    flex: 1,
    color: '#7c8290',
    fontSize: 13,
    fontWeight: '700',
  },
  planTimePill: {
    minWidth: 66,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  planTimePillTrip: {
    backgroundColor: '#eefbff',
  },
  planTimePillActivity: {
    backgroundColor: '#fff1f5',
  },
  planTimeText: {
    color: '#0d7187',
    fontSize: 11,
    fontWeight: '800',
  },
  planTimeTextActivity: {
    color: '#cf295f',
  },
  planCopyWrap: {
    flex: 1,
  },
  planRowTitle: {
    color: '#171821',
    fontSize: 15,
    fontWeight: '800',
  },
  planRowMeta: {
    marginTop: 3,
    color: '#7c8290',
    fontSize: 13,
  },
  emptyDayState: {
    marginTop: 16,
    borderRadius: 22,
    backgroundColor: '#f9fafc',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 26,
    paddingHorizontal: 18,
  },
  emptyDayText: {
    marginTop: 10,
    color: '#7c8290',
    fontSize: 14,
    textAlign: 'center',
  },
  errorText: {
    marginTop: 14,
    color: '#d53d18',
    textAlign: 'center',
  },
});
