import { FontAwesome, Ionicons } from '@expo/vector-icons';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import * as Linking from 'expo-linking';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/components/auth-provider';
import Avatar from '@/components/avatar';
import { useI18n } from '@/components/i18n-provider';
import UserProfileCard from '@/components/user-profile-card';
import HiddenSidequestCard from '@/components/hidden-sidequest-card';
import ActivityImageFallback from '@/components/activity-image-fallback';
import HeroShell from '@/components/hero-shell';
import ModalSheet from '@/components/modal-sheet';
import { EmptyState } from '@/components/ui/empty-state';
import { apiFetch, apiJson } from '@/lib/api';
import { getCached, setCached, invalidateTripCache } from '@/lib/cache';
import { uploadImageIfNeeded } from '@/lib/uploads';
import type { Quest, SideQuestActivity, TripInvite, LinkPreview } from '@/lib/types';
import { COLORS, SHADOWS, SPACING, RADIUS, TYPOGRAPHY } from '@/constants/design-tokens';

type ChatMsg = {
  id: string;
  userId?: string | null;
  userName: string;
  text: string;
  imageUrl?: string | null;
  isSystem: boolean;
  createdAt: string;
  linkPreview?: LinkPreview | null;
};

type ChatPresenceUser = {
  userId: string;
  userName: string;
  avatarUrl?: string | null;
};

type TripMember = {
  id: string;
  name: string;
  avatarUrl?: string | null;
  isOwner: boolean;
};

export default function TripDetailsScreen() {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView | null>(null);
  const { id, openChat: openChatParam } = useLocalSearchParams<{ id: string; openChat?: string }>();
  const { user } = useAuth();
  const { t } = useI18n();
  const [trip, setTrip] = useState<Quest | null>(null);
  const [members, setMembers] = useState<TripMember[]>([]);
  const [invites, setInvites] = useState<TripInvite[]>([]);
  const [activities, setActivities] = useState<SideQuestActivity[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteMessage, setInviteMessage] = useState('');
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [peopleSheetOpen, setPeopleSheetOpen] = useState(false);
  const [inviteComposerOpen, setInviteComposerOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatDraft, setChatDraft] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [chatPendingImage, setChatPendingImage] = useState<string | null>(null);
  const [chatImageUploading, setChatImageUploading] = useState(false);
  const [chatFullscreenImage, setChatFullscreenImage] = useState<string | null>(null);
  const [chatPresence, setChatPresence] = useState<ChatPresenceUser[]>([]);
  const [chatUnread, setChatUnread] = useState(false);
  const lastChatTimestampRef = useRef<string | null>(null);
  const lastReadAtRef = useRef<string>(new Date(Date.now() - 24 * 3600 * 1000).toISOString());
  const chatScrollRef = useRef<ScrollView | null>(null);
  const [spotifyModalOpen, setSpotifyModalOpen] = useState(false);
  const [spotifyUrlDraft, setSpotifyUrlDraft] = useState('');
  const [spotifySaving, setSpotifySaving] = useState(false);
  const [spotifyMessage, setSpotifyMessage] = useState('');
  const [error, setError] = useState('');
  const [profileCardUserId, setProfileCardUserId] = useState<string | null>(null);
  const [selectedCategoryKey, setSelectedCategoryKey] = useState<string | null>(null);
  const [failedAvatars, setFailedAvatars] = useState<Set<string>>(new Set());
  const chatInputOpacityRef = useRef(new Animated.Value(0.5)).current;
  const inviteEmailOpacityRef = useRef(new Animated.Value(0.5)).current;
  const spotifyUrlOpacityRef = useRef(new Animated.Value(0.5)).current;

  useFocusEffect(
    useCallback(() => {
      let active = true;

      async function run() {
        console.log(`[TRIP-DETAIL] loading trip ${id}...`);

        // Show cached data INSTANTLY so navigating back to an already-opened
        // trip doesn't flash a loading state. We then refetch in the background.
        const cachedTrip = getCached<Quest>(`/api/trips/${id}`);
        const cachedMembers = getCached<TripMember[]>(`/api/trips/${id}/members`);
        const cachedInvites = getCached<TripInvite[]>(`/api/trips/${id}/invites`);
        const cachedActivities = getCached<SideQuestActivity[]>(`/api/trips/${id}/activities`);

        if (cachedTrip) {
          setTrip(cachedTrip);
          setSpotifyUrlDraft(cachedTrip.spotifyUrl ?? '');
        }
        if (cachedMembers) setMembers(cachedMembers);
        if (cachedInvites) setInvites(cachedInvites);
        if (cachedActivities) setActivities(cachedActivities);

        try {
          const [tripData, memberData, inviteData, activityData] = await Promise.all([
            apiJson<Quest>(`/api/trips/${id}`),
            apiJson<TripMember[]>(`/api/trips/${id}/members`),
            apiJson<TripInvite[]>(`/api/trips/${id}/invites`),
            apiJson<SideQuestActivity[]>(`/api/trips/${id}/activities`),
          ]);

          if (!active) return;
          setTrip(tripData);
          setSpotifyUrlDraft(tripData.spotifyUrl ?? '');
          setMembers(memberData);
          setInvites(inviteData);
          setActivities(activityData);
          setCached(`/api/trips/${id}`, tripData);
          setCached(`/api/trips/${id}/members`, memberData);
          setCached(`/api/trips/${id}/invites`, inviteData);
          setCached(`/api/trips/${id}/activities`, activityData);
          // Check for unread chat messages
          try {
            const latestMsgs = await apiJson<ChatMsg[]>(`/api/trips/${id}/chat?since=${encodeURIComponent(lastReadAtRef.current)}`);
            if (!active) return;
            if (latestMsgs.length > 0) setChatUnread(true);
          } catch {
            if (!active) return;
          }
          setError('');
        } catch (err) {
          if (!active) return;
          setError(err instanceof Error ? err.message : 'Unable to load this adventure.');
        }
      }

      void run();

      return () => {
        active = false;
      };
    }, [id]),
  );

  const sortedActivities = useMemo(
    () =>
      [...activities].sort((left, right) => {
        const leftDate = new Date(`${left.date}T12:00:00`).getTime();
        const rightDate = new Date(`${right.date}T12:00:00`).getTime();
        return leftDate - rightDate;
      }),
    [activities],
  );
  const canManageTrip = useMemo(
    () => Boolean(user?.id && trip?.ownerIds?.includes(user.id)),
    [trip?.ownerIds, user?.id],
  );
  const activityGroups = useMemo(() => {
    const groups = new Map<string, { label: string; emoji: string; items: SideQuestActivity[] }>();

    // Initialize category groups
    groups.set('flight', { label: 'Flights', emoji: '✈️', items: [] });
    groups.set('food', { label: 'Restaurants', emoji: '🍽️', items: [] });
    groups.set('activities', { label: 'Activities', emoji: '🎯', items: [] });
    groups.set('other', { label: 'Övrigt', emoji: '⭐', items: [] });

    // Group activities by category
    for (const activity of sortedActivities) {
      if (activity.category === 'flight') {
        groups.get('flight')!.items.push(activity);
      } else if (activity.category === 'food') {
        groups.get('food')!.items.push(activity);
      } else if (activity.category === 'sidequest' || activity.category === 'sight') {
        groups.get('activities')!.items.push(activity);
      } else {
        groups.get('other')!.items.push(activity);
      }
    }

    // Filter out empty groups and return
    return Array.from(groups.entries())
      .filter(([_, group]) => group.items.length > 0)
      .map(([key, group]) => ({ key, ...group }));
  }, [sortedActivities]);

  const activityDayGroups = useMemo(() => {
    const map = new Map<string, SideQuestActivity[]>();
    for (const a of sortedActivities) {
      const key = a.date.slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    return Array.from(map.entries())
      .map(([date, items]) => ({
        date,
        items: items.sort((x, y) => (x.time ?? '').localeCompare(y.time ?? '')),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [sortedActivities]);

  const memberAvatarMap = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const m of members) map.set(m.id, m.avatarUrl ?? null);
    return map;
  }, [members]);

  // Deep link from a chat-message push notification: ?openChat=1 opens the
  // chat modal automatically once this screen mounts.
  useEffect(() => {
    if (openChatParam === '1') {
      setChatOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openChatParam]);

  // ── Chat polling + presence ──────────────────────────────────────────────

  useEffect(() => {
    if (!chatOpen) return;

    lastReadAtRef.current = new Date().toISOString();
    setChatUnread(false);
    lastChatTimestampRef.current = null;

    void loadChatMessages(true);
    void sendChatHeartbeat();
    void loadChatPresence();

    const msgPollId = setInterval(() => void loadChatMessages(false), 3000);
    const heartbeatId = setInterval(() => void sendChatHeartbeat(), 15000);
    const presencePollId = setInterval(() => void loadChatPresence(), 5000);

    return () => {
      clearInterval(msgPollId);
      clearInterval(heartbeatId);
      clearInterval(presencePollId);
      void apiFetch(`/api/trips/${id}/chat/presence`, { method: 'DELETE' }).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatOpen, id]);

  // Auto-scroll chat to bottom when messages arrive
  useEffect(() => {
    if (!chatOpen || chatMessages.length === 0) return;
    const timer = setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(timer);
  }, [chatMessages, chatOpen]);

  async function handleAddInvite() {
    const normalizedEmail = inviteEmail.trim().toLowerCase();

    if (!normalizedEmail) {
      setInviteMessage('Enter an email address first.');
      return;
    }

    if (!/\S+@\S+\.\S+/.test(normalizedEmail)) {
      setInviteMessage('That email address does not look valid.');
      return;
    }

    if (invites.some((invite) => invite.email.toLowerCase() === normalizedEmail)) {
      setInviteMessage('That person is already invited.');
      return;
    }

    setInviteSubmitting(true);
    setInviteMessage('');

    try {
      const invite = await apiJson<TripInvite>(`/api/trips/${id}/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail }),
      });

      invalidateTripCache(id);
      setInvites((current) => [...current, invite]);
      setInviteEmail('');
      setInviteComposerOpen(false);
      setInviteMessage('Invite sent.');
    } catch (err) {
      setInviteMessage(err instanceof Error ? err.message : 'Unable to invite right now.');
    } finally {
      setInviteSubmitting(false);
    }
  }

  async function handleCopyInviteCode() {
    if (!trip?.inviteCode) return;
    await Clipboard.setStringAsync(trip.inviteCode);
    setInviteMessage(t('trip.success.codeCopied', { code: trip.inviteCode }));
    setTimeout(() => setInviteMessage(''), 2500);
  }

  async function handleShareInvite() {
    if (!trip?.inviteCode) return;
    await Share.share({
      title: `Join ${trip.title ?? 'my adventure'}`,
      message: `Join ${trip.title ?? 'my SideQuest adventure'} with code ${trip.inviteCode}.`,
      url: trip.imageUrl ?? undefined,
    });
  }

  async function loadChatMessages(initial: boolean) {
    try {
      const since = initial ? null : lastChatTimestampRef.current;
      const url = `/api/trips/${id}/chat${since ? `?since=${encodeURIComponent(since)}` : ''}`;
      const msgs = await apiJson<ChatMsg[]>(url);
      if (initial) {
        setChatMessages(msgs);
        lastChatTimestampRef.current = msgs.length > 0 ? msgs[msgs.length - 1].createdAt : null;
      } else if (msgs.length > 0) {
        setChatMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const fresh = msgs.filter((m) => !existingIds.has(m.id));
          return fresh.length > 0 ? [...prev, ...fresh] : prev;
        });
        lastChatTimestampRef.current = msgs[msgs.length - 1].createdAt;
      }
    } catch {
      // ignore poll errors
    }
  }

  async function sendChatHeartbeat() {
    await apiFetch(`/api/trips/${id}/chat/presence`, { method: 'PUT' }).catch(() => {});
  }

  async function loadChatPresence() {
    try {
      const data = await apiJson<ChatPresenceUser[]>(`/api/trips/${id}/chat/presence`);
      setChatPresence(data);
    } catch {}
  }

  function closeChat() {
    Keyboard.dismiss();
    setChatOpen(false);
  }

  async function handlePickChatImage() {
    if (chatImageUploading || chatSending) return;
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError('Photo library access is required to attach images.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
      });
      if (result.canceled || !result.assets[0]) return;
      setChatPendingImage(result.assets[0].uri);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open the photo library.');
    }
  }

  async function handleSendChat() {
    const trimmed = chatDraft.trim();
    const hasImage = chatPendingImage !== null;
    if ((!trimmed && !hasImage) || chatSending || chatImageUploading) return;
    setChatSending(true);
    try {
      let uploadedImageUrl: string | null = null;
      if (hasImage && chatPendingImage) {
        setChatImageUploading(true);
        try {
          uploadedImageUrl = await uploadImageIfNeeded(chatPendingImage, 'chat');
        } finally {
          setChatImageUploading(false);
        }
      }
      const msg = await apiJson<ChatMsg>(`/api/trips/${id}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: trimmed, imageUrl: uploadedImageUrl }),
      });
      setChatMessages((prev) => [...prev, msg]);
      setChatDraft('');
      setChatPendingImage(null);
      lastChatTimestampRef.current = msg.createdAt;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send message right now.');
    } finally {
      setChatSending(false);
    }
  }

  async function handleSaveTripSpotify(value: string | null) {
    if (!trip) return;

    try {
      setSpotifySaving(true);
      setSpotifyMessage('');

      const response = await apiFetch(`/api/trips/${id}/spotify`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(value && value.trim() ? { spotifyUrl: value.trim() } : { clearSpotifyUrl: true }),
      });

      if (!response.ok) {
        throw new Error((await response.text()) || 'Unable to save the Spotify link right now.');
      }

      const updated = (await response.json()) as Quest;
      invalidateTripCache(id);
      setTrip(updated);
      setSpotifyUrlDraft(updated.spotifyUrl ?? '');
      setSpotifyModalOpen(false);
      setSpotifyMessage(updated.spotifyUrl ? 'Shared Spotify link updated.' : 'Shared Spotify link removed.');
    } catch (err) {
      setSpotifyMessage(err instanceof Error ? err.message : 'Unable to save the Spotify link right now.');
    } finally {
      setSpotifySaving(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.screen}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[styles.content, { paddingTop: Math.max(insets.top, 18) + 4, paddingBottom: Math.max(insets.bottom, 24) + 120 }]}
          showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.backButton} activeOpacity={0.88} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={24} color="#11131a" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{trip?.title ?? 'Adventure'}</Text>
            <TouchableOpacity style={styles.settingsButton} activeOpacity={0.88} onPress={() => router.push(`/trip/${id}/settings`)}>
              <Ionicons name="settings-outline" size={20} color="#11131a" />
            </TouchableOpacity>
          </View>

          <HeroShell imageUrl={trip?.imageUrl} style={styles.heroCardSize}>
            {!trip?.imageUrl ? (
              <View style={styles.heroPatternRow}>
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <View key={i} style={styles.heroPatternCell} />
                ))}
              </View>
            ) : null}
            <View style={styles.heroBody}>
              <Text style={styles.heroEyebrow}>{trip?.destination ?? 'Upcoming adventure'}</Text>
              <Text style={styles.heroTitle}>{trip?.title ?? 'Loading adventure...'}</Text>
              <Text style={styles.heroDate}>{formatTripDateRange(trip?.startDate, trip?.endDate)}</Text>
              <View style={styles.heroMetaRow}>
                <TripMetaChip icon="people-outline" label={`${members.length || 1} travelers`} onPress={() => setPeopleSheetOpen(true)} />
                <TripMetaChip icon="mail-outline" label={`${invites.length} pending`} onPress={() => setPeopleSheetOpen(true)} />
              </View>
            </View>
          </HeroShell>

          <View style={styles.spotifyRow}>
            <View style={styles.spotifyRowIcon}>
              <FontAwesome name="spotify" size={18} color="#fff" />
            </View>
            <View style={styles.spotifyRowBody}>
              <Text style={styles.spotifyRowTitle}>Spotify</Text>
              <Text style={styles.spotifyRowSubtitle}>{trip?.spotifyUrl ? 'Linked for this trip' : 'No playlist linked yet'}</Text>
            </View>
            <View style={styles.spotifyRowButtons}>
              {trip?.spotifyUrl ? (
                <>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={[styles.spotifyRowBtn, styles.spotifyRowBtnPrimary]}
                    onPress={() => void openSpotifyLink(trip.spotifyUrl!)}>
                    <Ionicons name="play" size={11} color="#1cb35b" />
                    <Text style={styles.spotifyRowBtnPrimaryText}>Open</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={[styles.spotifyRowBtn, styles.spotifyRowBtnGhost]}
                    onPress={() => {
                      setSpotifyUrlDraft(trip.spotifyUrl ?? '');
                      setSpotifyMessage('');
                      setSpotifyModalOpen(true);
                    }}>
                    <Ionicons name="pencil" size={11} color="#161821" />
                    <Text style={styles.spotifyRowBtnGhostText}>Change</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[styles.spotifyRowBtn, styles.spotifyRowBtnPrimary]}
                  onPress={() => {
                    setSpotifyUrlDraft('');
                    setSpotifyMessage('');
                    setSpotifyModalOpen(true);
                  }}>
                  <Ionicons name="add" size={13} color="#1cb35b" />
                  <Text style={styles.spotifyRowBtnPrimaryText}>Add</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
          {spotifyMessage ? <Text style={styles.spotifyMessage}>{spotifyMessage}</Text> : null}

          <TouchableOpacity style={styles.costSplitRow} activeOpacity={0.86} onPress={() => router.push(`/trip/${id}/split`)}>
            <View style={styles.costSplitRowIcon}>
              <Ionicons name="calculator-outline" size={18} color={COLORS.primary} />
            </View>
            <Text style={styles.costSplitRowLabel}>Cost Split</Text>
            <Ionicons name="chevron-forward" size={20} color="#b2b7c0" />
          </TouchableOpacity>


          <View style={styles.sectionHeader}>
            <Text style={styles.sectionEyebrow}>SIDEQUEST FEED</Text>
            <Text style={styles.sectionTitle}>What the group{'\n'}will discover</Text>
            <Text style={styles.sectionCopy}>Group plans, day by day.</Text>
          </View>

          {activityDayGroups.length > 0 ? (
            activityDayGroups.map((group) => (
              <View key={group.date} style={styles.dayGroup}>
                <View style={styles.dayHeader}>
                  <Text style={styles.dayHeaderText}>{formatDayHeaderDate(group.date)}</Text>
                  <Text style={styles.dayHeaderDay}>Day {dayNumberRelative(group.date, trip?.startDate)}</Text>
                  <View style={styles.dayHeaderLine} />
                </View>
                {group.items.map((activity) => {
                  const hidden = activity.isHiddenForViewer;
                  const timeLabel = formatActivityTimeShort(activity.time);

                  if (hidden) {
                    return (
                      <HiddenSidequestCard
                        key={activity.id}
                        id={activity.id}
                        revealAt={activity.revealAt}
                        timeLabel={timeLabel}
                        formatTimeUntilReveal={formatTimeUntilReveal}
                        onPress={() => router.push(`/trip/${id}/sidequest/${activity.id}`)}
                      />
                    );
                  }

                  return (
                    <TouchableOpacity
                      key={activity.id}
                      activeOpacity={0.86}
                      style={styles.timelineRow}
                      onPress={() => router.push(`/trip/${id}/sidequest/${activity.id}`)}>
                      <View style={styles.timelineIconWrap}>
                        {activity.imageUrl ? (
                          <Image source={{ uri: activity.imageUrl }} style={styles.timelineIcon} />
                        ) : (
                          <ActivityImageFallback category={activity.category} size="small" style={styles.timelineIcon} />
                        )}
                      </View>
                      <View style={styles.timelineBody}>
                        <Text style={styles.timelineTitle} numberOfLines={1}>
                          {activity.title?.trim() || 'Activity'}
                        </Text>
                        <Text style={styles.timelineSubtitle} numberOfLines={1}>
                          {formatActivityAuthorSubtitle(activity)}
                        </Text>
                      </View>
                      {timeLabel ? <Text style={styles.timelineTime}>{timeLabel}</Text> : null}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))
          ) : (
            <EmptyState
              icon="sparkles-outline"
              title="Inga aktiviteter än"
              description="Skapa det första överraskningsuppdraget, avslöjningsmomentet eller planen för äventyret."
            />
          )}

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </ScrollView>

        <View pointerEvents="box-none" style={[styles.chatBubbleWrap, { bottom: Math.max(insets.bottom, 16) + 6 }]}>
          <TouchableOpacity activeOpacity={0.92} style={[styles.chatBubble, { backgroundColor: COLORS.secondary, shadowColor: COLORS.secondary }]} onPress={() => setChatOpen(true)}>
            <Ionicons name="chatbubble-ellipses-outline" size={20} color="#fff" />
            {chatUnread ? <View style={[styles.chatUnreadDot, { backgroundColor: COLORS.primary }]} /> : null}
          </TouchableOpacity>
        </View>

        <View pointerEvents="box-none" style={[styles.floatingWrap, { bottom: Math.max(insets.bottom, 16) + 6 }]}>
          <TouchableOpacity activeOpacity={0.92} style={[styles.floatingButton, { backgroundColor: COLORS.primary, shadowColor: COLORS.primary }]} onPress={() => router.push(`/trip/${id}/sidequest/new`)}>
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={styles.floatingButtonText}>Lägg till aktivitet</Text>
          </TouchableOpacity>
        </View>

        <ModalSheet visible={peopleSheetOpen} onClose={() => setPeopleSheetOpen(false)}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <View>
              <Text style={styles.sheetEyebrow}>TRAVELERS</Text>
              <Text style={styles.sheetTitle}>Everyone on this adventure</Text>
            </View>
            <TouchableOpacity style={styles.sheetCloseButton} activeOpacity={0.88} onPress={() => setPeopleSheetOpen(false)}>
              <Ionicons name="close" size={20} color="#161821" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.sheetContent, { paddingBottom: Math.max(insets.bottom, 18) + 12 }]}>
                <View style={styles.peopleSection}>
                  <Text style={styles.peopleSectionTitle}>Travelers</Text>
                  {members.map((member) => (
                    <Pressable
                      key={member.id}
                      style={({ pressed }: { pressed: boolean }) => [styles.personRow, pressed ? { opacity: 0.7 } : null]}
                      onPress={() => {
                        setPeopleSheetOpen(false);
                        setTimeout(() => setProfileCardUserId(member.id), 280);
                      }}>
                      <View style={styles.personAvatar}>
                        <Avatar
                          uri={member.avatarUrl}
                          name={member.name}
                          fallbackText={getInitials(member.name)}
                          forceFallback={failedAvatars.has(member.id)}
                          onError={() => setFailedAvatars(prev => new Set([...prev, member.id]))}
                          size={42}
                          fallbackBackgroundColor="#1d212a"
                          fallbackTextColor="#fff"
                        />
                      </View>
                      <View style={styles.personCopy}>
                        <Text style={styles.personName}>{member.name}</Text>
                        <Text style={styles.personMeta}>{member.isOwner ? 'Owner' : 'Member'}</Text>
                      </View>
                    </Pressable>
                  ))}
                  {canManageTrip ? (
                    <View style={styles.inviteInlineWrap}>
                      <TouchableOpacity
                        activeOpacity={0.9}
                        style={[styles.personRow, styles.personRowInvite, inviteComposerOpen ? styles.personRowInviteOpen : null]}
                        onPress={() => {
                          setInviteMessage('');
                          setInviteComposerOpen((current) => !current);
                        }}>
                        <View style={[styles.personAvatar, styles.inviteAvatar]}>
                          <Ionicons name="add" size={20} color={COLORS.primary} />
                        </View>
                        <View style={styles.personCopy}>
                          <Text style={styles.personName}>Invite traveler</Text>
                          <Text style={styles.personMeta}>Add by email or share the invite code</Text>
                        </View>
                        <Ionicons name={inviteComposerOpen ? 'chevron-up' : 'chevron-forward'} size={18} color="#8e95a2" />
                      </TouchableOpacity>

                      {inviteComposerOpen ? (
                        <View style={styles.inviteInlineComposer}>
                          <View style={styles.inviteComposer}>
                            <Animated.View style={[{ opacity: inviteEmailOpacityRef }]}>
                              <TextInput
                                value={inviteEmail}
                                onChangeText={setInviteEmail}
                                onFocus={() => {
                                  Animated.timing(inviteEmailOpacityRef, {
                                    toValue: 1,
                                    duration: 300,
                                    useNativeDriver: false,
                                  }).start();
                                }}
                                onBlur={() => {
                                  Animated.timing(inviteEmailOpacityRef, {
                                    toValue: 0.5,
                                    duration: 300,
                                    useNativeDriver: false,
                                  }).start();
                                }}
                                placeholder="friend@example.com"
                                placeholderTextColor="#afb5bf"
                                keyboardType="email-address"
                                autoCapitalize="none"
                                autoCorrect={false}
                                style={styles.inviteInput}
                              />
                            </Animated.View>
                            <TouchableOpacity
                              activeOpacity={0.9}
                              style={[styles.inviteAddButton, { backgroundColor: COLORS.primary }, inviteSubmitting ? styles.inviteAddButtonDisabled : null]}
                              disabled={inviteSubmitting}
                              onPress={() => void handleAddInvite()}>
                              <Text style={styles.inviteAddButtonText}>{inviteSubmitting ? 'Adding...' : 'Invite'}</Text>
                            </TouchableOpacity>
                          </View>

                          <View style={styles.inviteActions}>
                            <TouchableOpacity activeOpacity={0.9} style={styles.secondaryInviteButton} onPress={() => void handleCopyInviteCode()}>
                              <Ionicons name="copy-outline" size={16} color={COLORS.primary} />
                              <Text style={[styles.secondaryInviteButtonText, { color: COLORS.primary }]}>Copy code</Text>
                            </TouchableOpacity>
                            <TouchableOpacity activeOpacity={0.9} style={styles.secondaryInviteButton} onPress={() => void handleShareInvite()}>
                              <Ionicons name="share-social-outline" size={16} color={COLORS.primary} />
                              <Text style={[styles.secondaryInviteButtonText, { color: COLORS.primary }]}>Share</Text>
                            </TouchableOpacity>
                          </View>

                          <View style={styles.inviteHintRow}>
                            <Text style={styles.inviteHintLabel}>Invite code</Text>
                            <Text style={[styles.inviteHintCode, { color: COLORS.primary }]}>{trip?.inviteCode ?? '------'}</Text>
                          </View>

                          {inviteMessage ? <Text style={styles.inviteMessage}>{inviteMessage}</Text> : null}
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                </View>

                <View style={styles.peopleSection}>
                  <Text style={styles.peopleSectionTitle}>Pending invites</Text>
                  {invites.length > 0 ? (
                    invites.map((invite) => (
                      <View key={invite.id} style={styles.personRow}>
                        <View style={[styles.personAvatar, styles.pendingAvatar]}>
                          <Ionicons name="mail-outline" size={16} color="#7a8290" />
                        </View>
                        <View style={styles.personCopy}>
                          <Text style={styles.personName}>{invite.email}</Text>
                          <Text style={styles.personMeta}>Waiting for response</Text>
                        </View>
                      </View>
                    ))
                  ) : (
                    <Text style={styles.peopleEmpty}>No pending invites yet.</Text>
                  )}
                </View>
              </ScrollView>
        </ModalSheet>

        <Modal visible={chatOpen} transparent animationType="fade" onRequestClose={closeChat}>
          <View style={styles.chatModalBackdrop}>
            <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={closeChat} />
            <KeyboardAvoidingView
              style={[styles.chatKeyboardAvoider, { marginTop: insets.top + 12, marginBottom: insets.bottom + 12 }]}
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={[styles.chatPanel, { paddingTop: 18, paddingBottom: 14 }]}>
              <View style={styles.chatPanelHeader}>
                <View style={styles.chatPanelHeaderLeft}>
                  <Text style={styles.chatPanelEyebrow}>GROUP CHAT</Text>
                  <Text style={styles.chatPanelTitle}>{trip?.title ?? 'Adventure chat'}</Text>
                </View>
                <TouchableOpacity style={styles.chatPanelClose} activeOpacity={0.88} onPress={closeChat}>
                  <Ionicons name="close" size={20} color="#161821" />
                </TouchableOpacity>
              </View>

              {chatPresence.length > 0 ? (
                <View style={styles.chatPresenceRow}>
                  {chatPresence.slice(0, 6).map((u) => (
                    <View key={u.userId} style={styles.chatPresenceBubble}>
                      <Text style={[styles.chatPresenceBubbleText, { color: COLORS.secondary }]}>{getInitials(u.userName)}</Text>
                    </View>
                  ))}
                  {chatPresence.length > 6 ? (
                    <View style={styles.chatPresenceBubble}>
                      <Text style={styles.chatPresenceBubbleText}>+{chatPresence.length - 6}</Text>
                    </View>
                  ) : null}
                  <Text style={styles.chatPresenceLabel}>
                    {chatPresence.length === 1 ? '1 in chat' : `${chatPresence.length} in chat`}
                  </Text>
                </View>
              ) : null}

              <ScrollView ref={chatScrollRef} style={styles.chatListScroll} showsVerticalScrollIndicator={false} contentContainerStyle={styles.chatList}>
                {chatMessages.map((message, index) => {
                  const ownMessage = message.userId === user?.id;
                  const systemMessage = message.isSystem;
                  const prevMessage = index > 0 ? chatMessages[index - 1] : null;
                  const showTime =
                    !prevMessage ||
                    new Date(message.createdAt).getTime() - new Date(prevMessage.createdAt).getTime() >= 5 * 60 * 1000;
                  const avatarUrl = message.userId ? (memberAvatarMap.get(message.userId) ?? null) : null;

                  return (
                    <View key={message.id}>
                      {showTime ? (
                        <Text style={styles.chatTimeLabel}>{formatChatTimestamp(message.createdAt)}</Text>
                      ) : null}
                      {systemMessage ? (
                        <Text style={styles.chatSystemLabel}>{message.text}</Text>
                      ) : ownMessage ? (
                        <View style={styles.chatMessageWrapOwn}>
                          {message.imageUrl ? (
                            <Pressable onPress={() => setChatFullscreenImage(message.imageUrl ?? null)}>
                              <Image source={{ uri: message.imageUrl }} style={styles.chatMessageImage} />
                            </Pressable>
                          ) : null}
                          <View style={[styles.chatBubbleCard, styles.chatBubbleCardOwn, { backgroundColor: COLORS.primary }]}>
                            {message.text ? (
                              <ChatMessageText text={message.text} isOwn={true} />
                            ) : null}
                            {message.linkPreview ? (
                              <LinkPreviewCardInline preview={message.linkPreview} isOwn={true} />
                            ) : null}
                          </View>
                        </View>
                      ) : (
                        <View style={styles.chatMessageRow}>
                          <TouchableOpacity
                            style={styles.chatAvatar}
                            activeOpacity={0.7}
                            onPress={() => message.userId && setProfileCardUserId(message.userId)}>
                            <Avatar
                              uri={avatarUrl}
                              name={message.userName}
                              fallbackText={getInitials(message.userName)}
                              forceFallback={failedAvatars.has(message.userId || '')}
                              onError={() => message.userId && setFailedAvatars(prev => new Set([...prev, message.userId!]))}
                              size={28}
                              fallbackBackgroundColor="#1d212a"
                              fallbackTextColor="#fff"
                            />
                          </TouchableOpacity>
                          <View style={styles.chatMessageContent}>
                            <Text style={styles.chatAuthor}>{message.userName}</Text>
                            {message.imageUrl ? (
                              <Pressable onPress={() => setChatFullscreenImage(message.imageUrl ?? null)}>
                                <Image source={{ uri: message.imageUrl }} style={styles.chatMessageImage} />
                              </Pressable>
                            ) : null}
                            <View style={styles.chatBubbleCard}>
                              {message.text ? (
                                <ChatMessageText text={message.text} isOwn={false} />
                              ) : null}
                              {message.linkPreview ? (
                                <LinkPreviewCardInline preview={message.linkPreview} isOwn={false} />
                              ) : null}
                            </View>
                          </View>
                        </View>
                      )}
                    </View>
                  );
                })}
              </ScrollView>

              {chatPendingImage ? (
                <View style={styles.chatPendingImageWrap}>
                  <Image source={{ uri: chatPendingImage }} style={styles.chatPendingImage} />
                  <TouchableOpacity
                    style={styles.chatPendingImageRemove}
                    activeOpacity={0.85}
                    onPress={() => setChatPendingImage(null)}>
                    <Ionicons name="close" size={14} color="#fff" />
                  </TouchableOpacity>
                  {chatImageUploading ? (
                    <View style={styles.chatPendingImageUploading}>
                      <Text style={styles.chatPendingImageUploadingText}>Uploading…</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
              <View style={styles.chatComposer}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={styles.chatAttachButton}
                  disabled={chatSending || chatImageUploading}
                  onPress={() => void handlePickChatImage()}>
                  <Ionicons name="image-outline" size={22} color={chatSending || chatImageUploading ? '#c2c8d2' : '#161821'} />
                </TouchableOpacity>
                <Animated.View style={{ flex: 1, opacity: chatInputOpacityRef }}>
                  <TextInput
                    value={chatDraft}
                    onChangeText={setChatDraft}
                    onFocus={() => {
                      Animated.timing(chatInputOpacityRef, {
                        toValue: 1,
                        duration: 300,
                        useNativeDriver: false,
                      }).start();
                      setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 250);
                    }}
                    onBlur={() => {
                      Animated.timing(chatInputOpacityRef, {
                        toValue: 0.5,
                        duration: 300,
                        useNativeDriver: false,
                      }).start();
                    }}
                    placeholder="Send a message to the group"
                    placeholderTextColor="#afb5bf"
                    style={styles.chatInput}
                    multiline
                  />
                </Animated.View>
                <TouchableOpacity
                  activeOpacity={0.9}
                  style={[
                    styles.chatSendButton,
                    { backgroundColor: COLORS.primary },
                    (!chatDraft.trim() && !chatPendingImage) || chatSending || chatImageUploading ? styles.chatSendButtonDisabled : null,
                  ]}
                  disabled={(!chatDraft.trim() && !chatPendingImage) || chatSending || chatImageUploading}
                  onPress={() => void handleSendChat()}>
                  <Ionicons name="send" size={16} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
            </KeyboardAvoidingView>
          </View>
        </Modal>

        <ModalSheet visible={spotifyModalOpen} onClose={() => setSpotifyModalOpen(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <View style={[styles.sheetContent, { paddingBottom: Math.max(insets.bottom, 18) + 12 }]}>
              <View style={styles.sheetHandle} />
              <View style={styles.sheetHeader}>
                <View>
                  <Text style={styles.sheetEyebrow}>SHARED SPOTIFY</Text>
                  <Text style={styles.sheetTitle}>Spotify for this event</Text>
                </View>
                <TouchableOpacity style={styles.sheetCloseButton} activeOpacity={0.88} onPress={() => setSpotifyModalOpen(false)}>
                  <Ionicons name="close" size={20} color="#161821" />
                </TouchableOpacity>
              </View>

              <View style={styles.spotifySheetBody}>
                <Text style={styles.spotifySheetCopy}>Paste a public Spotify playlist, album, or track link that everyone can use.</Text>
                <Animated.View style={[{ opacity: spotifyUrlOpacityRef }]}>
                  <TextInput
                    value={spotifyUrlDraft}
                    onChangeText={setSpotifyUrlDraft}
                    onFocus={() => {
                      Animated.timing(spotifyUrlOpacityRef, {
                        toValue: 1,
                        duration: 300,
                        useNativeDriver: false,
                      }).start();
                    }}
                    onBlur={() => {
                      Animated.timing(spotifyUrlOpacityRef, {
                        toValue: 0.5,
                        duration: 300,
                        useNativeDriver: false,
                      }).start();
                    }}
                    placeholder="https://open.spotify.com/..."
                    placeholderTextColor="#a3a9b4"
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    style={styles.spotifyInput}
                  />
                </Animated.View>
                <View style={styles.spotifySheetButtons}>
                  <TouchableOpacity activeOpacity={0.88} style={styles.spotifySheetSecondaryButton} onPress={() => void handleSaveTripSpotify(null)}>
                    <Text style={styles.spotifySheetSecondaryButtonText}>Remove</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={0.9}
                    style={[styles.spotifySheetPrimaryButton, spotifySaving ? styles.spotifySheetPrimaryButtonDisabled : null]}
                    disabled={spotifySaving}
                    onPress={() => void handleSaveTripSpotify(spotifyUrlDraft)}>
                    <Text style={styles.spotifySheetPrimaryButtonText}>{spotifySaving ? 'Saving...' : 'Save link'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </KeyboardAvoidingView>
        </ModalSheet>

        <Modal
          visible={selectedCategoryKey !== null}
          transparent
          animationType="slide"
          onRequestClose={() => setSelectedCategoryKey(null)}>
          <View style={styles.categoryModalOverlay}>
            <View style={[styles.categoryModalContent, { paddingTop: 14 }]}>
              <View style={styles.categoryModalHeader}>
                <TouchableOpacity onPress={() => setSelectedCategoryKey(null)} style={styles.categoryModalCloseButton}>
                  <Ionicons name="chevron-down" size={24} color="#161821" />
                </TouchableOpacity>
                <View style={{ flex: 1 }} />
                <TouchableOpacity
                  onPress={() => {
                    setSelectedCategoryKey(null);
                    router.push(`/trip/${encodeURIComponent(id)}/sidequest/new`);
                  }}
                  style={styles.categoryModalAddButton}>
                  <Ionicons name="add" size={24} color="#fff" />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.categoryModalBody}>
                {(() => {
                  const selected = activityGroups.find(g => g.key === selectedCategoryKey);
                  if (!selected) return null;

                  return (
                    <>
                      <View style={styles.categoryModalTitleSection}>
                        <Text style={styles.categoryModalEmoji}>{selected.emoji}</Text>
                        <View>
                          <Text style={styles.categoryModalLabel}>{selected.label}</Text>
                          <Text style={styles.categoryModalCount}>{selected.items.length} activities</Text>
                        </View>
                      </View>

                      <View style={styles.categoryModalActivities}>
                        {selected.items.map((activity) => {
                          const isRevealed = !activity.revealAt || new Date(activity.revealAt).getTime() <= Date.now();
                          const isDisabled = !isRevealed;

                          return (
                            <TouchableOpacity
                              key={activity.id}
                              style={[styles.categoryModalActivityCard, isDisabled && styles.categoryModalActivityCardHidden]}
                              activeOpacity={isDisabled ? 0.5 : 0.7}
                              disabled={isDisabled}
                              onPress={() => {
                                if (!isDisabled) {
                                  setSelectedCategoryKey(null);
                                  router.push(`/trip/${encodeURIComponent(id)}/sidequest/${encodeURIComponent(activity.id)}`);
                                }
                              }}>
                              {isRevealed ? (
                                <>
                                  <View>
                                    <Text style={styles.categoryModalActivityTitle}>{activity.title}</Text>
                                    <Text style={styles.categoryModalActivityDate} numberOfLines={1}>
                                      {formatActivityDate(activity.date)}
                                    </Text>
                                  </View>
                                  <Ionicons name="chevron-forward" size={18} color="#c5cad2" />
                                </>
                              ) : (
                                <>
                                  <View>
                                    <Text style={styles.categoryModalActivityTitle}>1 hidden sidequest</Text>
                                    <Text style={styles.categoryModalActivityDate} numberOfLines={1}>
                                      {formatTimeUntilReveal(activity.revealAt)}
                                    </Text>
                                  </View>
                                  <View style={styles.lockedBadge}>
                                    <Text style={styles.lockedBadgeText}>LOCKED</Text>
                                  </View>
                                </>
                              )}
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </>
                  );
                })()}
              </ScrollView>
            </View>
          </View>
        </Modal>

        <UserProfileCard userId={profileCardUserId} onClose={() => setProfileCardUserId(null)} />

        <Modal visible={chatFullscreenImage !== null} transparent animationType="fade" onRequestClose={() => setChatFullscreenImage(null)}>
          <Pressable style={styles.chatFullscreenBackdrop} onPress={() => setChatFullscreenImage(null)}>
            {chatFullscreenImage ? (
              <Image source={{ uri: chatFullscreenImage }} style={styles.chatFullscreenImage} resizeMode="contain" />
            ) : null}
            <TouchableOpacity style={[styles.chatFullscreenClose, { top: Math.max(insets.top, 16) + 8 }]} onPress={() => setChatFullscreenImage(null)}>
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </Pressable>
        </Modal>
      </View>
    </>
  );
}

async function openSpotifyLink(url: string) {
  const canOpen = await Linking.canOpenURL(url);
  if (canOpen) {
    await Linking.openURL(url);
  }
}

const URL_REGEX = /https?:\/\/[^\s]+/g;

function ChatMessageText({ text, isOwn }: { text: string; isOwn: boolean }) {
  const parts = text.split(URL_REGEX);
  const urls = text.match(URL_REGEX) || [];

  let urlIndex = 0;

  return (
    <Text>
      {parts.map((part, i) => {
        const hasUrl = urlIndex < urls.length;
        const elements: React.ReactNode[] = [];

        if (part) {
          elements.push(
            <Text key={`text-${i}`} style={[styles.chatBubbleText, isOwn && styles.chatBubbleTextOwn]}>
              {part}
            </Text>
          );
        }

        if (hasUrl) {
          const url = urls[urlIndex++];
          elements.push(
            <Text
              key={`link-${i}`}
              style={[styles.chatBubbleText, isOwn && styles.chatBubbleTextOwn, isOwn ? styles.chatBubbleLink : styles.chatBubbleLinkOther]}
              onPress={() => openSpotifyLink(url)}>
              {url}
            </Text>
          );
        }

        return elements;
      })}
    </Text>
  );
}

function LinkPreviewCardInline({ preview, isOwn }: { preview: LinkPreview; isOwn?: boolean }) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => openSpotifyLink(preview.url)}
      style={[styles.linkPreviewInline, isOwn && styles.linkPreviewInlineOwn]}>
      {preview.imageUrl ? (
        <Image source={{ uri: preview.imageUrl }} style={styles.linkPreviewInlineImage} />
      ) : null}
      <View style={styles.linkPreviewInlineContent}>
        {preview.title ? (
          <Text style={[styles.linkPreviewInlineTitle, isOwn && styles.linkPreviewInlineTitleOwn]} numberOfLines={2}>
            {preview.title}
          </Text>
        ) : null}
        {preview.description ? (
          <Text style={[styles.linkPreviewInlineDescription, isOwn && styles.linkPreviewInlineDescriptionOwn]} numberOfLines={1}>
            {preview.description}
          </Text>
        ) : null}
        <Text style={[styles.linkPreviewInlineUrl, isOwn && styles.linkPreviewInlineUrlOwn]} numberOfLines={1}>
          {preview.url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function TripMetaChip({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity activeOpacity={0.88} style={styles.heroChip} onPress={onPress}>
      <Ionicons name={icon} size={15} color="#fff" />
      <Text style={styles.heroChipText}>{label}</Text>
    </TouchableOpacity>
  );
}

function formatTripDateRange(startDate?: string, endDate?: string) {
  if (!startDate || !endDate) return 'Dates coming soon';
  const formatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
  return `${formatter.format(new Date(`${startDate}T12:00:00`))} - ${formatter.format(new Date(`${endDate}T12:00:00`))}`;
}

function formatActivityDate(date: string) {
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(`${date}T12:00:00`));
}

function formatDayHeaderDate(dateIso: string) {
  const d = new Date(`${dateIso.slice(0, 10)}T12:00:00`);
  if (isNaN(d.getTime())) return '';
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(d);
  const monthDay = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(d);
  return `${weekday} · ${monthDay}`;
}

function dayNumberRelative(dateIso: string, tripStartIso?: string) {
  if (!tripStartIso) return 1;
  const d = new Date(`${dateIso.slice(0, 10)}T12:00:00`);
  const start = new Date(`${tripStartIso.slice(0, 10)}T12:00:00`);
  if (isNaN(d.getTime()) || isNaN(start.getTime())) return 1;
  const diff = Math.round((d.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(1, diff + 1);
}

function formatActivityTimeShort(time?: string | null) {
  if (!time) return '';
  return time.slice(0, 5);
}

function formatActivityAuthorSubtitle(activity: SideQuestActivity) {
  const name = activity.ownerName?.trim() || '';
  if (name && activity.commentCount > 0) return `${name} · ${activity.commentCount}`;
  return name;
}

function formatActivityRevealDate(revealAt?: string | null) {
  if (!revealAt) return 'soon';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(revealAt));
}

function formatTimeUntilReveal(revealAt?: string | null) {
  if (!revealAt) return 'Reveals soon';
  const now = Date.now();
  const reveal = new Date(revealAt).getTime();
  const diffMs = reveal - now;

  if (diffMs <= 0) return 'Revealed';

  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) {
    return `Reveals in ${days} d ${hours} h ${minutes} m`;
  }
  if (hours > 0) {
    return `Reveals in ${hours} h ${minutes} m`;
  }
  return `Reveals in ${minutes} m`;
}

function formatRevealChip(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric' }).format(new Date(value));
}

function formatSpotifyDisplayUrl(url?: string | null) {
  if (!url) return '';

  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/$/, '');
    return `${parsed.host}${path}`;
  } catch {
    return url.replace(/^https?:\/\//, '');
  }
}

function formatChatTimestamp(value: string) {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

function getInitials(name?: string | null) {
  const parts = (name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return '?';

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    paddingHorizontal: 22,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f6f8',
  },
  headerTitle: {
    flex: 1,
    marginLeft: 12,
    color: '#121317',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.8,
  },
  settingsButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f6f8',
  },
  heroCardSize: {
    minHeight: 270,
    justifyContent: 'flex-end',
  },
  heroPatternRow: {
    position: 'absolute',
    top: 14,
    left: 18,
    right: 18,
    flexDirection: 'row',
    gap: 6,
  },
  heroPatternCell: {
    flex: 1,
    height: 38,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  heroBody: {
    padding: 22,
  },
  heroEyebrow: {
    color: '#ffd0c0',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  heroTitle: {
    marginTop: 4,
    color: '#fff',
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -1.4,
    lineHeight: 38,
  },
  heroDate: {
    marginTop: 6,
    color: '#fbe4d8',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  heroMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 18,
  },
  costSplitCard: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#eaedf2',
    backgroundColor: '#ffffff',
  },
  costSplitRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 16,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#eceef2',
    backgroundColor: '#fff',
  },
  costSplitRowIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#fff0f4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  costSplitRowLabel: {
    flex: 1,
    color: '#161821',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  costSplitLabel: {
    flex: 1,
    marginLeft: 12,
    fontSize: 15,
    fontWeight: '600',
    color: '#1b1e28',
  },
  heroChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.32)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  heroChipText: {
    color: '#fff',
    fontSize: 12.5,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  spotifyCard: {
    marginTop: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#eaedf2',
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  spotifyRow: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#eceef2',
    backgroundColor: '#fff',
  },
  spotifyRowIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1cb35b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  spotifyRowBody: {
    flex: 1,
  },
  spotifyRowTitle: {
    color: '#161821',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  spotifyRowSubtitle: {
    marginTop: 2,
    color: '#8a909d',
    fontSize: 12.5,
    fontWeight: '600',
  },
  spotifyRowButtons: {
    flexDirection: 'row',
    gap: 6,
  },
  spotifyRowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  spotifyRowBtnPrimary: {
    backgroundColor: '#e7f8ef',
  },
  spotifyRowBtnPrimaryText: {
    color: '#1cb35b',
    fontSize: 12,
    fontWeight: '800',
  },
  spotifyRowBtnGhost: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e4e7ee',
  },
  spotifyRowBtnGhostText: {
    color: '#161821',
    fontSize: 12,
    fontWeight: '700',
  },
  spotifyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  spotifyIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f3f6f4',
    marginRight: 8,
  },
  spotifyCopy: {
    flex: 1,
  },
  spotifyLabel: {
    color: '#1b2029',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  spotifyHint: {
    marginTop: 1,
    color: '#8a92a0',
    fontSize: 11,
    lineHeight: 15,
  },
  spotifyUrlText: {
    marginTop: 8,
    color: '#4f5866',
    fontSize: 12,
    lineHeight: 17,
  },
  spotifyActions: {
    marginTop: 8,
    flexDirection: 'row',
    gap: 8,
  },
  spotifyPrimaryButton: {
    flex: 1,
    minHeight: 34,
    borderRadius: 10,
    backgroundColor: '#eef8f1',
    borderWidth: 1,
    borderColor: '#d3e9da',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  spotifyPrimaryButtonText: {
    color: '#167a3a',
    fontSize: 12,
    fontWeight: '700',
  },
  spotifyGhostButton: {
    minWidth: 76,
    minHeight: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e0e5ec',
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 10,
  },
  spotifyGhostButtonText: {
    color: '#4e5664',
    fontSize: 12,
    fontWeight: '700',
  },
  spotifyEmptyButton: {
    marginTop: 8,
    minHeight: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#dde4e8',
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  spotifyEmptyButtonText: {
    color: '#4e5664',
    fontSize: 12,
    fontWeight: '700',
  },
  spotifyMessage: {
    marginTop: 6,
    color: '#79838f',
    fontSize: 11,
    lineHeight: 15,
  },
  spotifySheetBody: {
    paddingTop: 18,
    gap: 14,
  },
  spotifySheetCopy: {
    color: '#6c7480',
    fontSize: 14,
    lineHeight: 21,
  },
  spotifyInput: {
    minHeight: 56,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e5e8ee',
    backgroundColor: '#f9fbfc',
    paddingHorizontal: 16,
    color: '#141821',
    fontSize: 16,
  },
  spotifySheetButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  spotifySheetSecondaryButton: {
    minHeight: 52,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e4e8ef',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  spotifySheetSecondaryButtonText: {
    color: '#525a67',
    fontSize: 15,
    fontWeight: '700',
  },
  spotifySheetPrimaryButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 18,
    backgroundColor: '#1db954',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  spotifySheetPrimaryButtonDisabled: {
    opacity: 0.7,
  },
  spotifySheetPrimaryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: COLORS.backdropModal,
    justifyContent: 'flex-end',
  },
  sheetCard: {
    maxHeight: '82%',
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    backgroundColor: COLORS.bgPrimary,
    paddingTop: SPACING.md,
    paddingHorizontal: SPACING.lg,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: RADIUS.circle,
    backgroundColor: COLORS.borderInput,
  },
  sheetHeader: {
    marginTop: SPACING.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  sheetEyebrow: {
    ...TYPOGRAPHY.eyebrow,
    color: COLORS.textMeta,
  },
  sheetTitle: {
    marginTop: SPACING.xs,
    ...TYPOGRAPHY.pageHeading,
    color: COLORS.textPrimary,
  },
  sheetCloseButton: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.circle,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.bgLight,
  },
  sheetContent: {
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.sm,
    gap: SPACING.lg,
  },
  inviteCard: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#ebedf2',
    backgroundColor: '#fff',
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.04,
    shadowRadius: 20,
    elevation: 4,
  },
  inviteHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  inviteEyebrow: {
    color: '#97a0ad',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  inviteTitle: {
    marginTop: 6,
    color: '#161821',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.5,
    maxWidth: 220,
  },
  inviteCodePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    backgroundColor: '#fff3f6',
    borderWidth: 1,
    borderColor: '#ffd4de',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  inviteCodePillText: {
    color: '#ff4f74',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  inviteComposer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 16,
  },
  inviteInput: {
    flex: 1,
    minHeight: 56,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e6e9ef',
    backgroundColor: '#f9fafc',
    paddingHorizontal: 16,
    color: '#161821',
    fontSize: 15,
  },
  inviteAddButton: {
    minHeight: 56,
    borderRadius: 18,
    backgroundColor: '#ff4f74',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  inviteAddButtonDisabled: {
    opacity: 0.72,
  },
  inviteAddButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  inviteActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  secondaryInviteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#ffd4de',
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  secondaryInviteButtonText: {
    color: '#ff4f74',
    fontSize: 14,
    fontWeight: '700',
  },
  inviteMessage: {
    marginTop: 12,
    color: '#6f7683',
    fontSize: 14,
    fontWeight: '600',
  },
  peopleSection: {
    borderRadius: 26,
    borderWidth: 1,
    borderColor: '#ebedf2',
    backgroundColor: '#fff',
    padding: 18,
  },
  peopleSectionTitle: {
    color: '#161821',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.5,
    marginBottom: 10,
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f3f6',
  },
  personRowInvite: {
    borderBottomWidth: 0,
  },
  personRowInviteOpen: {
    paddingBottom: 10,
  },
  personAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1d212a',
    marginRight: 12,
  },
  pendingAvatar: {
    backgroundColor: '#f3f5f8',
  },
  inviteAvatar: {
    backgroundColor: '#fff2f5',
    borderWidth: 1.5,
    borderColor: '#ffd4de',
  },
  personCopy: {
    flex: 1,
  },
  personName: {
    color: '#161821',
    fontSize: 15,
    fontWeight: '700',
  },
  personMeta: {
    marginTop: 3,
    color: '#7b828e',
    fontSize: 13,
    fontWeight: '600',
  },
  peopleEmpty: {
    color: '#7b828e',
    fontSize: 14,
    fontWeight: '600',
  },
  inviteInlineWrap: {
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#f1f3f6',
    paddingTop: 4,
  },
  inviteInlineComposer: {
    paddingTop: 4,
    paddingBottom: 4,
  },
  inviteHintRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 16,
    backgroundColor: '#fff5f7',
    borderWidth: 1,
    borderColor: '#ffd6df',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  inviteHintLabel: {
    color: '#8f5665',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
  },
  inviteHintCode: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  sectionHeader: {
    marginTop: SPACING.xxl,
  },
  miniCalendarWrap: {
    marginTop: 18,
  },
  miniCalendarEyebrow: {
    ...TYPOGRAPHY.eyebrow,
    color: COLORS.textMeta,
  },
  miniCalendarRow: {
    paddingTop: 12,
    gap: 10,
  },
  miniCalendarChip: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff6f8',
    borderWidth: 1,
    borderColor: '#ffd8e2',
  },
  miniCalendarWeekday: {
    color: '#cf295f',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  miniCalendarDay: {
    marginTop: SPACING.xs,
    color: COLORS.textPrimary,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  sectionEyebrow: {
    ...TYPOGRAPHY.eyebrow,
    color: COLORS.textMeta,
  },
  sectionTitle: {
    marginTop: SPACING.sm,
    ...TYPOGRAPHY.pageHeading,
    color: COLORS.textPrimary,
    fontSize: 30,
    lineHeight: 34,
    letterSpacing: -1.2,
  },
  sectionCopy: {
    marginTop: SPACING.sm,
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    lineHeight: 22,
  },
  emptyState: {
    marginTop: 18,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: '#ebedf2',
    backgroundColor: '#fff',
    paddingHorizontal: 24,
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyIconCircle: {
    width: 74,
    height: 74,
    borderRadius: 37,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f6f8',
  },
  emptyTitle: {
    marginTop: 18,
    color: '#161821',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.8,
  },
  emptyCopy: {
    marginTop: 10,
    color: '#79808c',
    fontSize: 15,
    lineHeight: 23,
    textAlign: 'center',
  },
  errorText: {
    marginTop: 18,
    color: '#d53d18',
    textAlign: 'center',
  },
  floatingWrap: {
    position: 'absolute',
    right: 22,
  },
  chatBubbleWrap: {
    position: 'absolute',
    left: 22,
  },
  chatBubble: {
    width: 58,
    height: 58,
    borderRadius: RADIUS.circle,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.secondary,
    shadowColor: COLORS.secondary,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.22,
    shadowRadius: 24,
    elevation: 8,
  },
  chatUnreadDot: {
    position: 'absolute',
    top: SPACING.sm,
    right: SPACING.sm,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.primary,
    borderWidth: 2,
    borderColor: COLORS.bgPrimary,
  },
  chatModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(9,11,17,0.42)',
    paddingHorizontal: 14,
  },
  chatKeyboardAvoider: {
    flex: 1,
  },
  chatPanel: {
    flex: 1,
    borderRadius: 30,
    backgroundColor: '#fff',
    paddingHorizontal: 16,
  },
  chatPanelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eef1f5',
  },
  chatPanelHeaderLeft: {
    flex: 1,
    paddingRight: 10,
  },
  chatPresenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eef1f5',
  },
  chatPresenceBubble: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#e8f4f7',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  chatPresenceBubbleText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.secondary,
  },
  chatPresenceLabel: {
    ...TYPOGRAPHY.meta,
    color: COLORS.textSecondary,
    fontWeight: '600',
    marginLeft: 2,
  },
  chatPanelEyebrow: {
    ...TYPOGRAPHY.eyebrow,
    color: COLORS.textMeta,
  },
  chatPanelTitle: {
    marginTop: SPACING.xs,
    ...TYPOGRAPHY.pageHeading,
    color: COLORS.textPrimary,
    fontSize: 26,
  },
  chatPanelClose: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f6f8',
  },
  floatingButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: '#ff4f74',
    shadowColor: '#ff4f74',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.24,
    shadowRadius: 24,
    elevation: 8,
  },
  floatingButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
  chatListScroll: {
    flex: 1,
  },
  chatList: {
    paddingTop: 18,
    paddingBottom: 10,
    gap: 6,
  },
  chatTimeLabel: {
    textAlign: 'center',
    color: '#a4aab4',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 4,
  },
  chatMessageWrapOwn: {
    alignItems: 'flex-end',
    marginVertical: 3,
  },
  chatSystemLabel: {
    textAlign: 'center',
    color: '#a4aab4',
    fontSize: 12,
    marginVertical: 2,
  },
  chatMessageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginVertical: 3,
  },
  chatAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1d212a',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  chatMessageContent: {
    flex: 1,
    minWidth: 0,
    maxWidth: '70%',
  },
  chatAuthor: {
    marginBottom: 3,
    color: '#9aa2ae',
    fontSize: 11,
    fontWeight: '700',
  },
  chatBubbleCard: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    borderRadius: 20,
    backgroundColor: '#f3f5f8',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  chatBubbleCardOwn: {
    alignSelf: 'flex-end',
    maxWidth: '70%',
    backgroundColor: '#ff4f74',
  },
  chatBubbleText: {
    color: '#161821',
    fontSize: 14,
    lineHeight: 20,
  },
  chatBubbleTextOwn: {
    color: '#fff',
  },
  chatBubbleLink: {
    color: '#fff',
    textDecorationLine: 'underline',
  },
  chatBubbleLinkOther: {
    color: '#ff4f74',
    textDecorationLine: 'underline',
  },
  linkPreviewInline: {
    flexDirection: 'row',
    borderRadius: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    overflow: 'hidden',
    marginTop: 8,
  },
  linkPreviewInlineOwn: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  linkPreviewInlineImage: {
    width: 70,
    height: 70,
    backgroundColor: '#eef0f4',
  },
  linkPreviewInlineContent: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    justifyContent: 'center',
  },
  linkPreviewInlineTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#161821',
    marginBottom: 2,
  },
  linkPreviewInlineTitleOwn: {
    color: '#fff',
  },
  linkPreviewInlineDescription: {
    fontSize: 12,
    color: '#8a909d',
    marginBottom: 3,
  },
  linkPreviewInlineDescriptionOwn: {
    color: 'rgba(255, 255, 255, 0.8)',
  },
  linkPreviewInlineUrl: {
    fontSize: 11,
    color: '#a4aab4',
    fontWeight: '500',
  },
  linkPreviewInlineUrlOwn: {
    color: 'rgba(255, 255, 255, 0.6)',
  },
  chatMeta: {
    marginTop: 4,
    color: '#9aa2ae',
    fontSize: 11,
    fontWeight: '700',
  },
  chatComposer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
  },
  chatInput: {
    flex: 1,
    minHeight: 54,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e6e9ef',
    backgroundColor: '#f9fafc',
    paddingHorizontal: 16,
    color: '#161821',
    fontSize: 15,
  },
  chatSendButton: {
    width: 54,
    height: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ff4f74',
  },
  chatSendButtonDisabled: {
    opacity: 0.55,
  },
  chatMessageImage: {
    width: 220,
    height: 220,
    borderRadius: 16,
    marginBottom: 6,
    backgroundColor: '#eef0f4',
  },
  chatFullscreenBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatFullscreenImage: {
    width: '100%',
    height: '100%',
  },
  chatFullscreenClose: {
    position: 'absolute',
    right: 18,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatAttachButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f3f6',
  },
  chatPendingImageWrap: {
    marginTop: 8,
    alignSelf: 'flex-start',
    width: 96,
    height: 96,
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#eef0f4',
  },
  chatPendingImage: {
    width: '100%',
    height: '100%',
  },
  chatPendingImageRemove: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(12,14,19,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatPendingImageUploading: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(12,14,19,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatPendingImageUploadingText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  dayGroup: {
    marginTop: SPACING.xl,
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginBottom: SPACING.sm,
  },
  dayHeaderText: {
    ...TYPOGRAPHY.cardTitle,
    color: COLORS.textPrimary,
    fontWeight: '800',
  },
  dayHeaderDay: {
    ...TYPOGRAPHY.meta,
    color: COLORS.textMeta,
  },
  dayHeaderLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.borderPrimary,
    marginLeft: SPACING.xs,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.md,
  },
  timelineTime: {
    ...TYPOGRAPHY.meta,
    color: COLORS.textMeta,
    marginLeft: SPACING.sm,
  },
  timelineIconWrap: {
    width: 42,
    height: 42,
  },
  timelineIcon: {
    width: 42,
    height: 42,
    borderRadius: RADIUS.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineIconHidden: {
    backgroundColor: COLORS.avatarDark,
  },
  timelineBody: {
    flex: 1,
    minWidth: 0,
  },
  timelineTitle: {
    ...TYPOGRAPHY.cardTitle,
    color: COLORS.textPrimary,
    fontWeight: '800',
  },
  timelineSubtitle: {
    marginTop: 2,
    ...TYPOGRAPHY.meta,
    color: COLORS.textMeta,
    fontWeight: '500',
  },
  categoryGrid: {
    marginTop: 16,
    gap: 12,
  },
  categoryCardWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  categoryCard: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 18,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ebedf2',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  categoryCardAddButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  categoryCardHeader: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  categoryEmoji: {
    fontSize: 28,
  },
  categoryInfo: {
    flex: 1,
  },
  categoryLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#8a919d',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  categoryItemName: {
    marginTop: 4,
    fontSize: 16,
    fontWeight: '700',
    color: '#161821',
  },
  categoryCount: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8a919d',
  },
  categoryModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  categoryModalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    maxHeight: '90%',
    paddingHorizontal: 22,
    paddingBottom: 32,
  },
  categoryModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
    paddingHorizontal: 2,
  },
  categoryModalCloseButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f6f8',
  },
  categoryModalAddButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
  },
  categoryModalBody: {
    paddingBottom: 4,
  },
  categoryModalTitleSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 24,
  },
  categoryModalEmoji: {
    fontSize: 40,
  },
  categoryModalLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#8a919d',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  categoryModalCount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#161821',
    marginTop: 4,
  },
  categoryModalActivities: {
    gap: 12,
  },
  categoryModalActivityCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    opacity: 1,
  },
  categoryModalActivityCardHidden: {
    opacity: 0.6,
  },
  categoryModalActivityLockSection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: '#f9fafc',
    borderWidth: 1,
    borderColor: '#ebedf2',
  },
  lockedBadge: {
    backgroundColor: '#f5f6f8',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  lockedBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#8a919d',
    letterSpacing: 0.5,
  },
  categoryModalActivityTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#161821',
  },
  categoryModalActivityDate: {
    fontSize: 13,
    color: '#8a919d',
    marginTop: 4,
  },
});
