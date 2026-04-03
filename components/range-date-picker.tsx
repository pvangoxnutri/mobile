import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';

type Props = {
  visible: boolean;
  title?: string;
  subtitle?: string;
  startDate?: string | null;
  endDate?: string | null;
  minDate?: string | null;
  maxDate?: string | null;
  confirmLabel?: string;
  onChange: (startDate: string, endDate: string) => void;
  onClose: () => void;
};

type MonthItem = {
  key: string;
  year: number;
  month: number;
};

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function RangeDatePicker({
  visible,
  title = 'Choose dates',
  subtitle = 'Pick a start date and then an end date.',
  startDate,
  endDate,
  minDate,
  maxDate,
  confirmLabel = 'Apply dates',
  onChange,
  onClose,
}: Props) {
  const { width } = useWindowDimensions();
  const flatListRef = useRef<FlatList<MonthItem>>(null);
  const pageWidth = width - 40;
  const months = useMemo(() => buildMonthItems(startDate ?? minDate ?? null, maxDate ?? null), [maxDate, minDate, startDate]);
  const [draftStartDate, setDraftStartDate] = useState<string | null>(startDate ?? null);
  const [draftEndDate, setDraftEndDate] = useState<string | null>(endDate ?? null);
  const [visibleMonthIndex, setVisibleMonthIndex] = useState(0);

  useEffect(() => {
    if (!visible) {
      return;
    }

    const nextIndex = findMonthIndex(months, startDate ?? endDate ?? minDate ?? toDateInput(new Date()));
    setDraftStartDate(startDate ?? null);
    setDraftEndDate(endDate ?? null);
    setVisibleMonthIndex(nextIndex);

    requestAnimationFrame(() => {
      flatListRef.current?.scrollToIndex({ index: nextIndex, animated: false });
    });
  }, [visible, startDate, endDate, minDate, months]);

  const monthLabel = months[visibleMonthIndex]
    ? new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(
        new Date(months[visibleMonthIndex].year, months[visibleMonthIndex].month, 1),
      )
    : '';

  const helperText = !draftStartDate
    ? 'Pick a start date'
    : !draftEndDate
      ? 'Now pick an end date'
      : 'Range selected';

  function handleDayPress(day: string) {
    if (isDateDisabled(day, minDate, maxDate)) {
      return;
    }

    if (!draftStartDate || (draftStartDate && draftEndDate)) {
      setDraftStartDate(day);
      setDraftEndDate(null);
      return;
    }

    if (day === draftStartDate) {
      setDraftStartDate(null);
      setDraftEndDate(null);
      return;
    }

    if (day < draftStartDate) {
      setDraftStartDate(day);
      setDraftEndDate(draftStartDate);
      return;
    }

    setDraftEndDate(day);
  }

  function handleConfirm() {
    if (!draftStartDate || !draftEndDate) {
      return;
    }

    onChange(draftStartDate, draftEndDate);
    onClose();
  }

  function handleClear() {
    setDraftStartDate(null);
    setDraftEndDate(null);
  }

  function goToMonth(direction: -1 | 1) {
    const nextIndex = Math.max(0, Math.min(months.length - 1, visibleMonthIndex + direction));
    setVisibleMonthIndex(nextIndex);
    flatListRef.current?.scrollToIndex({ index: nextIndex, animated: true });
  }

  function handleMomentumEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
    setVisibleMonthIndex(nextIndex);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />

        <View style={styles.sheet}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.subtitle}>{subtitle}</Text>
            </View>
            <TouchableOpacity activeOpacity={0.9} style={styles.closeButton} onPress={onClose}>
              <Ionicons name="close" size={20} color="#161821" />
            </TouchableOpacity>
          </View>

          <View style={styles.summaryRow}>
            <DateSummaryCard label="Start" value={draftStartDate} active={!draftStartDate || !draftEndDate} />
            <View style={styles.summaryArrow}>
              <Ionicons name="arrow-forward" size={16} color="#b1b7c1" />
            </View>
            <DateSummaryCard label="End" value={draftEndDate} active={Boolean(draftStartDate && !draftEndDate)} />
          </View>

          <View style={styles.helperPill}>
            <Ionicons
              name={!draftStartDate ? 'calendar-outline' : !draftEndDate ? 'ellipse-outline' : 'checkmark-circle'}
              size={16}
              color="#ff4f74"
            />
            <Text style={styles.helperText}>{helperText}</Text>
          </View>

          <View style={styles.monthHeader}>
            <TouchableOpacity
              activeOpacity={0.88}
              style={[styles.monthNavButton, visibleMonthIndex === 0 ? styles.monthNavButtonDisabled : null]}
              disabled={visibleMonthIndex === 0}
              onPress={() => goToMonth(-1)}>
              <Ionicons name="chevron-back" size={18} color={visibleMonthIndex === 0 ? '#c9ced7' : '#161821'} />
            </TouchableOpacity>
            <Text style={styles.monthLabel}>{monthLabel}</Text>
            <TouchableOpacity
              activeOpacity={0.88}
              style={[styles.monthNavButton, visibleMonthIndex === months.length - 1 ? styles.monthNavButtonDisabled : null]}
              disabled={visibleMonthIndex === months.length - 1}
              onPress={() => goToMonth(1)}>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={visibleMonthIndex === months.length - 1 ? '#c9ced7' : '#161821'}
              />
            </TouchableOpacity>
          </View>

          <View style={styles.weekdayRow}>
            {WEEKDAY_LABELS.map((label) => (
              <Text key={label} style={styles.weekdayLabel}>
                {label}
              </Text>
            ))}
          </View>

          <FlatList
            ref={flatListRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            data={months}
            keyExtractor={(item) => item.key}
            getItemLayout={(_, index) => ({ length: pageWidth, offset: pageWidth * index, index })}
            onMomentumScrollEnd={handleMomentumEnd}
            renderItem={({ item }) => (
              <MonthGrid
                month={item}
                width={pageWidth}
                startDate={draftStartDate}
                endDate={draftEndDate}
                minDate={minDate}
                maxDate={maxDate}
                onDayPress={handleDayPress}
              />
            )}
          />

          <View style={styles.footer}>
            <TouchableOpacity
              activeOpacity={0.9}
              style={[styles.secondaryButton, !draftStartDate && !draftEndDate ? styles.secondaryButtonDisabled : null]}
              disabled={!draftStartDate && !draftEndDate}
              onPress={handleClear}>
              <Text style={styles.secondaryButtonText}>Reset</Text>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.92}
              style={[styles.primaryButton, !(draftStartDate && draftEndDate) ? styles.primaryButtonDisabled : null]}
              disabled={!(draftStartDate && draftEndDate)}
              onPress={handleConfirm}>
              <Text style={styles.primaryButtonText}>{confirmLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function MonthGrid({
  month,
  width,
  startDate,
  endDate,
  minDate,
  maxDate,
  onDayPress,
}: {
  month: MonthItem;
  width: number;
  startDate: string | null;
  endDate: string | null;
  minDate?: string | null;
  maxDate?: string | null;
  onDayPress: (day: string) => void;
}) {
  const days = buildMonthCells(month.year, month.month);

  return (
    <View style={[styles.monthPage, { width }]}>
      <View style={styles.grid}>
        {days.map((day, index) => {
          if (!day) {
            return <View key={`empty-${month.key}-${index}`} style={styles.dayCell} />;
          }

          const disabled = isDateDisabled(day, minDate, maxDate);
          const isStart = startDate === day;
          const isEnd = endDate === day;
          const inRange = Boolean(startDate && endDate && day > startDate && day < endDate);
          const single = Boolean(startDate && endDate && startDate === endDate && day === startDate);

          return (
            <Pressable
              key={day}
              disabled={disabled}
              onPress={() => onDayPress(day)}
              style={[
                styles.dayCell,
                inRange ? styles.dayCellInRange : null,
                isStart ? styles.dayCellRangeStart : null,
                isEnd ? styles.dayCellRangeEnd : null,
                single ? styles.dayCellSingle : null,
              ]}>
              <View style={[styles.dayCircle, isStart || isEnd ? styles.dayCircleSelected : null, disabled ? styles.dayCircleDisabled : null]}>
                <Text
                  style={[
                    styles.dayText,
                    disabled ? styles.dayTextDisabled : null,
                    isStart || isEnd ? styles.dayTextSelected : null,
                  ]}>
                  {getDayNumber(day)}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function DateSummaryCard({
  label,
  value,
  active,
}: {
  label: string;
  value: string | null;
  active?: boolean;
}) {
  return (
    <View style={[styles.summaryCard, active ? styles.summaryCardActive : null]}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value ? formatDisplayDate(value) : 'Select'}</Text>
    </View>
  );
}

function buildMonthItems(anchorDate: string | null, maxDate: string | null) {
  const anchor = anchorDate ? parseDate(anchorDate) : new Date();
  const start = new Date(anchor.getFullYear(), anchor.getMonth() - 12, 1);
  const endBase = maxDate ? parseDate(maxDate) : new Date(anchor.getFullYear(), anchor.getMonth() + 24, 1);
  const end = new Date(endBase.getFullYear(), endBase.getMonth() + 1, 1);
  const items: MonthItem[] = [];
  const cursor = new Date(start);

  while (cursor < end) {
    items.push({
      key: `${cursor.getFullYear()}-${cursor.getMonth()}`,
      year: cursor.getFullYear(),
      month: cursor.getMonth(),
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return items;
}

function buildMonthCells(year: number, month: number) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const leading = (first.getDay() + 6) % 7;
  const cells: (string | null)[] = [];

  for (let i = 0; i < leading; i += 1) {
    cells.push(null);
  }

  for (let day = 1; day <= last.getDate(); day += 1) {
    cells.push(toDateInput(new Date(year, month, day)));
  }

  while (cells.length % 7 !== 0 || cells.length < 35) {
    cells.push(null);
  }

  return cells;
}

function findMonthIndex(months: MonthItem[], date: string) {
  const parsed = parseDate(date);
  const index = months.findIndex((month) => month.year === parsed.getFullYear() && month.month === parsed.getMonth());
  return index >= 0 ? index : 0;
}

function isDateDisabled(value: string, minDate?: string | null, maxDate?: string | null) {
  if (minDate && value < minDate) return true;
  if (maxDate && value > maxDate) return true;
  return false;
}

function parseDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

function toDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDayNumber(value: string) {
  return String(parseDate(value).getDate());
}

export function formatDisplayDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(parseDate(value));
}

export function formatRangeDisplay(startDate?: string | null, endDate?: string | null) {
  if (!startDate || !endDate) return 'Select dates';
  return `${formatDisplayDate(startDate)} -> ${formatDisplayDate(endDate)}`;
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(12,14,19,0.22)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 24,
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#d9dde4',
  },
  header: {
    marginTop: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  headerCopy: {
    flex: 1,
  },
  title: {
    color: '#161821',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.8,
  },
  subtitle: {
    marginTop: 8,
    color: '#7d8491',
    fontSize: 14,
    lineHeight: 21,
  },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f6f8',
  },
  summaryRow: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  summaryCard: {
    flex: 1,
    minHeight: 74,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#eceff4',
    backgroundColor: '#f8fafc',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  summaryCardActive: {
    borderColor: '#ffc6d3',
    backgroundColor: '#fff5f8',
  },
  summaryLabel: {
    color: '#8a919e',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  summaryValue: {
    marginTop: 8,
    color: '#161821',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  summaryArrow: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  helperPill: {
    marginTop: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#ffd6df',
    backgroundColor: '#fff4f7',
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  helperText: {
    color: '#c83362',
    fontSize: 14,
    fontWeight: '700',
  },
  monthHeader: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthNavButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f6f8',
  },
  monthNavButtonDisabled: {
    backgroundColor: '#f7f8fa',
  },
  monthLabel: {
    color: '#161821',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  weekdayRow: {
    marginTop: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  weekdayLabel: {
    width: `${100 / 7}%`,
    textAlign: 'center',
    color: '#9198a4',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  monthPage: {
    paddingTop: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
  },
  dayCellInRange: {
    backgroundColor: '#ffe7ee',
  },
  dayCellRangeStart: {
    backgroundColor: '#ffd6e0',
    borderTopLeftRadius: 18,
    borderBottomLeftRadius: 18,
  },
  dayCellRangeEnd: {
    backgroundColor: '#ffd6e0',
    borderTopRightRadius: 18,
    borderBottomRightRadius: 18,
  },
  dayCellSingle: {
    borderRadius: 18,
  },
  dayCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircleSelected: {
    backgroundColor: '#ff4f74',
    shadowColor: '#ff4f74',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 4,
  },
  dayCircleDisabled: {
    opacity: 0.36,
  },
  dayText: {
    color: '#161821',
    fontSize: 16,
    fontWeight: '700',
  },
  dayTextSelected: {
    color: '#fff',
    fontWeight: '900',
  },
  dayTextDisabled: {
    color: '#c2c8d1',
  },
  footer: {
    marginTop: 16,
    flexDirection: 'row',
    gap: 10,
  },
  secondaryButton: {
    minHeight: 56,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e7eaf0',
    backgroundColor: '#fff',
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonDisabled: {
    opacity: 0.5,
  },
  secondaryButtonText: {
    color: '#6f7683',
    fontSize: 14,
    fontWeight: '800',
  },
  primaryButton: {
    flex: 1,
    minHeight: 56,
    borderRadius: 18,
    backgroundColor: '#ff4f74',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.56,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: -0.2,
  },
});
