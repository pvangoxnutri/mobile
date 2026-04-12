/**
 * WorldOverview — continent-based summary used as the world map placeholder.
 *
 * Architecture contract:
 *   props: { statusMap, onContinentPress }
 *
 * When a real interactive map is plugged in, replace this file's default
 * export while keeping the same props interface so the parent screen needs
 * no changes.
 */

import { TouchableOpacity, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useAppTheme } from '@/contexts/app-theme-context';
import { COUNTRIES, CONTINENT_ORDER, inContinent, type Continent, type StatusMap } from './country-data';

interface ContinentStats {
  continent: Continent;
  total: number;
  visited: number;
  planned: number;
  living: boolean;
}

interface WorldOverviewProps {
  statusMap: StatusMap;
  /** Called when the user taps a continent card — parent can use to filter the list */
  onContinentPress: (continent: Continent | null) => void;
  activeContinentFilter: Continent | null;
}

// Rough geographic emoji / icon for each continent
const CONTINENT_META: Record<Continent, { emoji: string; color: string; lightBg: string }> = {
  Europe:          { emoji: '🏰', color: '#3B82F6', lightBg: '#EFF6FF' },
  Asia:            { emoji: '🏯', color: '#8B5CF6', lightBg: '#F5F3FF' },
  Africa:          { emoji: '🌍', color: '#F59E0B', lightBg: '#FFFBEB' },
  'North America': { emoji: '🗽', color: '#10B981', lightBg: '#ECFDF5' },
  'South America': { emoji: '🌿', color: '#06B6D4', lightBg: '#ECFEFF' },
  Oceania:         { emoji: '🌊', color: '#F97316', lightBg: '#FFF7ED' },
};

function buildStats(statusMap: StatusMap): ContinentStats[] {
  return CONTINENT_ORDER.map((continent) => {
    const countries = COUNTRIES.filter((c) => inContinent(c, continent));
    const visited = countries.filter((c) => statusMap[c.code] === 'visited').length;
    const planned = countries.filter((c) => statusMap[c.code] === 'planned').length;
    const living  = countries.some((c) => statusMap[c.code] === 'living');
    return { continent, total: countries.length, visited, planned, living };
  });
}

export default function WorldOverview({ statusMap, onContinentPress, activeContinentFilter }: WorldOverviewProps) {
  const theme = useAppTheme();
  const { width } = useWindowDimensions();
  const stats = buildStats(statusMap);
  const cardWidth = (width - 40 - 10) / 2; // 2 columns, 20px side padding, 10px gap

  const totalVisited = Object.values(statusMap).filter((s) => s === 'visited').length;
  const totalPlanned = Object.values(statusMap).filter((s) => s === 'planned').length;
  const totalLiving  = Object.values(statusMap).filter((s) => s === 'living').length;
  const totalCountries = COUNTRIES.length;

  return (
    <View>
      {/* ── Global progress banner ─────────────────────────────────────────── */}
      <View style={[styles.progressBanner, { borderColor: theme.primary20 }]}>
        <View style={styles.progressRow}>
          <View style={styles.progressItem}>
            <Text style={[styles.progressValue, { color: theme.primary }]}>{totalVisited}</Text>
            <Text style={styles.progressLabel}>visited</Text>
          </View>
          <View style={styles.progressDivider} />
          <View style={styles.progressItem}>
            <Text style={[styles.progressValue, { color: theme.secondary }]}>{totalPlanned}</Text>
            <Text style={styles.progressLabel}>planned</Text>
          </View>
          <View style={styles.progressDivider} />
          <View style={styles.progressItem}>
            <Text style={[styles.progressValue, { color: '#D97706' }]}>{totalLiving}</Text>
            <Text style={styles.progressLabel}>living</Text>
          </View>
          <View style={styles.progressDivider} />
          <View style={styles.progressItem}>
            <Text style={[styles.progressValue, { color: '#A0A7B3' }]}>{totalCountries - totalVisited - totalPlanned - totalLiving}</Text>
            <Text style={styles.progressLabel}>unexplored</Text>
          </View>
        </View>

        {/* Progress track */}
        <View style={styles.track}>
          {totalVisited > 0 ? (
            <View style={[styles.trackFill, { flex: totalVisited, backgroundColor: theme.primary }]} />
          ) : null}
          {totalPlanned > 0 ? (
            <View style={[styles.trackFill, { flex: totalPlanned, backgroundColor: theme.secondary }]} />
          ) : null}
          {totalLiving > 0 ? (
            <View style={[styles.trackFill, { flex: totalLiving, backgroundColor: '#D97706' }]} />
          ) : null}
          <View style={[styles.trackFill, { flex: Math.max(totalCountries - totalVisited - totalPlanned - totalLiving, 0), backgroundColor: '#EEF0F4' }]} />
        </View>
      </View>

      {/* ── All-continents chip ───────────────────────────────────────────── */}
      <TouchableOpacity
        style={[styles.allChip, activeContinentFilter === null && { backgroundColor: theme.primary12, borderColor: theme.primary20 }]}
        activeOpacity={0.75}
        onPress={() => onContinentPress(null)}>
        <Text style={[styles.allChipText, activeContinentFilter === null && { color: theme.primary }]}>🌐  All continents</Text>
      </TouchableOpacity>

      {/* ── 2-column continent grid ───────────────────────────────────────── */}
      <View style={styles.grid}>
        {stats.map((s) => {
          const meta = CONTINENT_META[s.continent];
          const isActive = activeContinentFilter === s.continent;
          const hasActivity = s.visited > 0 || s.planned > 0 || s.living;

          return (
            <TouchableOpacity
              key={s.continent}
              style={[
                styles.continentCard,
                { width: cardWidth },
                isActive && { borderColor: meta.color, backgroundColor: meta.lightBg },
              ]}
              activeOpacity={0.78}
              onPress={() => onContinentPress(isActive ? null : s.continent)}>

              {/* Emoji icon */}
              <Text style={styles.continentEmoji}>{meta.emoji}</Text>

              {/* Name */}
              <Text style={styles.continentName} numberOfLines={1}>{s.continent}</Text>

              {/* Stats row */}
              <View style={styles.cardStatsRow}>
                {s.visited > 0 ? (
                  <View style={[styles.miniTag, { backgroundColor: meta.lightBg }]}>
                    <View style={[styles.miniDot, { backgroundColor: meta.color }]} />
                    <Text style={[styles.miniTagText, { color: meta.color }]}>{s.visited}</Text>
                  </View>
                ) : null}
                {s.living ? (
                  <View style={[styles.miniTag, { backgroundColor: '#FEF3C7' }]}>
                    <Text style={styles.miniTagText}>🏠</Text>
                  </View>
                ) : null}
              </View>

              {/* Progress bar */}
              <View style={styles.cardTrack}>
                <View
                  style={[
                    styles.cardTrackFill,
                    { width: `${Math.round(((s.visited + s.planned) / s.total) * 100)}%`, backgroundColor: meta.color },
                  ]}
                />
              </View>

              <Text style={styles.cardMeta}>
                {hasActivity ? `${s.visited + s.planned} / ${s.total}` : `${s.total} countries`}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  progressBanner: {
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: '#fff',
    paddingHorizontal: 18,
    paddingVertical: 16,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 3,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  progressItem: {
    flex: 1,
    alignItems: 'center',
  },
  progressValue: {
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -1,
  },
  progressLabel: {
    marginTop: 2,
    fontSize: 11,
    color: '#9AA2AE',
    fontWeight: '600',
    letterSpacing: 0.4,
  },
  progressDivider: {
    width: 1,
    height: 36,
    backgroundColor: '#EDF0F5',
  },
  track: {
    flexDirection: 'row',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    gap: 1,
  },
  trackFill: {
    borderRadius: 3,
  },
  allChip: {
    alignSelf: 'flex-start',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E8EAF0',
    backgroundColor: '#F6F7FA',
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 12,
  },
  allChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  continentCard: {
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: '#ECEEF3',
    backgroundColor: '#fff',
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 3,
  },
  continentEmoji: {
    fontSize: 28,
    marginBottom: 8,
  },
  continentName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#141720',
    letterSpacing: -0.3,
    marginBottom: 6,
  },
  cardStatsRow: {
    flexDirection: 'row',
    gap: 5,
    marginBottom: 10,
    minHeight: 22,
  },
  miniTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  miniDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  miniTagText: {
    fontSize: 11,
    fontWeight: '700',
  },
  cardTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#EEF0F4',
    overflow: 'hidden',
    marginBottom: 6,
  },
  cardTrackFill: {
    height: 4,
    borderRadius: 2,
  },
  cardMeta: {
    fontSize: 11,
    color: '#9AA2AE',
    fontWeight: '600',
  },
});
