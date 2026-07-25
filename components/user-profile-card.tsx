import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/components/auth-provider';
import { useI18n } from '@/components/i18n-provider';
import { useTheme } from '@/components/theme-provider';
import { useOwnTravelStats } from '@/hooks/use-own-travel-stats';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { AppTheme } from '@/constants/themes';
import { worldPercentForCount } from '@/components/travel-tracker/travel-tracker-state';
import TravelStatsSummary from '@/components/travel-tracker/travel-stats-summary';
import { CONTINENT_ORDER } from '@/components/travel-tracker/country-data';
import { getCachedUserProfile, loadUserProfile } from '@/lib/user-cache';
import {
  getCachedUserTravelStats,
  loadUserTravelStats,
  type RemoteTravelStats,
} from '@/lib/travel-stats-api';
import type { UserProfile } from '@/lib/types';

export default function UserProfileCard({
  userId,
  onClose,
  onReport,
}: {
  userId: string | null;
  onClose: () => void;
  onReport?: (name: string) => void;
}) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const { user: authUser } = useAuth();
  // YOUR OWN popup must show the exact numbers your profile page shows —
  // and the page computes them LOCALLY (AsyncStorage + trips) via this
  // same hook, no server row required. Other users' popups keep the
  // synced-aggregate path below.
  const ownStats = useOwnTravelStats();
  const isSelf = userId !== null && userId === authUser?.id;
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileStateUserId, setProfileStateUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [avatarExpanded, setAvatarExpanded] = useState(false);
  // Aggregated Travel Tracker stats — per-user cache in travel-stats-api,
  // so one person's numbers can never bleed onto another's card. null =
  // the user has never synced stats (section hidden).
  const [travelStats, setTravelStats] = useState<RemoteTravelStats | null>(null);
  const [travelStatsStateUserId, setTravelStatsStateUserId] = useState<string | null>(null);
  const [travelStatsLoading, setTravelStatsLoading] = useState(false);
  const [travelStatsError, setTravelStatsError] = useState(false);
  const visibleUserIdRef = useRef(userId);
  const statsLoadGenerationRef = useRef(0);
  visibleUserIdRef.current = userId;

  const loadStats = useCallback((id: string, cachedAlready: boolean) => {
    const generation = ++statsLoadGenerationRef.current;
    setTravelStatsStateUserId(id);
    setTravelStatsError(false);
    setTravelStatsLoading(!cachedAlready);
    loadUserTravelStats(id)
      .then((data) => {
        if (
          generation !== statsLoadGenerationRef.current
          || visibleUserIdRef.current !== id
        ) return;
        setTravelStatsStateUserId(id);
        setTravelStats(data);
      })
      .catch(() => {
        if (
          generation !== statsLoadGenerationRef.current
          || visibleUserIdRef.current !== id
        ) return;
        // A stats failure must never break the rest of the profile card.
        setTravelStatsError(true);
      })
      .finally(() => {
        if (
          generation === statsLoadGenerationRef.current
          && visibleUserIdRef.current === id
        ) {
          setTravelStatsLoading(false);
        }
      });
  }, []);

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      setProfileStateUserId(null);
      setLoading(false);
      setError('');
      setTravelStats(null);
      setTravelStatsStateUserId(null);
      setTravelStatsLoading(false);
      setTravelStatsError(false);
      return undefined;
    }

    let active = true;
    setAvatarFailed(false);
    setAvatarExpanded(false);
    setError('');
    setProfileStateUserId(userId);

    const cachedStats = getCachedUserTravelStats(userId);
    setTravelStats(cachedStats);
    loadStats(userId, cachedStats !== null);

    // Show whatever's cached immediately (no spinner) — this is what makes
    // reopening the same person's card feel instant instead of refetching
    // every single tap. loadUserProfile() itself skips the network call
    // entirely if the cache is still fresh.
    const cached = getCachedUserProfile(userId);
    if (cached) {
      setProfile(cached);
      setLoading(false);
    } else {
      setProfile(null);
      setLoading(true);
    }

    loadUserProfile(userId)
      .then((data) => {
        if (!active || visibleUserIdRef.current !== userId) return;
        setProfileStateUserId(userId);
        setProfile(data);
      })
      .catch(() => {
        if (!active || visibleUserIdRef.current !== userId) return;
        if (!cached) setError('Could not load profile');
      })
      .finally(() => {
        if (active && visibleUserIdRef.current === userId) setLoading(false);
      });

    return () => {
      active = false;
      statsLoadGenerationRef.current += 1;
    };
  }, [loadStats, userId]);

  const visible = userId !== null;
  // Effects run after a render. Tagging each async state payload with its
  // owner prevents the previous person's cached profile or stats from
  // flashing during that one render when userId changes.
  const profileMatchesVisibleUser = Boolean(userId) && profileStateUserId === userId;
  const visibleProfile = profileMatchesVisibleUser ? profile : null;
  const visibleProfileLoading = Boolean(userId) && (!profileMatchesVisibleUser || loading);
  const visibleProfileError = profileMatchesVisibleUser ? error : '';
  const statsMatchVisibleUser = Boolean(userId) && travelStatsStateUserId === userId;
  const visibleTravelStats = statsMatchVisibleUser ? travelStats : null;
  const visibleTravelStatsLoading =
    Boolean(userId) && (!statsMatchVisibleUser || travelStatsLoading);
  const visibleTravelStatsError = statsMatchVisibleUser && travelStatsError;
  const modalTopPadding = Math.max(18, insets.top + 10);
  const modalBottomPadding = Math.max(18, insets.bottom + 10);
  const cardMaxHeight = Math.max(
    240,
    windowHeight - modalTopPadding - modalBottomPadding,
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}>
      <View
        style={[
          styles.backdrop,
          { paddingTop: modalTopPadding, paddingBottom: modalBottomPadding },
        ]}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
        <View
          style={[styles.card, { maxHeight: cardMaxHeight }]}
          accessibilityViewIsModal>
          {onReport && visibleProfile ? (
            <Pressable
              style={styles.reportButton}
              onPress={() => onReport(visibleProfile.name)}
              hitSlop={10}>
              <Ionicons name="flag" size={20} color="#ff4f74" />
            </Pressable>
          ) : null}
          <Pressable style={styles.closeButton} onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={22} color={theme.colors.textPrimary} />
          </Pressable>

          <ScrollView
            key={userId ?? 'closed'}
            style={styles.cardScroll}
            contentContainerStyle={styles.cardContent}
            showsVerticalScrollIndicator={false}
            overScrollMode="never">
            {visibleProfileLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
              </View>
            ) : visibleProfileError ? (
              <View style={styles.errorContainer}>
                <Ionicons name="alert-circle-outline" size={40} color={theme.colors.error} />
                <Text style={styles.errorText}>{visibleProfileError}</Text>
              </View>
            ) : visibleProfile ? (
              <>
                <View style={styles.avatarRing}>
                  {visibleProfile.avatarUrl
                    && visibleProfile.avatarUrl.trim()
                    && !avatarFailed ? (
                      // Tap to view full-size — initials fallback stays inert
                      // (nothing meaningful to enlarge).
                      <Pressable
                        onPress={() => setAvatarExpanded(true)}
                        accessibilityRole="imagebutton"
                        accessibilityLabel={visibleProfile.name}>
                        <Image
                          source={{ uri: visibleProfile.avatarUrl }}
                          style={styles.avatar}
                          onError={() => setAvatarFailed(true)}
                        />
                      </Pressable>
                    ) : (
                      <View style={[styles.avatar, styles.avatarFallback]}>
                        <Text style={styles.avatarInitials}>
                          {getInitials(visibleProfile.name)}
                        </Text>
                      </View>
                    )}
                  {visibleProfile.isOnline ? <View style={styles.onlineDot} /> : null}
                </View>

                <Text style={styles.name}>{visibleProfile.name}</Text>
                {visibleProfile.bio ? <Text style={styles.bio}>{visibleProfile.bio}</Text> : null}

                {/* Aggregated Travel Tracker stats — same shared band as the
                    tracker and the own profile. ALWAYS rendered while a
                    profile is open: skeleton during load, real values on
                    success, and ZEROS (0 / 0.0% / 0 of 7) when the user has
                    no synced stats (404) or the request failed — the
                    section must never vanish. A failed request adds a
                    discreet retry line under the band; the rest of the
                    popup is unaffected either way. */}
                <View style={styles.travelStatsWrap}>
                  {isSelf ? (
                    // Self: identical source AND values as the profile page
                    // (local computation via the same shared hook) — the
                    // server aggregates are irrelevant for your own popup.
                    <TravelStatsSummary
                      countriesVisited={ownStats.stats?.countriesVisited ?? 0}
                      worldExploredPercent={ownStats.stats?.worldExploredPercent ?? 0}
                      continentsReached={ownStats.stats?.continentsReached ?? 0}
                      totalContinents={ownStats.stats?.totalContinents ?? CONTINENT_ORDER.length}
                      rankingAvailable={false}
                      loading={ownStats.loading}
                    />
                  ) : (
                    <TravelStatsSummary
                      countriesVisited={visibleTravelStats?.countriesVisited ?? 0}
                      worldExploredPercent={worldPercentForCount(
                        visibleTravelStats?.countriesVisited ?? 0,
                      )}
                      continentsReached={visibleTravelStats?.continentsReached ?? 0}
                      totalContinents={CONTINENT_ORDER.length}
                      rankingAvailable={false}
                      loading={visibleTravelStatsLoading}
                    />
                  )}
                  {!isSelf
                    && visibleTravelStatsError
                    && !visibleTravelStats
                    && !visibleTravelStatsLoading ? (
                      <Pressable
                        onPress={userId ? () => loadStats(userId, false) : undefined}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                        <Text style={styles.travelStatsRetryText}>
                          {t('travel.stats.loadError')} · {t('common.retry')}
                        </Text>
                      </Pressable>
                    ) : null}
                </View>
              </>
            ) : null}
          </ScrollView>
        </View>
      </View>

      {/* Full-size avatar viewer — nested Modal like the chat's fullscreen
          image, so Android back closes the viewer first, then the card. */}
      <Modal
        visible={avatarExpanded}
        transparent
        animationType="fade"
        onRequestClose={() => setAvatarExpanded(false)}>
        <Pressable style={styles.avatarViewerBackdrop} onPress={() => setAvatarExpanded(false)}>
          {visibleProfile?.avatarUrl ? (
            <Image
              source={{ uri: visibleProfile.avatarUrl }}
              style={styles.avatarViewerImage}
              resizeMode="contain"
            />
          ) : null}
          <Pressable
            style={[styles.avatarViewerClose, { top: 54 }]}
            onPress={() => setAvatarExpanded(false)}
            hitSlop={10}
            accessibilityRole="button">
            <Ionicons name="close" size={24} color="#fff" />
          </Pressable>
        </Pressable>
      </Modal>
    </Modal>
  );
}

function getInitials(name?: string | null) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase()).join('') || '?';
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: theme.isDark ? theme.colors.backdropModal : 'rgba(12,16,26,0.5)',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  card: {
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
    borderRadius: 28,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: theme.isDark ? StyleSheet.hairlineWidth : 0,
    borderColor: theme.colors.borderPrimary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: theme.isDark ? 0.5 : 0.16,
    shadowRadius: 32,
    elevation: theme.isDark ? 0 : 12,
  },
  cardScroll: {
    width: '100%',
    flexGrow: 0,
    flexShrink: 1,
  },
  cardContent: {
    paddingHorizontal: 22,
    paddingTop: 36,
    paddingBottom: 24,
    alignItems: 'center',
  },
  reportButton: {
    position: 'absolute',
    top: 14,
    left: 14,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bgLight,
    zIndex: 2,
  },
  closeButton: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bgLight,
    zIndex: 2,
  },
  loadingContainer: {
    minHeight: 240,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    minHeight: 200,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    marginTop: 10,
    fontSize: 14,
    color: theme.colors.textPrimary,
  },
  avatarRing: {
    width: 132,
    height: 132,
    borderRadius: 66,
    borderWidth: 4,
    borderColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 118,
    height: 118,
    borderRadius: 59,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallback: {
    backgroundColor: theme.colors.avatarDark,
  },
  onlineDot: {
    position: 'absolute',
    // Sits on the ring's lower-right diagonal (45°) rather than the corner
    // of the bounding box, so it visually touches the circle.
    right: 8,
    bottom: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#22c55e',
    borderWidth: 3,
    borderColor: theme.colors.surfaceElevated,
  },
  avatarInitials: {
    color: '#fff',
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -1,
  },
  name: {
    marginTop: 22,
    color: theme.colors.textPrimary,
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -1.2,
    textAlign: 'center',
  },
  bio: {
    marginTop: 10,
    color: theme.colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  travelStatsWrap: {
    alignSelf: 'stretch',
    marginTop: 14,
  },
  travelStatsRetryText: {
    marginTop: 8,
    textAlign: 'center',
    color: theme.colors.textMeta,
    fontSize: 12,
    fontWeight: '600',
  },
  avatarViewerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarViewerImage: {
    width: '100%',
    height: '80%',
  },
  avatarViewerClose: {
    position: 'absolute',
    right: 18,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
