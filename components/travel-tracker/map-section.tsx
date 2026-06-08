/**
 * WorldOverview - continent-based summary grid.
 * Each card shows a continent with an illustrative icon, a soft watermark,
 * a checkmark badge when visited, and a slim progress bar.
 */

import { TouchableOpacity, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

import { COUNTRIES, CONTINENT_ORDER, inContinent, type Continent, type StatusMap } from './country-data';
import { getLocalizedContinentShortName } from './country-i18n';
import { useI18n } from '@/components/i18n-provider';
import { PRIMARY_COLOR } from '@/constants/colors';

interface ContinentStats {
  continent: Continent;
  total: number;
  visited: number;
  planned: number;
  living: boolean;
}

interface WorldOverviewProps {
  statusMap: StatusMap;
  onContinentPress: (continent: Continent | null) => void;
  activeContinentFilter: Continent | null;
}

interface ContinentMeta {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  color: string;
  lightBg: string;
  shortName: string;
}

const CONTINENT_META: Record<Continent, ContinentMeta> = {
  Europe:          { icon: 'castle',             color: '#7C6FE0', lightBg: '#EFEEFB', shortName: 'Europe' },
  Asia:            { icon: 'temple-buddhist',    color: '#E47A8B', lightBg: '#FCEEF1', shortName: 'Asia' },
  Africa:          { icon: 'tree',               color: '#D4943C', lightBg: '#FBF1DE', shortName: 'Africa' },
  'North America': { icon: 'image-filter-hdr',   color: '#5A6472', lightBg: '#EEF0F4', shortName: 'N. America' },
  'South America': { icon: 'palm-tree',          color: '#A57DC8', lightBg: '#F3ECF8', shortName: 'S. America' },
  Oceania:         { icon: 'waves',              color: '#5DA9D1', lightBg: '#E6F1F8', shortName: 'Oceania' },
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
  const { width } = useWindowDimensions();
  const stats = buildStats(statusMap);
  const cardWidth = (width - 40 - 12) / 2; // 2 columns, 20px side padding, 12px gap

  const { language } = useI18n();

  return (
    <View style={styles.grid}>
      {stats.map((s) => {
        const meta = CONTINENT_META[s.continent];
        const isActive = activeContinentFilter === s.continent;
        const hasVisited = s.visited > 0 || s.living;
        const progressPct = Math.round(((s.visited + s.planned) / s.total) * 100);

        return (
          <TouchableOpacity
            key={s.continent}
            style={[
              styles.card,
              { width: cardWidth },
              isActive && { borderColor: meta.color, borderWidth: 2 },
            ]}
            activeOpacity={0.85}
            onPress={() => onContinentPress(isActive ? null : s.continent)}>

            {/* Background watermark icon */}
            <View pointerEvents="none" style={styles.watermark}>
              <MaterialCommunityIcons
                name={meta.icon}
                size={130}
                color={meta.color}
                style={{ opacity: 0.10 }}
              />
            </View>

            {/* Foreground icon tile + checkmark badge */}
            <View style={styles.iconTileWrap}>
              <View style={[styles.iconTile, { backgroundColor: meta.lightBg }]}>
                <MaterialCommunityIcons name={meta.icon} size={26} color={meta.color} />
              </View>
              {hasVisited ? (
                <View style={styles.checkBadge}>
                  <Ionicons name="checkmark" size={11} color="#fff" />
                </View>
              ) : null}
            </View>

            {/* Name */}
            <Text style={styles.cardName} numberOfLines={1}>{getLocalizedContinentShortName(s.continent, language)}</Text>

            {/* Stats row */}
            <View style={styles.statsRow}>
              <Text style={[styles.statsValue, hasVisited && { color: PRIMARY_COLOR }]}>
                {s.visited}
              </Text>
              <Text style={styles.statsOf}> of {s.total}</Text>
            </View>

            {/* Progress bar */}
            <View style={styles.track}>
              {progressPct > 0 ? (
                <View
                  style={[
                    styles.trackFill,
                    { width: `${progressPct}%`, backgroundColor: PRIMARY_COLOR },
                  ]}
                />
              ) : null}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  card: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#ECE7DD',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    overflow: 'hidden',
    minHeight: 150,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  watermark: {
    position: 'absolute',
    right: -18,
    top: -8,
  },
  iconTileWrap: {
    width: 48,
    height: 48,
    marginBottom: 14,
  },
  iconTile: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: PRIMARY_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  cardName: {
    fontSize: 17,
    fontWeight: '800',
    color: '#141720',
    letterSpacing: -0.4,
    marginBottom: 4,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 10,
  },
  statsValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#141720',
    letterSpacing: -0.3,
  },
  statsOf: {
    fontSize: 13,
    color: '#8A909D',
    fontWeight: '500',
  },
  track: {
    height: 2,
    borderRadius: 1,
    backgroundColor: '#ECE7DD',
    overflow: 'hidden',
  },
  trackFill: {
    height: 2,
    borderRadius: 1,
  },
});
