import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useI18n } from '@/components/i18n-provider';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { AppTheme } from '@/constants/themes';

/**
 * The one travel-summary presentation shared by the Travel Tracker, the
 * signed-in profile and other users' profiles.
 *
 * This component owns presentation only. Counts, percentages and ranking
 * availability stay with the parent so the three data paths cannot drift.
 * A rank is rendered only when the caller explicitly supplies a real one;
 * otherwise the compact badge uses the continents fallback.
 */
export type TravelStatsSummaryProps = {
  countriesVisited: number;
  worldExploredPercent: number;
  continentsReached: number;
  totalContinents: number;
  rankingPercentile?: number | null;
  rankingAvailable?: boolean;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
};

export default function TravelStatsSummary({
  countriesVisited,
  worldExploredPercent,
  continentsReached,
  totalContinents,
  rankingPercentile = null,
  rankingAvailable = false,
  loading = false,
  error = false,
  onRetry,
}: TravelStatsSummaryProps) {
  const { t } = useI18n();
  const styles = useThemedStyles(createStyles);

  if (loading) {
    return (
      <View style={styles.container} accessibilityLabel={t('travel.stats.title')}>
        <View style={styles.heroRow}>
          <View style={styles.heroCopy}>
            <View style={styles.skeletonValue} />
            <View style={styles.skeletonLabel} />
          </View>
          <View style={styles.skeletonBadge}>
            <View style={styles.skeletonBadgeValue} />
            <View style={styles.skeletonBadgeLabel} />
          </View>
        </View>
        <View style={styles.progressHeader}>
          <View style={styles.skeletonProgressLabel} />
          <View style={styles.skeletonProgressValue} />
        </View>
        <View style={styles.progressTrack} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, styles.errorContainer]}>
        <Text style={styles.errorText}>{t('travel.stats.loadError')}</Text>
        {onRetry ? (
          <TouchableOpacity
            onPress={onRetry}
            style={styles.retryButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.retryText}>{t('common.retry')}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }

  const showRanking =
    rankingAvailable && typeof rankingPercentile === 'number' && rankingPercentile > 0;
  const worldValue = `${worldExploredPercent.toFixed(1)}%`;
  // Only the visual fill is clamped. The supplied calculation remains the
  // displayed source of truth, including for boundary or unexpected values.
  const progressWidth = `${Math.max(0, Math.min(100, worldExploredPercent))}%` as const;
  const badgeValue = showRanking
    ? t('travel.stats.topPercent', { percent: rankingPercentile as number })
    : `${continentsReached}/${totalContinents}`;
  const badgeLabel = showRanking
    ? t('travel.stats.ofTravelers')
    : t('travel.continentsReachedLabel');

  return (
    <View style={styles.container} accessibilityLabel={t('travel.stats.title')}>
      <View style={styles.heroRow}>
        <View style={styles.heroCopy}>
          <Text
            style={styles.countryValue}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}>
            {countriesVisited}
          </Text>
          <Text style={styles.countryLabel}>{t('travel.countriesVisitedLabel')}</Text>
        </View>

        <View style={styles.badge}>
          <Ionicons
            name={showRanking ? 'trophy-outline' : 'earth-outline'}
            size={15}
            style={styles.badgeIcon}
          />
          <View style={styles.badgeCopy}>
            <Text
              style={styles.badgeValue}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.72}>
              {badgeValue}
            </Text>
            <Text style={styles.badgeLabel}>{badgeLabel}</Text>
          </View>
        </View>
      </View>

      <View style={styles.progressHeader}>
        <Text style={styles.progressLabel}>{t('travel.stats.worldExplored')}</Text>
        <Text
          style={styles.progressValue}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}>
          {worldValue}
        </Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: progressWidth }]} />
      </View>
    </View>
  );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  // The count, badge and progress line live on one continuous surface. This
  // keeps the summary visually distinct from the continent card grid.
  container: {
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.borderPrimary,
    backgroundColor: theme.colors.surfaceElevated,
    paddingHorizontal: 18,
    paddingTop: 17,
    paddingBottom: 16,
    ...theme.shadows.subtle,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  heroCopy: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  countryValue: {
    alignSelf: 'flex-start',
    color: theme.colors.primary,
    fontSize: 42,
    lineHeight: 45,
    fontWeight: '900',
    letterSpacing: -1.7,
    fontVariant: ['tabular-nums'],
  },
  countryLabel: {
    marginTop: 1,
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '600',
  },
  badge: {
    width: 112,
    maxWidth: '46%',
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    borderRadius: 16,
    backgroundColor: theme.isDark ? theme.colors.bgLight : theme.colors.bgLightest,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  badgeIcon: {
    color: theme.colors.secondary,
  },
  badgeCopy: {
    flex: 1,
    minWidth: 0,
  },
  badgeValue: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    lineHeight: 19,
    fontWeight: '800',
    letterSpacing: -0.4,
    fontVariant: ['tabular-nums'],
  },
  badgeLabel: {
    marginTop: 2,
    color: theme.isDark ? theme.colors.textSecondary : theme.colors.textPrimary,
    fontSize: 10.5,
    lineHeight: 13,
    fontWeight: '700',
  },
  progressHeader: {
    marginTop: 16,
    marginBottom: 7,
    minHeight: 17,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
  },
  progressLabel: {
    flex: 1,
    color: theme.colors.textSecondary,
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: '600',
  },
  progressValue: {
    flexShrink: 1,
    color: theme.colors.textPrimary,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  progressTrack: {
    width: '100%',
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.isDark ? theme.colors.bgLight : theme.colors.bgLight,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    minWidth: 0,
    borderRadius: 2,
    backgroundColor: theme.colors.primary,
  },
  skeletonValue: {
    width: 62,
    height: 38,
    borderRadius: 9,
    backgroundColor: theme.colors.bgLight,
  },
  skeletonLabel: {
    width: 92,
    maxWidth: '90%',
    height: 11,
    marginTop: 6,
    borderRadius: 4,
    backgroundColor: theme.colors.bgLight,
  },
  skeletonBadge: {
    width: 112,
    maxWidth: '46%',
    minHeight: 58,
    borderRadius: 16,
    backgroundColor: theme.isDark ? theme.colors.bgLight : theme.colors.bgLightest,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  skeletonBadgeValue: {
    width: 46,
    maxWidth: '80%',
    height: 15,
    borderRadius: 5,
    backgroundColor: theme.colors.borderPrimary,
  },
  skeletonBadgeLabel: {
    width: 68,
    maxWidth: '95%',
    height: 9,
    marginTop: 6,
    borderRadius: 4,
    backgroundColor: theme.colors.borderPrimary,
  },
  skeletonProgressLabel: {
    width: 88,
    height: 10,
    borderRadius: 4,
    backgroundColor: theme.colors.bgLight,
  },
  skeletonProgressValue: {
    width: 34,
    height: 10,
    borderRadius: 4,
    backgroundColor: theme.colors.bgLight,
  },
  errorContainer: {
    minHeight: 92,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  errorText: {
    flexShrink: 1,
    textAlign: 'center',
    color: theme.colors.textSecondary,
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: '600',
  },
  retryButton: {
    flexShrink: 0,
    borderRadius: 999,
    backgroundColor: theme.colors.primaryLight12,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  retryText: {
    color: theme.colors.primary,
    fontSize: 12.5,
    fontWeight: '800',
  },
});
