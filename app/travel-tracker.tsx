import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/contexts/app-theme-context';
import WorldOverview from '@/components/travel-tracker/map-section';
import StatusSheet from '@/components/travel-tracker/status-sheet';
import {
  COUNTRIES,
  getCountryFlag,
  inContinent,
  buildEntries,
  type Continent,
  type Country,
  type CountryStatus,
  type StatusMap,
} from '@/components/travel-tracker/country-data';
import { apiJson } from '@/lib/api';
import type { Quest } from '@/lib/types';

type Filter = 'all' | 'visited' | 'planned' | 'living';

const STORAGE_KEY = 'travel_tracker_status_map';

const STATUS_LABEL: Record<CountryStatus, string> = {
  none: '',
  visited: 'Visited',
  planned: 'Planned',
  living: 'Living here',
};

export default function TravelTrackerScreen() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();

  // ── State ──────────────────────────────────────────────────────────────────
  const [statusMap, setStatusMap] = useState<StatusMap>({});
  const [tripDerivedMap, setTripDerivedMap] = useState<StatusMap>({});
  const [ready, setReady] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [continentFilter, setContinentFilter] = useState<Continent | null>(null);
  const [sheetCountry, setSheetCountry] = useState<Country | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);

  // ── Persistence ────────────────────────────────────────────────────────────
  useEffect(() => {
    void AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => { if (raw) setStatusMap(JSON.parse(raw) as StatusMap); })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  // ── Load trips and derive country statuses ─────────────────────────────────
  useEffect(() => {
    void apiJson<Quest[]>('/api/trips')
      .then((trips) => {
        const today = new Date().toISOString().slice(0, 10);
        const derived: StatusMap = {};
        for (const trip of trips) {
          if (!trip.countries?.length) continue;
          const status: CountryStatus = trip.endDate < today ? 'visited' : 'planned';
          for (const code of trip.countries) {
            // "visited" beats "planned" if a country appears in multiple trips
            if (!derived[code] || (derived[code] === 'planned' && status === 'visited')) {
              derived[code] = status;
            }
          }
        }
        setTripDerivedMap(derived);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!ready) return;
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(statusMap));
  }, [statusMap, ready]);

  // ── Derived ────────────────────────────────────────────────────────────────
  // Merge: manual statusMap overrides trip-derived status
  const mergedMap = useMemo<StatusMap>(() => ({ ...tripDerivedMap, ...statusMap }), [tripDerivedMap, statusMap]);
  const entries = useMemo(() => buildEntries(mergedMap), [mergedMap]);

  const livingCountry = useMemo(
    () => COUNTRIES.find((c) => mergedMap[c.code] === 'living') ?? null,
    [mergedMap],
  );

  const visitedCount = useMemo(
    () => Object.values(mergedMap).filter((s) => s === 'visited').length,
    [mergedMap],
  );
  const plannedCount = useMemo(
    () => Object.values(mergedMap).filter((s) => s === 'planned').length,
    [mergedMap],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries
      .filter((e) => {
        if (filter !== 'all' && e.status !== filter) return false;
        if (continentFilter && !inContinent(e, continentFilter)) return false;
        if (q && !e.name.toLowerCase().includes(q) && !e.code.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [entries, filter, continentFilter, search]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  function openSheet(country: Country) {
    setSheetCountry(country);
    setSheetVisible(true);
  }

  function handleStatusSelect(status: CountryStatus) {
    if (!sheetCountry) return;
    setStatusMap((prev) => {
      const next = { ...prev };
      // Enforce single living country
      if (status === 'living') {
        Object.keys(next).forEach((code) => {
          if (next[code] === 'living') delete next[code];
        });
      }
      if (status === 'none') {
        delete next[sheetCountry.code];
      } else {
        next[sheetCountry.code] = status;
      }
      return next;
    });
    setSheetVisible(false);
  }

  function handleContinentFilter(continent: Continent | null) {
    setContinentFilter(continent);
    // Sync list filter to "all" when selecting a continent
    setFilter('all');
  }

  // ── Filter tab press animation ─────────────────────────────────────────────
  const filterScaleAnims = useRef<Record<Filter, Animated.Value>>({
    all: new Animated.Value(1),
    visited: new Animated.Value(1),
    planned: new Animated.Value(1),
    living: new Animated.Value(1),
  }).current;

  function pressFilter(f: Filter) {
    Animated.sequence([
      Animated.timing(filterScaleAnims[f], { toValue: 0.93, duration: 70, useNativeDriver: true }),
      Animated.timing(filterScaleAnims[f], { toValue: 1, duration: 110, useNativeDriver: true }),
    ]).start();
    setFilter(f);
    setContinentFilter(null);
  }

  return (
    <>
      <ScrollView
        style={[styles.screen, { backgroundColor: '#F7F8FA' }]}
        contentContainerStyle={[
          styles.content,
          { paddingTop: Math.max(insets.top, 16) + 8, paddingBottom: Math.max(insets.bottom, 20) + 112 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backButton} activeOpacity={0.8} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={26} color="#6D7380" />
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={styles.title}>Travel Tracker</Text>
            <Text style={styles.subtitle}>Where you've been, where you're going</Text>
          </View>
        </View>

        {/* ── Stats strip ────────────────────────────────────────────────── */}
        <View style={styles.statsStrip}>
          <StatPill
            value={visitedCount}
            label="Visited"
            color={theme.primary}
            bg={theme.primary08}
            icon="checkmark-circle"
          />
          <StatPill
            value={plannedCount}
            label="Planned"
            color={theme.secondary}
            bg={theme.secondary08}
            icon="bookmark"
          />
          <View style={[styles.livingPill, livingCountry && { backgroundColor: '#FEF3C7', borderColor: '#FCD34D' }]}>
            <Text style={styles.livingPillFlag}>
              {livingCountry ? getCountryFlag(livingCountry) : '🏠'}
            </Text>
            <Text style={[styles.livingPillText, { color: livingCountry ? '#D97706' : '#9AA2AE' }]} numberOfLines={1}>
              {livingCountry ? livingCountry.name : 'Set home'}
            </Text>
          </View>
        </View>

        {/* ── World overview ──────────────────────────────────────────────── */}
        <SectionHeader title="World Overview" />
        <WorldOverview
          statusMap={mergedMap}
          onContinentPress={handleContinentFilter}
          activeContinentFilter={continentFilter}
        />

        {/* ── Filter tabs + search ────────────────────────────────────────── */}
        <SectionHeader title="Countries" style={{ marginTop: 28 }} />

        <View style={styles.filterRow}>
          {(['all', 'visited', 'planned', 'living'] as Filter[]).map((f) => {
            const isActive = filter === f && !continentFilter;
            return (
              <Animated.View key={f} style={{ transform: [{ scale: filterScaleAnims[f] }] }}>
                <TouchableOpacity
                  style={[
                    styles.filterChip,
                    isActive && { backgroundColor: theme.primary, borderColor: theme.primary },
                  ]}
                  activeOpacity={0.8}
                  onPress={() => pressFilter(f)}>
                  <Text style={[styles.filterChipText, isActive && { color: '#fff' }]}>
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </Text>
                </TouchableOpacity>
              </Animated.View>
            );
          })}
        </View>

        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={18} color="#9AA2AE" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search countries…"
            placeholderTextColor="#B0B7C3"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {search.length > 0 ? (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color="#B0B7C3" />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* ── Country list ────────────────────────────────────────────────── */}
        <View style={styles.countryList}>
          {filtered.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>🌐</Text>
              <Text style={styles.emptyText}>No countries match your filter</Text>
            </View>
          ) : (
            filtered.map((entry, index) => {
              const fromTrip = !statusMap[entry.code] && !!tripDerivedMap[entry.code];
              return (
                <View key={entry.code}>
                  {index > 0 ? <View style={styles.rowDivider} /> : null}
                  <TouchableOpacity
                    style={styles.countryRow}
                    activeOpacity={0.75}
                    onPress={() => openSheet(entry)}>
                    <Text style={styles.flagEmoji}>{getCountryFlag(entry)}</Text>
                    <View style={styles.countryNameWrap}>
                      <Text style={styles.countryName} numberOfLines={1}>{entry.name}</Text>
                      {fromTrip ? <Text style={styles.fromTripLabel}>✈ from trip</Text> : null}
                    </View>
                    {entry.status !== 'none' ? (
                      <StatusBadge status={entry.status} theme={theme} />
                    ) : (
                      <Ionicons name="chevron-forward" size={18} color="#C8CDD8" />
                    )}
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* ── Status bottom sheet ─────────────────────────────────────────────── */}
      <StatusSheet
        country={sheetCountry}
        currentStatus={sheetCountry ? (statusMap[sheetCountry.code] ?? 'none') : 'none'}
        visible={sheetVisible}
        onSelect={handleStatusSelect}
        onClose={() => setSheetVisible(false)}
      />
    </>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatPill({
  value,
  label,
  color,
  bg,
  icon,
}: {
  value: number;
  label: string;
  color: string;
  bg: string;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={[styles.statPill, { backgroundColor: bg }]}>
      <Ionicons name={icon} size={16} color={color} />
      <Text style={[styles.statPillValue, { color }]}>{value}</Text>
      <Text style={[styles.statPillLabel, { color }]}>{label}</Text>
    </View>
  );
}

function StatusBadge({ status, theme }: { status: CountryStatus; theme: ReturnType<typeof useAppTheme> }) {
  const config: Record<CountryStatus, { bg: string; color: string } | null> = {
    none:    null,
    visited: { bg: theme.primary12,  color: theme.primary },
    planned: { bg: theme.secondary12, color: theme.secondary },
    living:  { bg: '#FEF3C7', color: '#D97706' },
  };
  const c = config[status];
  if (!c) return null;
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <Text style={[styles.badgeText, { color: c.color }]}>{STATUS_LABEL[status]}</Text>
    </View>
  );
}

function SectionHeader({ title, style }: { title: string; style?: object }) {
  return (
    <View style={[styles.sectionHeaderRow, style]}>
      <Text style={styles.sectionHeaderText}>{title.toUpperCase()}</Text>
      <View style={styles.sectionHeaderLine} />
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 20,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    marginBottom: 24,
  },
  backButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: '#141720',
    letterSpacing: -1.1,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 14,
    color: '#8A909D',
    lineHeight: 20,
  },

  // Stats strip
  statsStrip: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 28,
  },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  statPillValue: {
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  statPillLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  livingPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E8EAF0',
    backgroundColor: '#F6F7FA',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  livingPillFlag: {
    fontSize: 16,
  },
  livingPillText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },

  // Section header
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  sectionHeaderText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#9AA2AE',
    letterSpacing: 2,
  },
  sectionHeaderLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#ECEEF3',
  },

  // Filter chips
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  filterChip: {
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#E2E5EE',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  filterChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },

  // Search
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E5EE',
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    height: 48,
    gap: 10,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  searchIcon: {
    flexShrink: 0,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#1B1E28',
  },

  // Country list
  countryList: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#ECEEF3',
    backgroundColor: '#fff',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 14,
    elevation: 4,
  },
  rowDivider: {
    height: 1,
    backgroundColor: '#F3F5F9',
    marginLeft: 58,
  },
  countryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 12,
  },
  flagEmoji: {
    fontSize: 26,
    width: 34,
    textAlign: 'center',
  },
  countryNameWrap: {
    flex: 1,
  },
  countryName: {
    fontSize: 16,
    color: '#1B1E28',
    fontWeight: '500',
    letterSpacing: -0.2,
  },
  fromTripLabel: {
    fontSize: 11,
    color: '#9AA2AE',
    fontWeight: '600',
    marginTop: 1,
  },

  // Status badge
  badge: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyEmoji: {
    fontSize: 40,
    marginBottom: 10,
  },
  emptyText: {
    fontSize: 15,
    color: '#9AA2AE',
    fontWeight: '500',
  },
});
