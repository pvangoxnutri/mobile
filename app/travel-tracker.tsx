import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { getTravelTrackerLivingColors } from '@/components/travel-tracker/status-colors';
import WorldGlobe from '@/components/travel-tracker/world-globe';
import {
  compareCountriesByLocalizedName,
  getLocalizedCountryName,
} from '@/components/travel-tracker/country-i18n';
import {
  getCountryFlag,
  inContinent,
  buildEntries,
  type Continent,
  type Country,
  type CountryStatus,
  type StatusMap,
} from '@/components/travel-tracker/country-data';
import {
  computeTravelStats,
  deriveTripStatusMap,
  getPrimaryLivingCountryCode,
  mergeStatusMaps,
  sanitizeStatusMap,
  setCountryStatus,
  TRAVEL_TRACKER_STORAGE_KEY,
} from '@/components/travel-tracker/travel-tracker-state';
import TravelStatsSummary from '@/components/travel-tracker/travel-stats-summary';
import { pushOwnTravelStats } from '@/lib/travel-stats-api';
import { useKeyboardFocusScroll } from '@/hooks/useKeyboardFocusScroll';
import { apiJson } from '@/lib/api';
import type { Quest } from '@/lib/types';
import { useTheme } from '@/components/theme-provider';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { AppTheme } from '@/constants/themes';

type Filter = 'all' | 'visited' | 'planned' | 'living';

const STORAGE_KEY = TRAVEL_TRACKER_STORAGE_KEY;

const FILTER_LABEL_KEY: Record<Filter, string> = {
  all: 'travel.filterAll',
  visited: 'travel.visited',
  planned: 'travel.planned',
  living: 'travel.filterLiving',
};


export default function TravelTrackerScreen() {
  const { t, language } = useI18n();
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const livingColors = getTravelTrackerLivingColors(theme);
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
      .then((raw) => { if (raw) setStatusMap(sanitizeStatusMap(JSON.parse(raw))); })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    void apiJson<Quest[]>('/api/trips')
      .then((trips) => {
        const today = new Date().toISOString().slice(0, 10);
        setTripDerivedMap(deriveTripStatusMap(trips, today));
      })
      .catch((err: unknown) => {
        console.warn('[TRAVEL_TRACKER] Failed to load trip-derived countries:', err instanceof Error ? err.message : err);
      });
  }, []);

  useEffect(() => {
    if (!ready) return;
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(statusMap));
  }, [statusMap, ready]);

  // Sync ONLY the aggregate numbers to the backend (debounced) so other
  // members' profiles can show them — the country list itself never leaves
  // the device. Derived from the same mergedMap the screen renders.
  useEffect(() => {
    if (!ready) return;
    const merged = mergeStatusMaps(tripDerivedMap, statusMap);
    const aggregate = computeTravelStats(merged);
    const handle = setTimeout(() => {
      pushOwnTravelStats({
        countriesVisited: aggregate.countriesVisited,
        continentsReached: aggregate.continentsReached,
      });
    }, 1500);
    return () => clearTimeout(handle);
  }, [statusMap, tripDerivedMap, ready]);

  const mergedMap = useMemo<StatusMap>(
    () => mergeStatusMaps(tripDerivedMap, statusMap),
    [tripDerivedMap, statusMap],
  );
  const initialGlobeFocusCode = ready
    ? getPrimaryLivingCountryCode(statusMap)
    : undefined;
  const entries = useMemo(
    () => buildEntries(mergedMap).map((entry) => ({
      ...entry,
      name: getLocalizedCountryName(entry, language),
    })),
    [language, mergedMap],
  );

  // 'living' counts as visited: a country holds ONE status, so marking your
  // home country as "living here" would otherwise silently drop it from the
  // visited tally.
  const travelStats = useMemo(() => computeTravelStats(mergedMap), [mergedMap]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries
      .filter((e) => {
        if (filter !== 'all' && e.status !== filter) return false;
        if (continentFilter && !inContinent(e, continentFilter)) return false;
        if (q && !e.name.toLowerCase().includes(q) && !e.code.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => compareCountriesByLocalizedName(a, b, language));
  }, [entries, filter, continentFilter, language, search]);

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

  const openSheet = useCallback((country: Country) => {
    setSheetCountry(country);
    setSheetVisible(true);
  }, []);

  function handleStatusSelect(status: CountryStatus) {
    if (!sheetCountry) return;
    setStatusMap((prev) => setCountryStatus(prev, sheetCountry.code, status));
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
        style={styles.screen}
        contentContainerStyle={[
          styles.content,
          { paddingTop: Math.max(insets.top, 16) + 8, paddingBottom: Math.max(insets.bottom, 20) + 112 },
        ]}
        showsVerticalScrollIndicator={false}
        {...scrollViewProps}>

        {/* Back navigation */}
        <TouchableOpacity style={styles.backRow} activeOpacity={0.7} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={theme.isDark ? theme.colors.textPrimary : '#1B1E28'} />
          <Text style={styles.backText}>{t('profile.title')}</Text>
        </TouchableOpacity>

        <WorldGlobe
          statusMap={mergedMap}
          activeCode={sheetVisible ? (sheetCountry?.code ?? null) : null}
          initialFocusCode={initialGlobeFocusCode}
          onCountryPress={openSheet}
        />

        {/* Travel summary — the shared TravelStatsSummary band (also used
            on profiles), visually a different species from the continent
            cards below. Ranking stays off until a real backend sample
            exists (see the old device-local note); the component then
            renders the product-specified continents fallback. */}
        <View style={styles.summaryWrap}>
          <TravelStatsSummary
            countriesVisited={travelStats.countriesVisited}
            worldExploredPercent={travelStats.worldExploredPercent}
            continentsReached={travelStats.continentsReached}
            totalContinents={travelStats.totalContinents}
            rankingAvailable={false}
          />
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
          <View style={styles.countriesHeader}>
            <Text style={[styles.sectionEyebrow, styles.countriesHeading]}>{t('travel.countriesEyebrow')}</Text>
            <TouchableOpacity
              style={styles.addButton}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={t('travel.addCountryAccessibility')}
              onPress={handleAddPress}>
              <Ionicons name="add" size={17} color={theme.colors.white} />
              <Text style={styles.addButtonText}>{t('common.add')}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.filterRow}>
            {(['all', 'visited', 'planned', 'living'] as Filter[]).map((f) => {
              const isActive = filter === f && !continentFilter;
              const activeBackground = f === 'living'
                ? livingColors.accent
                : theme.colors.primary;
              const activeTextColor = f === 'living'
                ? livingColors.onAccent
                : theme.colors.white;
              return (
                <Animated.View key={f} style={{ transform: [{ scale: filterScaleAnims[f] }] }}>
                  <TouchableOpacity
                    style={[
                      styles.filterChip,
                      isActive && {
                        backgroundColor: activeBackground,
                        borderColor: activeBackground,
                      },
                    ]}
                    activeOpacity={0.8}
                    onPress={() => pressFilter(f)}>
                    <Text style={[styles.filterChipText, isActive && { color: activeTextColor }]}>
                      {t(FILTER_LABEL_KEY[f])}
                    </Text>
                  </TouchableOpacity>
                </Animated.View>
              );
            })}
          </View>

          <View style={styles.searchWrap}>
            <Ionicons name="search-outline" size={18} color={theme.isDark ? theme.colors.textMeta : '#9AA2AE'} />
            <TextInput
              ref={searchInputRef}
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder={t('travel.search_countries')}
              placeholderTextColor={theme.isDark ? theme.colors.placeholderText : '#B0B7C3'}
              keyboardAppearance={theme.keyboardAppearance}
              autoCapitalize="none"
              autoCorrect={false}
              onFocus={onFocusField(searchInputRef)}
              returnKeyType="search"
              onSubmitEditing={() => Keyboard.dismiss()}
            />
            {search.length > 0 ? (
              <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={theme.isDark ? theme.colors.textMuted : '#B0B7C3'} />
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={styles.countryList}>
            {filtered.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="globe-outline" size={40} color={theme.isDark ? theme.colors.textMeta : '#9AA2AE'} style={{ marginBottom: 10 }} />
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
                            <Ionicons name="airplane" size={11} color={theme.isDark ? theme.colors.textMeta : '#9AA2AE'} />
                            <Text style={styles.fromTripLabel}>{t('travel.fromTrip')}</Text>
                          </View>
                        ) : null}
                      </View>
                      {entry.status !== 'none' ? (
                        <StatusBadge status={entry.status} />
                      ) : (
                        <Ionicons name="chevron-forward" size={18} color={theme.isDark ? theme.colors.textMuted : '#C8CDD8'} />
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
        currentStatus={sheetCountry ? (mergedMap[sheetCountry.code] ?? 'none') : 'none'}
        visible={sheetVisible}
        onSelect={handleStatusSelect}
        onClose={() => setSheetVisible(false)}
      />
    </>
  );
}

function StatusBadge({ status }: { status: CountryStatus }) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const livingColors = getTravelTrackerLivingColors(theme);
  // Status hues are semantic identity — visited stays brand pink, planned
  // stays teal, and living uses the shared Travel Tracker yellow in both
  // themes rather than borrowing an unrelated reservation/warning token.
  const config: Record<CountryStatus, { bg: string; color: string } | null> = {
    none:    null,
    visited: { bg: theme.colors.primaryLight12, color: theme.colors.primary },
    planned: {
      bg: theme.isDark ? 'rgba(34,174,199,0.16)' : 'rgba(13, 144, 168, 0.12)',
      color: theme.colors.secondary,
    },
    living:  {
      bg: livingColors.surface,
      color: livingColors.accent,
    },
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

const createStyles = (theme: AppTheme) => StyleSheet.create({
  // Light keeps the screen's signature warm parchment page; dark uses the
  // standard app page background (warm cream doesn't translate to dark).
  screen: { flex: 1, backgroundColor: theme.isDark ? theme.colors.bgPrimary : '#F7F3EC' },
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
    color: theme.isDark ? theme.colors.textPrimary : '#1B1E28',
    fontWeight: '500',
    marginLeft: 2,
  },

  // Title
  eyebrow: {
    fontSize: 12,
    fontWeight: '800',
    color: theme.colors.primary,
    letterSpacing: 2.2,
    marginBottom: 8,
  },
  summaryWrap: {
    marginTop: 10,
    marginBottom: 28,
  },
  countriesHeader: {
    marginTop: 28,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  countriesHeading: {
    marginBottom: 0,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.colors.primary,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  addButtonText: {
    fontSize: 13,
    fontWeight: '700',
    // White on the pink button in both themes.
    color: theme.colors.white,
    letterSpacing: -0.2,
  },

  // Section eyebrow
  sectionEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    color: theme.isDark ? theme.colors.textMeta : '#9AA2AE',
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
    // Light literal equals the borderInput token exactly.
    borderColor: theme.colors.borderInput,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  filterChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.isDark ? theme.colors.textSecondary : '#6B7280',
  },

  // Search
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    // Light literal equals the borderInput token exactly.
    borderColor: theme.colors.borderInput,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 14,
    height: 48,
    gap: 10,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    // Dark: the input border already defines the field — no gray elevation box.
    elevation: theme.isDark ? 0 : 2,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: theme.isDark ? theme.colors.textPrimary : '#1B1E28',
  },

  // Country list
  countryList: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: theme.isDark ? theme.colors.borderPrimary : '#ECEEF3',
    backgroundColor: theme.colors.surface,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 14,
    elevation: theme.isDark ? 0 : 4,
  },
  rowDivider: {
    height: 1,
    backgroundColor: theme.isDark ? theme.colors.borderPrimary : '#F3F5F9',
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
    color: theme.isDark ? theme.colors.textPrimary : '#1B1E28',
    fontWeight: '500',
    letterSpacing: -0.2,
  },
  fromTripLabel: {
    fontSize: 11,
    color: theme.isDark ? theme.colors.textMeta : '#9AA2AE',
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
    color: theme.isDark ? theme.colors.textMeta : '#9AA2AE',
    fontWeight: '500',
  },
});
