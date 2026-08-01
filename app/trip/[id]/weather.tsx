import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import WeatherIcon from '@/components/weather-icon';
import { useI18n } from '@/components/i18n-provider';
import { useTheme } from '@/components/theme-provider';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { AppTheme } from '@/constants/themes';
import { getCached } from '@/lib/cache';
import { useNetworkStatus } from '@/lib/use-network-status';
import {
  conditionLabelKey,
  fetchTripWeather,
  getCachedTripWeather,
  uvCategoryKey,
  type TripWeather,
} from '@/lib/weather-api';
import type { Quest } from '@/lib/types';

export default function WeatherScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, language } = useI18n();
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const locale = language === 'sv' ? 'sv-SE' : 'en-US';
  const isConnected = useNetworkStatus();

  const [weather, setWeather] = useState<TripWeather | null>(() => (id ? getCachedTripWeather(id) : null));
  const [loading, setLoading] = useState(weather === null);
  const [failed, setFailed] = useState(false);

  // Cached-then-refresh, same pattern as the rest of the app: whatever is
  // cached renders instantly, a background fetch updates it. A failed
  // refresh silently keeps the cached copy (its updatedAt stays truthful).
  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      let active = true;
      const cached = getCachedTripWeather(id);
      if (cached) {
        setWeather(cached);
        setLoading(false);
      }
      fetchTripWeather(id)
        .then((data) => {
          if (!active) return;
          setWeather(data);
          setFailed(false);
        })
        .catch(() => {
          if (active) setFailed(true);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => {
        active = false;
      };
    }, [id]),
  );

  const cachedTrip = id ? getCached<Quest>(`/api/trips/${id}`) : null;

  const formatDay = (date: string, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, options).format(new Date(`${date}T12:00:00`));

  const formatTripDates = () => {
    const start = cachedTrip?.startDate ?? weather?.forecastStart;
    // An open-ended adventure has no end date, but the forecast still covers a
    // real window — show that rather than nothing, since this screen is about
    // the forecast period, not the adventure's length.
    const end = cachedTrip?.endDate ?? weather?.forecastEnd;
    if (!start || !end) return null;
    return `${formatDay(start, { day: 'numeric', month: 'short' })} – ${formatDay(end, { day: 'numeric', month: 'short' })}`;
  };

  const formatUpdatedAt = () => {
    if (!weather?.updatedAt) return null;
    const updated = new Date(weather.updatedAt);
    // A stale forecast is old by definition — a relative age ("3 hours
    // ago") reads more honestly than a raw clock time. Fresh data keeps
    // the absolute timestamp. Stale caps at 24h server-side, so
    // minutes/hours (+ a day fallback) cover the whole range.
    if (weather.stale) {
      const diffMinutes = Math.max(1, Math.floor((Date.now() - updated.getTime()) / 60_000));
      if (diffMinutes < 60) return t('weather.updatedMinutesAgo', { count: diffMinutes });
      const diffHours = Math.floor(diffMinutes / 60);
      if (diffHours === 1) return t('weather.updatedHourAgo');
      if (diffHours < 24) return t('weather.updatedHoursAgo', { count: diffHours });
      return t('weather.updatedDayAgo');
    }
    const label = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }).format(updated);
    return t('weather.updatedAt', { time: label });
  };

  const featured = weather?.status === 'available' ? weather.days[0] : undefined;
  const restDays = weather?.status === 'available' ? weather.days.slice(1) : [];
  // "Today" must be evaluated in the DESTINATION's timezone — day.date is
  // destination-local, so a device/UTC date mislabels around midnight.
  // en-CA yields YYYY-MM-DD directly; unsupported timeZone falls back.
  const todayIso = (() => {
    try {
      return new Intl.DateTimeFormat('en-CA', weather?.timezone ? { timeZone: weather.timezone } : undefined).format(new Date());
    } catch {
      return new Date().toISOString().slice(0, 10);
    }
  })();

  function renderStatusMessage(icon: string, text: string) {
    return (
      <View style={styles.statusWrap}>
        <View style={styles.statusIconCircle}>
          <Ionicons name={icon as never} size={26} color={theme.colors.textSecondary} />
        </View>
        <Text style={styles.statusText}>{text}</Text>
      </View>
    );
  }

  function renderBody() {
    if (loading && !weather) {
      return (
        <View style={styles.statusWrap}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      );
    }
    if (!weather) {
      // Nothing cached and the fetch failed — offline gets its own copy.
      if (failed && isConnected === false) return renderStatusMessage('cloud-offline-outline', t('weather.offline'));
      return renderStatusMessage('cloud-outline', t('weather.unavailable'));
    }
    if (weather.status === 'too_early') {
      const from = weather.forecastAvailableFrom
        ? formatDay(weather.forecastAvailableFrom, { day: 'numeric', month: 'long' })
        : null;
      return renderStatusMessage(
        'calendar-outline',
        from ? `${t('weather.tooEarly')} ${t('weather.tooEarlyFrom', { date: from })}` : t('weather.tooEarly'),
      );
    }
    if (weather.status === 'no_coordinates') {
      // No usable place anywhere (no day locations, no destination coords)
      // — offer the direct path to add the starting destination, which
      // enables weather for every day at once via the resolved timeline.
      return (
        <View>
          {renderStatusMessage('location-outline', t('weather.noCoordinates'))}
          <TouchableOpacity
            style={styles.addDestinationButton}
            activeOpacity={0.88}
            onPress={() => router.push(`/trip/${id}/settings`)}>
            <Ionicons name="location" size={15} color="#fff" />
            <Text style={styles.addDestinationButtonText}>{t('trip.addDestination')}</Text>
          </TouchableOpacity>
        </View>
      );
    }
    if (weather.status !== 'available' || !featured) return renderStatusMessage('cloud-outline', t('weather.unavailable'));

    return (
      <>
        {/* Featured day — trip start, or today when the trip is ongoing. */}
        <View style={styles.featuredCard}>
          <Text style={styles.featuredDayLabel}>
            {featured.date === todayIso ? t('weather.today') : formatDay(featured.date, { weekday: 'long', day: 'numeric', month: 'long' })}
          </Text>
          {/* Always show WHERE this day's forecast applies — the page
              header is generic now, so the location must live on the day. */}
          {featured.locationLabel ? (
            <View style={styles.featuredLocationRow}>
              <Ionicons name="location-outline" size={13} color={theme.colors.textSecondary} />
              <Text style={styles.featuredLocationText} numberOfLines={1}>{featured.locationLabel}</Text>
            </View>
          ) : null}
          {featured.isForecastAvailable ? (
            <>
              <View style={styles.featuredMain}>
                <WeatherIcon condition={featured.code} size={54} />
                <View style={styles.featuredTemps}>
                  <Text style={styles.featuredTemp}>{Math.round(featured.tempMaxC)}°</Text>
                  <Text style={styles.featuredTempMin}>{Math.round(featured.tempMinC)}°</Text>
                </View>
              </View>
              <Text style={styles.featuredCondition}>{t(conditionLabelKey(featured.code))}</Text>
              <View style={styles.featuredMetaRow}>
                <View style={styles.featuredMetaItem}>
                  <Ionicons name="water-outline" size={15} color={theme.colors.textSecondary} />
                  <Text style={styles.featuredMetaText}>{featured.precipitationProbability}%</Text>
                </View>
                <View style={styles.featuredMetaItem}>
                  <Ionicons name="sunny-outline" size={15} color={theme.colors.textSecondary} />
                  <Text style={styles.featuredMetaText}>
                    {t('weather.uvShort')} {featured.uvIndexMax} · {t(uvCategoryKey(featured.uvIndexMax))}
                  </Text>
                </View>
              </View>
            </>
          ) : (
            <Text style={styles.featuredUnavailableText}>{t('weather.dayUnavailable')}</Text>
          )}
        </View>

        {/* Remaining trip days inside the forecast window, grouped by
            consecutive location — a new pin only appears where the resolved
            location actually changes from the previous day. */}
        {restDays.map((day, index) => {
          const previousLocation = index === 0 ? featured?.locationLabel : restDays[index - 1].locationLabel;
          const showLocationLabel = Boolean(day.locationLabel) && day.locationLabel !== previousLocation;
          return (
            <View key={day.date}>
              {showLocationLabel ? (
                <View style={styles.locationGroupRow}>
                  <Ionicons name="location-outline" size={12} color={theme.colors.textMeta} />
                  <Text style={styles.locationGroupText} numberOfLines={1}>{day.locationLabel}</Text>
                </View>
              ) : null}
              <View style={styles.dayRow}>
                <View style={styles.dayRowDate}>
                  <Text style={styles.dayRowWeekday}>{formatDay(day.date, { weekday: 'short' })}</Text>
                  <Text style={styles.dayRowDay}>{formatDay(day.date, { day: 'numeric', month: 'short' })}</Text>
                </View>
                {day.isForecastAvailable ? (
                  <>
                    <WeatherIcon condition={day.code} size={22} />
                    <View style={styles.dayRowCondition}>
                      <Text style={styles.dayRowConditionText} numberOfLines={1}>{t(conditionLabelKey(day.code))}</Text>
                      <Text style={styles.dayRowMeta}>
                        <Ionicons name="water-outline" size={11} color={theme.colors.textMeta} /> {day.precipitationProbability}% · {t('weather.uvShort')} {t(uvCategoryKey(day.uvIndexMax))}
                      </Text>
                    </View>
                    <Text style={styles.dayRowTemps}>
                      {Math.round(day.tempMaxC)}° <Text style={styles.dayRowTempMin}>{Math.round(day.tempMinC)}°</Text>
                    </Text>
                  </>
                ) : (
                  <Text style={styles.dayRowUnavailableText}>{t('weather.dayUnavailable')}</Text>
                )}
              </View>
            </View>
          );
        })}

        {weather.attribution ? <Text style={styles.attribution}>{weather.attribution}</Text> : null}
      </>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 18) + 4 }]}>
        <TouchableOpacity style={styles.backButton} activeOpacity={0.88} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={theme.isDark ? theme.colors.textPrimary : '#11131a'} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('weather.title')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 20) + 24 }]}
        showsVerticalScrollIndicator={false}>
        {/* Header + trip dates + last updated. Deliberately NOT the trip
            destination text — the forecast follows the feed's per-day
            locations (TripDayLocation timeline), so a single destination
            name would be misleading; each day card carries its own
            location label instead. */}
        <View style={styles.destCard}>
          <Text style={styles.destName} numberOfLines={2}>
            {t('weather.headerTitle')}
          </Text>
          {formatTripDates() ? <Text style={styles.destDates}>{formatTripDates()}</Text> : null}
          {formatUpdatedAt() ? <Text style={styles.destUpdated}>{formatUpdatedAt()}</Text> : null}
        </View>

        {renderBody()}
      </ScrollView>
    </View>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: theme.isDark ? theme.colors.bgPrimary : '#f7f8fa',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 18,
      paddingBottom: 12,
    },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      flex: 1,
      textAlign: 'center',
      fontSize: 18,
      fontWeight: '800',
      color: theme.colors.textPrimary,
    },
    headerSpacer: {
      width: 40,
    },
    content: {
      paddingHorizontal: 18,
      paddingTop: 4,
    },
    destCard: {
      marginBottom: 14,
    },
    destName: {
      fontSize: 24,
      fontWeight: '800',
      letterSpacing: -0.5,
      color: theme.colors.textPrimary,
    },
    destDates: {
      marginTop: 2,
      fontSize: 14,
      fontWeight: '600',
      color: theme.colors.textSecondary,
    },
    destUpdated: {
      marginTop: 2,
      fontSize: 12,
      color: theme.colors.textMeta,
    },
    addDestinationButton: {
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      marginTop: 4,
      paddingHorizontal: 18,
      paddingVertical: 11,
      borderRadius: 999,
      backgroundColor: theme.colors.primary,
    },
    addDestinationButtonText: {
      color: '#fff',
      fontSize: 13.5,
      fontWeight: '800',
    },
    statusWrap: {
      alignItems: 'center',
      paddingVertical: 48,
      paddingHorizontal: 24,
      gap: 14,
    },
    statusIconCircle: {
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.isDark ? theme.colors.bgLightest : '#f1f3f7',
    },
    statusText: {
      fontSize: 15,
      lineHeight: 21,
      textAlign: 'center',
      color: theme.colors.textSecondary,
    },
    featuredCard: {
      borderRadius: 22,
      borderWidth: 1,
      borderColor: theme.isDark ? theme.colors.borderPrimary : '#eef1f5',
      backgroundColor: theme.isDark ? theme.colors.bgLightest : '#fff',
      padding: 18,
      marginBottom: 16,
    },
    featuredDayLabel: {
      fontSize: 13,
      fontWeight: '700',
      textTransform: 'capitalize',
      color: theme.colors.textSecondary,
    },
    featuredLocationRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: 4,
    },
    featuredLocationText: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.colors.textSecondary,
    },
    locationGroupRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      marginTop: 14,
      marginBottom: 2,
    },
    locationGroupText: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.colors.textMeta,
    },
    featuredMain: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
      marginTop: 10,
    },
    featuredTemps: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 8,
    },
    featuredTemp: {
      fontSize: 44,
      fontWeight: '800',
      letterSpacing: -1,
      color: theme.colors.textPrimary,
    },
    featuredTempMin: {
      fontSize: 22,
      fontWeight: '700',
      color: theme.colors.textMeta,
      marginBottom: 6,
    },
    featuredCondition: {
      marginTop: 6,
      fontSize: 16,
      fontWeight: '700',
      color: theme.colors.textPrimary,
    },
    featuredMetaRow: {
      flexDirection: 'row',
      gap: 18,
      marginTop: 10,
    },
    featuredMetaItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    featuredMetaText: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.colors.textSecondary,
    },
    featuredUnavailableText: {
      marginTop: 10,
      fontSize: 14,
      fontWeight: '600',
      color: theme.colors.textMeta,
    },
    dayRowUnavailableText: {
      flex: 1,
      fontSize: 13,
      fontWeight: '600',
      color: theme.colors.textMeta,
    },
    dayRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: theme.isDark ? theme.colors.borderPrimary : '#eef1f5',
    },
    dayRowDate: {
      width: 64,
    },
    dayRowWeekday: {
      fontSize: 14,
      fontWeight: '700',
      textTransform: 'capitalize',
      color: theme.colors.textPrimary,
    },
    dayRowDay: {
      fontSize: 12,
      color: theme.colors.textMeta,
    },
    dayRowCondition: {
      flex: 1,
    },
    dayRowConditionText: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.colors.textPrimary,
    },
    dayRowMeta: {
      marginTop: 1,
      fontSize: 12,
      color: theme.colors.textMeta,
    },
    dayRowTemps: {
      fontSize: 15,
      fontWeight: '800',
      color: theme.colors.textPrimary,
    },
    dayRowTempMin: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.colors.textMeta,
    },
    attribution: {
      marginTop: 18,
      fontSize: 11,
      color: theme.colors.textMeta,
    },
  });
