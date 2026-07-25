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
import { useTheme } from '@/components/theme-provider';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { AppTheme } from '@/constants/themes';

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
  // Dark-mode variants of the SAME hue: the continent palette is the
  // product's data-viz identity, so dark lifts each color for readability on
  // dark surfaces (never grays it out) and swaps the pastel tile for a tinted
  // wash of the lifted hue.
  darkColor: string;
  darkBg: string;
  shortName: string;
}

const CONTINENT_META: Record<Continent, ContinentMeta> = {
  Europe:          { icon: 'castle',             color: '#7C6FE0', lightBg: '#EFEEFB', darkColor: '#978cea', darkBg: 'rgba(151,140,234,0.16)', shortName: 'Europe' },
  Asia:            { icon: 'temple-buddhist',    color: '#E47A8B', lightBg: '#FCEEF1', darkColor: '#ee92a1', darkBg: 'rgba(238,146,161,0.16)', shortName: 'Asia' },
  Africa:          { icon: 'tree',               color: '#D4943C', lightBg: '#FBF1DE', darkColor: '#e0a851', darkBg: 'rgba(224,168,81,0.16)', shortName: 'Africa' },
  'North America': { icon: 'image-filter-hdr',   color: '#5A6472', lightBg: '#EEF0F4', darkColor: '#8f99a8', darkBg: 'rgba(143,153,168,0.16)', shortName: 'N. America' },
  'South America': { icon: 'palm-tree',          color: '#A57DC8', lightBg: '#F3ECF8', darkColor: '#b795d6', darkBg: 'rgba(183,149,214,0.16)', shortName: 'S. America' },
  Oceania:         { icon: 'waves',              color: '#5DA9D1', lightBg: '#E6F1F8', darkColor: '#74bde2', darkBg: 'rgba(116,189,226,0.16)', shortName: 'Oceania' },
  Antarctica:      { icon: 'snowflake',          color: '#4E8FA6', lightBg: '#E8F3F6', darkColor: '#78B8CC', darkBg: 'rgba(120,184,204,0.16)', shortName: 'Antarctica' },
};

function buildStats(statusMap: StatusMap): ContinentStats[] {
  return CONTINENT_ORDER.map((continent) => {
    const countries = COUNTRIES.filter((c) => inContinent(c, continent));
    // 'living' counts as visited so the continent tallies sum up to the
    // hero stat's visited total (which also includes the home country).
    const visited = countries.filter((c) => statusMap[c.code] === 'visited' || statusMap[c.code] === 'living').length;
    const planned = countries.filter((c) => statusMap[c.code] === 'planned').length;
    const living  = countries.some((c) => statusMap[c.code] === 'living');
    return { continent, total: countries.length, visited, planned, living };
  });
}

export default function WorldOverview({ statusMap, onContinentPress, activeContinentFilter }: WorldOverviewProps) {
  const { width } = useWindowDimensions();
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const stats = buildStats(statusMap);
  const cardWidth = (width - 40 - 2 * 10) / 3; // 3 columns, 20px side padding, 10px gaps — ~30% smaller than the old 2-column layout

  const { language, t } = useI18n();

  return (
    <View style={styles.grid}>
      {stats.map((s) => {
        const meta = CONTINENT_META[s.continent];
        // Same hue in both themes — dark just lifts it for readability.
        const continentColor = theme.isDark ? meta.darkColor : meta.color;
        const tileBg = theme.isDark ? meta.darkBg : meta.lightBg;
        const isActive = activeContinentFilter === s.continent;
        const hasVisited = s.visited > 0 || s.living;
        const progressPct = Math.round(((s.visited + s.planned) / s.total) * 100);

        return (
          <TouchableOpacity
            key={s.continent}
            style={[
              styles.card,
              { width: cardWidth },
              isActive && { borderColor: continentColor, borderWidth: 2 },
            ]}
            activeOpacity={0.85}
            onPress={() => onContinentPress(isActive ? null : s.continent)}>

            {/* Background watermark icon */}
            <View pointerEvents="none" style={styles.watermark}>
              <MaterialCommunityIcons
                name={meta.icon}
                size={90}
                color={continentColor}
                style={{ opacity: 0.10 }}
              />
            </View>

            {/* Foreground icon tile + checkmark badge */}
            <View style={styles.iconTileWrap}>
              <View style={[styles.iconTile, { backgroundColor: tileBg }]}>
                <MaterialCommunityIcons name={meta.icon} size={18} color={continentColor} />
              </View>
              {hasVisited ? (
                <View style={styles.checkBadge}>
                  <Ionicons name="checkmark" size={8} color={theme.colors.white} />
                </View>
              ) : null}
            </View>

            {/* Name */}
            <Text style={styles.cardName} numberOfLines={1}>{getLocalizedContinentShortName(s.continent, language)}</Text>

            {/* Stats row */}
            <View style={styles.statsRow}>
              <Text style={[styles.statsValue, hasVisited && { color: theme.colors.primary }]}>
                {s.visited}
              </Text>
              <Text style={styles.statsOf}> {t('travel.ofTotal', { total: s.total })}</Text>
            </View>

            {/* Progress bar */}
            <View style={styles.track}>
              {progressPct > 0 ? (
                <View
                  style={[
                    styles.trackFill,
                    { width: `${progressPct}%`, backgroundColor: theme.colors.primary },
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

const createStyles = (theme: AppTheme) => StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    // Light keeps the warm parchment-tinted border of this screen; dark uses
    // the standard hairline ring, with Android elevation zeroed (dark
    // separates via surface contrast, not gray shadow boxes).
    borderColor: theme.isDark ? theme.colors.borderPrimary : '#ECE7DD',
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 11,
    paddingTop: 11,
    paddingBottom: 10,
    overflow: 'hidden',
    minHeight: 108,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: theme.isDark ? 0 : 3,
  },
  watermark: {
    position: 'absolute',
    right: -12,
    top: -6,
  },
  iconTileWrap: {
    width: 34,
    height: 34,
    marginBottom: 10,
  },
  iconTile: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    // The ring cuts the badge out of the card surface it sits on.
    borderColor: theme.isDark ? theme.colors.surface : '#fff',
  },
  cardName: {
    fontSize: 12,
    fontWeight: '800',
    color: theme.isDark ? theme.colors.textPrimary : '#141720',
    letterSpacing: -0.3,
    marginBottom: 3,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 7,
  },
  statsValue: {
    fontSize: 11,
    fontWeight: '800',
    color: theme.isDark ? theme.colors.textPrimary : '#141720',
    letterSpacing: -0.2,
  },
  statsOf: {
    fontSize: 10,
    color: theme.isDark ? theme.colors.textMeta : '#8A909D',
    fontWeight: '500',
  },
  track: {
    height: 2,
    borderRadius: 1,
    // Progress track: warm parchment tint in light, standard subtle fill in
    // dark — the pink fill provides the signal in both.
    backgroundColor: theme.isDark ? theme.colors.bgLight : '#ECE7DD',
    overflow: 'hidden',
  },
  trackFill: {
    height: 2,
    borderRadius: 1,
  },
});
