import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  InteractionManager,
  Keyboard,
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useI18n } from '@/components/i18n-provider';
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
import { useKeyboardFocusScroll } from '@/hooks/useKeyboardFocusScroll';
import { apiJson } from '@/lib/api';
import type { Quest } from '@/lib/types';
import { PRIMARY_COLOR, PRIMARY_12, SECONDARY_COLOR, SECONDARY_12 } from '@/constants/colors';

type Filter = 'all' | 'visited' | 'planned' | 'living';

const STORAGE_KEY = 'travel_tracker_status_map';
const TOTAL_CONTINENTS = 6;

const FILTER_LABEL_KEY: Record<Filter, string> = {
  all: 'travel.filterAll',
  visited: 'travel.visited',
  planned: 'travel.planned',
  living: 'travel.filterLiving',
};


export default function TravelTrackerScreen() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const searchInputRef = useRef<TextInput>(null);
  const listAnchorY = useRef(0);
  // Reuses this screen's own scrollRef (already driven by the filter-chip
  // "scroll to list anchor" logic below) instead of creating a second,
  // independent scroll controller for the same ScrollView.
  const { onFocusField, scrollViewProps } = useKeyboardFocusScroll(scrollRef);

  const [statusMap, setStatusMap] = useState<StatusMap>({});
  const [tripDerivedMap, setTripDerivedMap] = useState<StatusMap>({});
  const [ready, setReady] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [continentFilter, setContinentFilter] = useState<Continent | null>(null);
  const [sheetCountry, setSheetCountry] = useState<Country | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);

  useEffect(() => {
    void AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => { if (raw) setStatusMap(JSON.parse(raw) as StatusMap); })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    void apiJson<Quest[]>('/api/trips')
      .then((trips) => {
        const today = new Date().toISOString().slice(0, 10);
        const derived: StatusMap = {};
        for (const trip of trips) {
          if (!trip.countries?.length) continue;
          const status: CountryStatus = trip.endDate < today ? 'visited' : 'planned';
          for (const code of trip.countries) {
            if (!derived[code] || (derived[code] === 'planned' && status === 'visited')) {
              derived[code] = status;
            }
          }
        }
        setTripDerivedMap(derived);
      })
      .catch((err: unknown) => {
        console.warn('[TRAVEL_TRACKER] Failed to load trip-derived countries:', err instanceof Error ? err.message : err);
      });
  }, []);

  useEffect(() => {
    if (!ready) return;
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(statusMap));
  }, [statusMap, ready]);

  const mergedMap = useMemo<StatusMap>(() => ({ ...tripDerivedMap, ...statusMap }), [tripDerivedMap, statusMap]);
  const entries = useMemo(() => buildEntries(mergedMap), [mergedMap]);

  const visitedCount = useMemo(
    () => Object.values(mergedMap).filter((s) => s === 'visited').length,
    [mergedMap],
  );

  const continentsVisited = useMemo(() => {
    const set = new Set<Continent>();
    COUNTRIES.forEach((c) => {
      const s = mergedMap[c.code];
      if (s === 'visited' || s === 'living') {
        set.add(c.continent);
        if (c.continent2) set.add(c.continent2);
      }
    });
    return set.size;
  }, [mergedMap]);

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

  // Android mounts every country row synchronously on open, and rendering all
  // ~200 flag rows up front froze the screen for a beat ("tog jättelång tid att
  // ladda in"). Render a small slice first so the screen paints instantly, then
  // fill in the rest once the open animation/interaction settles.
  const [showAllRows, setShowAllRows] = useState(false);
  useEffect(() => { setShowAllRows(false); }, [filter, continentFilter, search]);
  useEffect(() => {
    if (showAllRows) return;
    const task = InteractionManager.runAfterInteractions(() => setShowAllRows(true));
    return () => task.cancel();
  }, [showAllRows, filtered]);
  const visibleRows = showAllRows ? filtered : filtered.slice(0, 24);

  function openSheet(country: Country) {
    setSheetCountry(country);
    setSheetVisible(true);
  }

  function handleStatusSelect(status: CountryStatus) {
    if (!sheetCountry) return;
    setStatusMap((prev) => {
      const next = { ...prev };
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
    setFilter('all');
  }

  function handleAddPress() {
    scrollRef.current?.scrollTo({ y: Math.max(listAnchorY.current - 12, 0), animated: true });
    setTimeout(() => searchInputRef.current?.focus(), 350);
  }

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
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <ScrollView
        ref={scrollRef}
        style={[styles.screen, { backgroundColor: '#F7F3EC' }]}
        contentContainerStyle={[
          styles.content,
          { paddingTop: Math.max(insets.top, 16) + 8, paddingBottom: Math.max(insets.bottom, 20) + 112 },
        ]}
        showsVerticalScrollIndicator={false}
        {...scrollViewProps}>

        {/* Back navigation */}
        <TouchableOpacity style={styles.backRow} activeOpacity={0.7} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color="#1B1E28" />
          <Text style={styles.backText}>{t('profile.title')}</Text>
        </TouchableOpacity>

        {/* Title block */}
        {/* "Resespårning" is one long word with no space to wrap at — unlike
            "Travel Tracker" — so at this fontSize it could break mid-word.
            Shrink to fit instead of wrapping. */}
        <Text style={styles.bigTitle} numberOfLines={1} adjustsFontSizeToFit>
          {t('travel.title')}
        </Text>

        {/* Dark stats card */}
        <View style={styles.heroCard}>
          <View style={styles.heroStat}>
            <Text style={styles.heroStatLabel} numberOfLines={1} adjustsFontSizeToFit>{t('travel.visitedStat')}</Text>
            <View style={styles.heroStatValueRow}>
              <Text style={styles.heroStatBig}>{visitedCount}</Text>
              <Text style={styles.heroStatSmall}>{t('travel.countriesUnit')}</Text>
            </View>
          </View>

          <View style={styles.heroDivider} />

          <View style={styles.heroStat}>
            <Text style={styles.heroStatLabel} numberOfLines={1} adjustsFontSizeToFit>{t('travel.continentsStat')}</Text>
            <View style={styles.heroStatValueRow}>
              <Text style={styles.heroStatBig}>{continentsVisited}</Text>
              <Text style={styles.heroStatSmall}>{t('travel.ofTotal', { total: TOTAL_CONTINENTS })}</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.addButton} activeOpacity={0.85} onPress={handleAddPress}>
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.addButtonText}>{t('common.add')}</Text>
          </TouchableOpacity>
        </View>

        {/* By Continent grid */}
        <Text style={styles.sectionEyebrow}>{t('travel.byContinent')}</Text>
        <WorldOverview
          statusMap={mergedMap}
          onContinentPress={handleContinentFilter}
          activeContinentFilter={continentFilter}
        />

        {/* Countries section anchor */}
        <View onLayout={(e) => { listAnchorY.current = e.nativeEvent.layout.y; }}>
          <Text style={[styles.sectionEyebrow, { marginTop: 28 }]}>{t('travel.countriesEyebrow')}</Text>

          <View style={styles.filterRow}>
            {(['all', 'visited', 'planned', 'living'] as Filter[]).map((f) => {
              const isActive = filter === f && !continentFilter;
              return (
                <Animated.View key={f} style={{ transform: [{ scale: filterScaleAnims[f] }] }}>
                  <TouchableOpacity
                    style={[
                      styles.filterChip,
                      isActive && { backgroundColor: PRIMARY_COLOR, borderColor: PRIMARY_COLOR },
                    ]}
                    activeOpacity={0.8}
                    onPress={() => pressFilter(f)}>
                    <Text style={[styles.filterChipText, isActive && { color: '#fff' }]}>
                      {t(FILTER_LABEL_KEY[f])}
                    </Text>
                  </TouchableOpacity>
                </Animated.View>
              );
            })}
          </View>

          <View style={styles.searchWrap}>
            <Ionicons name="search-outline" size={18} color="#9AA2AE" />
            <TextInput
              ref={searchInputRef}
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder={t('travel.search_countries')}
              placeholderTextColor="#B0B7C3"
              autoCapitalize="none"
              autoCorrect={false}
              onFocus={onFocusField(searchInputRef)}
              returnKeyType="search"
              onSubmitEditing={() => Keyboard.dismiss()}
            />
            {search.length > 0 ? (
              <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color="#B0B7C3" />
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={styles.countryList}>
            {filtered.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="globe-outline" size={40} color="#9AA2AE" style={{ marginBottom: 10 }} />
                <Text style={styles.emptyText}>{t('travel.noCountriesMatch')}</Text>
              </View>
            ) : (
              visibleRows.map((entry, index) => {
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
                        {fromTrip ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Ionicons name="airplane" size={11} color="#9AA2AE" />
                            <Text style={styles.fromTripLabel}>{t('travel.fromTrip')}</Text>
                          </View>
                        ) : null}
                      </View>
                      {entry.status !== 'none' ? (
                        <StatusBadge status={entry.status} />
                      ) : (
                        <Ionicons name="chevron-forward" size={18} color="#C8CDD8" />
                      )}
                    </TouchableOpacity>
                  </View>
                );
              })
            )}
          </View>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>

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

function StatusBadge({ status }: { status: CountryStatus }) {
  const { t } = useI18n();
  const config: Record<CountryStatus, { bg: string; color: string } | null> = {
    none:    null,
    visited: { bg: PRIMARY_12,  color: PRIMARY_COLOR },
    planned: { bg: SECONDARY_12, color: SECONDARY_COLOR },
    living:  { bg: '#FEF3C7', color: '#D97706' },
  };
  const labelKey: Record<CountryStatus, string> = {
    none: '',
    visited: 'travel.visited',
    planned: 'travel.planned',
    living: 'travel.livingHere',
  };
  const c = config[status];
  if (!c) return null;
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <Text style={[styles.badgeText, { color: c.color }]}>{t(labelKey[status])}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    flexGrow: 1,
    paddingHorizontal: 20,
  },

  // Back nav
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginBottom: 18,
    paddingVertical: 4,
    paddingRight: 8,
  },
  backText: {
    fontSize: 16,
    color: '#1B1E28',
    fontWeight: '500',
    marginLeft: 2,
  },

  // Title
  eyebrow: {
    fontSize: 12,
    fontWeight: '800',
    color: PRIMARY_COLOR,
    letterSpacing: 2.2,
    marginBottom: 8,
  },
  bigTitle: {
    fontSize: 44,
    fontWeight: '900',
    color: '#141720',
    lineHeight: 50,
    letterSpacing: -1.4,
    marginBottom: 22,
  },

  // Dark hero card
  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1B1E28',
    borderRadius: 24,
    paddingHorizontal: 22,
    paddingVertical: 20,
    marginBottom: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 8,
    overflow: 'hidden',
  },
  heroStat: {
    flex: 1,
  },
  heroStatLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#9AA2AE',
    letterSpacing: 1.0,
    marginBottom: 6,
  },
  heroStatValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  heroStatBig: {
    fontSize: 30,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: -1.2,
  },
  heroStatSmall: {
    fontSize: 12,
    color: '#C8CDD8',
    fontWeight: '500',
  },
  heroDivider: {
    width: 1,
    height: 38,
    backgroundColor: '#2E323D',
    marginHorizontal: 16,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: PRIMARY_COLOR,
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginLeft: 14,
  },
  addButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.2,
  },

  // Section eyebrow
  sectionEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    color: '#9AA2AE',
    letterSpacing: 2,
    marginBottom: 14,
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
  countryNameWrap: { flex: 1 },
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
  emptyText: {
    fontSize: 15,
    color: '#9AA2AE',
    fontWeight: '500',
  },
});
