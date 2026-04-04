import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiJson } from '@/lib/api';
import type { Quest, SideQuestActivity } from '@/lib/types';

type CalendarItem = {
  id: string;
  kind: 'trip' | 'activity';
  tripId: string;
  title: string;
  date: string;
  time?: string | null;
  meta: string;
};

export default function CalendarScreen() {
  const insets = useSafeAreaInsets();
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

  useEffect(() => {
    const selected = parseDateKey(selectedDate);
    if (selected.getMonth() !== monthDate.getMonth() || selected.getFullYear() !== monthDate.getFullYear()) {
      setSelectedDate(toDateKey(monthDate));
    }
  }, [monthDate, selectedDate]);

  const calendarDays = useMemo(() => buildCalendarDays(monthDate), [monthDate]);
  const dayItemsMap = useMemo(() => buildDayItemsMap(quests, activities), [activities, quests]);
  const monthTitle = useMemo(
    () => new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(monthDate),
    [monthDate],
  );
  const selectedItems = useMemo(() => {
    const items = dayItemsMap.get(selectedDate) ?? [];
    return [...items].sort(sortCalendarItems);
  }, [dayItemsMap, selectedDate]);

  return (
    <ScrollView
      contentContainerStyle={[styles.screen, { paddingTop: Math.max(insets.top, 18) + 12, paddingBottom: Math.max(insets.bottom, 20) + 30 }]}
      showsVerticalScrollIndicator={false}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Calendar</Text>
        <View style={styles.monthSwitch}>
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
        <View style={styles.weekdayRow}>
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
            <Text key={day} style={styles.weekdayLabel}>
              {day}
            </Text>
          ))}
        </View>

        <View style={styles.grid}>
          {calendarDays.map((day) => {
            const key = toDateKey(day.date);
            const items = dayItemsMap.get(key) ?? [];
            const isCurrentMonth = day.date.getMonth() === monthDate.getMonth();
            const isToday = key === toDateKey(new Date());
            const isSelected = key === selectedDate;

            return (
              <Pressable key={key} style={[styles.dayCell, isSelected ? styles.dayCellSelected : null]} onPress={() => setSelectedDate(key)}>
                <View style={[styles.dayNumberWrap, isToday ? styles.dayNumberWrapToday : null, isSelected ? styles.dayNumberWrapSelected : null]}>
                  <Text
                    style={[
                      styles.dayNumber,
                      isCurrentMonth ? styles.dayNumberCurrentMonth : styles.dayNumberOutsideMonth,
                      isToday || isSelected ? styles.dayNumberToday : null,
                    ]}>
                    {day.date.getDate()}
                  </Text>
                </View>
                {items.length > 0 ? (
                  <View style={styles.dayMarkers}>
                    {items.slice(0, 3).map((item) => (
                      <View key={`${key}-${item.id}`} style={[styles.dayMarker, item.kind === 'activity' ? styles.dayMarkerActivity : styles.dayMarkerTrip]} />
                    ))}
                  </View>
                ) : (
                  <View style={styles.dayMarkersEmpty} />
                )}
                {items.length > 0 ? <Text style={styles.dayCount}>{items.length}</Text> : null}
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.planCard}>
        <Text style={styles.planEyebrow}>SELECTED DAY</Text>
        <Text style={styles.planTitle}>{formatSelectedDate(selectedDate)}</Text>
        <Text style={styles.planCopy}>Tap any day above to see exactly what is planned, including adventure spans and timed items like flights.</Text>

        {selectedItems.length > 0 ? (
          <View style={styles.planList}>
            {selectedItems.map((item) => (
              <TouchableOpacity key={item.id} activeOpacity={0.86} style={styles.planRow} onPress={() => router.push(`/trip/${item.tripId}`)}>
                <View style={[styles.planTimePill, item.kind === 'activity' ? styles.planTimePillActivity : styles.planTimePillTrip]}>
                  <Text style={[styles.planTimeText, item.kind === 'activity' ? styles.planTimeTextActivity : null]}>
                    {item.time?.trim() ? item.time : item.kind === 'activity' ? 'Anytime' : 'All day'}
                  </Text>
                </View>
                <View style={styles.planCopyWrap}>
                  <Text style={styles.planRowTitle}>{item.title}</Text>
                  <Text style={styles.planRowMeta}>{item.meta}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#8a919d" />
              </TouchableOpacity>
            ))}
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

function buildCalendarDays(monthDate: Date) {
  const firstDay = startOfMonth(monthDate);
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const start = new Date(firstDay);
  start.setDate(firstDay.getDate() - mondayOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return { date };
  });
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
      title: activity.title ?? 'Untitled plan',
      date: activity.date,
      time: activity.time,
      meta: activity.category?.trim() || (activity.visibility === 'hidden' ? 'Hidden SideQuest' : 'SideQuest'),
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

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  title: {
    fontSize: 34,
    fontWeight: '900',
    color: '#121317',
    letterSpacing: -1.2,
  },
  monthSwitch: {
    flexDirection: 'row',
    alignItems: 'center',
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
    color: '#21242d',
    fontSize: 15,
    fontWeight: '700',
    minWidth: 120,
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
  weekdayRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  weekdayLabel: {
    flex: 1,
    textAlign: 'center',
    color: '#8a909b',
    fontSize: 12,
    fontWeight: '700',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.2857%',
    minHeight: 78,
    paddingHorizontal: 3,
    paddingVertical: 6,
    borderRadius: 18,
    alignItems: 'center',
  },
  dayCellSelected: {
    backgroundColor: '#fff4f7',
  },
  dayNumberWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  dayNumberWrapToday: {
    backgroundColor: '#ff4f74',
  },
  dayNumberWrapSelected: {
    backgroundColor: '#ff9db0',
  },
  dayNumber: {
    fontSize: 12,
    fontWeight: '700',
  },
  dayNumberCurrentMonth: {
    color: '#252833',
  },
  dayNumberOutsideMonth: {
    color: '#a6acb8',
  },
  dayNumberToday: {
    color: '#fff',
  },
  dayMarkers: {
    flexDirection: 'row',
    gap: 4,
    minHeight: 8,
    alignItems: 'center',
    marginBottom: 6,
  },
  dayMarkersEmpty: {
    minHeight: 14,
  },
  dayMarker: {
    width: 7,
    height: 7,
    borderRadius: 999,
  },
  dayMarkerTrip: {
    backgroundColor: '#10c7e8',
  },
  dayMarkerActivity: {
    backgroundColor: '#ff4f74',
  },
  dayCount: {
    color: '#69707c',
    fontSize: 10,
    fontWeight: '800',
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
