import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BrandMark from '@/components/brand-mark';
import { useAuth } from '@/components/auth-provider';
import { useAppTheme } from '@/contexts/app-theme-context';
import TopAlertsButton from '@/components/top-alerts-button';
import { apiFetch, apiJson } from '@/lib/api';
import type { PendingInvite, Quest, SideQuestActivity } from '@/lib/types';

type TripMember = {
  id: string;
  name: string;
  avatarUrl?: string | null;
  isOwner: boolean;
};

type TripWithEvent = {
  quest: Quest;
  nextEventDate: Date;
  nextEventLabel: string;
  upcomingEvents: { label: string; date: Date }[];
};

export default function HomeScreen() {
  const { user, signOut } = useAuth();
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
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
  const eventFade = useRef(new Animated.Value(1)).current;
  const floatingBottom = Math.max(insets.bottom, 14) + 78;
  const upcomingCardWidth = Math.min(width - 56, 320);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  const loadQuests = useCallback(() => {
    let active = true;
    setLoading(true);
    setError('');

    void apiJson<Quest[]>('/api/trips')
      .then(async (data) => {
        if (!active) return;
        const tripList = Array.isArray(data) ? data : [];

        const activityGroups = await Promise.all(
          tripList.map(async (trip) => {
            try {
              return await apiJson<SideQuestActivity[]>(`/api/trips/${trip.id}/activities`);
            } catch {
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
        setActivities([]);
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
    void apiJson<PendingInvite[]>('/api/trips/invites/me')
      .then(setPendingInvites)
      .catch(() => {});
  }, []);

  useFocusEffect(loadQuests);
  useFocusEffect(loadInvites);

  const sortedTrips = useMemo(() => sortTripsByUpcomingEvent(quests, activities, now), [activities, now, quests]);
  const featuredTrip = sortedTrips[0] ?? null;
  const countdownParts = useMemo(() => getCountdownParts(featuredTrip?.nextEventDate, now), [featuredTrip?.nextEventDate, now]);
  const featuredEvent = featuredTrip?.upcomingEvents[featuredEventIndex] ?? null;
  const allowNativeDriver = Platform.OS !== 'web';

  useEffect(() => {
    setFeaturedEventIndex(0);
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
      const res = await apiFetch(`/api/trips/${invite.tripId}/invites/${invite.id}/accept`, { method: 'POST' });
      if (!res.ok) return;
      setPendingInvites((prev) => prev.filter((i) => i.id !== invite.id));
      loadQuests();
      loadInvites();
    } catch {
      // silently ignore
    } finally {
      setInviteActionBusy(null);
    }
  }

  async function handleDeclineInvite(invite: PendingInvite) {
    setInviteActionBusy(invite.id + '_decline');
    try {
      const res = await apiFetch(`/api/trips/${invite.tripId}/invites/${invite.id}/decline`, { method: 'POST' });
      if (!res.ok) return;
      setPendingInvites((prev) => prev.filter((i) => i.id !== invite.id));
      loadInvites();
    } catch {
      // silently ignore
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

    try {
      const data = await apiJson<TripMember[]>(`/api/trips/${featuredTrip.quest.id}/members`);
      setFeaturedMembers(data);
    } catch {
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
            { paddingTop: Math.max(insets.top, 18) + 10, paddingBottom: floatingBottom + 96 },
          ]}
          showsVerticalScrollIndicator={false}>
          <View style={styles.topRow}>
            <BrandMark size="sm" />
            <View style={styles.topActions}>
              <TopAlertsButton inviteCount={pendingInvites.length} />
              <TouchableOpacity style={styles.avatarShell} activeOpacity={0.8} onPress={() => router.push('/(tabs)/profile')}>
                {user?.avatarUrl ? (
                  <Image source={{ uri: user.avatarUrl }} style={styles.avatarImage} />
                ) : (
                  <View style={styles.avatarCore}>
                    <Text style={styles.avatarText}>{getInitials(user?.name)}</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {pendingInvites.length > 0 ? (
            <View style={[styles.inviteSection, { marginTop: 20 }]}>
              <View style={styles.inviteSectionHeader}>
                <Ionicons name="mail-unread-outline" size={16} color={theme.primary} />
                <Text style={[styles.inviteSectionTitle, { color: theme.primary }]}>You're invited!</Text>
              </View>
              {pendingInvites.map((invite) => (
                <View key={invite.id} style={[styles.inviteCard, { borderColor: theme.primary20, backgroundColor: theme.primary08 }]}>
                  {invite.tripImageUrl ? (
                    <Image source={{ uri: invite.tripImageUrl }} style={styles.inviteCardImage} />
                  ) : (
                    <View style={[styles.inviteCardImage, styles.inviteCardImagePlaceholder]}>
                      <Ionicons name="map-outline" size={22} color="#b0b4be" />
                    </View>
                  )}
                  <View style={styles.inviteCardBody}>
                    <Text style={styles.inviteCardTitle} numberOfLines={1}>{invite.tripTitle ?? 'Adventure'}</Text>
                    {invite.tripDestination ? (
                      <Text style={styles.inviteCardMeta} numberOfLines={1}><Ionicons name="location-outline" size={11} /> {invite.tripDestination}</Text>
                    ) : null}
                    <Text style={styles.inviteCardFrom}>Invited by {invite.invitedByName}</Text>
                  </View>
                  <View style={styles.inviteCardActions}>
                    <TouchableOpacity style={[styles.inviteAcceptBtn, { backgroundColor: theme.primary }]} activeOpacity={0.82} onPress={() => void handleAcceptInvite(invite)} disabled={inviteActionBusy === invite.id}>
                      {inviteActionBusy === invite.id ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.inviteAcceptText}>Join</Text>}
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.inviteDeclineBtn} activeOpacity={0.82} onPress={() => void handleDeclineInvite(invite)} disabled={inviteActionBusy === invite.id + '_decline'}>
                      {inviteActionBusy === invite.id + '_decline' ? <ActivityIndicator size="small" color="#8a909e" /> : <Ionicons name="close" size={16} color="#8a909e" />}
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          <Text style={styles.emptySectionHeading}>UPCOMING</Text>
          <View style={styles.emptyUpcoming}>
            <View style={styles.emptyRocketCircle}>
              <Ionicons name="rocket-outline" size={46} color="#c8c7ca" />
            </View>
            <Text style={styles.emptyUpcomingTitle}>No adventures yet</Text>
            <Text style={styles.emptyUpcomingCopy}>Create your first trip and start building SideQuests together</Text>
          </View>

          <Text style={styles.emptyHint}>Tap + to create your first adventure</Text>
        </ScrollView>

        <FloatingFab
          open={fabOpen}
          bottom={floatingBottom}
          onToggle={() => setFabOpen((current) => !current)}
          onDismiss={() => setFabOpen(false)}
          onJoin={() => { setFabOpen(false); setJoinModalOpen(true); setJoinCode(''); setJoinError(''); }}
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
          { paddingTop: Math.max(insets.top, 18) + 10, paddingBottom: floatingBottom + 96 },
        ]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.topRow}>
          <BrandMark size="sm" />
          <View style={styles.topActions}>
            <TopAlertsButton inviteCount={pendingInvites.length} />
            <TouchableOpacity style={styles.avatarShell} activeOpacity={0.8} onPress={() => router.push('/(tabs)/profile')}>
              {user?.avatarUrl ? (
                <Image source={{ uri: user.avatarUrl }} style={styles.avatarImage} />
              ) : (
                <View style={styles.avatarCore}>
                  <Text style={styles.avatarText}>{getInitials(user?.name)}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {pendingInvites.length > 0 ? (
          <View style={styles.inviteSection}>
            <View style={styles.inviteSectionHeader}>
              <Ionicons name="mail-unread-outline" size={16} color="#ff4f74" />
              <Text style={styles.inviteSectionTitle}>You're invited!</Text>
            </View>
            {pendingInvites.map((invite) => (
              <View key={invite.id} style={styles.inviteCard}>
                {invite.tripImageUrl ? (
                  <Image source={{ uri: invite.tripImageUrl }} style={styles.inviteCardImage} />
                ) : (
                  <View style={[styles.inviteCardImage, styles.inviteCardImagePlaceholder]}>
                    <Ionicons name="map-outline" size={22} color="#b0b4be" />
                  </View>
                )}
                <View style={styles.inviteCardBody}>
                  <Text style={styles.inviteCardTitle} numberOfLines={1}>
                    {invite.tripTitle ?? 'Adventure'}
                  </Text>
                  {invite.tripDestination ? (
                    <Text style={styles.inviteCardMeta} numberOfLines={1}>
                      <Ionicons name="location-outline" size={11} /> {invite.tripDestination}
                    </Text>
                  ) : null}
                  <Text style={styles.inviteCardFrom}>Invited by {invite.invitedByName}</Text>
                </View>
                <View style={styles.inviteCardActions}>
                  <TouchableOpacity
                    style={styles.inviteAcceptBtn}
                    activeOpacity={0.82}
                    onPress={() => void handleAcceptInvite(invite)}
                    disabled={inviteActionBusy === invite.id}>
                    {inviteActionBusy === invite.id ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.inviteAcceptText}>Join</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.inviteDeclineBtn}
                    activeOpacity={0.82}
                    onPress={() => void handleDeclineInvite(invite)}
                    disabled={inviteActionBusy === invite.id + '_decline'}>
                    {inviteActionBusy === invite.id + '_decline' ? (
                      <ActivityIndicator size="small" color="#8a909e" />
                    ) : (
                      <Ionicons name="close" size={16} color="#8a909e" />
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {loading ? (
          <View style={styles.loadingState}>
            <Text style={styles.loadingText}>Loading your next adventure...</Text>
          </View>
        ) : (
          <>
            <View style={styles.hero}>
              <Text style={styles.heroTitle}>{featuredTrip?.quest.title?.trim() || 'Your next adventure'}</Text>

              <View style={styles.dateRow}>
                <Ionicons name="calendar-clear-outline" size={25} color="#4f5461" />
                <Animated.Text style={[styles.dateText, { opacity: eventFade }]}>
                  {featuredEvent?.label ?? featuredTrip?.nextEventLabel ?? 'Dates coming soon'}
                </Animated.Text>
              </View>

              <View style={styles.badgeRow}>
                <InfoBadge tone="cyan" icon="time" label={formatHeaderCountdown(featuredTrip?.nextEventDate, now)} />
                <InfoBadge tone="pink" icon="people" label={getMembersLabel(featuredTrip?.quest)} onPress={() => void openMembers()} />
              </View>
            </View>

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>UPCOMING</Text>
              <View style={styles.sectionLine} />
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              decelerationRate="fast"
              snapToInterval={upcomingCardWidth + 14}
              snapToAlignment="start"
              contentContainerStyle={styles.carouselContent}
              style={styles.carousel}>
              {sortedTrips.map((entry, index) => (
                <QuestCard
                  key={entry.quest.id}
                  id={entry.quest.id}
                  title={entry.quest.title ?? 'Untitled quest'}
                  badge={formatCardCountdown(entry.nextEventDate, now)}
                  badgeTone={index % 2 === 0 ? 'pink' : 'cyan'}
                  imageUrl={entry.quest.imageUrl}
                  cardWidth={upcomingCardWidth}
                />
              ))}
            </ScrollView>
          </>
        )}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </ScrollView>

      {!loading ? (
        <View pointerEvents="box-none" style={[styles.countdownWrap, { bottom: floatingBottom }]}>
          <TouchableOpacity
            activeOpacity={featuredTrip ? 0.85 : 1}
            disabled={!featuredTrip}
            style={styles.activeQuestCard}
            onPress={() => featuredTrip && router.push(`/trip/${featuredTrip.quest.id}`)}>
            <View style={styles.activeQuestDot} />
            <View style={styles.activeQuestTextBlock}>
              <Text style={styles.activeQuestLabel}>COUNTDOWN</Text>
              <Text style={styles.activeQuestTitle}>{featuredTrip?.nextEventLabel ?? 'No upcoming event'}</Text>
              <Text style={styles.activeQuestMeta}>
                {featuredTrip ? `${countdownParts[0].value}d ${countdownParts[1].value}h ${countdownParts[2].value}m` : 'Create a trip to start the timer'}
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      ) : null}

      <FloatingFab
        open={fabOpen}
        bottom={floatingBottom}
        onToggle={() => setFabOpen((current) => !current)}
        onDismiss={() => setFabOpen(false)}
        onJoin={() => { setFabOpen(false); setJoinModalOpen(true); setJoinCode(''); setJoinError(''); }}
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
        />
      </Modal>

      <Modal visible={membersOpen} transparent animationType="fade" onRequestClose={() => setMembersOpen(false)}>
        <View style={styles.modalBackdrop}>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={() => setMembersOpen(false)} />
          <View style={[styles.membersCard, { paddingBottom: Math.max(insets.bottom, 18) + 16 }]}>
            <View style={styles.membersHeader}>
              <View>
                <Text style={styles.membersEyebrow}>TRAVELERS</Text>
                <Text style={styles.membersTitle}>{featuredTrip?.quest.title ?? 'Adventure'}</Text>
              </View>
              <TouchableOpacity style={styles.membersClose} activeOpacity={0.88} onPress={() => setMembersOpen(false)}>
                <Ionicons name="close" size={20} color="#161821" />
              </TouchableOpacity>
            </View>

            {membersLoading ? (
              <Text style={styles.membersLoading}>Loading members...</Text>
            ) : (
              <View style={styles.membersList}>
                {featuredMembers.map((member) => (
                  <View key={member.id} style={styles.memberRow}>
                    <View style={styles.memberAvatar}>
                      <Text style={styles.memberAvatarText}>{getInitials(member.name)}</Text>
                    </View>
                    <View style={styles.memberCopy}>
                      <Text style={styles.memberName}>{member.name}</Text>
                      <Text style={styles.memberMeta}>{member.isOwner ? 'Owner' : 'Member'}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function FloatingFab({
  open,
  bottom,
  onToggle,
  onDismiss,
  onJoin,
}: {
  open: boolean;
  bottom: number;
  onToggle: () => void;
  onDismiss: () => void;
  onJoin: () => void;
}) {
  const theme = useAppTheme();
  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {open ? <Pressable style={styles.fabBackdrop} onPress={onDismiss} /> : null}
      <View pointerEvents="box-none" style={[styles.fabWrap, { bottom }]}>
        {open ? (
          <View style={styles.fabMenu}>
            <TouchableOpacity
              activeOpacity={0.9}
              style={[styles.fabMenuButton, styles.fabMenuButtonPrimary, { backgroundColor: theme.primary, borderColor: theme.primary }]}
              onPress={() => {
                onDismiss();
                router.push('/create-trip');
              }}>
              <Text style={styles.fabMenuButtonPrimaryText}>Create Adventure</Text>
              <View style={styles.fabMenuIconCircle}>
                <Ionicons name="add" size={14} color="#fff" />
              </View>
            </TouchableOpacity>

            <TouchableOpacity activeOpacity={0.9} style={styles.fabMenuButton} onPress={onJoin}>
              <Text style={[styles.fabMenuButtonText, { color: theme.primary }]}>Join Adventure</Text>
              <Ionicons name="person-add-outline" size={15} color={theme.primary} />
            </TouchableOpacity>

            <View style={styles.fabMenuCaret} />
          </View>
        ) : null}

        <TouchableOpacity activeOpacity={0.92} style={styles.floatingFab} onPress={onToggle}>
          <Ionicons name="add" size={30} color="#fff" />
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
  const theme = useAppTheme();
  const content = (
    <View style={styles.infoBadge}>
      <View style={[styles.infoBadgeIcon, tone === 'cyan' ? styles.infoBadgeIconCyan : styles.infoBadgeIconPink, { backgroundColor: tone === 'cyan' ? theme.secondary : theme.primary }]}>
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
  const theme = useAppTheme();
  return (
    <TouchableOpacity
      activeOpacity={0.86}
      onPress={() => router.push(`/trip/${id}`)}
      style={[styles.questCard, { width: cardWidth }, badgeTone === 'cyan' ? styles.questCardSky : styles.questCardLava]}>
      {imageUrl ? <Image source={{ uri: imageUrl }} style={styles.questCardImage} /> : null}
      <View style={[styles.questCardOverlay, badgeTone === 'cyan' ? styles.questCardOverlaySky : styles.questCardOverlayLava]} />
      <View style={[styles.questCardBadge, badgeTone === 'cyan' ? styles.questCardBadgeCyan : styles.questCardBadgePink, { backgroundColor: badgeTone === 'cyan' ? theme.secondary : theme.primary }]}>
        <Text style={[styles.questCardBadgeText, badgeTone === 'cyan' ? styles.questCardBadgeTextDark : null]}>{badge}</Text>
      </View>
      <Text style={styles.questCardTitle}>{title}</Text>
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
}: {
  code: string;
  onChangeCode: (v: string) => void;
  onJoin: () => void;
  onClose: () => void;
  busy: boolean;
  error: string;
  insets: { bottom: number };
}) {
  const theme = useAppTheme();
  return (
    <View style={styles.modalBackdrop}>
      <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={onClose} />
      <View style={[styles.joinCard, { paddingBottom: Math.max(insets.bottom, 18) + 8 }]}>
        <View style={styles.joinHeader}>
          <View>
            <Text style={styles.joinEyebrow}>INVITE CODE</Text>
            <Text style={styles.joinTitle}>Join an Adventure</Text>
          </View>
          <TouchableOpacity style={styles.membersClose} activeOpacity={0.88} onPress={onClose}>
            <Ionicons name="close" size={20} color="#161821" />
          </TouchableOpacity>
        </View>
        <Text style={styles.joinSubtitle}>
          Ask the trip organiser for the 6-character code and enter it below.
        </Text>
        <TextInput
          style={styles.joinInput}
          placeholder="e.g. A3F9B2"
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
          style={({ pressed }) => [styles.joinButton, { backgroundColor: theme.primary }, pressed && { opacity: 0.88 }, (!code.trim() || busy) && styles.joinButtonDisabled]}
          onPress={onJoin}
          disabled={!code.trim() || busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.joinButtonText}>Join Adventure</Text>}
        </Pressable>
      </View>
    </View>
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
    };
  }

  const tripStart = new Date(`${quest.startDate}T12:00:00`);
  if (tripStart.getTime() < today.getTime()) {
    return null;
  }

  return {
    quest,
    nextEventDate: tripStart,
    nextEventLabel: quest.title?.trim() || 'Upcoming adventure',
    upcomingEvents: [{ label: quest.title?.trim() || 'Upcoming adventure', date: tripStart }],
  };
}

function getInitials(name?: string | null) {
  if (!name) return 'SQ';
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase()).join('') || 'SQ';
}

function getCountdownParts(targetDate: Date | undefined, now: Date) {
  if (!targetDate) {
    return [
      { label: 'DAYS', value: '00' },
      { label: 'HOURS', value: '00' },
      { label: 'MIN', value: '00' },
    ];
  }

  const diff = Math.max(0, targetDate.getTime() - now.getTime());
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);

  return [
    { label: 'DAYS', value: String(days).padStart(2, '0') },
    { label: 'HOURS', value: String(hours).padStart(2, '0') },
    { label: 'MIN', value: String(minutes).padStart(2, '0') },
  ];
}

function formatHeaderCountdown(targetDate: Date | undefined, now: Date) {
  const parts = getCountdownParts(targetDate, now);
  return `${parts[0].value}D ${parts[1].value}H`;
}

function formatCardCountdown(targetDate: Date, now: Date) {
  const diff = Math.max(0, targetDate.getTime() - now.getTime());
  const days = Math.ceil(diff / 86400000);
  if (days <= 1) return 'UP NEXT';
  return `IN ${days} DAYS`;
}

function getMembersLabel(quest?: Quest | null) {
  const count = quest?.ownerIds?.length || 1;
  return `${count} MEMBERS`;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#fff',
  },
  screenContent: {
    paddingHorizontal: 22,
    paddingBottom: 110,
  },
  emptyScreenContent: {
    flexGrow: 1,
    paddingHorizontal: 22,
    paddingBottom: 164,
  },
  emptySectionHeading: {
    marginTop: 44,
    color: '#5f5a5a',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 2.8,
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
    backgroundColor: '#f5f4f5',
  },
  emptyUpcomingTitle: {
    marginTop: 28,
    color: '#171821',
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -1.2,
  },
  emptyUpcomingCopy: {
    marginTop: 12,
    maxWidth: 240,
    color: '#747984',
    fontSize: 18,
    lineHeight: 30,
    textAlign: 'center',
  },
  emptyHint: {
    marginTop: 'auto',
    textAlign: 'center',
    color: '#c8c9cf',
    fontSize: 14,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatarShell: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#f4f4f5',
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
    backgroundColor: '#1e2128',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  hero: {
    marginTop: 54,
  },
  heroTitle: {
    color: '#121317',
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
    color: '#747984',
    fontSize: 15,
    fontWeight: '600',
  },
  dateRow: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateText: {
    color: '#454a56',
    fontSize: 17,
    letterSpacing: -0.3,
  },
  badgeRow: {
    marginTop: 18,
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  infoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 999,
    backgroundColor: '#f5f5f6',
    borderWidth: 1,
    borderColor: '#e3e5e9',
    paddingVertical: 8,
    paddingHorizontal: 13,
  },
  infoBadgeIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoBadgeIconCyan: {
    backgroundColor: '#0d90a8',
  },
  infoBadgeIconPink: {
    backgroundColor: '#e12d68',
  },
  infoBadgeLabel: {
    color: '#666b76',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.9,
  },
  sectionHeader: {
    marginTop: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sectionLabel: {
    color: '#b4b7bf',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 3.2,
  },
  sectionLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#e8ebef',
  },
  carousel: {
    marginTop: 16,
    marginRight: -22,
  },
  carouselContent: {
    paddingRight: 22,
    gap: 14,
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
    width: 172,
    marginBottom: 12,
    borderRadius: 20,
    backgroundColor: '#fff',
    padding: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 12,
  },
  fabMenuButton: {
    minHeight: 42,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#ffd0db',
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fabMenuButtonPrimary: {
    backgroundColor: '#d5004f',
    borderColor: '#d5004f',
    marginBottom: 8,
  },
  fabMenuButtonPrimaryText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  fabMenuButtonText: {
    color: '#ff4f74',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  fabMenuIconCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  fabMenuCaret: {
    position: 'absolute',
    right: 22,
    bottom: -8,
    width: 16,
    height: 16,
    backgroundColor: '#fff',
    transform: [{ rotate: '45deg' }],
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(10,12,18,0.28)',
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  membersCard: {
    borderRadius: 28,
    backgroundColor: '#fff',
    padding: 20,
  },
  membersHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  membersEyebrow: {
    color: '#97a0ad',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  membersTitle: {
    marginTop: 6,
    color: '#161821',
    fontSize: 24,
    fontWeight: '900',
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
    marginTop: 18,
    gap: 12,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  memberAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1d212a',
    marginRight: 12,
  },
  memberAvatarText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
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
    marginTop: 2,
    color: '#7b828e',
    fontSize: 13,
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
