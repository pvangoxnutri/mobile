import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { router, useLocalSearchParams } from 'expo-router';
import type { Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, BackHandler, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Image as CachedImage } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BrandMark from '@/components/brand-mark';
import Avatar from '@/components/avatar';
import { useAuth } from '@/components/auth-provider';
import { useI18n } from '@/components/i18n-provider';
import TabHeader from '@/components/tab-header';
import TopAlertsButton from '@/components/top-alerts-button';
import UserProfileCard from '@/components/user-profile-card';
import InviteCard from '@/components/invite-card';
import ActivityImageFallback from '@/components/activity-image-fallback';
import { getCategorySymbol } from '@/lib/category-symbol';
import { DEFAULT_BLUR, extractBlur } from '@/lib/activity-blur';
import { BigHeroCard, getInitials, type TripWithEvent, type TripMember } from '@/components/big-hero-card';
import { apiFetch, apiJson } from '@/lib/api';
import { consumePendingInviteCode } from '@/lib/pending-invite';
import { getCached, setCached, invalidateCache, invalidateTripCache } from '@/lib/cache';
import { prefetchAvatars } from '@/lib/avatar-prefetch';
import { maybeRequestPushPermission } from '@/lib/push-notifications';
import { formatRelativeTime } from '@/lib/format-time';
import { markStartup, markStartupSync } from '@/lib/startup-timing'; // TEMPORARY — see lib/startup-timing.ts
import { useScalePress } from '@/hooks/useMotion';
import type { PendingInvite, Quest, SideQuestActivity, TripEvent } from '@/lib/types';
import { SPACING, RADIUS, TYPOGRAPHY } from '@/constants/design-tokens';
import { useTheme } from '@/components/theme-provider';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { AppTheme } from '@/constants/themes';

// TripMember, TripWithEvent and BigHeroCard live in components/big-hero-card.tsx
// so the create-trip preview can reuse the exact same rendering as home.

export default function HomeScreen() {
  markStartup('[HOME] HomeScreen render');
  const { user, signOut } = useAuth();
  const { t } = useI18n();
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  // Set when this screen was opened via a trip-invite push notification's
  // deep link (?inviteId=...) — used to highlight that specific invite so
  // tapping the notification doesn't just land "somewhere on home".
  const { inviteId: focusInviteId } = useLocalSearchParams<{ inviteId?: string }>();
  const { width, height: screenHeight } = useWindowDimensions();
  // Measured height of the floating header pill — lets the ScrollView's
  // paddingTop clear it exactly (see headerTop/headerClearance below), no
  // matter how tall TabHeader actually renders on a given device/font scale.
  const [headerHeight, setHeaderHeight] = useState(0);
  const [quests, setQuests] = useState<Quest[]>([]);
  const [activities, setActivities] = useState<SideQuestActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fabOpen, setFabOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [membersOpen, setMembersOpen] = useState(false);
  const [featuredMembers, setFeaturedMembers] = useState<TripMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [featuredEventIndex, setFeaturedEventIndex] = useState(0);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [inviteActionBusy, setInviteActionBusy] = useState<string | null>(null);
  const [joinModalOpen, setJoinModalOpen] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinBusy, setJoinBusy] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [profileCardUserId, setProfileCardUserId] = useState<string | null>(null);
  const [selectedTripIndex, setSelectedTripIndex] = useState(0);
  const [failedMemberAvatars, setFailedMemberAvatars] = useState<Set<string>>(new Set());
  // Keyed by trip id, populated for every trip (not just the featured one) —
  // see loadQuests. This is what lets every BigHeroCard in the carousel show
  // its own avatars immediately, instead of only the currently-featured one,
  // so swiping between trips never blanks-then-reloads avatars.
  const [membersByTripId, setMembersByTripId] = useState<Record<string, TripMember[]>>({});
  const [tripEvents, setTripEvents] = useState<TripEvent[]>([]);
  const eventFade = useRef(new Animated.Value(1)).current;
  const carouselRef = useRef<ScrollView>(null);
  const selectedTripIdRef = useRef<string | null>(null);
  const prevQuestIdsKeyRef = useRef<string | null>(null);
  // Set right when the user joins/accepts into a trip so the carousel lands
  // on THAT trip once it shows up in `quests`, instead of the keep-current-
  // trip logic below re-selecting whatever was already featured (it can't
  // know about a brand-new trip id on its own).
  const pendingFeaturedTripIdRef = useRef<string | null>(null);
  const floatingBottom = Math.max(insets.bottom, 14) + 78;
  // The header floats ON TOP of the ScrollView now (position: absolute),
  // the same way the bottom tab bar floats on top of it from below — so
  // content scrolling past actually goes behind the translucent pill,
  // instead of there being dead space behind a fully-reserved header.
  // headerClearance is what the ScrollView's own paddingTop needs to be so
  // content starts just below the pill at rest (scroll position 0).
  const headerTop = Math.max(insets.top, 16) + 8;
  const headerClearance = headerTop + (headerHeight || 76) + 14;
  // Hero card fills the viewport leaving ~24px peek of the next card on the
  // right, signalling "swipe for more". snapToInterval below locks one card
  // per page.
  const upcomingCardWidth = width - 48;

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  // Redeem an invite link that arrived while the user was signed out: the
  // invite screen stashes the code before sending them to login, and once
  // home mounts (post-login/onboarding) we send them back to complete the
  // join — the invite survives the auth detour.
  useEffect(() => {
    if (!user) return;
    void consumePendingInviteCode()
      .then((code) => {
        // Cast: expo-router's generated route types don't include the new
        // invite/[code] route until the next `expo start` regenerates them.
        if (code) router.push(`/invite/${code}` as Href);
      })
      .catch(() => {});
  }, [user]);

  const loadQuests = useCallback(() => {
    let active = true;
    markStartup('[HOME] loadQuests → start');

    // Show cached trips + activities INSTANTLY so a tab switch back to home
    // doesn't flash a loading state. We then refetch in the background and
    // update if anything has changed.
    const cachedTrips = markStartupSync('[HOME] cache read /api/trips', () => getCached<Quest[]>('/api/trips'));
    if (cachedTrips) {
      setQuests(cachedTrips);
      const cachedActs: SideQuestActivity[] = [];
      const cachedMembersByTrip: Record<string, TripMember[]> = {};
      for (const trip of cachedTrips) {
        const acts = getCached<SideQuestActivity[]>(`/api/trips/${trip.id}/activities`);
        if (acts) cachedActs.push(...acts);
        const members = getCached<TripMember[]>(`/api/trips/${trip.id}/members`);
        if (members) cachedMembersByTrip[trip.id] = members;
      }
      if (cachedActs.length > 0) setActivities(cachedActs);
      if (Object.keys(cachedMembersByTrip).length > 0) {
        setMembersByTripId((prev) => ({ ...prev, ...cachedMembersByTrip }));
      }
      setLoading(false);
      markStartup('[HOME] cache HIT — rendering cached trips, loading=false');
    } else {
      setLoading(true);
      markStartup('[HOME] cache MISS — loading=true, showing skeleton until network resolves');
    }
    setError('');

    console.log('[HOME] loading trips...');
    const tripsFetchStart = Date.now();
    void apiJson<Quest[]>('/api/trips')
      .then(async (data) => {
        markStartup(`[HOME] GET /api/trips resolved (${Date.now() - tripsFetchStart}ms)`);
        if (!active) return;
        const tripList = Array.isArray(data) ? data : [];
        setCached('/api/trips', tripList);

        const activitiesFetchStart = Date.now();
        const perTripResults = await Promise.all(
          tripList.map(async (trip) => {
            // On a transient failure (flaky connection — most common while
            // actually travelling), fall back to whatever's still cached for
            // THIS trip instead of swallowing to []. Otherwise one dropped
            // request silently blanks "Up Next" and the activity feed until
            // the next focus event happens to succeed.
            const [acts, members] = await Promise.all([
              apiJson<SideQuestActivity[]>(`/api/trips/${trip.id}/activities`).catch((err) => {
                console.warn(`[HOME] loadActivities failed for trip ${trip.id}:`, err instanceof Error ? err.message : err);
                return getCached<SideQuestActivity[]>(`/api/trips/${trip.id}/activities`) ?? [];
              }),
              apiJson<TripMember[]>(`/api/trips/${trip.id}/members`).catch((err) => {
                console.warn(`[HOME] loadMembers failed for trip ${trip.id}:`, err instanceof Error ? err.message : err);
                return getCached<TripMember[]>(`/api/trips/${trip.id}/members`) ?? [];
              }),
            ]);
            setCached(`/api/trips/${trip.id}/activities`, acts);
            setCached(`/api/trips/${trip.id}/members`, members);
            return { tripId: trip.id, acts, members };
          }),
        );
        markStartup(`[HOME] all per-trip /activities + /members resolved in parallel (${Date.now() - activitiesFetchStart}ms, ${tripList.length} trips)`);

        if (!active) return;
        setQuests(tripList);
        setActivities(perTripResults.flatMap((r) => r.acts));
        setMembersByTripId((prev) => {
          const next = { ...prev };
          for (const r of perTripResults) next[r.tripId] = r.members;
          return next;
        });
        markStartup(`[HOME] loadQuests → fully done (${Date.now() - tripsFetchStart}ms total since fetch start)`);

        // Contextual permission prompt: the moment a user has at least one
        // adventure (created or joined) is when push notifications first
        // become meaningful — no point asking before that.
        if (tripList.length > 0) {
          void maybeRequestPushPermission();
        }
      })
      .catch(async (err: Error) => {
        markStartup(`[HOME] GET /api/trips FAILED (${Date.now() - tripsFetchStart}ms)`, { message: err.message });
        if (!active) return;
        setError(err.message || 'Unable to load quests.');
        // Only wipe state if we don't have a cached snapshot still on screen
        if (!cachedTrips) setActivities([]);
        if (err.message.includes('401') || err.message.toLowerCase().includes('unauthorized')) {
          await signOut();
          router.replace('/(auth)/login');
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [signOut]);

  const loadInvites = useCallback(() => {
    markStartup('[HOME] loadInvites → start');
    const cached = getCached<PendingInvite[]>('/api/trips/invites/me');
    if (cached) setPendingInvites(cached);

    const start = Date.now();
    void apiJson<PendingInvite[]>('/api/trips/invites/me')
      .then((data) => {
        markStartup(`[HOME] GET /api/trips/invites/me resolved (${Date.now() - start}ms)`);
        setCached('/api/trips/invites/me', data);
        setPendingInvites(data);
      })
      .catch((err: unknown) => {
        markStartup(`[HOME] GET /api/trips/invites/me FAILED (${Date.now() - start}ms)`);
        console.warn('[HOME] loadInvites failed:', err instanceof Error ? err.message : err);
      });
  }, []);

  const loadTripEvents = useCallback(() => {
    markStartup('[HOME] loadTripEvents → start');
    const cached = getCached<TripEvent[]>('/api/trips/events/me');
    if (cached) setTripEvents(cached);

    const start = Date.now();
    void apiJson<TripEvent[]>('/api/trips/events/me')
      .then((data) => {
        markStartup(`[HOME] GET /api/trips/events/me resolved (${Date.now() - start}ms)`);
        setCached('/api/trips/events/me', data);
        setTripEvents(data);
      })
      .catch((err: unknown) => {
        markStartup(`[HOME] GET /api/trips/events/me FAILED (${Date.now() - start}ms)`);
        console.warn('[HOME] loadTripEvents failed:', err instanceof Error ? err.message : err);
      });
  }, []);

  useFocusEffect(loadQuests);
  useFocusEffect(loadInvites);
  useFocusEffect(loadTripEvents);

  const sortedTrips = useMemo(() => sortTripsByUpcomingEvent(quests, activities, now), [activities, now, quests]);
  const featuredTrip = sortedTrips[selectedTripIndex] ?? null;
  const countdownParts = useMemo(() => getCountdownParts(featuredTrip?.nextEventDate, now, t), [featuredTrip?.nextEventDate, now, t]);
  const featuredEvent = featuredTrip?.upcomingEvents[featuredEventIndex] ?? null;
  const allowNativeDriver = Platform.OS !== 'web';

  // Keep the ref pointing at whichever trip is currently shown, so the
  // effect below can re-find it by id after a refetch instead of always
  // snapping back to index 0.
  if (featuredTrip) selectedTripIdRef.current = featuredTrip.quest.id;

  // `quests` gets a brand-new array reference on every focus-triggered
  // refetch (loadQuests), even when the trips themselves haven't changed —
  // resetting selectedTripIndex on every such reference change desynced the
  // carousel's visible card (untouched, since nothing scrolls it back) from
  // "Up Next"/the dashes (which jumped to trip 0), making Up Next look like
  // it randomly went blank while swiping. Only reset when the actual set of
  // trip ids changes, and try to keep showing the same trip by id.
  const questIdsKey = useMemo(() => quests.map((q) => q.id).sort().join(','), [quests]);
  useEffect(() => {
    if (prevQuestIdsKeyRef.current === questIdsKey) return;
    prevQuestIdsKeyRef.current = questIdsKey;
    const wantedTripId = pendingFeaturedTripIdRef.current ?? selectedTripIdRef.current;
    const keepIndex = wantedTripId ? sortedTrips.findIndex((entry) => entry.quest.id === wantedTripId) : -1;
    const nextIndex = keepIndex >= 0 ? keepIndex : 0;
    pendingFeaturedTripIdRef.current = null;
    setSelectedTripIndex(nextIndex);
    setFeaturedEventIndex(0);
    carouselRef.current?.scrollTo({ x: nextIndex * (upcomingCardWidth + 14), animated: false });
  }, [questIdsKey, sortedTrips, upcomingCardWidth]);

  useEffect(() => {
    setFeaturedEventIndex(0);
  }, [featuredTrip?.quest.id]);

  // Background-only: warms expo-image's disk cache for every visible
  // member avatar across all of this user's trips (not just the featured
  // one) so swiping the carousel never shows a fade-in pop — every card's
  // avatars are already prefetched by the time it becomes featured. Never
  // awaited, never blocks rendering — Avatar already renders correctly
  // without this.
  useEffect(() => {
    prefetchAvatars(Object.values(membersByTripId).flat().map((m) => m.avatarUrl));
  }, [membersByTripId]);

  useEffect(() => {
    if (!featuredTrip || featuredTrip.upcomingEvents.length <= 1) return;

    const interval = setInterval(() => {
      Animated.sequence([
        Animated.timing(eventFade, {
          toValue: 0,
          duration: 180,
          useNativeDriver: allowNativeDriver,
        }),
        Animated.timing(eventFade, {
          toValue: 1,
          duration: 220,
          useNativeDriver: allowNativeDriver,
        }),
      ]).start();

      setFeaturedEventIndex((current) => (current + 1) % featuredTrip.upcomingEvents.length);
    }, 3000);

    return () => clearInterval(interval);
  }, [allowNativeDriver, eventFade, featuredTrip]);

  async function handleAcceptInvite(invite: PendingInvite) {
    setInviteActionBusy(invite.id);
    try {
      const res = await apiFetch(`/api/trips/${encodeURIComponent(invite.tripId)}/invites/${encodeURIComponent(invite.id)}/accept`, { method: 'POST' });
      if (!res.ok) return;
      setPendingInvites((prev) => prev.filter((i) => i.id !== invite.id));
      // Trip list, that trip's own members/invites, and this user's pending
      // invites have all changed server-side — drop the stale cache for
      // every one of them so the next reads (incl. opening the trip itself)
      // hit the network instead of showing pre-accept state.
      invalidateCache('/api/trips/invites/me');
      invalidateTripCache(invite.tripId);
      pendingFeaturedTripIdRef.current = invite.tripId;
      loadQuests();
      loadInvites();
    } catch (err) {
      console.error('[HOME] handleAcceptInvite failed:', err instanceof Error ? err.message : err);
    } finally {
      setInviteActionBusy(null);
    }
  }

  async function handleDeclineInvite(invite: PendingInvite) {
    setInviteActionBusy(invite.id + '_decline');
    try {
      const res = await apiFetch(`/api/trips/${encodeURIComponent(invite.tripId)}/invites/${encodeURIComponent(invite.id)}/decline`, { method: 'POST' });
      if (!res.ok) return;
      setPendingInvites((prev) => prev.filter((i) => i.id !== invite.id));
      invalidateCache('/api/trips/invites/me');
      invalidateTripCache(invite.tripId);
      loadInvites();
    } catch (err) {
      console.error('[HOME] handleDeclineInvite failed:', err instanceof Error ? err.message : err);
    } finally {
      setInviteActionBusy(null);
    }
  }

  async function handleJoin() {
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    setJoinBusy(true);
    setJoinError('');
    try {
      const res = await apiFetch('/api/trips/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) {
        const text = await res.text();
        setJoinError(text || 'Could not join adventure.');
        return;
      }
      const joined = (await res.json()) as { tripId?: string };
      setJoinModalOpen(false);
      setJoinCode('');
      invalidateCache('/api/trips');
      if (joined.tripId) pendingFeaturedTripIdRef.current = joined.tripId;
      loadQuests();
    } catch {
      setJoinError('Something went wrong. Try again.');
    } finally {
      setJoinBusy(false);
    }
  }

  async function openMembers() {
    if (!featuredTrip) return;
    setMembersOpen(true);
    setFailedMemberAvatars(new Set());

    // membersByTripId already holds this exact trip's member list — loadQuests
    // populates it for every trip up front. Reuse it instead of re-fetching
    // data we already have; only hit the network if we genuinely don't have
    // anything yet (e.g. that fetch hasn't resolved, or it failed).
    const known = membersByTripId[featuredTrip.quest.id];
    if (known && known.length > 0) {
      setFeaturedMembers(known);
      setMembersLoading(false);
      return;
    }

    const url = `/api/trips/${featuredTrip.quest.id}/members`;
    const cached = getCached<TripMember[]>(url);
    if (cached) {
      setFeaturedMembers(cached);
      setMembersLoading(false);
      return;
    }

    setMembersLoading(true);
    try {
      const data = await apiJson<TripMember[]>(url);
      setCached(url, data);
      setFeaturedMembers(data);
    } catch (err) {
      console.warn('[HOME] openMembers failed:', err instanceof Error ? err.message : err);
      setFeaturedMembers([]);
    } finally {
      setMembersLoading(false);
    }
  }

  if (!loading && quests.length === 0) {
    return (
      <View style={styles.screen}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[
            styles.emptyScreenContent,
            { paddingTop: headerClearance, paddingBottom: floatingBottom + 96 },
          ]}
          showsVerticalScrollIndicator={false}>
          {pendingInvites.length > 0 ? (
            <View style={[styles.inviteSection, { marginTop: 20 }]}>
              <View style={styles.inviteSectionHeader}>
                <Ionicons name="mail-unread-outline" size={16} color={theme.colors.primary} />
                <Text style={[styles.inviteSectionTitle, { color: theme.colors.primary }]}>{t('home.invited')}</Text>
              </View>
              {pendingInvites.map((invite) => (
                <InviteCard
                  key={invite.id}
                  invite={invite}
                  highlighted={invite.id === focusInviteId}
                  busy={inviteActionBusy === invite.id || inviteActionBusy === invite.id + '_decline'}
                  onAccept={handleAcceptInvite}
                  onDecline={handleDeclineInvite}
                />
              ))}
            </View>
          ) : null}

          <Text style={styles.emptySectionHeading}>{t('home.upcoming')}</Text>
          <View style={styles.emptyUpcoming}>
            <View style={styles.emptyRocketCircle}>
              <Ionicons name="rocket-outline" size={46} color={theme.isDark ? theme.colors.textMuted : '#c8c7ca'} />
            </View>
            <Text style={styles.emptyUpcomingTitle}>{t('home.no_adventures')}</Text>
            <Text style={styles.emptyUpcomingCopy}>{t('home.create_first_trip')}</Text>
          </View>

          <Text style={styles.emptyHint}>{t('home.tap_to_create')}</Text>
        </ScrollView>

        <View
          style={[styles.fixedHeader, { top: headerTop }]}
          onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}>
          <TabHeader inviteCount={pendingInvites.length} />
        </View>

        <FloatingFab
          open={fabOpen}
          bottom={floatingBottom}
          onToggle={() => setFabOpen((current) => !current)}
          onDismiss={() => setFabOpen(false)}
          onJoin={() => { setFabOpen(false); setJoinModalOpen(true); setJoinCode(''); setJoinError(''); }}
          t={t}
        />

        <Modal visible={joinModalOpen} transparent animationType="fade" onRequestClose={() => setJoinModalOpen(false)}>
          <JoinModal
            code={joinCode}
            onChangeCode={setJoinCode}
            onJoin={() => void handleJoin()}
            onClose={() => setJoinModalOpen(false)}
            busy={joinBusy}
            error={joinError}
            insets={insets}
            t={t}
          />
        </Modal>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          styles.screenContent,
          { paddingTop: headerClearance, paddingBottom: Math.max(insets.bottom, 14) + 100 },
        ]}
        showsVerticalScrollIndicator={false}>

        {pendingInvites.length > 0 ? (
          <View style={styles.inviteSection}>
            <View style={styles.inviteSectionHeader}>
              <Ionicons name="mail-unread-outline" size={16} color={theme.colors.primary} />
              <Text style={styles.inviteSectionTitle}>{t('home.invited')}</Text>
            </View>
            {pendingInvites.map((invite) => (
              <InviteCard
                key={invite.id}
                invite={invite}
                highlighted={invite.id === focusInviteId}
                busy={inviteActionBusy === invite.id || inviteActionBusy === invite.id + '_decline'}
                onAccept={handleAcceptInvite}
                onDecline={handleDeclineInvite}
              />
            ))}
          </View>
        ) : null}

        {/* Once we have trips to show, a later loading=true from a
            background refetch (e.g. after invalidateTripCache on an
            invite accept/decline) must NOT swap this whole tree back out
            for the skeleton — that unmounts every BigHeroCard + Avatar
            underneath, which is what caused avatars to blank and re-fade-in
            on every refresh even though the image itself was cached. Only
            show the skeleton when we have nothing at all to show yet. */}
        {loading && quests.length === 0 ? (
          <View style={styles.loadingState}>
            <Text style={styles.loadingText}>{t('home.loading')}</Text>
          </View>
        ) : (
          <>
            {/* ── BigHero rail ────────────────────────────────────────────── */}
            <ScrollView
              ref={carouselRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              decelerationRate="fast"
              snapToInterval={upcomingCardWidth + 14}
              snapToAlignment="start"
              contentContainerStyle={styles.bigHeroContent}
              onMomentumScrollEnd={(event) => {
                const offset = event.nativeEvent.contentOffset.x;
                const cardWidth = upcomingCardWidth + 14;
                const index = Math.round(offset / cardWidth);
                setSelectedTripIndex(Math.min(index, sortedTrips.length - 1));
              }}
              style={styles.bigHeroScroll}>
              {sortedTrips.map((entry) => (
                <BigHeroCard
                  key={entry.quest.id}
                  trip={entry}
                  width={upcomingCardWidth}
                  cardHeight={Math.min(upcomingCardWidth * 0.92, screenHeight * 0.36, 320)}
                  sealedCount={activities.filter((a) => a.tripId === entry.quest.id && a.isHidden && !a.isRevealed).length}
                  members={membersByTripId[entry.quest.id] ?? []}
                  failedAvatars={failedMemberAvatars}
                  onAvatarError={(id) => setFailedMemberAvatars((prev) => new Set([...prev, id]))}
                  now={now}
                  t={t}
                />
              ))}
            </ScrollView>

            {/* ── Dashes pagination + swipe hint ──────────────────────────── */}
            {sortedTrips.length > 1 ? (
              <View style={styles.dashRow}>
                <View style={styles.dashes}>
                  {sortedTrips.map((entry, index) => (
                    <View
                      key={entry.quest.id}
                      style={[styles.dash, index === selectedTripIndex && styles.dashActive]}
                    />
                  ))}
                </View>
                {/* Only show the "swipe for more" hint while there are still
                    adventures to the RIGHT of the current card. When the user
                    has swiped to the last one, nothing more is to be revealed
                    by swiping right, so hide the arrow + text. */}
                {selectedTripIndex < sortedTrips.length - 1 ? (
                  <View style={styles.swipeHint}>
                    <Text style={styles.swipeHintText}>{t('home.swipe_for_more')}</Text>
                    <Ionicons name="arrow-forward" size={14} color={theme.colors.textMeta} />
                  </View>
                ) : null}
              </View>
            ) : null}

            {/* ── ACTIVITY feed ───────────────────────────────────────────── */}
            <ActivityFeedCard
              tripId={featuredTrip?.quest.id}
              events={tripEvents}
              activities={activities.filter((a) => a.tripId === featuredTrip?.quest.id)}
              members={featuredTrip ? membersByTripId[featuredTrip.quest.id] ?? [] : []}
              failedAvatars={failedMemberAvatars}
              onAvatarError={(id) => setFailedMemberAvatars((prev) => new Set([...prev, id]))}
              now={now}
              t={t}
            />

            {/* ── UP NEXT row ─────────────────────────────────────────────── */}
            <UpNextRow
              trip={featuredTrip}
              activities={activities.filter((a) => a.tripId === featuredTrip?.quest.id)}
              now={now}
              t={t}
            />
          </>
        )}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </ScrollView>

      <View
        style={[styles.fixedHeader, { top: headerTop }]}
        onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}>
        <TabHeader inviteCount={pendingInvites.length} />
      </View>

      {/* Bottom-floating countdown card removed: the new BigHeroCard already
          surfaces day-of-trip, time-left, member avatars and an Enter button
          right on the photo. */}

      <FloatingFab
        open={fabOpen}
        bottom={floatingBottom}
        onToggle={() => setFabOpen((current) => !current)}
        onDismiss={() => setFabOpen(false)}
        onJoin={() => { setFabOpen(false); setJoinModalOpen(true); setJoinCode(''); setJoinError(''); }}
        t={t}
      />

      <Modal visible={joinModalOpen} transparent animationType="fade" onRequestClose={() => setJoinModalOpen(false)}>
        <JoinModal
          code={joinCode}
          onChangeCode={setJoinCode}
          onJoin={() => void handleJoin()}
          onClose={() => setJoinModalOpen(false)}
          busy={joinBusy}
          error={joinError}
          insets={insets}
          t={t}
        />
      </Modal>

      <Modal visible={membersOpen} transparent animationType="slide" onRequestClose={() => setMembersOpen(false)}>
        <View style={styles.membersBackdrop}>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={() => setMembersOpen(false)} />
          <View style={[styles.membersCard, { paddingBottom: Math.max(insets.bottom, 18) + 12 }]}>
            <View style={styles.membersHandle} />
            <View style={styles.membersHeader}>
              <View>
                <Text style={styles.membersEyebrow}>{t('home.members_heading')}</Text>
                <Text style={styles.membersTitle}>{featuredTrip?.quest.title ?? t('home.defaultTripName')}</Text>
              </View>
              <TouchableOpacity style={styles.membersClose} activeOpacity={0.88} onPress={() => setMembersOpen(false)}>
                <Ionicons name="close" size={20} color={theme.colors.textPrimary} />
              </TouchableOpacity>
            </View>

            {membersLoading ? (
              <Text style={styles.membersLoading}>{t('home.members_loading')}</Text>
            ) : (
              <View style={styles.membersList}>
                {featuredMembers.map((member) => (
                  <Pressable
                    key={member.id}
                    style={({ pressed }: { pressed: boolean }) => [styles.memberRow, pressed ? { opacity: 0.7 } : null]}
                    onPress={() => {
                      setMembersOpen(false);
                      setTimeout(() => setProfileCardUserId(member.id), 280);
                    }}>
                    <View style={styles.memberAvatar}>
                      <Avatar
                        uri={member.avatarUrl}
                        name={member.name}
                        fallbackText={getInitials(member.name)}
                        forceFallback={failedMemberAvatars.has(member.id)}
                        onError={() => setFailedMemberAvatars(prev => new Set([...prev, member.id]))}
                        size={42}
                        online={member.isOnline}
                        fallbackBackgroundColor={theme.colors.avatarDark}
                        fallbackTextColor="#fff"
                      />
                    </View>
                    <View style={styles.memberCopy}>
                      <Text style={styles.memberName}>{member.name}</Text>
                      <Text style={styles.memberMeta}>{member.isOwner ? t('common.owner') : t('common.member')}</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        </View>
      </Modal>

      <UserProfileCard userId={profileCardUserId} onClose={() => setProfileCardUserId(null)} />
    </View>
  );
}

function FloatingFab({
  open,
  bottom,
  onToggle,
  onDismiss,
  onJoin,
  t,
}: {
  open: boolean;
  bottom: number;
  onToggle: () => void;
  onDismiss: () => void;
  onJoin: () => void;
  t?: (key: string) => string;
}) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  // Animated values — driven from the `open` prop:
  //   menu  → fade + slide-up + scale
  //   back  → fade only
  //   fab + → 45° rotation so it visually becomes a ×
  const menuOpacity = useRef(new Animated.Value(0)).current;
  const menuTranslate = useRef(new Animated.Value(20)).current;
  const menuScale = useRef(new Animated.Value(0.92)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const fabRotate = useRef(new Animated.Value(0)).current;
  // Keep the menu mounted long enough to play the close animation. Set to
  // false only after the close animation finishes.
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      Animated.parallel([
        Animated.timing(backdropOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.spring(menuTranslate, { toValue: 0, useNativeDriver: true, damping: 16, stiffness: 220 }),
        Animated.spring(menuScale, { toValue: 1, useNativeDriver: true, damping: 16, stiffness: 220 }),
        Animated.timing(menuOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.spring(fabRotate, { toValue: 1, useNativeDriver: true, damping: 14, stiffness: 200 }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(backdropOpacity, { toValue: 0, duration: 160, useNativeDriver: true }),
        Animated.timing(menuTranslate, { toValue: 20, duration: 160, useNativeDriver: true }),
        Animated.timing(menuScale, { toValue: 0.92, duration: 160, useNativeDriver: true }),
        Animated.timing(menuOpacity, { toValue: 0, duration: 140, useNativeDriver: true }),
        Animated.timing(fabRotate, { toValue: 0, duration: 180, useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [open, backdropOpacity, menuTranslate, menuScale, menuOpacity, fabRotate]);

  const fabRotation = fabRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '45deg'],
  });

  // The menu is a plain overlay (not an RN <Modal>), and Home is the root
  // screen — without this, Android's system back would background the app
  // with the menu still open instead of just closing the menu.
  useEffect(() => {
    if (!open || Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onDismiss();
      return true;
    });
    return () => sub.remove();
  }, [open, onDismiss]);

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {mounted ? (
        <Animated.View
          pointerEvents={open ? 'auto' : 'none'}
          style={[styles.fabBackdrop, { opacity: backdropOpacity }]}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={onDismiss} />
        </Animated.View>
      ) : null}

      <View pointerEvents="box-none" style={[styles.fabWrap, { bottom }]}>
        {mounted ? (
          <Animated.View
            pointerEvents={open ? 'auto' : 'none'}
            style={[
              styles.fabMenu,
              {
                opacity: menuOpacity,
                transform: [{ translateY: menuTranslate }, { scale: menuScale }],
              },
            ]}>
            <TouchableOpacity
              activeOpacity={0.88}
              style={[styles.fabMenuButton, styles.fabMenuButtonPrimary, { backgroundColor: theme.colors.primary }]}
              onPress={() => {
                onDismiss();
                router.push('/create-trip');
              }}>
              <View style={[styles.fabMenuIconWrap, { backgroundColor: 'rgba(255,255,255,0.18)' }]}>
                <Ionicons name="add" size={20} color="#fff" />
              </View>
              <Text style={styles.fabMenuButtonPrimaryText} numberOfLines={1}>{t ? t('home.create_adventure') : 'Create Adventure'}</Text>
            </TouchableOpacity>

            <TouchableOpacity activeOpacity={0.88} style={[styles.fabMenuButton, styles.fabMenuButtonSecondary, { borderColor: theme.colors.primary }]} onPress={onJoin}>
              <View style={[styles.fabMenuIconWrap, { backgroundColor: theme.colors.primaryLight12 }]}>
                <Ionicons name="person-add" size={18} color={theme.colors.primary} />
              </View>
              <Text style={[styles.fabMenuButtonText, { color: theme.colors.primary }]} numberOfLines={1}>{t ? t('home.join_adventure') : 'Join Adventure'}</Text>
            </TouchableOpacity>

            <View style={styles.fabMenuCaret} />
          </Animated.View>
        ) : null}

        <TouchableOpacity
          activeOpacity={0.92}
          style={[styles.floatingFab, { backgroundColor: theme.colors.primary, shadowColor: theme.colors.primary }]}
          onPress={onToggle}>
          <Animated.View style={{ transform: [{ rotate: fabRotation }] }}>
            <Ionicons name="add" size={30} color="#fff" />
          </Animated.View>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function InfoBadge({
  icon,
  label,
  tone,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  tone: 'cyan' | 'pink';
  onPress?: () => void;
}) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const content = (
    <View style={styles.infoBadge}>
      <View style={[styles.infoBadgeIcon, tone === 'cyan' ? styles.infoBadgeIconCyan : styles.infoBadgeIconPink, { backgroundColor: tone === 'cyan' ? theme.colors.secondary : theme.colors.primary }]}>
        <Ionicons name={icon} size={16} color="#fff" />
      </View>
      <Text style={styles.infoBadgeLabel}>{label}</Text>
    </View>
  );

  if (!onPress) return content;
  return (
    <TouchableOpacity activeOpacity={0.86} onPress={onPress}>
      {content}
    </TouchableOpacity>
  );
}

function QuestCard({
  id,
  title,
  badge,
  badgeTone,
  imageUrl,
  cardWidth,
}: {
  id: string;
  title: string;
  badge: string;
  badgeTone: 'cyan' | 'pink';
  imageUrl?: string | null;
  cardWidth: number;
}) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <TouchableOpacity
      activeOpacity={0.86}
      onPress={() => router.push(`/trip/${id}`)}
      style={[styles.questCard, { width: cardWidth }, badgeTone === 'cyan' ? styles.questCardSky : styles.questCardLava]}>
      {imageUrl ? <Image source={{ uri: imageUrl }} style={styles.questCardImage} /> : null}
      <View style={[styles.questCardOverlay, badgeTone === 'cyan' ? styles.questCardOverlaySky : styles.questCardOverlayLava]} />
      <View style={[styles.questCardBadge, badgeTone === 'cyan' ? styles.questCardBadgeCyan : styles.questCardBadgePink, { backgroundColor: badgeTone === 'cyan' ? theme.colors.secondary : theme.colors.primary }]}>
        <Text style={[styles.questCardBadgeText, badgeTone === 'cyan' ? styles.questCardBadgeTextDark : null]}>{badge}</Text>
      </View>
      <Text style={styles.questCardTitle}>{title}</Text>
    </TouchableOpacity>
  );
}

// ── Hero card helpers ────────────────────────────────────────────────────────

// getTripDayInfo + formatTimeLeft live in components/big-hero-card.tsx now.

function categoryIonicon(category?: string | null): keyof typeof Ionicons.glyphMap {
  // Delegates to the shared category visual system.
  return getCategorySymbol(category).icon;
}

// BigHeroCard moved to components/big-hero-card.tsx so create-trip can
// render the exact same component as a live preview.

// ── ActivityFeedCard ─────────────────────────────────────────────────────────
// Shows the most recent things happening for the featured trip: trip events
// (member joined / left) and a synthesized "X plans tomorrow" row when there
// are activities scheduled for tomorrow.

function ActivityFeedCard({
  tripId,
  events,
  activities,
  members,
  failedAvatars,
  onAvatarError,
  now,
  t,
}: {
  tripId?: string;
  events: TripEvent[];
  activities: SideQuestActivity[];
  members: TripMember[];
  failedAvatars: Set<string>;
  onAvatarError: (id: string) => void;
  now: Date;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  if (!tripId) return null;

  // This is just a preview feed — Home shows at most 3 rows total. The full
  // list lives in the bell notification center (see TMP_Navbar.tsx), which
  // reads from a different source (NotificationLog) and has its own
  // independent read/unread state.
  const MAX_ROWS = 3;
  const allTripEvents = events.filter((e) => e.tripId === tripId);

  // Tomorrow's plans (synthesized row)
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);
  const plansTomorrow = activities.filter((a) => a.date === tomorrowStr);
  const sealedTomorrow = plansTomorrow.filter((a) => a.isHidden && !a.isRevealed).length;
  const firstPlanTomorrow = plansTomorrow.find((a) => !a.isHidden) ?? plansTomorrow[0];

  const hasTomorrowRow = plansTomorrow.length > 0;
  const tripEvents = allTripEvents.slice(0, hasTomorrowRow ? MAX_ROWS - 1 : MAX_ROWS);

  const totalNew = allTripEvents.length + (hasTomorrowRow ? 1 : 0);
  const isEmpty = totalNew === 0;

  function eventLabel(e: TripEvent): string {
    if (e.type === 'member_joined') return t('home.activity.joined', { name: e.actorName });
    if (e.type === 'member_left') return t('home.activity.left', { name: e.actorName });
    return e.actorName;
  }

  function eventRoute(e: TripEvent): string {
    if ((e.type === 'activity_added' || e.type === 'sidequest_revealed') && e.activityId) {
      return `/trip/${e.tripId}/sidequest/${e.activityId}`;
    }
    return `/trip/${e.tripId}`;
  }

  function findMember(event: TripEvent): TripMember | undefined {
    // Prefer the id (always correct); fall back to the name snapshot for
    // cached events fetched before actorId existed in the payload.
    if (event.actorId) {
      const byId = members.find((m) => m.id === event.actorId);
      if (byId) return byId;
    }
    return members.find((m) => m.name === event.actorName);
  }

  return (
    <View style={styles.activityCard}>
      <View style={styles.activityHeader}>
        <View style={styles.activityHeaderLeft}>
          <View style={styles.activityHeaderDot} />
          <Text style={styles.activityHeaderLabel}>{t('home.activity.heading')}</Text>
        </View>
        {/* Static label, not a count — this is a 3-row preview, so a number
            here ("5 new") would imply more unread items than are actually
            rendered. The full list lives in the bell notification center. */}
        <Text style={styles.activityHeaderCount}>{t('home.activity.latest_label')}</Text>
      </View>

      {tripEvents.map((event, index) => {
        // Hidden SideQuests must not reveal who added them — same rule as
        // the title itself, so neither the actor's avatar nor their name is
        // rendered for this row. A reveal isn't anyone's action either — it
        // shows the gift icon, not an avatar, regardless of who triggered it.
        const isHiddenAdd = event.type === 'activity_added' && !!event.isHidden;
        const isRevealed = event.type === 'sidequest_revealed';
        const member = isHiddenAdd || isRevealed ? undefined : findMember(event);
        return (
          <TouchableOpacity
            key={event.id}
            activeOpacity={0.84}
            onPress={() => router.push(eventRoute(event) as Href)}
            style={[styles.activityRow, index > 0 && styles.activityRowBorder]}>
            <View style={[styles.activityAvatar, isHiddenAdd && styles.activityAvatarMuted, isRevealed && styles.activityAvatarGold]}>
              {isHiddenAdd ? (
                <Ionicons name="lock-closed-outline" size={16} color={theme.colors.textMeta} />
              ) : isRevealed ? (
                <Ionicons name="gift-outline" size={16} color="#fff" />
              ) : (
                <Avatar
                  // The event payload carries the actor's live avatar, so the
                  // picture shows even when the actor isn't in the (possibly
                  // cached) member list yet — e.g. right after they joined.
                  uri={event.actorAvatarUrl ?? member?.avatarUrl}
                  name={event.actorName}
                  fallbackText={getInitials(event.actorName)}
                  forceFallback={member ? failedAvatars.has(member.id) : false}
                  onError={() => member && onAvatarError(member.id)}
                  size={36}
                  online={member?.isOnline}
                />
              )}
            </View>
            <View style={styles.activityTextBlock}>
              <Text style={styles.activityTitle} numberOfLines={2}>
                {isHiddenAdd ? (
                  t('home.activity.hidden_added')
                ) : isRevealed ? (
                  // Deliberately not appending event.activityTitle — tapping
                  // this row already opens the SideQuest detail screen,
                  // where the title is right there. Showing it here too was
                  // just noise.
                  t('home.activity.revealed')
                ) : (
                  <>
                    <Text style={styles.activityTitleBold}>{event.actorName}</Text>{' '}
                    {event.type === 'member_joined'
                      ? t('home.activity.joined_verb')
                      : event.type === 'activity_added'
                      ? t('home.activity.added_verb')
                      : t('home.activity.left_verb')}
                  </>
                )}
              </Text>
              <Text style={styles.activityMeta}>{formatRelativeTime(event.createdAt, now)}</Text>
            </View>
          </TouchableOpacity>
        );
      })}

      {plansTomorrow.length > 0 ? (
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => router.push(`/trip/${tripId}`)}
          style={[styles.activityRow, tripEvents.length > 0 && styles.activityRowBorder]}>
          <View style={[styles.activityAvatar, styles.activityAvatarMuted]}>
            <Ionicons name={categoryIonicon(firstPlanTomorrow?.category)} size={16} color={theme.colors.textMeta} />
          </View>
          <View style={styles.activityTextBlock}>
            <Text style={styles.activityTitle}>
              <Text style={styles.activityTitleBold}>{plansTomorrow.length} {t('home.activity.plans')}</Text> {t('home.activity.tomorrow')}
            </Text>
            <Text style={styles.activityMeta}>
              {firstPlanTomorrow?.title ?? ''}
              {sealedTomorrow > 0 ? ` · +${sealedTomorrow} sealed` : ''}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
        </TouchableOpacity>
      ) : null}

      {isEmpty ? (
        <View style={[styles.activityRow, styles.activityEmptyRow]}>
          <View style={[styles.activityAvatar, styles.activityAvatarMuted]}>
            <Ionicons name="time-outline" size={16} color={theme.colors.textMuted} />
          </View>
          <View style={styles.activityTextBlock}>
            <Text style={styles.activityEmptyText}>{t('home.activity.empty')}</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

// ── UpNextRow + UpNextCard ───────────────────────────────────────────────────

function UpNextRow({
  trip,
  activities,
  now,
  t,
}: {
  trip: TripWithEvent | null;
  activities: SideQuestActivity[];
  now: Date;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  if (!trip) return null;

  // Pick the next 3 upcoming activities (today or future), sorted by date+time
  const todayStr = now.toISOString().slice(0, 10);
  const upcoming = activities
    .filter((a) => a.date >= todayStr)
    .sort((a, b) => {
      const cmp = a.date.localeCompare(b.date);
      if (cmp !== 0) return cmp;
      return (a.time ?? '').localeCompare(b.time ?? '');
    })
    .slice(0, 3);

  const isEmpty = upcoming.length === 0;

  return (
    <View style={styles.upNextWrap}>
      <View style={styles.upNextHeader}>
        <Text style={styles.upNextHeading}>{t('home.up_next')}</Text>
        <TouchableOpacity activeOpacity={0.7} onPress={() => router.push(`/trip/${trip.quest.id}`)}>
          <Text style={styles.upNextSeeAll}>{t('home.see_all')}</Text>
        </TouchableOpacity>
      </View>

      {isEmpty ? (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => router.push(`/trip/${trip.quest.id}/sidequest/new`)}
          style={styles.upNextEmptyCard}>
          <View style={styles.upNextEmptyIcon}>
            <Ionicons name="add-circle-outline" size={22} color={theme.colors.textMuted} />
          </View>
          <Text style={styles.upNextEmptyText}>{t('home.upnext.empty')}</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.upNextRow}>
          {upcoming.map((activity) => (
            <UpNextCard
              key={activity.id}
              activity={activity}
              tripId={trip.quest.id}
              now={now}
              t={t}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function UpNextCard({
  activity,
  tripId,
  now,
  t,
}: {
  activity: SideQuestActivity;
  tripId: string;
  now: Date;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const styles = useThemedStyles(createStyles);
  const isSealed = activity.isHidden && !activity.isRevealed;
  const todayStr = now.toISOString().slice(0, 10);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);

  const dateLabel =
    activity.date === todayStr ? t('home.today') :
    activity.date === tomorrowStr ? t('home.tomorrow') :
    new Date(activity.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });

  const timeLabel = activity.time ? ` · ${activity.time}` : '';

  // Time-until-reveal for sealed
  function formatUnlockTimer(revealAtStr?: string | null): string | null {
    if (!revealAtStr) return null;
    const reveal = new Date(revealAtStr);
    const diffMs = reveal.getTime() - now.getTime();
    if (diffMs <= 0) return null;
    const hours = Math.floor(diffMs / (60 * 60 * 1000));
    const mins = Math.floor((diffMs % (60 * 60 * 1000)) / (60 * 1000));
    return `${hours}:${String(mins).padStart(2, '0')}`;
  }
  const unlockTimer = isSealed ? formatUnlockTimer(activity.revealAt) : null;
  // expo-image's blurRadius scale doesn't match RN core Image's — using
  // CachedImage here made sealed covers look far less blurred than the
  // identical setting on calendar/trip timeline (both use core Image).
  // Use core Image for the sealed case so the blur is visually identical,
  // and honor the activity's own configured amount, not just the default.
  const blurAmount = isSealed ? extractBlur(activity.description) ?? DEFAULT_BLUR : undefined;

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={() => router.push(`/trip/${tripId}/sidequest/${activity.id}`)}
      style={[styles.upNextCard, isSealed && styles.upNextCardSealed]}>
      <View style={[styles.upNextImageBox, isSealed && styles.upNextImageBoxSealed]}>
        {activity.imageUrl && isSealed ? (
          <Image
            source={{ uri: activity.imageUrl }}
            style={styles.upNextImage}
            resizeMode="cover"
            blurRadius={blurAmount}
          />
        ) : activity.imageUrl ? (
          <CachedImage
            source={{ uri: activity.imageUrl }}
            style={styles.upNextImage}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={150}
          />
        ) : !isSealed ? (
          <ActivityImageFallback category={activity.category} size="medium" style={styles.upNextFallback} />
        ) : null}
        {isSealed && <View style={styles.upNextLockScrim} />}
        <View style={[styles.upNextIconBadge, isSealed && styles.upNextIconBadgeSealed]}>
          <Ionicons
            name={isSealed ? 'lock-closed' : getCategorySymbol(activity.category).icon}
            size={14}
            color={isSealed ? '#8a909e' : getCategorySymbol(activity.category).iconColor}
          />
        </View>
      </View>

      <View style={styles.upNextBody}>
        <Text style={styles.upNextDate} numberOfLines={1}>
          {isSealed && unlockTimer
            ? `${t('home.upnext.unlocks')} · ${unlockTimer}`
            : `${dateLabel}${timeLabel}`}
        </Text>
        <Text style={styles.upNextTitle} numberOfLines={1}>
          {isSealed ? t('calendar.activity.hidden') : activity.title}
        </Text>
        {isSealed && activity.teaser ? (
          <Text style={styles.upNextTeaser} numberOfLines={1}>"{activity.teaser}"</Text>
        ) : (
          <Text style={styles.upNextCreator} numberOfLines={1}>
            {activity.ownerName ? `${t('home.upnext.by')} ${activity.ownerName.split(' ')[0]}` : ''}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

function JoinModal({
  code,
  onChangeCode,
  onJoin,
  onClose,
  busy,
  error,
  insets,
  t,
}: {
  code: string;
  onChangeCode: (v: string) => void;
  onJoin: () => void;
  onClose: () => void;
  busy: boolean;
  error: string;
  insets: { bottom: number };
  t?: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={onClose} />
      <View style={[styles.joinCard, { paddingBottom: Math.max(insets.bottom, 18) + 8 }]}>
        <View style={styles.joinHeader}>
          <View>
            <Text style={styles.joinEyebrow}>{t ? t('home.invite_code') : 'INVITE CODE'}</Text>
            <Text style={styles.joinTitle}>{t ? t('home.join_title') : 'Join an Adventure'}</Text>
          </View>
          <TouchableOpacity style={styles.membersClose} activeOpacity={0.88} onPress={onClose}>
            <Ionicons name="close" size={20} color={theme.colors.textPrimary} />
          </TouchableOpacity>
        </View>
        <Text style={styles.joinSubtitle}>
          {t ? t('home.join_subtitle') : 'Enter the code shared with you to join their trip.'}
        </Text>
        <TextInput
          style={styles.joinInput}
          placeholder={t ? t('home.code_placeholder') : 'e.g. A3F9B2'}
          placeholderTextColor={theme.isDark ? theme.colors.placeholderText : '#b0b5c0'}
          keyboardAppearance={theme.keyboardAppearance}
          value={code}
          // No native maxLength: iOS silently rejects the ENTIRE paste when
          // the clipboard exceeds it (a code copied from Notes often carries
          // a trailing newline) — sanitize + slice here instead so pasting
          // always lands the code.
          onChangeText={(v) => onChangeCode(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="go"
          onSubmitEditing={onJoin}
        />
        {error ? <Text style={styles.joinError}>{error}</Text> : null}
        <Pressable
          style={({ pressed }) => [styles.joinButton, { backgroundColor: theme.colors.primary }, pressed && { opacity: 0.88 }, (!code.trim() || busy) && styles.joinButtonDisabled]}
          onPress={onJoin}
          disabled={!code.trim() || busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.joinButtonText}>{t ? t('home.join_adventure') : 'Join Adventure'}</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function sortTripsByUpcomingEvent(quests: Quest[], activities: SideQuestActivity[], now: Date) {
  return quests
    .map((quest) => getTripWithEvent(quest, activities, now))
    .filter((entry): entry is TripWithEvent => Boolean(entry))
    .sort((left, right) => left.nextEventDate.getTime() - right.nextEventDate.getTime());
}

function getTripWithEvent(quest: Quest, activities: SideQuestActivity[], now: Date): TripWithEvent | null {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const tripStart = new Date(`${quest.startDate}T12:00:00`);
  const tripEnd = new Date(`${quest.endDate}T12:00:00`);
  // Whether the trip is currently happening — independent of whether the
  // trip has individual activities scheduled. Previously this was only set
  // in the "no activities" branch, which made the LIVE badge missing on
  // any ongoing trip that had upcoming sidequests.
  const isOngoing = tripStart.getTime() <= today.getTime() && tripEnd.getTime() >= today.getTime();

  const tripActivities = activities
    .filter((activity) => activity.tripId === quest.id)
    .map((activity) => ({
      label: activity.visibility === 'hidden' ? 'Hidden' : activity.title?.trim() || 'Upcoming event',
      date: new Date(`${activity.date}T12:00:00`),
    }))
    .filter((item) => item.date.getTime() >= today.getTime())
    .sort((left, right) => left.date.getTime() - right.date.getTime());

  if (tripActivities[0]) {
    return {
      quest,
      nextEventDate: tripActivities[0].date,
      nextEventLabel: tripActivities[0].label,
      upcomingEvents: tripActivities,
      isOngoing,
    };
  }

  // Ongoing trip with no remaining activities — show with today as anchor
  if (isOngoing) {
    return {
      quest,
      nextEventDate: today,
      nextEventLabel: quest.title?.trim() || 'Ongoing adventure',
      upcomingEvents: [{ label: quest.title?.trim() || 'Ongoing adventure', date: today }],
      isOngoing: true,
    };
  }

  // Trip fully in the past — skip
  if (tripEnd.getTime() < today.getTime()) {
    return null;
  }

  // Upcoming trip
  return {
    quest,
    nextEventDate: tripStart,
    nextEventLabel: quest.title?.trim() || 'Upcoming adventure',
    upcomingEvents: [{ label: quest.title?.trim() || 'Upcoming adventure', date: tripStart }],
    isOngoing: false,
  };
}

// getInitials is imported from components/big-hero-card.tsx

function getCountdownParts(targetDate: Date | undefined, now: Date, t?: (key: string) => string) {
  if (!targetDate) {
    return [
      { label: t ? t('home.countdown_days') : 'DAYS', value: '00' },
      { label: t ? t('home.countdown_hours') : 'HOURS', value: '00' },
      { label: t ? t('home.countdown_minutes') : 'MIN', value: '00' },
    ];
  }

  const diff = Math.max(0, targetDate.getTime() - now.getTime());
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);

  return [
    { label: t ? t('home.countdown_days') : 'DAYS', value: String(days).padStart(2, '0') },
    { label: t ? t('home.countdown_hours') : 'HOURS', value: String(hours).padStart(2, '0') },
    { label: t ? t('home.countdown_minutes') : 'MIN', value: String(minutes).padStart(2, '0') },
  ];
}

function formatHeaderCountdown(targetDate: Date | undefined, now: Date) {
  const parts = getCountdownParts(targetDate, now);
  return `${parts[0].value}D ${parts[1].value}H`;
}

function formatCardCountdown(targetDate: Date, now: Date, t?: (key: string, vars?: Record<string, string | number>) => string) {
  const diff = Math.max(0, targetDate.getTime() - now.getTime());
  const days = Math.ceil(diff / 86400000);
  if (days <= 1) return t ? t('home.ongoing') : 'ONGOING';
  return t ? t('home.in_days', { days }) : `IN ${days} DAYS`;
}

function getMembersLabel(quest?: Quest | null, t?: (key: string, vars?: Record<string, string | number>) => string) {
  const count = quest?.ownerIds?.length || 1;
  if (t) return t('home.members_count', { count });
  return `${count} MEMBERS`;
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.bgPrimary,
  },
  // Floats ON TOP of the ScrollView (position: absolute) instead of
  // reserving its own space above it — the same relationship the bottom tab
  // bar already has with this same ScrollView. Content scrolls behind the
  // translucent pill instead of disappearing into dead space the moment it
  // passes underneath. Same look as the tab bar too (app/(tabs)/_layout.tsx):
  // translucent white, full rounding, same shadow — header/footer as a pair.
  fixedHeader: {
    position: 'absolute',
    left: 16,
    right: 16,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 10,
    borderRadius: 999,
    // Mirrors the tab bar pill (app/(tabs)/_layout.tsx): near-opaque surface;
    // dark separates via a hairline ring instead of the big drop shadow.
    backgroundColor: theme.colors.surfaceBar,
    borderWidth: theme.isDark ? StyleSheet.hairlineWidth : 0,
    borderColor: theme.colors.borderPrimary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: theme.isDark ? 0.35 : 0.07,
    shadowRadius: 20,
    elevation: theme.isDark ? 0 : 10,
  },
  screenContent: {
    paddingHorizontal: SPACING.xl,
    paddingBottom: 110,
  },
  emptyScreenContent: {
    flexGrow: 1,
    paddingHorizontal: SPACING.xl,
    paddingBottom: 164,
  },
  emptySectionHeading: {
    marginTop: SPACING.xxxl,
    ...TYPOGRAPHY.eyebrow,
    color: theme.colors.textMeta,
  },
  emptyUpcoming: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 90,
    paddingBottom: 92,
  },
  emptyRocketCircle: {
    width: 112,
    height: 112,
    borderRadius: 56,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bgLight,
  },
  emptyUpcomingTitle: {
    marginTop: 28,
    color: theme.colors.textPrimary,
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -1.2,
  },
  emptyUpcomingCopy: {
    marginTop: SPACING.lg,
    maxWidth: 240,
    color: theme.colors.textSecondary,
    fontSize: 18,
    lineHeight: 30,
    textAlign: 'center',
  },
  emptyHint: {
    marginTop: 'auto',
    textAlign: 'center',
    // Instructional copy — textMuted is too faint on the dark page bg.
    color: theme.isDark ? theme.colors.textMeta : theme.colors.textMuted,
    fontSize: 14,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 50,
    gap: SPACING.md,
  },
  avatarShell: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.bgLight,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: theme.isDark ? 0.2 : 0.05,
    shadowRadius: 12,
    elevation: theme.isDark ? 0 : 3,
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarCore: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.colors.avatarDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: theme.colors.white,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  hero: {
    marginTop: SPACING.xxxl,
  },
  heroTitle: {
    color: theme.colors.textPrimary,
    fontSize: 40,
    lineHeight: 42,
    fontWeight: '900',
    letterSpacing: -1.8,
  },
  loadingState: {
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: theme.colors.textSecondary,
    fontSize: 15,
    fontWeight: '600',
  },
  dateRow: {
    marginTop: SPACING.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  dateText: {
    color: theme.colors.textSecondary,
    fontSize: 17,
    letterSpacing: -0.3,
  },
  badgeRow: {
    marginTop: 18,
    flexDirection: 'row',
    gap: SPACING.md,
    flexWrap: 'wrap',
  },
  infoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    borderRadius: RADIUS.circle,
    backgroundColor: theme.colors.bgLight,
    borderWidth: 1,
    borderColor: theme.colors.borderPrimary,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  infoBadgeIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoBadgeIconCyan: {
    backgroundColor: theme.colors.secondary,
  },
  infoBadgeIconPink: {
    backgroundColor: theme.colors.primary,
  },
  infoBadgeLabel: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.9,
  },
  sectionHeader: {
    marginTop: SPACING.xxxl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  sectionLabel: {
    ...TYPOGRAPHY.eyebrow,
    color: theme.colors.textMeta,
  },
  sectionLine: {
    flex: 1,
    height: 1,
    backgroundColor: theme.colors.borderPrimary,
  },
  carousel: {
    marginTop: 16,
    marginRight: -22,
  },
  carouselContent: {
    paddingRight: 22,
    gap: 14,
  },

  // ── BigHeroCard ─────────────────────────────────────────────────────────
  bigHeroScroll: {
    marginTop: 8,
    marginRight: -22,
  },
  bigHeroContent: {
    paddingRight: 22,
    gap: 14,
  },
  bigHeroCard: {
    borderRadius: 32,
    overflow: 'hidden',
    backgroundColor: '#2a2a2a',
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 10,
  },
  bigHeroImage: {
    ...StyleSheet.absoluteFillObject,
  },
  bigHeroImageFallback: {
    backgroundColor: '#3a2c26',
  },
  // Stacked gradient fakes — bottom heaviest, fading up
  bigHeroGradient1: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    height: '40%',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  bigHeroGradient2: {
    position: 'absolute',
    left: 0, right: 0, bottom: '40%',
    height: '20%',
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  bigHeroGradient3: {
    position: 'absolute',
    left: 0, right: 0, bottom: '60%',
    height: '15%',
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  bigHeroTopRow: {
    position: 'absolute',
    top: 18, left: 18, right: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  bigHeroLocPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 100,
    backgroundColor: 'rgba(0,0,0,0.42)',
    maxWidth: '70%',
  },
  bigHeroLocText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  bigHeroLivePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 100,
    backgroundColor: 'rgba(20,22,29,0.7)',
  },
  bigHeroLiveDot: {
    width: 8, height: 8,
    borderRadius: 4,
    backgroundColor: '#3ddc8c',
  },
  bigHeroLiveText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  bigHeroUpcomingPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 100,
    backgroundColor: 'rgba(20,22,29,0.7)',
  },
  bigHeroUpcomingText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  bigHeroBottom: {
    position: 'absolute',
    left: 22, right: 22, bottom: 22,
  },
  bigHeroDayLine: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  bigHeroTitle: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.6,
    lineHeight: 32,
    marginBottom: 14,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  bigHeroFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bigHeroAvatars: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bigHeroAvatar: {
    width: 32, height: 32,
    borderRadius: 16,
    backgroundColor: '#fff1f5',
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  bigHeroAvatarImage: {
    width: '100%', height: '100%',
  },
  bigHeroAvatarText: {
    fontSize: 11,
    fontWeight: '800',
    color: theme.colors.primary,
  },
  bigHeroSealed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  bigHeroSealedText: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 12,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  bigHeroEnter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 100,
    backgroundColor: '#fff',
  },
  bigHeroEnterText: {
    color: '#14161d',
    fontSize: 13,
    fontWeight: '800',
  },

  // ── Dashes pagination ──────────────────────────────────────────────────
  dashRow: {
    marginTop: 8,
    paddingHorizontal: 22,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dashes: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dash: {
    width: 16, height: 3,
    borderRadius: 2,
    // Same treatment as the sheet handles: visible-but-quiet track in dark.
    backgroundColor: theme.colors.sheetHandle,
  },
  dashActive: {
    width: 28,
    backgroundColor: theme.colors.textPrimary,
  },
  swipeHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  swipeHintText: {
    color: theme.colors.textMeta,
    fontSize: 12,
    fontWeight: '500',
  },

  // ── Activity feed card ─────────────────────────────────────────────────
  activityCard: {
    marginTop: 10,
    backgroundColor: theme.colors.surface,
    borderRadius: 18,
    paddingVertical: 2,
    // Dark separates from the page via surface contrast + hairline border.
    borderWidth: theme.isDark ? StyleSheet.hairlineWidth : 0,
    borderColor: theme.colors.borderPrimary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: theme.isDark ? 0.2 : 0.05,
    shadowRadius: 8,
    elevation: theme.isDark ? 0 : 2,
  },
  activityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  activityHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  activityHeaderDot: {
    width: 7, height: 7,
    borderRadius: 4,
    backgroundColor: theme.colors.success,
  },
  activityHeaderLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: theme.colors.textPrimary,
    letterSpacing: 1.4,
  },
  activityHeaderCount: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.colors.textMeta,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 9,
    gap: 10,
  },
  activityRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.isDark ? theme.colors.borderPrimary : '#eef0f4',
  },
  activityAvatar: {
    width: 36, height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.avatarLight,
    alignItems: 'center',
    justifyContent: 'center',
    // No overflow:hidden — Avatar clips its own image and the online dot
    // must be able to sit on the circle's edge.
  },
  activityAvatarMuted: {
    backgroundColor: theme.colors.bgLight,
  },
  activityAvatarGold: {
    backgroundColor: '#d79a19',
  },
  activityTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  activityTitle: {
    fontSize: 13,
    color: theme.colors.textPrimary,
    fontWeight: '500',
    lineHeight: 18,
  },
  activityTitleBold: {
    fontWeight: '800',
  },
  activityMeta: {
    fontSize: 11,
    color: theme.colors.textMeta,
    marginTop: 2,
  },
  activityEmptyRow: {
    paddingVertical: 14,
  },
  activityEmptyText: {
    fontSize: 12,
    color: theme.colors.textMeta,
    fontWeight: '500',
  },

  // ── Up Next row ────────────────────────────────────────────────────────
  upNextWrap: {
    marginTop: 10,
  },
  upNextHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  upNextHeading: {
    fontSize: 11,
    fontWeight: '800',
    color: theme.colors.textPrimary,
    letterSpacing: 1.4,
  },
  upNextSeeAll: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textMeta,
  },
  upNextRow: {
    flexDirection: 'row',
    gap: 10,
  },
  upNextCard: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: theme.isDark ? StyleSheet.hairlineWidth : 0,
    borderColor: theme.colors.borderPrimary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: theme.isDark ? 0.2 : 0.04,
    shadowRadius: 6,
    elevation: theme.isDark ? 0 : 1,
  },
  upNextCardSealed: {
    // Warm "mystery" wash — dark keeps the same warmth as a muted tint
    // (same family as the stay surfaces), never a bright beige block.
    backgroundColor: theme.colors.sealedSurface,
  },
  upNextImageBox: {
    height: 76,
    // Image loading fill — dark-aware so covers never flash a light box.
    backgroundColor: theme.colors.sealedSurfaceSubtle,
    position: 'relative',
  },
  upNextImageBoxSealed: {
    backgroundColor: theme.colors.sealedSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  upNextImage: {
    width: '100%', height: '100%',
  },
  upNextLockScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 17, 23, 0.32)',
  },
  upNextFallback: {
    width: '100%',
    height: '100%',
    borderRadius: 0,
  },
  upNextIconBadge: {
    position: 'absolute',
    top: 8, left: 8,
    width: 28, height: 28,
    borderRadius: 14,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
  },
  upNextIconBadgeSealed: {
    position: 'absolute',
    top: '40%',
    left: '50%',
    transform: [{ translateX: -14 }],
    width: 28, height: 28,
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  upNextBody: {
    padding: 9,
  },
  upNextDate: {
    fontSize: 10,
    fontWeight: '700',
    color: theme.colors.textMeta,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  upNextTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: theme.colors.textPrimary,
    letterSpacing: -0.2,
  },
  upNextCreator: {
    fontSize: 11,
    color: theme.colors.textMeta,
    marginTop: 4,
    fontWeight: '500',
  },
  upNextTeaser: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    marginTop: 4,
    fontStyle: 'italic',
  },
  upNextEmptyCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.isDark ? theme.colors.borderPrimary : '#eef0f4',
    borderStyle: 'dashed',
    paddingVertical: 22,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  upNextEmptyIcon: {
    opacity: 0.7,
  },
  upNextEmptyText: {
    fontSize: 12,
    color: theme.colors.textMeta,
    fontWeight: '500',
    textAlign: 'center',
  },
  questCard: {
    height: 220,
    borderRadius: 34,
    paddingHorizontal: 20,
    paddingTop: 154,
    overflow: 'hidden',
  },
  questCardImage: {
    ...StyleSheet.absoluteFillObject,
  },
  questCardLava: {
    backgroundColor: '#2a2430',
  },
  questCardSky: {
    backgroundColor: '#8e84b7',
  },
  questCardOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  questCardOverlayLava: {
    backgroundColor: 'rgba(25,19,31,0.36)',
  },
  questCardOverlaySky: {
    backgroundColor: 'rgba(44,32,78,0.28)',
  },
  questCardBadge: {
    position: 'absolute',
    left: 18,
    top: 22,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  questCardBadgePink: {
    backgroundColor: '#ff8ca0',
  },
  questCardBadgeCyan: {
    backgroundColor: '#10c7e8',
  },
  questCardBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  questCardBadgeTextDark: {
    color: '#0d2c34',
  },
  questCardTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.9,
  },
  countdownWrap: {
    position: 'absolute',
    left: 22,
    zIndex: 4,
  },
  activeQuestCard: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 245,
    height: 68,
    borderRadius: 24,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.isDark ? theme.colors.borderPrimary : '#edf0f4',
    paddingHorizontal: 18,
    ...theme.shadows.medium,
  },
  activeQuestDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#79a7b5',
    marginRight: 12,
  },
  activeQuestTextBlock: {
    flex: 1,
  },
  activeQuestLabel: {
    color: theme.isDark ? theme.colors.textPrimary : '#252833',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 2.4,
  },
  activeQuestTitle: {
    marginTop: 2,
    color: theme.isDark ? theme.colors.secondary : '#0b7a94',
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: -0.4,
  },
  activeQuestMeta: {
    marginTop: 2,
    color: theme.colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  errorText: {
    marginTop: 22,
    color: theme.colors.error,
    textAlign: 'center',
  },
  fabBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.backdropFab,
  },
  fabWrap: {
    position: 'absolute',
    right: 22,
    alignItems: 'flex-end',
  },
  floatingFab: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    // Pink glow reads on both themes; Android elevation off in dark (grey box).
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: theme.isDark ? 0.45 : 0.26,
    shadowRadius: 22,
    elevation: theme.isDark ? 0 : 8,
  },
  fabMenu: {
    position: 'relative',
    width: 240,
    marginBottom: 14,
    borderRadius: 22,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: theme.isDark ? StyleSheet.hairlineWidth : 0,
    borderColor: theme.colors.borderPrimary,
    padding: 12,
    gap: 8,
    ...theme.shadows.floating,
  },
  fabMenuButton: {
    minHeight: 56,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  fabMenuButtonPrimary: {
    // backgroundColor applied inline via theme.colors.primary for theme consistency
    borderWidth: 1.5,
    borderColor: 'transparent', // match secondary's footprint so both buttons render at identical height
  },
  fabMenuButtonSecondary: {
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1.5,
    // borderColor applied inline via theme.colors.primary
  },
  fabMenuButtonPrimaryText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
    flex: 1,
  },
  fabMenuButtonText: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
    flex: 1,
  },
  fabMenuIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabMenuCaret: {
    position: 'absolute',
    right: 26,
    bottom: -7,
    width: 14,
    height: 14,
    backgroundColor: theme.colors.surfaceElevated,
    transform: [{ rotate: '45deg' }],
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: theme.colors.backdropModal,
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  membersBackdrop: {
    flex: 1,
    backgroundColor: theme.isDark ? theme.colors.backdropModal : 'rgba(12,14,19,0.28)',
    justifyContent: 'flex-end',
  },
  membersCard: {
    maxHeight: '82%',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    backgroundColor: theme.colors.surfaceElevated,
    paddingTop: 10,
    paddingHorizontal: 22,
  },
  membersHandle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: theme.colors.sheetHandle,
    marginBottom: 4,
  },
  membersHeader: {
    marginTop: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  membersEyebrow: {
    color: theme.isDark ? theme.colors.textMeta : '#9aa2ae',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  membersTitle: {
    marginTop: 6,
    color: theme.colors.textPrimary,
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.8,
  },
  membersClose: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.isDark ? theme.colors.bgLight : '#f5f6f8',
  },
  membersLoading: {
    marginTop: 18,
    color: theme.isDark ? theme.colors.textSecondary : '#7b828e',
    fontSize: 14,
  },
  membersList: {
    marginTop: 14,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.isDark ? theme.colors.borderPrimary : '#f1f3f6',
    gap: 12,
  },
  memberAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.avatarDark,
    // No overflow:hidden — Avatar clips its own image and the online dot
    // must be able to sit on the circle's edge.
  },
  memberCopy: {
    flex: 1,
  },
  memberName: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  memberMeta: {
    marginTop: 3,
    color: theme.isDark ? theme.colors.textSecondary : '#7b828e',
    fontSize: 13,
    fontWeight: '600',
  },

  // ─ Pending invites section
  inviteSection: {
    marginTop: 22,
    gap: 10,
  },
  inviteSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 2,
  },
  inviteSectionTitle: {
    color: theme.colors.primary,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  inviteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: theme.isDark ? theme.colors.primaryLight20 : '#ffd5df',
    backgroundColor: theme.isDark ? theme.colors.primaryLight08 : '#fff8fa',
    padding: 12,
    gap: 12,
  },
  inviteCardImage: {
    width: 52,
    height: 52,
    borderRadius: 14,
  },
  inviteCardImagePlaceholder: {
    backgroundColor: theme.colors.bgLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteCardBody: {
    flex: 1,
  },
  inviteCardTitle: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  inviteCardMeta: {
    marginTop: 2,
    color: theme.isDark ? theme.colors.textSecondary : '#7b828e',
    fontSize: 12,
  },
  inviteCardFrom: {
    marginTop: 3,
    color: theme.isDark ? theme.colors.textMeta : '#a0a6b2',
    fontSize: 11,
    fontWeight: '600',
  },
  inviteCardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inviteAcceptBtn: {
    height: 34,
    paddingHorizontal: 16,
    borderRadius: 17,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteAcceptText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
  inviteDeclineBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: theme.colors.bgLight,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ─ Join modal
  joinCard: {
    borderRadius: 28,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: theme.isDark ? StyleSheet.hairlineWidth : 0,
    borderColor: theme.colors.borderPrimary,
    padding: 20,
  },
  joinHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  joinEyebrow: {
    color: theme.isDark ? theme.colors.textMeta : '#97a0ad',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  joinTitle: {
    marginTop: 4,
    color: theme.colors.textPrimary,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.7,
  },
  joinSubtitle: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 18,
  },
  joinInput: {
    height: 54,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: theme.colors.borderInput,
    backgroundColor: theme.colors.bgLightest,
    paddingHorizontal: 18,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 6,
    color: theme.colors.textPrimary,
    textAlign: 'center',
  },
  joinError: {
    marginTop: 8,
    color: theme.colors.error,
    fontSize: 13,
    lineHeight: 18,
  },
  joinButton: {
    marginTop: 14,
    height: 52,
    borderRadius: 16,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinButtonDisabled: {
    opacity: 0.5,
  },
  joinButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
});
