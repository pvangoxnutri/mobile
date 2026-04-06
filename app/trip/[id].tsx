import { FontAwesome, Ionicons } from '@expo/vector-icons';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Image, Modal, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/components/auth-provider';
import { apiFetch, apiJson } from '@/lib/api';
import { getDefaultNotificationPreferences, loadNotificationPreferences, loadTripChat, sendTripChatMessage, type ChatMessage, type NotificationPreferences } from '@/lib/social';
import type { Quest, SideQuestActivity, TripInvite } from '@/lib/types';

type TripMember = {
  id: string;
  name: string;
  avatarUrl?: string | null;
  isOwner: boolean;
};

export default function TripDetailsScreen() {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView | null>(null);
  const feedOffsets = useRef<Record<string, number>>({});
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
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
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatDraft, setChatDraft] = useState('');
  const [chatPreferences, setChatPreferences] = useState<NotificationPreferences | null>(null);
  const [chatSending, setChatSending] = useState(false);
  const [spotifyModalOpen, setSpotifyModalOpen] = useState(false);
  const [spotifyUrlDraft, setSpotifyUrlDraft] = useState('');
  const [spotifySaving, setSpotifySaving] = useState(false);
  const [spotifyMessage, setSpotifyMessage] = useState('');
  const [error, setError] = useState('');

  useFocusEffect(
    useCallback(() => {
      let active = true;

      async function run() {
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
          const [prefs, chatState] = await Promise.all([
            loadNotificationPreferences(),
            loadTripChat(id, tripData.title ?? 'this adventure'),
          ]);
          if (!active) return;
          setChatPreferences(prefs);
          setChatMessages(chatState.messages);
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
    const groups = new Map<string, SideQuestActivity[]>();
    for (const activity of sortedActivities) {
      const current = groups.get(activity.date) ?? [];
      current.push(activity);
      groups.set(activity.date, current);
    }
    return Array.from(groups.entries()).map(([date, items]) => ({ date, items }));
  }, [sortedActivities]);

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
    setInviteMessage(`Invite code ${trip.inviteCode} copied.`);
  }

  async function handleShareInvite() {
    if (!trip?.inviteCode) return;
    await Share.share({
      title: `Join ${trip.title ?? 'my adventure'}`,
      message: `Join ${trip.title ?? 'my SideQuest adventure'} with code ${trip.inviteCode}.`,
      url: trip.imageUrl ?? undefined,
    });
  }

  async function handleSendChat() {
    if (!trip || !user) return;

    const trimmed = chatDraft.trim();
    if (!trimmed || chatSending) return;

    setChatSending(true);

    try {
      const nextState = await sendTripChatMessage({
        tripId: id,
        tripTitle: trip.title ?? 'this adventure',
        user: { id: user.id, name: user.name || 'Traveler' },
        text: trimmed,
        preferences: chatPreferences ?? getDefaultNotificationPreferences(),
      });

      setChatMessages(nextState.messages);
      setChatDraft('');
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

          <View style={styles.heroCard}>
            {trip?.imageUrl ? <Image source={{ uri: trip.imageUrl }} style={styles.heroImage} /> : null}
            <View style={styles.heroOverlay} />
            <View style={styles.heroBody}>
              <Text style={styles.heroEyebrow}>{trip?.destination ?? 'Upcoming adventure'}</Text>
              <Text style={styles.heroTitle}>{trip?.title ?? 'Loading adventure...'}</Text>
              <Text style={styles.heroDate}>{formatTripDateRange(trip?.startDate, trip?.endDate)}</Text>
              <View style={styles.heroMetaRow}>
                <TripMetaChip icon="people-outline" label={`${members.length || 1} travelers`} onPress={() => setPeopleSheetOpen(true)} />
                <TripMetaChip icon="mail-outline" label={`${invites.length} pending`} onPress={() => setPeopleSheetOpen(true)} />
              </View>
            </View>
          </View>

          <View style={styles.spotifyCard}>
            <View style={styles.spotifyHeader}>
              <View style={styles.spotifyIconWrap}>
                <FontAwesome name="spotify" size={22} color="#1db954" />
              </View>
              <View style={styles.spotifyCopy}>
                <Text style={styles.spotifyLabel}>Shared Spotify</Text>
                <Text style={styles.spotifyHint}>A shared playlist, album, or track for everyone in this event.</Text>
              </View>
            </View>

            {trip?.spotifyUrl ? (
              <>
                <Text style={styles.spotifyUrlText}>{trip.spotifyUrl}</Text>
                <View style={styles.spotifyActions}>
                  <TouchableOpacity activeOpacity={0.9} style={styles.spotifyPrimaryButton} onPress={() => void openSpotifyLink(trip.spotifyUrl!)}>
                    <Ionicons name="play-circle-outline" size={18} color="#fff" />
                    <Text style={styles.spotifyPrimaryButtonText}>Open Spotify</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={0.88}
                    style={styles.spotifyGhostButton}
                    onPress={() => {
                      setSpotifyUrlDraft(trip.spotifyUrl ?? '');
                      setSpotifyMessage('');
                      setSpotifyModalOpen(true);
                    }}>
                    <Ionicons name="create-outline" size={16} color="#1d232e" />
                    <Text style={styles.spotifyGhostButtonText}>Edit</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <TouchableOpacity
                activeOpacity={0.9}
                style={styles.spotifyEmptyButton}
                onPress={() => {
                  setSpotifyUrlDraft('');
                  setSpotifyMessage('');
                  setSpotifyModalOpen(true);
                }}>
                <Ionicons name="add-circle-outline" size={18} color="#1db954" />
                <Text style={styles.spotifyEmptyButtonText}>Add shared Spotify link</Text>
              </TouchableOpacity>
            )}

            {spotifyMessage ? <Text style={styles.spotifyMessage}>{spotifyMessage}</Text> : null}
          </View>

          {activityGroups.length > 0 ? (
            <View style={styles.miniCalendarWrap}>
              <Text style={styles.miniCalendarEyebrow}>TRIP CALENDAR</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.miniCalendarRow}>
                {activityGroups.map((group) => {
                  const date = new Date(`${group.date}T12:00:00`);
                  return (
                    <TouchableOpacity
                      key={group.date}
                      activeOpacity={0.88}
                      style={styles.miniCalendarChip}
                      onPress={() => {
                        const y = feedOffsets.current[group.date];
                        if (typeof y === 'number') {
                          scrollRef.current?.scrollTo({ y: Math.max(y - 18, 0), animated: true });
                        }
                      }}>
                      <Text style={styles.miniCalendarWeekday}>{new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(date)}</Text>
                      <Text style={styles.miniCalendarDay}>{date.getDate()}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionEyebrow}>SIDEQUEST FEED</Text>
            <Text style={styles.sectionTitle}>What the group will discover</Text>
            <Text style={styles.sectionCopy}>A playful stream of hidden and public moments for this trip.</Text>
          </View>

          {activityGroups.length > 0 ? (
            <View style={styles.feed}>
              {activityGroups.map((group) => (
                <View
                  key={group.date}
                  onLayout={(event) => {
                    feedOffsets.current[group.date] = event.nativeEvent.layout.y;
                  }}>
                  <Text style={styles.feedDayLabel}>{formatActivityDate(group.date)}</Text>
                  <View style={styles.feedDayGroup}>
                    {group.items.map((activity) => (
                      <SideQuestFeedCard
                        key={activity.id}
                        activity={activity}
                        onPress={() => router.push(`/trip/${id}/sidequest/${activity.id}`)}
                      />
                    ))}
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="sparkles-outline" size={30} color="#a0a8b5" />
              </View>
              <Text style={styles.emptyTitle}>No SideQuests yet</Text>
              <Text style={styles.emptyCopy}>Create the first hidden mission, reveal moment, or surprise plan for this adventure.</Text>
            </View>
          )}

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </ScrollView>

        <View pointerEvents="box-none" style={[styles.chatBubbleWrap, { bottom: Math.max(insets.bottom, 16) + 6 }]}>
          <TouchableOpacity activeOpacity={0.92} style={styles.chatBubble} onPress={() => setChatOpen(true)}>
            <Ionicons name="chatbubble-ellipses-outline" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        <View pointerEvents="box-none" style={[styles.floatingWrap, { bottom: Math.max(insets.bottom, 16) + 6 }]}>
          <TouchableOpacity activeOpacity={0.92} style={styles.floatingButton} onPress={() => router.push(`/trip/${id}/sidequest/new`)}>
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={styles.floatingButtonText}>Create SideQuest</Text>
          </TouchableOpacity>
        </View>

        <Modal visible={peopleSheetOpen} transparent animationType="slide" onRequestClose={() => setPeopleSheetOpen(false)}>
          <View style={styles.sheetBackdrop}>
            <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={() => setPeopleSheetOpen(false)} />
            <View style={[styles.sheetCard, { paddingBottom: Math.max(insets.bottom, 18) + 12 }]}>
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

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetContent}>
                <View style={styles.peopleSection}>
                  <Text style={styles.peopleSectionTitle}>Travelers</Text>
                  {members.map((member) => (
                    <View key={member.id} style={styles.personRow}>
                      <View style={styles.personAvatar}>
                        <Text style={styles.personAvatarText}>{getInitials(member.name)}</Text>
                      </View>
                      <View style={styles.personCopy}>
                        <Text style={styles.personName}>{member.name}</Text>
                        <Text style={styles.personMeta}>{member.isOwner ? 'Owner' : 'Member'}</Text>
                      </View>
                    </View>
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
                          <Ionicons name="add" size={20} color="#ff4f74" />
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
                            <TextInput
                              value={inviteEmail}
                              onChangeText={setInviteEmail}
                              placeholder="friend@example.com"
                              placeholderTextColor="#afb5bf"
                              keyboardType="email-address"
                              autoCapitalize="none"
                              autoCorrect={false}
                              style={styles.inviteInput}
                            />
                            <TouchableOpacity
                              activeOpacity={0.9}
                              style={[styles.inviteAddButton, inviteSubmitting ? styles.inviteAddButtonDisabled : null]}
                              disabled={inviteSubmitting}
                              onPress={() => void handleAddInvite()}>
                              <Text style={styles.inviteAddButtonText}>{inviteSubmitting ? 'Adding...' : 'Invite'}</Text>
                            </TouchableOpacity>
                          </View>

                          <View style={styles.inviteActions}>
                            <TouchableOpacity activeOpacity={0.9} style={styles.secondaryInviteButton} onPress={() => void handleCopyInviteCode()}>
                              <Ionicons name="copy-outline" size={16} color="#ff4f74" />
                              <Text style={styles.secondaryInviteButtonText}>Copy code</Text>
                            </TouchableOpacity>
                            <TouchableOpacity activeOpacity={0.9} style={styles.secondaryInviteButton} onPress={() => void handleShareInvite()}>
                              <Ionicons name="share-social-outline" size={16} color="#ff4f74" />
                              <Text style={styles.secondaryInviteButtonText}>Share</Text>
                            </TouchableOpacity>
                          </View>

                          <View style={styles.inviteHintRow}>
                            <Text style={styles.inviteHintLabel}>Invite code</Text>
                            <Text style={styles.inviteHintCode}>{trip?.inviteCode ?? '------'}</Text>
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
            </View>
          </View>
        </Modal>

        <Modal visible={chatOpen} transparent animationType="fade" onRequestClose={() => setChatOpen(false)}>
          <View style={styles.chatModalBackdrop}>
            <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={() => setChatOpen(false)} />
            <View style={[styles.chatPanel, { paddingTop: Math.max(insets.top, 18) + 14, paddingBottom: Math.max(insets.bottom, 18) + 14 }]}>
              <View style={styles.chatPanelHeader}>
                <View>
                  <Text style={styles.chatPanelEyebrow}>GROUP CHAT</Text>
                  <Text style={styles.chatPanelTitle}>{trip?.title ?? 'Adventure chat'}</Text>
                </View>
                <TouchableOpacity style={styles.chatPanelClose} activeOpacity={0.88} onPress={() => setChatOpen(false)}>
                  <Ionicons name="close" size={20} color="#161821" />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.chatList}>
                {chatMessages.map((message) => {
                  const ownMessage = message.authorId === user?.id;
                  const systemMessage = message.kind === 'system';

                  return (
                    <View
                      key={message.id}
                      style={[
                        styles.chatMessageWrap,
                        ownMessage ? styles.chatMessageWrapOwn : null,
                        systemMessage ? styles.chatMessageWrapSystem : null,
                      ]}>
                      {!ownMessage && !systemMessage ? <Text style={styles.chatAuthor}>{message.authorName}</Text> : null}
                      <View
                        style={[
                          styles.chatBubbleCard,
                          ownMessage ? styles.chatBubbleCardOwn : null,
                          systemMessage ? styles.chatBubbleCardSystem : null,
                        ]}>
                        <Text
                          style={[
                            styles.chatBubbleText,
                            ownMessage ? styles.chatBubbleTextOwn : null,
                            systemMessage ? styles.chatBubbleTextSystem : null,
                          ]}>
                          {message.text}
                        </Text>
                      </View>
                      <Text style={styles.chatMeta}>{formatChatTimestamp(message.createdAt)}</Text>
                    </View>
                  );
                })}
              </ScrollView>

              <View style={styles.chatComposer}>
                <TextInput
                  value={chatDraft}
                  onChangeText={setChatDraft}
                  placeholder="Send a message to the group"
                  placeholderTextColor="#afb5bf"
                  style={styles.chatInput}
                />
                <TouchableOpacity
                  activeOpacity={0.9}
                  style={[styles.chatSendButton, !chatDraft.trim() || chatSending ? styles.chatSendButtonDisabled : null]}
                  disabled={!chatDraft.trim() || chatSending}
                  onPress={() => void handleSendChat()}>
                  <Ionicons name="send" size={16} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <Modal visible={spotifyModalOpen} transparent animationType="fade" onRequestClose={() => setSpotifyModalOpen(false)}>
          <View style={styles.sheetBackdrop}>
            <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={() => setSpotifyModalOpen(false)} />
            <View style={[styles.sheetCard, { paddingBottom: Math.max(insets.bottom, 18) + 12 }]}>
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
                <TextInput
                  value={spotifyUrlDraft}
                  onChangeText={setSpotifyUrlDraft}
                  placeholder="https://open.spotify.com/..."
                  placeholderTextColor="#a3a9b4"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  style={styles.spotifyInput}
                />
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
          </View>
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

function SideQuestFeedCard({
  activity,
  onPress,
}: {
  activity: SideQuestActivity;
  onPress: () => void;
}) {
  const hidden = activity.isHiddenForViewer;
  const hasImage = Boolean(activity.imageUrl);

  return (
    <TouchableOpacity activeOpacity={0.92} style={styles.feedCard} onPress={onPress}>
      <View style={styles.feedImageWrap}>
        {hasImage ? <Image source={{ uri: activity.imageUrl! }} style={styles.feedImage} blurRadius={hidden ? 18 : 0} /> : null}
        {!hasImage ? (
          <View style={styles.feedPlaceholder}>
            <Ionicons name={hidden ? 'eye-off-outline' : 'image-outline'} size={28} color="#b0b6c0" />
          </View>
        ) : null}
        <View style={[styles.feedImageOverlay, hidden ? styles.feedImageOverlayHidden : null]} />
        <View style={styles.feedBadgeRow}>
          <FeedBadge label={hidden ? 'Hidden' : activity.ownerName || 'Visible'} tone={hidden ? 'dark' : 'pink'} />
          {activity.revealAt && !activity.isRevealed ? <FeedBadge label={formatRevealChip(activity.revealAt)} tone="light" /> : null}
        </View>
      </View>

      <View style={styles.feedBody}>
        <Text style={styles.feedDate}>{formatActivityDate(activity.date)}</Text>
        <Text style={styles.feedTitle}>{activity.title ?? 'Hidden SideQuest'}</Text>
        <Text numberOfLines={2} style={styles.feedDescription}>
          {hidden
            ? activity.teaserVisible && activity.teaser
              ? activity.teaser
              : 'Locked until reveal. Tap in to see when this one opens up.'
            : activity.description || 'A new surprise is waiting for the group.'}
        </Text>
        <View style={styles.feedFooter}>
          <Ionicons name="chevron-forward" size={18} color="#9298a4" />
        </View>
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

function FeedBadge({ label, tone }: { label: string; tone: 'pink' | 'dark' | 'light' }) {
  return (
    <View style={[styles.feedBadge, tone === 'pink' ? styles.feedBadgePink : tone === 'dark' ? styles.feedBadgeDark : styles.feedBadgeLight]}>
      <Text style={[styles.feedBadgeText, tone === 'dark' ? styles.feedBadgeTextLight : null]}>{label}</Text>
    </View>
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

function formatRevealChip(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric' }).format(new Date(value));
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
  heroCard: {
    minHeight: 270,
    borderRadius: 34,
    overflow: 'hidden',
    backgroundColor: '#edf0f3',
    justifyContent: 'flex-end',
  },
  heroImage: {
    ...StyleSheet.absoluteFillObject,
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(17,19,25,0.30)',
  },
  heroBody: {
    padding: 22,
  },
  heroEyebrow: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  heroTitle: {
    marginTop: 8,
    color: '#fff',
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -1.2,
  },
  heroDate: {
    marginTop: 8,
    color: 'rgba(255,255,255,0.90)',
    fontSize: 16,
  },
  heroMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 18,
  },
  heroChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  heroChipText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  spotifyCard: {
    marginTop: 18,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#e4f3e8',
    backgroundColor: '#f8fffa',
    padding: 18,
  },
  spotifyHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  spotifyIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e8f8ed',
    marginRight: 12,
  },
  spotifyCopy: {
    flex: 1,
  },
  spotifyLabel: {
    color: '#10151e',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  spotifyHint: {
    marginTop: 6,
    color: '#5e6a75',
    fontSize: 14,
    lineHeight: 21,
  },
  spotifyUrlText: {
    marginTop: 16,
    color: '#1e2a24',
    fontSize: 14,
    lineHeight: 21,
  },
  spotifyActions: {
    marginTop: 16,
    flexDirection: 'row',
    gap: 10,
  },
  spotifyPrimaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 18,
    backgroundColor: '#1db954',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  spotifyPrimaryButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  spotifyGhostButton: {
    minWidth: 92,
    minHeight: 48,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#d7e6db',
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
  },
  spotifyGhostButtonText: {
    color: '#1d232e',
    fontSize: 14,
    fontWeight: '700',
  },
  spotifyEmptyButton: {
    marginTop: 16,
    minHeight: 52,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#cbe8d3',
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  spotifyEmptyButtonText: {
    color: '#1b7f40',
    fontSize: 15,
    fontWeight: '800',
  },
  spotifyMessage: {
    marginTop: 12,
    color: '#496454',
    fontSize: 13,
    lineHeight: 20,
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
    backgroundColor: 'rgba(12,14,19,0.28)',
    justifyContent: 'flex-end',
  },
  sheetCard: {
    maxHeight: '82%',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    backgroundColor: '#fff',
    paddingTop: 10,
    paddingHorizontal: 20,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#d9dde4',
  },
  sheetHeader: {
    marginTop: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  sheetEyebrow: {
    color: '#9aa2ae',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  sheetTitle: {
    marginTop: 6,
    color: '#161821',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.8,
  },
  sheetCloseButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f6f8',
  },
  sheetContent: {
    paddingTop: 18,
    paddingBottom: 8,
    gap: 18,
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
  personAvatarText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
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
    color: '#ff4f74',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  sectionHeader: {
    marginTop: 28,
  },
  miniCalendarWrap: {
    marginTop: 18,
  },
  miniCalendarEyebrow: {
    color: '#9aa2ae',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
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
    marginTop: 4,
    color: '#161821',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  sectionEyebrow: {
    color: '#a7adb8',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2.5,
  },
  sectionTitle: {
    marginTop: 8,
    color: '#161821',
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -0.9,
  },
  sectionCopy: {
    marginTop: 8,
    color: '#78808c',
    fontSize: 15,
    lineHeight: 23,
  },
  feed: {
    marginTop: 16,
    gap: 14,
  },
  feedDayLabel: {
    marginBottom: 10,
    color: '#8a919d',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  feedDayGroup: {
    gap: 14,
  },
  feedCard: {
    borderRadius: 26,
    overflow: 'hidden',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ebedf2',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.06,
    shadowRadius: 24,
    elevation: 4,
  },
  feedImageWrap: {
    height: 174,
    backgroundColor: '#eef1f4',
  },
  feedImage: {
    ...StyleSheet.absoluteFillObject,
  },
  feedPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f2f4f7',
  },
  feedImageOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(18,22,29,0.12)',
  },
  feedImageOverlayHidden: {
    backgroundColor: 'rgba(18,22,29,0.35)',
  },
  feedBadgeRow: {
    position: 'absolute',
    top: 14,
    left: 14,
    right: 14,
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  feedBadge: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  feedBadgePink: {
    backgroundColor: '#ffe4ec',
  },
  feedBadgeDark: {
    backgroundColor: 'rgba(17,19,25,0.58)',
  },
  feedBadgeLight: {
    backgroundColor: 'rgba(255,255,255,0.82)',
  },
  feedBadgeText: {
    color: '#c82f61',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  feedBadgeTextLight: {
    color: '#fff',
  },
  feedBody: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 15,
  },
  feedDate: {
    color: '#868d99',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  feedTitle: {
    marginTop: 6,
    color: '#161821',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.6,
  },
  feedDescription: {
    marginTop: 8,
    color: '#6f7683',
    fontSize: 14,
    lineHeight: 20,
  },
  feedFooter: {
    marginTop: 12,
    alignItems: 'flex-end',
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
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0d90a8',
    shadowColor: '#0d90a8',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.22,
    shadowRadius: 24,
    elevation: 8,
  },
  chatModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(9,11,17,0.42)',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
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
  chatPanelEyebrow: {
    color: '#9aa2ae',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  chatPanelTitle: {
    marginTop: 6,
    color: '#161821',
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -0.8,
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
  chatList: {
    paddingTop: 18,
    paddingBottom: 10,
    gap: 12,
  },
  chatMessageWrap: {
    alignItems: 'flex-start',
  },
  chatMessageWrapOwn: {
    alignItems: 'flex-end',
  },
  chatMessageWrapSystem: {
    alignItems: 'center',
  },
  chatAuthor: {
    marginBottom: 4,
    marginLeft: 4,
    color: '#7b828e',
    fontSize: 12,
    fontWeight: '700',
  },
  chatBubbleCard: {
    maxWidth: '82%',
    borderRadius: 20,
    backgroundColor: '#f3f5f8',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  chatBubbleCardOwn: {
    backgroundColor: '#ff4f74',
  },
  chatBubbleCardSystem: {
    backgroundColor: '#eef7fa',
  },
  chatBubbleText: {
    color: '#161821',
    fontSize: 14,
    lineHeight: 20,
  },
  chatBubbleTextOwn: {
    color: '#fff',
  },
  chatBubbleTextSystem: {
    color: '#0d7187',
    fontWeight: '700',
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
});
