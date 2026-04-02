import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiJson } from '@/lib/api';
import type { Quest } from '@/lib/types';

export default function CalendarScreen() {
  const insets = useSafeAreaInsets();
  const [quests, setQuests] = useState<Quest[]>([]);
  const [monthDate, setMonthDate] = useState(() => startOfMonth(new Date()));
  const [error, setError] = useState('');

  const loadQuests = useCallback(() => {
    let active = true;

    void apiJson<Quest[]>('/api/trips')
      .then((data) => {
        if (!active) return;
        setQuests(Array.isArray(data) ? data : []);
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

  useFocusEffect(loadQuests);

  const calendarDays = useMemo(() => buildCalendarDays(monthDate), [monthDate]);
  const questMap = useMemo(() => buildQuestMap(quests), [quests]);
  const monthTitle = useMemo(
    () => new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(monthDate),
    [monthDate],
  );

  const monthTrips = useMemo(() => {
    const monthKey = monthDate.toISOString().slice(0, 7);
    return quests.filter((quest) => quest.startDate.startsWith(monthKey) || quest.endDate.startsWith(monthKey));
  }, [monthDate, quests]);

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
            const items = questMap.get(key) ?? [];
            const isCurrentMonth = day.date.getMonth() === monthDate.getMonth();
            const isToday = key === toDateKey(new Date());

            return (
              <Pressable key={key} style={styles.dayCell}>
                <View style={[styles.dayNumberWrap, isToday ? styles.dayNumberWrapToday : null]}>
                  <Text
                    style={[
                      styles.dayNumber,
                      isCurrentMonth ? styles.dayNumberCurrentMonth : styles.dayNumberOutsideMonth,
                      isToday ? styles.dayNumberToday : null,
                    ]}>
                    {day.date.getDate()}
                  </Text>
                </View>
                {items.slice(0, 2).map((quest) => (
                  <Pressable key={`${key}-${quest.id}`} onPress={() => router.push(`/trip/${quest.id}`)} style={styles.dayQuestPill}>
                    <Text numberOfLines={1} style={styles.dayQuestText}>
                      {quest.title ?? quest.destination ?? 'SideQuest'}
                    </Text>
                  </Pressable>
                ))}
                {items.length > 2 ? <Text style={styles.moreText}>+{items.length - 2} more</Text> : null}
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.listCard}>
        <Text style={styles.listTitle}>This month</Text>
        {monthTrips.length > 0 ? (
          monthTrips.map((quest) => (
            <TouchableOpacity key={quest.id} activeOpacity={0.86} style={styles.tripRow} onPress={() => router.push(`/trip/${quest.id}`)}>
              <View style={styles.tripRowDate}>
                <Text style={styles.tripRowDay}>{new Date(`${quest.startDate}T12:00:00`).getDate()}</Text>
                <Text style={styles.tripRowMonth}>
                  {new Intl.DateTimeFormat('en-US', { month: 'short' }).format(new Date(`${quest.startDate}T12:00:00`))}
                </Text>
              </View>
              <View style={styles.tripRowCopy}>
                <Text style={styles.tripRowTitle}>{quest.title ?? 'Untitled adventure'}</Text>
                <Text style={styles.tripRowMeta}>{formatDateRange(quest.startDate, quest.endDate)}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#8a919d" />
            </TouchableOpacity>
          ))
        ) : (
          <Text style={styles.emptyText}>No adventures in this month yet.</Text>
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

function buildQuestMap(quests: Quest[]) {
  const map = new Map<string, Quest[]>();

  for (const quest of quests) {
    const current = new Date(`${quest.startDate}T12:00:00`);
    const end = new Date(`${quest.endDate}T12:00:00`);

    while (current.getTime() <= end.getTime()) {
      const key = toDateKey(current);
      const existing = map.get(key) ?? [];
      existing.push(quest);
      map.set(key, existing);
      current.setDate(current.getDate() + 1);
    }
  }

  return map;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, offset: number) {
  return new Date(date.getFullYear(), date.getMonth() + offset, 1);
}

function toDateKey(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).toISOString().slice(0, 10);
}

function formatDateRange(startDate?: string, endDate?: string) {
  if (!startDate || !endDate) return 'Dates coming soon';
  const formatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
  return `${formatter.format(new Date(`${startDate}T12:00:00`))} - ${formatter.format(new Date(`${endDate}T12:00:00`))}`;
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
    minHeight: 88,
    paddingHorizontal: 3,
    paddingVertical: 4,
  },
  dayNumberWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  dayNumberWrapToday: {
    backgroundColor: '#ff4f74',
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
  dayQuestPill: {
    borderRadius: 999,
    backgroundColor: '#ffe5ec',
    paddingHorizontal: 6,
    paddingVertical: 3,
    marginBottom: 4,
  },
  dayQuestText: {
    color: '#d82d62',
    fontSize: 9,
    fontWeight: '700',
  },
  moreText: {
    color: '#8b92a0',
    fontSize: 9,
    fontWeight: '700',
  },
  listCard: {
    marginTop: 18,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#ebeef3',
    backgroundColor: '#fff',
    padding: 18,
  },
  listTitle: {
    color: '#171821',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 12,
  },
  tripRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  tripRowDate: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: '#fff2f6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  tripRowDay: {
    color: '#ff4f74',
    fontSize: 18,
    fontWeight: '900',
  },
  tripRowMonth: {
    color: '#ff4f74',
    fontSize: 11,
    fontWeight: '700',
    marginTop: -2,
  },
  tripRowCopy: {
    flex: 1,
  },
  tripRowTitle: {
    color: '#171821',
    fontSize: 15,
    fontWeight: '700',
  },
  tripRowMeta: {
    marginTop: 2,
    color: '#7c8290',
    fontSize: 13,
  },
  emptyText: {
    color: '#7c8290',
    fontSize: 15,
  },
  errorText: {
    marginTop: 14,
    color: '#d53d18',
    textAlign: 'center',
  },
});
