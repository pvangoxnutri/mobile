import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BrandMark from '@/components/brand-mark';
import { useAuth } from '@/components/auth-provider';
import { useI18n } from '@/components/i18n-provider';
import TabHeader from '@/components/tab-header';
import TopAlertsButton from '@/components/top-alerts-button';
import UserProfileCard from '@/components/user-profile-card';
import InviteCard from '@/components/invite-card';
import ActivityImageFallback from '@/components/activity-image-fallback';
import { getCategorySymbol } from '@/lib/category-symbol';
import { BigHeroCard, getInitials, type TripWithEvent, type TripMember } from '@/components/big-hero-card';
import { apiFetch, apiJson } from '@/lib/api';
import { getCached, setCached, invalidateCache } from '@/lib/cache';
import { useScalePress } from '@/hooks/useMotion';
import type { PendingInvite, Quest, SideQuestActivity, TripEvent } from '@/lib/types';
import { COLORS, SHADOWS, SPACING, RADIUS, TYPOGRAPHY } from '@/constants/design-tokens';

// TripMember, TripWithEvent and BigHeroCard live in components/big-hero-card.tsx
// so the create-trip preview can reuse the exact same rendering as home.

export default function HomeScreen() {
  const { user, signOut } = useAuth();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { width, height: screenHeight } = useWindowDimensions();
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
  const [homeMembers, setHomeMembers] = useState<TripMember[]>([]);
  const [tripEvents, setTripEvents] = useState<TripEvent[]>([]);
  const eventFade = useRef(new Animated.Value(1)).current;
  const carouselRef = useRef<ScrollView>(null);
  const floatingBottom = Math.max(insets.bottom, 14) + 78;
  // Hero card fills the viewport leaving ~24px peek of the next card on the
  // right, signalling "swipe for more". snapToInterval below locks one card
  // per page.
  const upcomingCardWidth = width - 48;

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  const loadQuests = useCallback(() => {
    let active = true;

    // Show cached trips + activities INSTANTLY so a tab switch back to home
    // doesn't flash a loading state. We then refetch in the background and
    // update if anything has changed.
    const cachedTrips = getCached<Quest[]>('/api/trips');
    if (cachedTrips) {
      setQuests(cachedTrips);
      const cachedActs: SideQuestActivity[] = [];
      for (const trip of cachedTrips) {
        const acts = getCached<SideQuestActivity[]>(`/api/trips/${trip.id}/activities`);
        if (acts) cachedActs.push(...acts);
      }
      if (cachedActs.length > 0) setActivities(cachedActs);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setError('');

    console.log('[HOME] loading trips...');
    void apiJson<Quest[]>('/api/trips')
      .then(async (data) => {
        if (!active) return;
        const tripList = Array.isArray(data) ? data : [];
        setCached('/api/trips', tripList);

        const activityGroups = await Promise.all(
          tripList.map(async (trip) => {
            try {
              const acts = await apiJson<SideQuestActivity[]>(`/api/trips/${trip.id}/activities`);
              setCached(`/api/trips/${trip.id}/activities`, acts);
              return acts;
            } catch (err) {
              console.warn(`[HOME] loadActivities failed for trip ${trip.id}:`, err instanceof Error ? err.message : err);
              return [];
            }
          }),
        );

        if (!active) return;
        setQuests(tripList);
        setActivities(activityGroups.flat());
      })
      .catch(async (err: Error) => {
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
    const cached = getCached<PendingInvite[]>('/api/trips/invites/me');
    if (cached) setPendingInvites(cached);

    void apiJson<PendingInvite[]>('/api/trips/invites/me')
      .then((data) => {
        setCached('/api/trips/invites/me', data);
        setPendingInvites(data);
      })
      .catch((err: unknown) => {
        console.warn('[HOME] loadInvites failed:', err instanceof Error ? err.message : err);
      });
  }, []);

  const loadTripEvents = useCallback(() => {
    const cached = getCached<TripEvent[]>('/api/trips/events/me');
    if (cached) setTripEvents(cached);

    void apiJson<TripEvent[]>('/api/trips/events/me')
      .then((data) => {
        setCached('/api/trips/events/me', data);
        setTripEvents(data);
      })
      .catch((err: unknown) => {
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

  useEffect(() => {
    setSelectedTripIndex(0);
    setFeaturedEventIndex(0);
  }, [quests]);

  useEffect(() => {
    setFeaturedEventIndex(0);
  }, [featuredTrip?.quest.id]);

  // Load members for the featured trip so the BigHeroCard can show avatar
  // overlay. Re-fires when the user swipes to a different trip. Cached
  // per-trip so re-visiting a swiped-to-trip is instant.
  useEffect(() => {
    if (!featuredTrip) {
      setHomeMembers([]);
      return;
    }
    let active = true;
    const url = `/api/trips/${featuredTrip.quest.id}/members`;
    const cached = getCached<TripMember[]>(url);
    if (cached) setHomeMembers(cached);

    void apiJson<TripMember[]>(url)
      .then((data) => {
        setCached(url, data);
        if (active) setHomeMembers(data);
      })
      .catch((err: unknown) => {
        console.warn('[HOME] homeMembers load failed:', err instanceof Error ? err.message : err);
        if (active && !cached) setHomeMembers([]);
      });
    return () => {
      active = false;
    };
  }, [featuredTrip?.quest.id]);

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
      // Trip list and invites have changed server-side — drop stale cache
      // so the next reads (incl. tab switches) hit the network.
      invalidateCache('/api/trips');
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
      setJoinModalOpen(false);
      setJoinCode('');
      invalidateCache('/api/trips');
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
    setMembersLoading(true);
    setFailedMemberAvatars(new Set());

    try {
      const data = await apiJson<TripMember[]>(`/api/trips/${featuredTrip.quest.id}/members`);
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
          contentContainerStyle={[
            styles.emptyScreenContent,
            { paddingTop: Math.max(insets.top, 16) + 8, paddingBottom: floatingBottom + 96 },
          ]}
          showsVerticalScrollIndicator={false}>
          <TabHeader inviteCount={pendingInvites.length} />

          {pendingInvites.length > 0 ? (
            <View style={[styles.inviteSection, { marginTop: 20 }]}>
              <View style={styles.inviteSectionHeader}>
                <Ionicons name="mail-unread-outline" size={16} color={COLORS.primary} />
                <Text style={[styles.inviteSectionTitle, { color: COLORS.primary }]}>{t('home.invited')}</Text>
              </View>
              {pendingInvites.map((invite) => (
                <InviteCard
                  key={invite.id}
                  invite={invite}
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
              <Ionicons name="rocket-outline" size={46} color="#c8c7ca" />
            </View>
            <Text style={styles.emptyUpcomingTitle}>{t('home.no_adventures')}</Text>
            <Text style={styles.emptyUpcomingCopy}>{t('home.create_first_trip')}</Text>
          </View>

          <Text style={styles.emptyHint}>{t('home.tap_to_create')}</Text>
        </ScrollView>

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
        contentContainerStyle={[
          styles.screenContent,
          { paddingTop: Math.max(insets.top, 16) + 8, paddingBottom: Math.max(insets.bottom, 14) + 100 },
        ]}
        showsVerticalScrollIndicator={false}>
        <TabHeader inviteCount={pendingInvites.length} />

        {pendingInvites.length > 0 ? (
          <View style={styles.inviteSection}>
            <View style={styles.inviteSectionHeader}>
              <Ionicons name="mail-unread-outline" size={16} color="#ff4f74" />
              <Text style={styles.inviteSectionTitle}>{t('home.invited')}</Text>
            </View>
            {pendingInvites.map((invite) => (
              <InviteCard
                key={invite.id}
                invite={invite}
                busy={inviteActionBusy === invite.id || inviteActionBusy === invite.id + '_decline'}
                onAccept={handleAcceptInvite}
                onDecline={handleDeclineInvite}
              />
            ))}
          </View>
        ) : null}

        {loading ? (
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
                  members={entry.quest.id === featuredTrip?.quest.id ? homeMembers : []}
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
                    <Ionicons name="arrow-forward" size={14} color="#8a909e" />
                  </View>
                ) : null}
              </View>
            ) : null}

            {/* ── ACTIVITY feed ───────────────────────────────────────────── */}
            <ActivityFeedCard
              tripId={featuredTrip?.quest.id}
              events={tripEvents}
              activities={activities.filter((a) => a.tripId === featuredTrip?.quest.id)}
              members={homeMembers}
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
                <Ionicons name="close" size={20} color="#161821" />
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
                      {member.avatarUrl && member.avatarUrl.trim() && !failedMemberAvatars.has(member.id) ? (
                        <Image
                          source={{ uri: member.avatarUrl }}
                          style={styles.memberAvatarImage}
                          onError={() => setFailedMemberAvatars(prev => new Set([...prev, member.id]))}
                        />
                      ) : (
                        <Text style={styles.memberAvatarText}>{getInitials(member.name)}</Text>
                      )}
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
              style={[styles.fabMenuButton, styles.fabMenuButtonPrimary, { backgroundColor: COLORS.primary }]}
              onPress={() => {
                onDismiss();
                router.push('/create-trip');
              }}>
              <View style={[styles.fabMenuIconWrap, { backgroundColor: 'rgba(255,255,255,0.18)' }]}>
                <Ionicons name="add" size={20} color="#fff" />
              </View>
              <Text style={styles.fabMenuButtonPrimaryText} numberOfLines={1}>{t ? t('home.create_adventure') : 'Create Adventure'}</Text>
            </TouchableOpacity>

            <TouchableOpacity activeOpacity={0.88} style={[styles.fabMenuButton, styles.fabMenuButtonSecondary, { borderColor: COLORS.primary }]} onPress={onJoin}>
              <View style={[styles.fabMenuIconWrap, { backgroundColor: COLORS.primaryLight12 }]}>
                <Ionicons name="person-add" size={18} color={COLORS.primary} />
              </View>
              <Text style={[styles.fabMenuButtonText, { color: COLORS.primary }]} numberOfLines={1}>{t ? t('home.join_adventure') : 'Join Adventure'}</Text>
            </TouchableOpacity>

            <View style={styles.fabMenuCaret} />
          </Animated.View>
        ) : null}

        <TouchableOpacity
          activeOpacity={0.92}
          style={[styles.floatingFab, { backgroundColor: COLORS.primary, shadowColor: COLORS.primary }]}
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
  const content = (
    <View style={styles.infoBadge}>
      <View style={[styles.infoBadgeIcon, tone === 'cyan' ? styles.infoBadgeIconCyan : styles.infoBadgeIconPink, { backgroundColor: tone === 'cyan' ? COLORS.secondary : COLORS.primary }]}>
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
  return (
    <TouchableOpacity
      activeOpacity={0.86}
      onPress={() => router.push(`/trip/${id}`)}
      style={[styles.questCard, { width: cardWidth }, badgeTone === 'cyan' ? styles.questCardSky : styles.questCardLava]}>
      {imageUrl ? <Image source={{ uri: imageUrl }} style={styles.questCardImage} /> : null}
      <View style={[styles.questCardOverlay, badgeTone === 'cyan' ? styles.questCardOverlaySky : styles.questCardOverlayLava]} />
      <View style={[styles.questCardBadge, badgeTone === 'cyan' ? styles.questCardBadgeCyan : styles.questCardBadgePink, { backgroundColor: badgeTone === 'cyan' ? COLORS.secondary : COLORS.primary }]}>
        <Text style={[styles.questCardBadgeText, badgeTone === 'cyan' ? styles.questCardBadgeTextDark : null]}>{badge}</Text>
      </View>
      <Text style={styles.questCardTitle}>{title}</Text>
    </TouchableOpacity>
  );
}

// ── Hero card helpers ────────────────────────────────────────────────────────

// getTripDayInfo + formatTimeLeft live in components/big-hero-card.tsx now.

function formatRelativeTime(dateStr: string, now: Date): string {
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const sec = Math.floor(diffMs / 1000);
  const min = Math.floor(sec / 60);
  const hour = Math.floor(min / 60);
  const day = Math.floor(hour / 24);
  if (sec < 60) return 'just now';
  if (min < 60) return `${min} min ago`;
  if (hour < 24) return `${hour}h ago`;
  if (day < 7) return `${day}d ago`;
  return date.toLocaleDateString();
}

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
  if (!tripId) return null;

  const tripEvents = events.filter((e) => e.tripId === tripId).slice(0, 3);

  // Tomorrow's plans (synthesized row)
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);
  const plansTomorrow = activities.filter((a) => a.date === tomorrowStr);
  const sealedTomorrow = plansTomorrow.filter((a) => a.isHidden && !a.isRevealed).length;
  const firstPlanTomorrow = plansTomorrow.find((a) => !a.isHidden) ?? plansTomorrow[0];

  const totalNew = tripEvents.length + (plansTomorrow.length > 0 ? 1 : 0);
  const isEmpty = totalNew === 0;

  function eventLabel(e: TripEvent): string {
    if (e.type === 'member_joined') return t('home.activity.joined', { name: e.actorName });
    if (e.type === 'member_left') return t('home.activity.left', { name: e.actorName });
    return e.actorName;
  }

  function findMember(name: string): TripMember | undefined {
    return members.find((m) => m.name === name);
  }

  return (
    <View style={styles.activityCard}>
      <View style={styles.activityHeader}>
        <View style={styles.activityHeaderLeft}>
          <View style={styles.activityHeaderDot} />
          <Text style={styles.activityHeaderLabel}>{t('home.activity.heading')}</Text>
        </View>
        <Text style={styles.activityHeaderCount}>{totalNew} {t('home.activity.new_suffix')}</Text>
      </View>

      {tripEvents.map((event, index) => {
        const member = findMember(event.actorName);
        return (
          <View key={event.id} style={[styles.activityRow, index > 0 && styles.activityRowBorder]}>
            <View style={styles.activityAvatar}>
              {member?.avatarUrl && !failedAvatars.has(member.id) ? (
                <Image
                  source={{ uri: member.avatarUrl }}
                  style={styles.activityAvatarImage}
                  onError={() => onAvatarError(member.id)}
                />
              ) : (
                <Text style={styles.activityAvatarText}>{getInitials(event.actorName)}</Text>
              )}
            </View>
            <View style={styles.activityTextBlock}>
              <Text style={styles.activityTitle}>
                <Text style={styles.activityTitleBold}>{event.actorName}</Text>{' '}
                {event.type === 'member_joined' ? t('home.activity.joined_verb') : t('home.activity.left_verb')}
              </Text>
              <Text style={styles.activityMeta}>{formatRelativeTime(event.createdAt, now)}</Text>
            </View>
          </View>
        );
      })}

      {plansTomorrow.length > 0 ? (
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => router.push(`/trip/${tripId}`)}
          style={[styles.activityRow, tripEvents.length > 0 && styles.activityRowBorder]}>
          <View style={[styles.activityAvatar, styles.activityAvatarMuted]}>
            <Ionicons name={categoryIonicon(firstPlanTomorrow?.category)} size={16} color="#8a909e" />
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
          <Ionicons name="chevron-forward" size={16} color="#bbc0c8" />
        </TouchableOpacity>
      ) : null}

      {isEmpty ? (
        <View style={[styles.activityRow, styles.activityEmptyRow]}>
          <View style={[styles.activityAvatar, styles.activityAvatarMuted]}>
            <Ionicons name="time-outline" size={16} color="#bbc0c8" />
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
            <Ionicons name="add-circle-outline" size={22} color="#bbc0c8" />
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

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={() => router.push(`/trip/${tripId}/sidequest/${activity.id}`)}
      style={[styles.upNextCard, isSealed && styles.upNextCardSealed]}>
      <View style={[styles.upNextImageBox, isSealed && styles.upNextImageBoxSealed]}>
        {!isSealed && activity.imageUrl ? (
          <Image source={{ uri: activity.imageUrl }} style={styles.upNextImage} resizeMode="cover" />
        ) : !isSealed ? (
          <ActivityImageFallback category={activity.category} size="medium" style={styles.upNextFallback} />
        ) : null}
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
          {isSealed ? (activity.title ?? t('home.upnext.sealed_title')) : activity.title}
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
            <Ionicons name="close" size={20} color="#161821" />
          </TouchableOpacity>
        </View>
        <Text style={styles.joinSubtitle}>
          {t ? t('home.join_subtitle') : 'Enter the code shared with you to join their trip.'}
        </Text>
        <TextInput
          style={styles.joinInput}
          placeholder={t ? t('home.code_placeholder') : 'e.g. A3F9B2'}
          placeholderTextColor="#b0b5c0"
          value={code}
          onChangeText={(v) => onChangeCode(v.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
          maxLength={6}
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="go"
          onSubmitEditing={onJoin}
        />
        {error ? <Text style={styles.joinError}>{error}</Text> : null}
        <Pressable
          style={({ pressed }) => [styles.joinButton, { backgroundColor: COLORS.primary }, pressed && { opacity: 0.88 }, (!code.trim() || busy) && styles.joinButtonDisabled]}
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

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.white,
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
    color: COLORS.textMeta,
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
    backgroundColor: COLORS.bgLight,
  },
  emptyUpcomingTitle: {
    marginTop: 28,
    color: COLORS.textPrimary,
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -1.2,
  },
  emptyUpcomingCopy: {
    marginTop: SPACING.lg,
    maxWidth: 240,
    color: COLORS.textSecondary,
    fontSize: 18,
    lineHeight: 30,
    textAlign: 'center',
  },
  emptyHint: {
    marginTop: 'auto',
    textAlign: 'center',
    color: COLORS.textMuted,
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
    backgroundColor: COLORS.bgLight,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
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
    backgroundColor: COLORS.avatarDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  hero: {
    marginTop: SPACING.xxxl,
  },
  heroTitle: {
    color: COLORS.textPrimary,
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
    color: COLORS.textSecondary,
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
    color: COLORS.textSecondary,
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
    backgroundColor: COLORS.bgLight,
    borderWidth: 1,
    borderColor: COLORS.borderPrimary,
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
    backgroundColor: COLORS.secondary,
  },
  infoBadgeIconPink: {
    backgroundColor: COLORS.primary,
  },
  infoBadgeLabel: {
    color: COLORS.textSecondary,
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
    color: COLORS.textMeta,
  },
  sectionLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.borderPrimary,
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
    color: COLORS.primary,
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
    backgroundColor: '#d8dce3',
  },
  dashActive: {
    width: 28,
    backgroundColor: '#14161d',
  },
  swipeHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  swipeHintText: {
    color: '#8a909e',
    fontSize: 12,
    fontWeight: '500',
  },

  // ── Activity feed card ─────────────────────────────────────────────────
  activityCard: {
    marginTop: 10,
    backgroundColor: '#fff',
    borderRadius: 18,
    paddingVertical: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
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
    backgroundColor: '#3ddc8c',
  },
  activityHeaderLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#14161d',
    letterSpacing: 1.4,
  },
  activityHeaderCount: {
    fontSize: 11,
    fontWeight: '600',
    color: '#8a909e',
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 9,
    gap: 12,
  },
  activityRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#eef0f4',
  },
  activityAvatar: {
    width: 36, height: 36,
    borderRadius: 18,
    backgroundColor: '#fff1f5',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  activityAvatarMuted: {
    backgroundColor: '#f4f5f7',
  },
  activityAvatarImage: {
    width: '100%', height: '100%',
  },
  activityAvatarText: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.primary,
  },
  activityTextBlock: {
    flex: 1,
  },
  activityTitle: {
    fontSize: 13,
    color: '#14161d',
    fontWeight: '500',
    lineHeight: 18,
  },
  activityTitleBold: {
    fontWeight: '800',
  },
  activityMeta: {
    fontSize: 11,
    color: '#8a909e',
    marginTop: 2,
  },
  activityEmptyRow: {
    paddingVertical: 14,
  },
  activityEmptyText: {
    fontSize: 12,
    color: '#8a909e',
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
    color: '#14161d',
    letterSpacing: 1.4,
  },
  upNextSeeAll: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8a909e',
  },
  upNextRow: {
    flexDirection: 'row',
    gap: 10,
  },
  upNextCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  upNextCardSealed: {
    backgroundColor: '#ece7df',
  },
  upNextImageBox: {
    height: 76,
    backgroundColor: '#e6e2d8',
    position: 'relative',
  },
  upNextImageBoxSealed: {
    backgroundColor: '#ece7df',
    alignItems: 'center',
    justifyContent: 'center',
  },
  upNextImage: {
    width: '100%', height: '100%',
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
    color: '#8a909e',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  upNextTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#14161d',
    letterSpacing: -0.2,
  },
  upNextCreator: {
    fontSize: 11,
    color: '#8a909e',
    marginTop: 4,
    fontWeight: '500',
  },
  upNextTeaser: {
    fontSize: 11,
    color: '#6e7480',
    marginTop: 4,
    fontStyle: 'italic',
  },
  upNextEmptyCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#eef0f4',
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
    color: '#8a909e',
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
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#edf0f4',
    paddingHorizontal: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.06,
    shadowRadius: 22,
    elevation: 5,
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
    color: '#252833',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 2.4,
  },
  activeQuestTitle: {
    marginTop: 2,
    color: '#0b7a94',
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: -0.4,
  },
  activeQuestMeta: {
    marginTop: 2,
    color: '#6f7683',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  errorText: {
    marginTop: 22,
    color: '#d53d18',
    textAlign: 'center',
  },
  fabBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(17,18,23,0.08)',
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
    backgroundColor: '#d5004f',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#d5004f',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.26,
    shadowRadius: 22,
    elevation: 8,
  },
  fabMenu: {
    position: 'relative',
    width: 240,
    marginBottom: 14,
    borderRadius: 22,
    backgroundColor: '#fff',
    padding: 12,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.16,
    shadowRadius: 28,
    elevation: 14,
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
    // backgroundColor applied inline via COLORS.primary for theme consistency
    borderWidth: 1.5,
    borderColor: 'transparent', // match secondary's footprint so both buttons render at identical height
  },
  fabMenuButtonSecondary: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    // borderColor applied inline via COLORS.primary
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
    backgroundColor: '#fff',
    transform: [{ rotate: '45deg' }],
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(10,12,18,0.28)',
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  membersBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(12,14,19,0.28)',
    justifyContent: 'flex-end',
  },
  membersCard: {
    maxHeight: '82%',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    backgroundColor: '#fff',
    paddingTop: 10,
    paddingHorizontal: 22,
  },
  membersHandle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#d9dde4',
    marginBottom: 4,
  },
  membersHeader: {
    marginTop: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  membersEyebrow: {
    color: '#9aa2ae',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  membersTitle: {
    marginTop: 6,
    color: '#161821',
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
    backgroundColor: '#f5f6f8',
  },
  membersLoading: {
    marginTop: 18,
    color: '#7b828e',
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
    borderBottomColor: '#f1f3f6',
    gap: 12,
  },
  memberAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1d212a',
    overflow: 'hidden',
  },
  memberAvatarText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  memberAvatarImage: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  memberCopy: {
    flex: 1,
  },
  memberName: {
    color: '#161821',
    fontSize: 15,
    fontWeight: '700',
  },
  memberMeta: {
    marginTop: 3,
    color: '#7b828e',
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
    color: '#ff4f74',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  inviteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#ffd5df',
    backgroundColor: '#fff8fa',
    padding: 12,
    gap: 12,
  },
  inviteCardImage: {
    width: 52,
    height: 52,
    borderRadius: 14,
  },
  inviteCardImagePlaceholder: {
    backgroundColor: '#f0f1f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteCardBody: {
    flex: 1,
  },
  inviteCardTitle: {
    color: '#161821',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  inviteCardMeta: {
    marginTop: 2,
    color: '#7b828e',
    fontSize: 12,
  },
  inviteCardFrom: {
    marginTop: 3,
    color: '#a0a6b2',
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
    backgroundColor: '#ff4f74',
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
    backgroundColor: '#f3f4f7',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ─ Join modal
  joinCard: {
    borderRadius: 28,
    backgroundColor: '#fff',
    padding: 20,
  },
  joinHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  joinEyebrow: {
    color: '#97a0ad',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  joinTitle: {
    marginTop: 4,
    color: '#161821',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.7,
  },
  joinSubtitle: {
    color: '#6f7683',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 18,
  },
  joinInput: {
    height: 54,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#e2e5ee',
    backgroundColor: '#f8f9fc',
    paddingHorizontal: 18,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 6,
    color: '#161821',
    textAlign: 'center',
  },
  joinError: {
    marginTop: 8,
    color: '#d53d18',
    fontSize: 13,
    lineHeight: 18,
  },
  joinButton: {
    marginTop: 14,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#ff4f74',
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
