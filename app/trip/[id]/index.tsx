import { FontAwesome, Ionicons } from '@expo/vector-icons';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as Linking from 'expo-linking';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/components/auth-provider';
import Avatar, { getInitials } from '@/components/avatar';
import { useI18n } from '@/components/i18n-provider';
import UserProfileCard from '@/components/user-profile-card';
import HiddenSidequestCard from '@/components/hidden-sidequest-card';
import DraggableDayList from '@/components/draggable-day-list';
import ActivityImageFallback from '@/components/activity-image-fallback';
import HeroShell from '@/components/hero-shell';
import ModalSheet from '@/components/modal-sheet';
import { EmptyState } from '@/components/ui/empty-state';
import { useKeyboardFocusScroll } from '@/hooks/useKeyboardFocusScroll';
import { apiFetch, apiJson } from '@/lib/api';
import { getCached, setCached, invalidateCache, invalidateTripCache } from '@/lib/cache';
import { uploadImageIfNeeded } from '@/lib/uploads';
import { isSealedInLists } from '@/lib/activity-blur';
import type { Quest, SideQuestActivity, TripInvite, LinkPreview } from '@/lib/types';
import { COLORS, SHADOWS, SPACING, RADIUS, TYPOGRAPHY } from '@/constants/design-tokens';

type ChatReaction = {
  emoji: string;
  count: number;
  reactedByMe: boolean;
};

type ChatMsg = {
  id: string;
  userId?: string | null;
  userName: string;
  text: string;
  imageUrl?: string | null;
  isSystem: boolean;
  // Lets us render a localized string for known system events instead of
  // the English text the backend stores for old-client compatibility. Null
  // for ordinary messages and for system messages predating this field.
  systemEventType?: string | null;
  createdAt: string;
  linkPreview?: LinkPreview | null;
  // Client-only — absent on every message that came from the server as-is.
  // Set on the locally-created optimistic entry while a send is in flight
  // or has failed; cleared (the whole entry gets replaced by the real
  // server message) once it succeeds.
  status?: 'pending' | 'failed';
  // Local file URI to preview/re-upload while status is 'pending' or
  // 'failed' — the real (remote) imageUrl only exists once the upload and
  // the POST have both succeeded.
  localImageUri?: string | null;
  // True when the message author has blocked the current user.
  // Set by the server — the client should show a blocked placeholder.
  isBlockedByAuthor?: boolean;
  // Per-emoji reaction summary from the server. Absent on optimistic
  // (pending/failed) entries, which have no server id to react to yet.
  reactions?: ChatReaction[];
};

// The reaction picker's fixed set — mirrors the backend whitelist in
// TripChatController.AllowedReactionEmojis.
const REACTION_EMOJIS = ['❤️', '😂', '😮', '😢', '👍', '👎'];

// Maps a known SystemEventType to its translated rendering. Falls back to
// the message's own (English, backend-authored) text for unknown/missing
// event types — covers chat history from before this field existed.
function renderSystemMessage(message: ChatMsg, t: (key: string, vars?: Record<string, string | number>) => string): string {
  if (message.systemEventType === 'member_joined') {
    return t('trip.chat.systemMemberJoined', { name: message.userName });
  }
  return message.text;
}

// Below this distance (px) from the bottom of the chat list, an incoming
// message is still allowed to auto-scroll the view — beyond it, the user is
// treated as "reading history" and left alone.
const CHAT_NEAR_BOTTOM_THRESHOLD = 80;

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
  const { t, language } = useI18n();
  const locale = language === 'sv' ? 'sv-SE' : 'en-US';
  const [trip, setTrip] = useState<Quest | null>(null);
  const [members, setMembers] = useState<TripMember[]>([]);
  const [invites, setInvites] = useState<TripInvite[]>([]);
  const [activities, setActivities] = useState<SideQuestActivity[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteMessage, setInviteMessage] = useState('');
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [inviteDeletingId, setInviteDeletingId] = useState<string | null>(null);
  const [peopleSheetOpen, setPeopleSheetOpen] = useState(false);
  const [toolsSheetOpen, setToolsSheetOpen] = useState(false);
  // Message whose reaction picker is open (long-press on a bubble).
  const [reactionPickerMsg, setReactionPickerMsg] = useState<ChatMsg | null>(null);
  // Scale for the bubble being long-pressed — pops up ~6% while its picker
  // is open (iMessage-style lift), springs back on close.
  const reactionScaleAnim = useRef(new Animated.Value(1)).current;
  // Hidden input that surfaces the OS keyboard when "+" is tapped, so the
  // user can react with ANY emoji beyond the six quick ones.
  const emojiInputRef = useRef<TextInput>(null);
  const [emojiInputValue, setEmojiInputValue] = useState('');
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
  const [chatLoading, setChatLoading] = useState(false);
  const [chatLoadError, setChatLoadError] = useState<string | null>(null);
  // Transient banner for things other than a single message failing to
  // send (that has its own inline pending/failed treatment per-bubble) —
  // image-picker permission/access errors mainly. Auto-clears itself.
  const [chatError, setChatError] = useState<string | null>(null);
  const chatErrorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastChatTimestampRef = useRef<string | null>(null);
  const lastReadAtRef = useRef<string>(new Date(Date.now() - 24 * 3600 * 1000).toISOString());
  const chatScrollRef = useRef<FlatList<ChatMsg> | null>(null);
  const chatInputRef = useRef<TextInput | null>(null);
  // Whether the user is currently scrolled near the bottom of the chat —
  // drives whether an incoming message should auto-scroll into view or
  // leave them undisturbed while reading older history.
  const chatNearBottomRef = useRef(true);
  // When sending/retrying from far up in the history, scrollToEnd has to
  // jump over a bunch of virtualized (unmeasured) cells. The onScroll
  // events fired while FlatList measures its way to the real bottom can
  // read as "still far from bottom" mid-jump, which would otherwise flip
  // chatNearBottomRef back to false and cancel the correction chain in
  // onContentSizeChange. While now < this timestamp, handleChatScroll
  // ignores those transient "far" readings.
  const chatForceBottomUntilRef = useRef(0);
  const [spotifyModalOpen, setSpotifyModalOpen] = useState(false);
  const [spotifyUrlDraft, setSpotifyUrlDraft] = useState('');
  const [spotifySaving, setSpotifySaving] = useState(false);
  const [spotifyMessage, setSpotifyMessage] = useState('');
  const [error, setError] = useState('');
  const [profileCardUserId, setProfileCardUserId] = useState<string | null>(null);
  const [selectedCategoryKey, setSelectedCategoryKey] = useState<string | null>(null);
  const [failedAvatars, setFailedAvatars] = useState<Set<string>>(new Set());
  const [blockedUserIds, setBlockedUserIds] = useState<Set<string>>(new Set());
  const [blockChatNotice, setBlockChatNotice] = useState<string | null>(null);
  const blockNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chatInputOpacityRef = useRef(new Animated.Value(0.5)).current;
  const inviteEmailOpacityRef = useRef(new Animated.Value(0.5)).current;
  const spotifyUrlOpacityRef = useRef(new Animated.Value(0.5)).current;
  const inviteEmailRef = useRef<TextInput>(null);
  const { scrollRef: peopleSheetScrollRef, onFocusField: onFocusPeopleSheetField, scrollViewProps: peopleSheetScrollViewProps } = useKeyboardFocusScroll();

  useFocusEffect(
    useCallback(() => {
      scrollRef.current?.scrollTo({ x: 0, y: 0, animated: false });
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
          try {
            const blockedIds = await apiJson<string[]>('/api/users/blocked-ids');
            if (!active) return;
            setBlockedUserIds(new Set(blockedIds));
          } catch {
            // non-fatal — proceed without block list
          }
          setError('');
        } catch (err) {
          if (!active) return;
          setError(err instanceof Error ? err.message : t('trip.error.loadFailed'));
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
    groups.set('flight', { label: t('trip.category.flight'), emoji: '✈️', items: [] });
    groups.set('food', { label: t('trip.category.food'), emoji: '🍽️', items: [] });
    groups.set('activities', { label: t('trip.category.activities'), emoji: '🎯', items: [] });
    groups.set('other', { label: t('trip.category.other'), emoji: '⭐', items: [] });

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
  }, [sortedActivities, t]);

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
        // Manual drag order from the backend (SortIndex), not time — letting
        // the group be freely reordered is the whole point of the drag list.
        items: items.sort((x, y) => x.sortIndex - y.sortIndex),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [sortedActivities]);

  const memberAvatarMap = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const m of members) map.set(m.id, m.avatarUrl ?? null);
    return map;
  }, [members]);

  const hasHiddenMessages = useMemo(
    () => chatMessages.some((m) =>
      (m.userId != null && blockedUserIds.has(m.userId)) || !!m.isBlockedByAuthor,
    ),
    [chatMessages, blockedUserIds],
  );

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
    chatNearBottomRef.current = true;
    setChatLoadError(null);
    setChatLoading(true);

    let active = true;
    let msgPollId: ReturnType<typeof setInterval> | null = null;

    // Only start polling for new messages once the initial load has
    // actually landed. Starting the interval immediately (the old code)
    // risked a fast incremental poll resolving before the slower initial
    // full load — the initial load's setChatMessages(msgs) is a full
    // replace, so it could wipe out whatever the poll had just merged in.
    void loadChatMessages(true).finally(() => {
      if (!active) return;
      msgPollId = setInterval(() => void loadChatMessages(false), 3000);
    });
    void sendChatHeartbeat();
    void loadChatPresence();

    const heartbeatId = setInterval(() => void sendChatHeartbeat(), 15000);
    const presencePollId = setInterval(() => void loadChatPresence(), 5000);

    const keyboardSub = Keyboard.addListener('keyboardDidShow', () => {
      if (chatNearBottomRef.current) chatScrollRef.current?.scrollToEnd({ animated: false });
    });

    return () => {
      active = false;
      if (msgPollId) clearInterval(msgPollId);
      clearInterval(heartbeatId);
      clearInterval(presencePollId);
      if (chatErrorTimeoutRef.current) clearTimeout(chatErrorTimeoutRef.current);
      keyboardSub.remove();
      void apiFetch(`/api/trips/${id}/chat/presence`, { method: 'DELETE' }).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatOpen, id]);

  // Auto-scroll chat to bottom when messages arrive — but only if the user
  // is already near the bottom (or this is the initial load / their own
  // send, which force chatNearBottomRef true at the source). Reading older
  // history shouldn't get yanked back down by an incoming message.
  useEffect(() => {
    if (!chatOpen || chatMessages.length === 0) return;
    if (!chatNearBottomRef.current) return;
    const timer = setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(timer);
  }, [chatMessages.length, chatOpen]);

  function handleChatScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const distanceFromBottom = contentSize.height - contentOffset.y - layoutMeasurement.height;
    const nearBottom = distanceFromBottom < CHAT_NEAR_BOTTOM_THRESHOLD;
    if (!nearBottom && Date.now() < chatForceBottomUntilRef.current) return;
    chatNearBottomRef.current = nearBottom;
  }

  function showChatError(message: string) {
    setChatError(message);
    if (chatErrorTimeoutRef.current) clearTimeout(chatErrorTimeoutRef.current);
    chatErrorTimeoutRef.current = setTimeout(() => setChatError(null), 4000);
  }

  async function handleAddInvite() {
    const normalizedEmail = inviteEmail.trim().toLowerCase();

    if (!normalizedEmail) {
      setInviteMessage(t('trip.error.emptyEmail'));
      return;
    }

    if (!/\S+@\S+\.\S+/.test(normalizedEmail)) {
      setInviteMessage(t('trip.error.invalidEmail'));
      return;
    }

    if (invites.some((invite) => invite.email.toLowerCase() === normalizedEmail)) {
      setInviteMessage(t('trip.error.emailAlreadyInvited'));
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
      setInviteMessage(t('trip.invite.sent'));
    } catch (err) {
      setInviteMessage(err instanceof Error ? err.message : t('trip.error.inviteFailed'));
    } finally {
      setInviteSubmitting(false);
    }
  }

  function handleDeleteInvite(invite: TripInvite) {
    Alert.alert(
      t('trip.invites.deleteConfirmTitle'),
      t('trip.invites.deleteConfirmMessage', { email: invite.email }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setInviteDeletingId(invite.id);
              try {
                const response = await apiFetch(`/api/trips/${id}/invites/${encodeURIComponent(invite.id)}`, { method: 'DELETE' });
                if (!response.ok && response.status !== 404) {
                  throw new Error((await response.text()) || t('trip.error.inviteFailed'));
                }
                invalidateTripCache(id);
                setInvites((current) => current.filter((i) => i.id !== invite.id));
              } catch (err) {
                setInviteMessage(err instanceof Error ? err.message : t('trip.error.inviteFailed'));
              } finally {
                setInviteDeletingId(null);
              }
            })();
          },
        },
      ],
    );
  }

  async function handleCopyInviteCode() {
    if (!trip?.inviteCode) return;
    await Clipboard.setStringAsync(trip.inviteCode);
    setInviteMessage(t('trip.success.codeCopied', { code: trip.inviteCode }));
    setTimeout(() => setInviteMessage(''), 2500);
  }

  async function handleShareInvite() {
    if (!trip?.inviteCode) return;
    const shareTitle = trip.title ?? t('home.defaultTripName');
    await Share.share({
      title: t('trip.share.title', { title: shareTitle }),
      message: t('trip.share.message', { title: shareTitle, code: trip.inviteCode }),
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
        setChatLoadError(null);
      } else if (msgs.length > 0) {
        setChatMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          let next = prev;
          const trulyNew: ChatMsg[] = [];

          for (const incoming of msgs) {
            if (existingIds.has(incoming.id)) continue; // already have this exact server message

            // Does this resolve one of OUR OWN optimistic entries that's
            // still in flight (poll won the race against our own POST's
            // response)? Can't match by id — temp ids and server ids are
            // never the same — so match on what the message actually is:
            // same author, same text, same image-presence, created within
            // a few seconds of each other.
            const pendingIndex = next.findIndex(
              (m) =>
                (m.status === 'pending' || m.status === 'failed') &&
                m.userId === incoming.userId &&
                m.text === incoming.text &&
                Boolean(m.localImageUri) === Boolean(incoming.imageUrl) &&
                Math.abs(new Date(m.createdAt).getTime() - new Date(incoming.createdAt).getTime()) < 15000,
            );

            if (pendingIndex !== -1) {
              next = next.map((m, i) => (i === pendingIndex ? incoming : m));
            } else {
              trulyNew.push(incoming);
            }
          }

          return trulyNew.length > 0 ? [...next, ...trulyNew] : next;
        });
        lastChatTimestampRef.current = msgs[msgs.length - 1].createdAt;
      }
    } catch (err) {
      // Background polls fail silently — the next 3s tick just retries.
      // The initial load is the one case the user would otherwise be
      // staring at a blank, unexplained panel for, so that one gets a
      // visible, retryable error instead.
      if (initial) {
        setChatLoadError(err instanceof Error ? err.message : t('trip.error.chatLoadFailed'));
      }
    } finally {
      if (initial) setChatLoading(false);
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
        showChatError(t('trip.error.photoAccessRequired'));
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
      });
      if (result.canceled || !result.assets[0]) return;
      setChatPendingImage(result.assets[0].uri);
    } catch (err) {
      showChatError(err instanceof Error ? err.message : t('trip.error.photoLibraryOpenFailed'));
    }
  }

  // Shared by a fresh send and a retry of a previously-failed one — takes
  // the (already in the list, as a 'pending' entry) message's id, uploads
  // its image if it has a local one still to send, POSTs, then swaps the
  // optimistic entry for the real server message (or flips it to 'failed').
  async function performChatSend(tempId: string, text: string, localImageUri: string | null) {
    setChatSending(true);
    try {
      let uploadedImageUrl: string | null = null;
      if (localImageUri) {
        setChatImageUploading(true);
        try {
          uploadedImageUrl = await uploadImageIfNeeded(localImageUri, 'chat');
        } finally {
          setChatImageUploading(false);
        }
      }
      const msg = await apiJson<ChatMsg>(`/api/trips/${id}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, imageUrl: uploadedImageUrl }),
      });
      setChatMessages((prev) => prev.map((m) => (m.id === tempId ? msg : m)));
      lastChatTimestampRef.current = msg.createdAt;
    } catch (err) {
      setChatMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, status: 'failed' as const } : m)));
      showChatError(err instanceof Error ? err.message : t('trip.error.chatSendFailed'));
    } finally {
      setChatSending(false);
    }
  }

  async function handleSendChat() {
    const trimmed = chatDraft.trim();
    const hasImage = chatPendingImage !== null;
    if ((!trimmed && !hasImage) || chatSending || chatImageUploading) return;

    const tempId = `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const localImageUri = chatPendingImage;

    chatNearBottomRef.current = true; // sending always means "take me to the bottom"
    chatForceBottomUntilRef.current = Date.now() + 700;
    setChatMessages((prev) => [
      ...prev,
      {
        id: tempId,
        userId: user?.id ?? null,
        userName: user?.name ?? '',
        text: trimmed,
        localImageUri,
        isSystem: false,
        createdAt: new Date().toISOString(),
        status: 'pending',
      },
    ]);
    setChatDraft('');
    chatInputRef.current?.clear();
    setChatPendingImage(null);
    setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: false }), 700);

    await performChatSend(tempId, trimmed, localImageUri);
  }

  async function handleRetryChat(message: ChatMsg) {
    if (chatSending || message.status !== 'failed') return;
    chatNearBottomRef.current = true;
    chatForceBottomUntilRef.current = Date.now() + 700;
    setChatMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, status: 'pending' as const } : m)));
    setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: false }), 700);
    await performChatSend(message.id, message.text, message.localImageUri ?? null);
  }

  function showReportMenu(contentType: 'chat_message' | 'user' | 'activity', contentId: string, targetUserId?: string, targetName?: string) {
    const isBlocked = targetUserId ? blockedUserIds.has(targetUserId) : false;
    const canBlockOrUnblock = targetUserId && targetUserId !== user?.id;

    // Top-level: Report / Block (or Unblock) / Cancel
    // Tapping "Report" opens the reason sub-menu.
    const reportLabel = contentType === 'chat_message'
      ? t('report.reportMessage')
      : contentType === 'activity'
        ? t('report.reportActivity')
        : t('report.reportUser');

    Alert.alert(
      targetName ?? t('report.title'),
      undefined,
      [
        {
          text: reportLabel,
          onPress: () => showReportReasonMenu(contentType, contentId),
        },
        ...(canBlockOrUnblock
          ? [{
              text: isBlocked ? t('report.unblockUser') : t('report.blockUser'),
              style: 'destructive' as const,
              onPress: () => void handleToggleBlock(targetUserId!, targetName ?? ''),
            }]
          : []),
        { text: t('common.cancel'), style: 'cancel' as const },
      ],
    );
  }

  function showReportReasonMenu(contentType: 'chat_message' | 'user' | 'activity', contentId: string) {
    const reasonKeys = ['spam', 'harassment', 'offensive', 'explicit', 'other'] as const;
    Alert.alert(
      t('report.reasonTitle'),
      undefined,
      [
        ...reasonKeys.map((reason) => ({
          text: t(`report.reason.${reason}`),
          onPress: () => void submitReport(contentType, contentId, reason),
        })),
        { text: t('common.cancel'), style: 'cancel' as const },
      ],
    );
  }

  async function submitReport(contentType: string, contentId: string, reason: string) {
    try {
      await apiFetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentType, contentId, reason }),
      });
      Alert.alert(t('report.success'));
    } catch {
      Alert.alert(t('report.failed'));
    }
  }

  async function handleToggleBlock(targetUserId: string, targetName: string) {
    const isBlocked = blockedUserIds.has(targetUserId);
    if (!isBlocked) {
      Alert.alert(
        t('report.blockConfirmTitle', { name: targetName }),
        t('report.blockConfirmBody'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('report.blockUser'),
            style: 'destructive',
            onPress: () => void doBlock(targetUserId, targetName),
          },
        ],
      );
    } else {
      await doUnblock(targetUserId);
      Alert.alert(t('report.unblockSuccess', { name: targetName }));
    }
  }

  async function doBlock(targetUserId: string, targetName: string) {
    try {
      await apiFetch(`/api/users/${targetUserId}/block`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tripId: id }),
      });
      setBlockedUserIds((prev) => new Set([...prev, targetUserId]));
      if (blockNoticeTimerRef.current) clearTimeout(blockNoticeTimerRef.current);
      setBlockChatNotice(targetName);
      blockNoticeTimerRef.current = setTimeout(() => setBlockChatNotice(null), 4000);
    } catch {
      Alert.alert(t('report.blockFailed'));
    }
  }

  async function doUnblock(targetUserId: string) {
    try {
      await apiFetch(`/api/users/${targetUserId}/block`, { method: 'DELETE' });
      setBlockedUserIds((prev) => { const next = new Set(prev); next.delete(targetUserId); return next; });
    } catch {
      Alert.alert(t('report.blockFailed'));
    }
  }

  // Long-press entry: vibrate and lift the bubble, then open the picker.
  function openReactionPicker(message: ChatMsg) {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setReactionPickerMsg(message);
    reactionScaleAnim.setValue(1);
    Animated.spring(reactionScaleAnim, {
      toValue: 1.06,
      damping: 12,
      mass: 1,
      stiffness: 180,
      useNativeDriver: true,
    }).start();
  }

  function closeReactionPicker() {
    Animated.spring(reactionScaleAnim, {
      toValue: 1,
      damping: 14,
      mass: 1,
      stiffness: 200,
      useNativeDriver: true,
    }).start();
    setReactionPickerMsg(null);
    setEmojiInputValue('');
  }

  // Pull the first emoji grapheme out of keyboard input. Uses Intl.Segmenter
  // when present (correctly handles ZWJ/skin-tone sequences), else falls
  // back to the first extended-pictographic run.
  function extractFirstEmoji(text: string): string | null {
    const trimmed = text.trim();
    if (!trimmed) return null;
    const Segmenter = (Intl as unknown as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
    if (Segmenter) {
      const seg = new Segmenter(undefined, { granularity: 'grapheme' });
      for (const { segment } of seg.segment(trimmed)) {
        if (/\p{Extended_Pictographic}/u.test(segment)) return segment;
      }
      return null;
    }
    const match = trimmed.match(/\p{Extended_Pictographic}(‍\p{Extended_Pictographic}|[️\u{1F3FB}-\u{1F3FF}])*/u);
    return match ? match[0] : null;
  }

  function handleEmojiInputChange(text: string) {
    const emoji = extractFirstEmoji(text);
    setEmojiInputValue('');
    emojiInputRef.current?.blur();
    if (!emoji || !reactionPickerMsg) return;
    void handleToggleReaction(reactionPickerMsg.id, emoji);
  }

  async function handleToggleReaction(messageId: string, emoji: string) {
    closeReactionPicker();

    // Optimistic flip — reconciled with the server's summary below.
    setChatMessages((prev) => prev.map((m) => {
      if (m.id !== messageId) return m;
      const current = m.reactions ?? [];
      const hit = current.find((r) => r.emoji === emoji);
      let next: ChatReaction[];
      if (hit?.reactedByMe) {
        next = current
          .map((r) => (r.emoji === emoji ? { ...r, count: r.count - 1, reactedByMe: false } : r))
          .filter((r) => r.count > 0);
      } else if (hit) {
        next = current.map((r) => (r.emoji === emoji ? { ...r, count: r.count + 1, reactedByMe: true } : r));
      } else {
        next = [...current, { emoji, count: 1, reactedByMe: true }];
      }
      return { ...m, reactions: next };
    }));

    try {
      const response = await apiFetch(`/api/trips/${id}/chat/${messageId}/reactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emoji }),
      });
      if (!response.ok) throw new Error(await response.text());
      const summary = (await response.json()) as ChatReaction[];
      setChatMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, reactions: summary } : m)));
    } catch {
      // Optimistic state may now be wrong — a full reload restores server truth.
      void loadChatMessages(true);
    }
  }

  // Reaction chips under a bubble. Tapping a chip toggles the current
  // user's reaction for that emoji; a highlighted chip = you reacted.
  function renderReactionChips(message: ChatMsg, ownMessage: boolean) {
    if (!message.reactions || message.reactions.length === 0 || message.status) return null;
    return (
      <View style={[styles.reactionChipsRow, ownMessage && styles.reactionChipsRowOwn]}>
        {message.reactions.map((reaction) => (
          <TouchableOpacity
            key={reaction.emoji}
            activeOpacity={0.75}
            style={[styles.reactionChip, reaction.reactedByMe && styles.reactionChipMine]}
            onPress={() => void handleToggleReaction(message.id, reaction.emoji)}>
            <Text style={styles.reactionChipText}>
              {reaction.emoji} {reaction.count}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  }

  function renderChatMessageItem(message: ChatMsg, index: number) {
    const ownMessage = message.userId === user?.id;
    const systemMessage = message.isSystem;
    const isBlocked = !ownMessage && !systemMessage && (
      !!(message.userId && blockedUserIds.has(message.userId)) || !!message.isBlockedByAuthor
    );
    const prevMessage = index > 0 ? chatMessages[index - 1] : null;
    const showTime =
      !prevMessage ||
      new Date(message.createdAt).getTime() - new Date(prevMessage.createdAt).getTime() >= 5 * 60 * 1000;
    const avatarUrl = message.userId ? (memberAvatarMap.get(message.userId) ?? null) : null;
    const imageSource = message.localImageUri ?? message.imageUrl;
    const isReacting = reactionPickerMsg?.id === message.id;
    const reactingScaleStyle = isReacting ? { transform: [{ scale: reactionScaleAnim }] } : undefined;
    const isPending = message.status === 'pending';
    const isFailed = message.status === 'failed';

    return (
      <View>
        {showTime ? (
          <Text style={styles.chatTimeLabel}>{formatChatTimestamp(message.createdAt, locale)}</Text>
        ) : null}
        {systemMessage ? (
          <Text style={styles.chatSystemLabel}>{renderSystemMessage(message, t)}</Text>
        ) : ownMessage ? (
          <View style={styles.chatMessageWrapOwn}>
            {imageSource ? (
              <Pressable onPress={() => setChatFullscreenImage(imageSource)} disabled={isPending || isFailed}>
                <Image source={{ uri: imageSource }} style={[styles.chatMessageImage, isPending && styles.chatMessagePending]} />
              </Pressable>
            ) : null}
            <Animated.View style={reactingScaleStyle}>
              <TouchableOpacity
                activeOpacity={0.85}
                disabled={isPending || isFailed}
                onLongPress={() => openReactionPicker(message)}>
                <View
                  style={[
                    styles.chatBubbleCard,
                    styles.chatBubbleCardOwn,
                    { backgroundColor: COLORS.primary },
                    isPending && styles.chatMessagePending,
                    isFailed && styles.chatBubbleCardFailed,
                  ]}>
                  {message.text ? <ChatMessageText text={message.text} isOwn={true} /> : null}
                  {message.linkPreview ? <LinkPreviewCardInline preview={message.linkPreview} isOwn={true} /> : null}
                </View>
              </TouchableOpacity>
            </Animated.View>
            {renderReactionChips(message, true)}
            {isPending ? (
              <Text style={styles.chatStatusPending}>{t('trip.chat.sending')}</Text>
            ) : isFailed ? (
              <TouchableOpacity activeOpacity={0.7} onPress={() => void handleRetryChat(message)}>
                <Text style={styles.chatStatusFailed}>{t('trip.chat.sendFailedRetry')}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : isBlocked ? (
          <View style={styles.chatMessageRow}>
            <View style={styles.chatAvatar}>
              <Avatar
                uri={avatarUrl}
                name={message.userName}
                fallbackText={getInitials(message.userName)}
                forceFallback={failedAvatars.has(message.userId || '')}
                onError={() => message.userId && setFailedAvatars((prev) => new Set([...prev, message.userId!]))}
                size={28}
                fallbackBackgroundColor="#c2c8d2"
                fallbackTextColor="#fff"
              />
            </View>
            <View style={styles.chatMessageContent}>
              <Text style={styles.chatAuthorBlocked}>{message.userName}</Text>
              <View style={styles.chatBubbleBlocked}>
                <Ionicons name="ban" size={12} color="#a3a9b4" />
                <Text style={styles.chatBubbleBlockedText}>{t('trip.chat.blockedMessage')}</Text>
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.chatMessageRow}>
            <TouchableOpacity
              style={styles.chatAvatar}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              onPress={() => message.userId && setProfileCardUserId(message.userId)}>
              <Avatar
                uri={avatarUrl}
                name={message.userName}
                fallbackText={getInitials(message.userName)}
                forceFallback={failedAvatars.has(message.userId || '')}
                onError={() => message.userId && setFailedAvatars((prev) => new Set([...prev, message.userId!]))}
                size={28}
                fallbackBackgroundColor="#1d212a"
                fallbackTextColor="#fff"
              />
            </TouchableOpacity>
            <View style={styles.chatMessageContent}>
              <Text style={styles.chatAuthor}>{message.userName}</Text>
              {imageSource ? (
                <Pressable onPress={() => setChatFullscreenImage(imageSource)}>
                  <Image source={{ uri: imageSource }} style={styles.chatMessageImage} />
                </Pressable>
              ) : null}
              <Animated.View style={reactingScaleStyle}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onLongPress={() => openReactionPicker(message)}>
                  <View style={styles.chatBubbleCard}>
                    {message.text ? <ChatMessageText text={message.text} isOwn={false} /> : null}
                    {message.linkPreview ? <LinkPreviewCardInline preview={message.linkPreview} isOwn={false} /> : null}
                  </View>
                </TouchableOpacity>
              </Animated.View>
              {renderReactionChips(message, false)}
            </View>
          </View>
        )}
      </View>
    );
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
        throw new Error((await response.text()) || t('trip.error.spotifySaveFailed'));
      }

      const updated = (await response.json()) as Quest;
      invalidateTripCache(id);
      setTrip(updated);
      setSpotifyUrlDraft(updated.spotifyUrl ?? '');
      setSpotifyModalOpen(false);
      setSpotifyMessage(updated.spotifyUrl ? t('trip.spotify.updated') : t('trip.spotify.removed'));
    } catch (err) {
      setSpotifyMessage(err instanceof Error ? err.message : t('trip.error.spotifySaveFailed'));
    } finally {
      setSpotifySaving(false);
    }
  }

  async function handleReorderActivities(date: string, reordered: SideQuestActivity[]) {
    const reorderedWithIndex = reordered.map((a, i) => ({ ...a, sortIndex: i }));
    const reorderedIds = new Set(reorderedWithIndex.map((a) => a.id));

    // Optimistic: drop the moved day's items back into the flat list with
    // their new SortIndex so the feed reflects the drop immediately.
    setActivities((prev) => [...prev.filter((a) => !reorderedIds.has(a.id)), ...reorderedWithIndex]);

    try {
      const response = await apiFetch(`/api/trips/${id}/activities/reorder`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, activityIds: reorderedWithIndex.map((a) => a.id) }),
      });
      if (!response.ok) throw new Error(await response.text());
      invalidateCache(`/api/trips/${id}/activities`);
    } catch {
      // Resync with the server's actual order rather than leaving a
      // possibly-wrong optimistic order in place.
      try {
        const fresh = await apiJson<SideQuestActivity[]>(`/api/trips/${id}/activities`);
        setActivities(fresh);
      } catch {
        // best effort
      }
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
            <Text style={styles.headerTitle}>{trip?.title ?? t('home.defaultTripName')}</Text>
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

            {/* Same top-left location pill as the Home carousel's preview
                card (components/big-hero-card.tsx) — kept in sync by hand
                since the two screens don't share this card as one
                component, only the underlying HeroShell. */}
            <View style={styles.heroTopRow}>
              <View style={styles.heroLocPill}>
                <Ionicons name="location" size={12} color="#fff" />
                <Text style={styles.heroLocText} numberOfLines={1}>
                  {trip?.destination ?? t('trip.upcomingAdventure')}
                </Text>
              </View>
            </View>

            <View style={styles.heroBody}>
              <Text style={styles.heroTitle} numberOfLines={2}>{trip?.title ?? t('trip.loadingAdventure')}</Text>
              <Text style={styles.heroDate}>{formatTripDateRange(trip?.startDate, trip?.endDate, locale, t)}</Text>
              <View style={styles.heroMetaRow}>
                <TripMetaChip icon="people-outline" label={t('trip.travelersCount', { count: members.length || 1 })} onPress={() => setPeopleSheetOpen(true)} />
                <TripMetaChip icon="mail-outline" label={t('trip.pendingCount', { count: invites.length })} onPress={() => setPeopleSheetOpen(true)} />
              </View>
            </View>
          </HeroShell>

          {/* Trip tools moved out of the feed — the floating launcher next
              to the chat bubble opens them in a bottom sheet instead, so the
              feed stays focused on trip activity. */}

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionEyebrow}>{t('trip.feedEyebrow')}</Text>
          </View>

          {activityDayGroups.length > 0 ? (
            activityDayGroups.map((group) => (
              <View key={group.date} style={styles.dayGroup}>
                <View style={styles.dayHeader}>
                  <Text style={styles.dayHeaderText}>{formatDayHeaderDate(group.date, locale)}</Text>
                  <Text style={styles.dayHeaderDay}>{t('trip.dayNumber', { day: dayNumberRelative(group.date, trip?.startDate) })}</Text>
                  <View style={styles.dayHeaderLine} />
                </View>
                <DraggableDayList
                  items={group.items}
                  keyExtractor={(activity) => activity.id}
                  // Reordering is a trip-wide collaborative action gated by
                  // MembersCanEdit (or trip ownership) on the backend's
                  // reorder endpoint — NOT per-activity canEdit, which is
                  // creator-only for editing/deleting an activity's own
                  // content. Using canEdit here would silently disable drag
                  // for an entire day whenever its first item happens to be
                  // someone else's activity, even for your own items below it.
                  enabled={canManageTrip || (trip?.membersCanEdit ?? true)}
                  onReorder={(reordered) => void handleReorderActivities(group.date, reordered)}
                  renderItem={(activity) => {
                  const hidden = isSealedInLists(activity);
                  const timeLabel = formatActivityTimeShort(activity.time);

                  if (hidden) {
                    return (
                      <HiddenSidequestCard
                        key={activity.id}
                        id={activity.id}
                        revealAt={activity.revealAt}
                        imageUrl={activity.imageUrl}
                        category={activity.category}
                        description={activity.description}
                        timeLabel={timeLabel}
                        formatTimeUntilReveal={(revealAt) => formatTimeUntilReveal(revealAt, t)}
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
                          {activity.title?.trim() || t('trip.activityFallbackTitle')}
                        </Text>
                        <Text style={styles.timelineSubtitle} numberOfLines={1}>
                          {formatActivityAuthorSubtitle(activity)}
                        </Text>
                      </View>
                      {timeLabel ? <Text style={styles.timelineTime}>{timeLabel}</Text> : null}
                    </TouchableOpacity>
                  );
                  }}
                />
              </View>
            ))
          ) : (
            <EmptyState
              icon="sparkles-outline"
              title={t('trip.empty.title')}
              description={t('trip.empty.description')}
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

        {/* Trip tools launcher — compact sibling of the chat bubble. Opens
            the tools sheet that replaced the in-feed Functions card. */}
        <View pointerEvents="box-none" style={[styles.toolsBubbleWrap, { bottom: Math.max(insets.bottom, 16) + 6 }]}>
          <TouchableOpacity
            activeOpacity={0.92}
            style={styles.toolsBubble}
            accessibilityRole="button"
            accessibilityLabel={t('trip.tools.openLabel')}
            onPress={() => setToolsSheetOpen(true)}>
            <Ionicons name="grid-outline" size={20} color={COLORS.primary} />
          </TouchableOpacity>
        </View>

        <View pointerEvents="box-none" style={[styles.floatingWrap, { bottom: Math.max(insets.bottom, 16) + 6 }]}>
          <TouchableOpacity activeOpacity={0.92} style={[styles.floatingButton, { backgroundColor: COLORS.primary, shadowColor: COLORS.primary }]} onPress={() => router.push(`/trip/${id}/sidequest/new`)}>
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={styles.floatingButtonText}>{t('trip.addActivity')}</Text>
          </TouchableOpacity>
        </View>

        {/* Trip tools sheet — every utility entry point in one place, off
            the feed. Navigation targets are unchanged; only the entry moved.
            slowEntry: the launcher sheet should glide up deliberately. */}
        <ModalSheet visible={toolsSheetOpen} slowEntry onClose={() => setToolsSheetOpen(false)}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <View>
              <Text style={styles.sheetEyebrow}>{t('trip.functions.subtitle')}</Text>
              <Text style={styles.sheetTitle}>{t('trip.tools.title')}</Text>
            </View>
            <TouchableOpacity style={styles.sheetCloseButton} activeOpacity={0.88} onPress={() => setToolsSheetOpen(false)}>
              <Ionicons name="close" size={20} color="#161821" />
            </TouchableOpacity>
          </View>
          <View style={styles.toolsList}>
            <TouchableOpacity
              style={styles.toolRow}
              activeOpacity={0.86}
              onPress={() => {
                setToolsSheetOpen(false);
                router.push(`/trip/${id}/split`);
              }}>
              <View style={[styles.toolRowIcon, { backgroundColor: '#fff0f4' }]}>
                <Ionicons name="calculator-outline" size={20} color={COLORS.primary} />
              </View>
              <Text style={styles.toolRowLabel}>{t('trip.costSplit')}</Text>
              <Ionicons name="chevron-forward" size={18} color="#b2b7c0" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.toolRow}
              activeOpacity={0.86}
              onPress={() => {
                setToolsSheetOpen(false);
                setSpotifyModalOpen(true);
              }}>
              <View style={[styles.toolRowIcon, { backgroundColor: '#e7f8ef' }]}>
                <FontAwesome name="spotify" size={20} color="#1cb35b" />
              </View>
              <Text style={styles.toolRowLabel}>{t('trip.tools.spotify')}</Text>
              <Ionicons name="chevron-forward" size={18} color="#b2b7c0" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.toolRow}
              activeOpacity={0.86}
              onPress={() => {
                setToolsSheetOpen(false);
                router.push(`/trip/${id}/packing-list`);
              }}>
              <View style={[styles.toolRowIcon, { backgroundColor: '#eef4ff' }]}>
                <Ionicons name="checkmark-done-outline" size={20} color="#3b82f6" />
              </View>
              <Text style={styles.toolRowLabel}>{t('trip.packingList.title')}</Text>
              <Ionicons name="chevron-forward" size={18} color="#b2b7c0" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.toolRow}
              activeOpacity={0.86}
              onPress={() => {
                setToolsSheetOpen(false);
                setPeopleSheetOpen(true);
              }}>
              <View style={[styles.toolRowIcon, { backgroundColor: '#f3e8ff' }]}>
                <Ionicons name="person-add-outline" size={20} color="#9333ea" />
              </View>
              <Text style={styles.toolRowLabel}>{t('trip.tools.inviteFriends')}</Text>
              <Ionicons name="chevron-forward" size={18} color="#b2b7c0" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.toolRow}
              activeOpacity={0.86}
              onPress={() => {
                setToolsSheetOpen(false);
                router.push(`/trip/${id}/settings`);
              }}>
              <View style={[styles.toolRowIcon, { backgroundColor: '#f1f5f9' }]}>
                <Ionicons name="settings-outline" size={20} color="#475569" />
              </View>
              <Text style={styles.toolRowLabel}>{t('settings.title')}</Text>
              <Ionicons name="chevron-forward" size={18} color="#b2b7c0" />
            </TouchableOpacity>
          </View>
        </ModalSheet>

        <ModalSheet visible={peopleSheetOpen} onClose={() => setPeopleSheetOpen(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <View>
              <Text style={styles.sheetEyebrow}>{t('trip.travelersEyebrow')}</Text>
              <Text style={styles.sheetTitle}>{t('trip.everyoneOnAdventure')}</Text>
            </View>
            <TouchableOpacity style={styles.sheetCloseButton} activeOpacity={0.88} onPress={() => setPeopleSheetOpen(false)}>
              <Ionicons name="close" size={20} color="#161821" />
            </TouchableOpacity>
          </View>

          <ScrollView
            ref={peopleSheetScrollRef}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[styles.sheetContent, { paddingBottom: Math.max(insets.bottom, 18) + 12 }]}
            {...peopleSheetScrollViewProps}>
                <View style={styles.peopleSection}>
                  <Text style={styles.peopleSectionTitle}>{t('trip.travelersSectionTitle')}</Text>
                  {members.map((member) => (
                    <Pressable
                      key={member.id}
                      style={({ pressed }: { pressed: boolean }) => [styles.personRow, pressed ? { opacity: 0.7 } : null]}
                      onPress={() => {
                        setPeopleSheetOpen(false);
                        setTimeout(() => setProfileCardUserId(member.id), 280);
                      }}>
                      <TouchableOpacity
                        style={styles.personAvatar}
                        activeOpacity={0.7}
                        onPress={() => {
                          setPeopleSheetOpen(false);
                          setTimeout(() => setProfileCardUserId(member.id), 280);
                        }}>
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
                      </TouchableOpacity>
                      <View style={styles.personCopy}>
                        <Text style={styles.personName}>{member.name}</Text>
                        <Text style={styles.personMeta}>{member.isOwner ? t('common.owner') : t('common.member')}</Text>
                      </View>
                      {member.id !== user?.id ? (
                        <TouchableOpacity
                          style={styles.personMenuButton}
                          activeOpacity={0.6}
                          hitSlop={8}
                          onPress={() => {
                            setPeopleSheetOpen(false);
                            setTimeout(() => setProfileCardUserId(member.id), 280);
                          }}>
                          <Ionicons name="ellipsis-vertical" size={18} color="#8e95a2" />
                        </TouchableOpacity>
                      ) : null}
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
                          <Text style={styles.personName}>{t('trip.inviteTraveler')}</Text>
                          <Text style={styles.personMeta}>{t('trip.inviteTravelerHint')}</Text>
                        </View>
                        <Ionicons name={inviteComposerOpen ? 'chevron-up' : 'chevron-forward'} size={18} color="#8e95a2" />
                      </TouchableOpacity>

                      {inviteComposerOpen ? (
                        <View style={styles.inviteInlineComposer}>
                          <View style={styles.inviteComposer}>
                            {/* flex: 1 here (not just on inviteInput) is the
                                fix — without it this wrapper sizes to its
                                content instead of filling the row, so the
                                TextInput's own flex:1 had nothing to flex
                                into: typing a longer email grew the input
                                unbounded and pushed the Invite button off
                                the right edge of the screen. */}
                            <Animated.View style={[{ opacity: inviteEmailOpacityRef, flex: 1 }]}>
                              <TextInput
                                ref={inviteEmailRef}
                                value={inviteEmail}
                                onChangeText={setInviteEmail}
                                onFocus={() => {
                                  Animated.timing(inviteEmailOpacityRef, {
                                    toValue: 1,
                                    duration: 300,
                                    useNativeDriver: false,
                                  }).start();
                                  onFocusPeopleSheetField(inviteEmailRef)();
                                }}
                                onBlur={() => {
                                  Animated.timing(inviteEmailOpacityRef, {
                                    toValue: 0.5,
                                    duration: 300,
                                    useNativeDriver: false,
                                  }).start();
                                }}
                                placeholder={t('trip.invites.placeholder')}
                                placeholderTextColor="#afb5bf"
                                keyboardType="email-address"
                                autoCapitalize="none"
                                autoCorrect={false}
                                style={styles.inviteInput}
                                returnKeyType="done"
                                onSubmitEditing={() => Keyboard.dismiss()}
                              />
                            </Animated.View>
                            <TouchableOpacity
                              activeOpacity={0.9}
                              style={[styles.inviteAddButton, { backgroundColor: COLORS.primary }, inviteSubmitting ? styles.inviteAddButtonDisabled : null]}
                              disabled={inviteSubmitting}
                              onPress={() => void handleAddInvite()}>
                              {inviteSubmitting ? (
                                <ActivityIndicator size="small" color="#fff" />
                              ) : (
                                <Text style={styles.inviteAddButtonText}>{t('common.invite')}</Text>
                              )}
                            </TouchableOpacity>
                          </View>

                          <View style={styles.inviteActions}>
                            <TouchableOpacity activeOpacity={0.9} style={styles.secondaryInviteButton} onPress={() => void handleCopyInviteCode()}>
                              <Ionicons name="copy-outline" size={16} color={COLORS.primary} />
                              <Text style={[styles.secondaryInviteButtonText, { color: COLORS.primary }]}>{t('trip.copyCode')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity activeOpacity={0.9} style={styles.secondaryInviteButton} onPress={() => void handleShareInvite()}>
                              <Ionicons name="share-social-outline" size={16} color={COLORS.primary} />
                              <Text style={[styles.secondaryInviteButtonText, { color: COLORS.primary }]}>{t('common.share')}</Text>
                            </TouchableOpacity>
                          </View>

                          <View style={styles.inviteHintRow}>
                            <Text style={styles.inviteHintLabel}>{t('trip.invite_code_section')}</Text>
                            <Text style={[styles.inviteHintCode, { color: COLORS.primary }]}>{trip?.inviteCode ?? '------'}</Text>
                          </View>

                          {inviteMessage ? <Text style={styles.inviteMessage}>{inviteMessage}</Text> : null}
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                </View>

                <View style={styles.peopleSection}>
                  <Text style={styles.peopleSectionTitle}>{t('trip.pendingInvites')}</Text>
                  {invites.length > 0 ? (
                    invites.map((invite) => (
                      <View key={invite.id} style={styles.personRow}>
                        <View style={[styles.personAvatar, styles.pendingAvatar]}>
                          <Ionicons name="mail-outline" size={16} color="#7a8290" />
                        </View>
                        <View style={styles.personCopy}>
                          <Text style={styles.personName}>{invite.email}</Text>
                          <Text style={styles.personMeta}>{t('trip.waitingForResponse')}</Text>
                        </View>
                        {canManageTrip ? (
                          <TouchableOpacity
                            activeOpacity={0.7}
                            hitSlop={10}
                            disabled={inviteDeletingId === invite.id}
                            onPress={() => handleDeleteInvite(invite)}>
                            {inviteDeletingId === invite.id ? (
                              <ActivityIndicator size="small" color="#8e95a2" />
                            ) : (
                              <Ionicons name="close-circle-outline" size={20} color="#8e95a2" />
                            )}
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    ))
                  ) : (
                    <Text style={styles.peopleEmpty}>{t('trip.no_invites')}</Text>
                  )}
                </View>
              </ScrollView>
          </KeyboardAvoidingView>
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
                  <Text style={styles.chatPanelEyebrow}>{t('trip.groupChatEyebrow')}</Text>
                  <Text style={styles.chatPanelTitle}>{trip?.title ?? t('trip.adventureChatFallback')}</Text>
                </View>
                <TouchableOpacity style={styles.chatPanelClose} activeOpacity={0.88} onPress={closeChat}>
                  <Ionicons name="close" size={20} color="#161821" />
                </TouchableOpacity>
              </View>

              {chatPresence.length > 0 ? (
                <View style={styles.chatPresenceRow}>
                  {chatPresence.slice(0, 6).map((u) => (
                    <Avatar
                      key={u.userId}
                      uri={u.avatarUrl}
                      name={u.userName}
                      size={30}
                      style={styles.chatPresenceBubble}
                      fallbackBackgroundColor="#e8f4f7"
                      fallbackTextColor={COLORS.secondary}
                    />
                  ))}
                  {chatPresence.length > 6 ? (
                    <View style={styles.chatPresenceBubble}>
                      <Text style={styles.chatPresenceBubbleText}>+{chatPresence.length - 6}</Text>
                    </View>
                  ) : null}
                  <Text style={styles.chatPresenceLabel}>
                    {t('trip.inChat', { count: chatPresence.length })}
                  </Text>
                </View>
              ) : null}

              {chatError ? (
                <View style={styles.chatErrorBanner}>
                  <Ionicons name="alert-circle" size={14} color={COLORS.error} />
                  <Text style={styles.chatErrorBannerText} numberOfLines={2}>{chatError}</Text>
                </View>
              ) : null}

              {chatLoading && chatMessages.length === 0 ? (
                <View style={styles.chatListScroll}>
                  <ChatLoadingSkeleton />
                </View>
              ) : chatLoadError && chatMessages.length === 0 ? (
                <View style={styles.chatListScroll}>
                  <EmptyState
                    icon="cloud-offline-outline"
                    title={t('trip.chat.loadFailedTitle')}
                    description={chatLoadError}
                    action={{
                      label: t('common.retry'),
                      onPress: () => {
                        setChatLoading(true);
                        void loadChatMessages(true);
                      },
                    }}
                  />
                </View>
              ) : (
                <FlatList
                  ref={chatScrollRef}
                  data={chatMessages}
                  keyExtractor={(message) => message.id}
                  style={styles.chatListScroll}
                  contentContainerStyle={styles.chatList}
                  showsVerticalScrollIndicator={false}
                  onScroll={handleChatScroll}
                  scrollEventThrottle={100}
                  // The length-change effect below fires a scrollToEnd on a
                  // fixed timer, which can land short if images/layout are
                  // still settling. onContentSizeChange fires on every actual
                  // layout commit, so it's what makes "open already at the
                  // bottom" reliable instead of occasionally one message shy.
                  onContentSizeChange={() => {
                    if (chatNearBottomRef.current) chatScrollRef.current?.scrollToEnd({ animated: false });
                  }}
                  renderItem={({ item, index }) => renderChatMessageItem(item, index)}
                  ListHeaderComponent={
                    hasHiddenMessages ? (
                      <View style={styles.chatBlockedBanner}>
                        <Ionicons name="ban-outline" size={13} color="#b45309" />
                        <Text style={styles.chatBlockedBannerText}>{t('trip.chat.blockedUsersBanner')}</Text>
                      </View>
                    ) : null
                  }
                  ListEmptyComponent={
                    <EmptyState
                      icon="chatbubbles-outline"
                      title={t('trip.chat.emptyTitle')}
                      description={t('trip.chat.emptyDescription')}
                    />
                  }
                />
              )}

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
                      <Text style={styles.chatPendingImageUploadingText}>{t('trip.uploadingImage')}</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
              {blockChatNotice ? (
                <View style={styles.chatBlockNotice}>
                  <Ionicons name="ban-outline" size={14} color="#5c6370" />
                  <Text style={styles.chatBlockNoticeText}>
                    {t('trip.chat.blockedNotice', { name: blockChatNotice })}
                  </Text>
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
                    ref={chatInputRef}
                    value={chatDraft}
                    onChangeText={setChatDraft}
                    onFocus={() => {
                      Animated.timing(chatInputOpacityRef, {
                        toValue: 1,
                        duration: 300,
                        useNativeDriver: false,
                      }).start();
                    }}
                    onBlur={() => {
                      Animated.timing(chatInputOpacityRef, {
                        toValue: 0.5,
                        duration: 300,
                        useNativeDriver: false,
                      }).start();
                    }}
                    placeholder={t('trip.chatPlaceholder')}
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

            {/* Nested inside the chat Modal (not a sibling) — iOS can
                silently fail to present a second top-level <Modal> while
                one is already visible, which made tapping a chat image to
                enlarge it do nothing. Only relevant while chat is open
                anyway, so nesting it here costs nothing. */}
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

            {/* Reaction picker — nested for the same iOS reason as the
                image viewer above. Reporting lives here now too, since the
                bubble long-press that used to open the report menu opens
                this picker instead. */}
            <Modal
              visible={reactionPickerMsg !== null}
              transparent
              animationType="fade"
              onRequestClose={closeReactionPicker}>
              <Pressable style={styles.reactionBackdrop} onPress={closeReactionPicker}>
                <Pressable style={styles.reactionPickerCard} onPress={() => {}}>
                  <View style={styles.reactionEmojiRow}>
                    {REACTION_EMOJIS.map((emoji) => {
                      const mine = reactionPickerMsg?.reactions?.some(
                        (r) => r.emoji === emoji && r.reactedByMe,
                      );
                      return (
                        <TouchableOpacity
                          key={emoji}
                          activeOpacity={0.7}
                          style={[styles.reactionEmojiButton, mine && styles.reactionEmojiButtonMine]}
                          onPress={() =>
                            reactionPickerMsg && void handleToggleReaction(reactionPickerMsg.id, emoji)
                          }>
                          <Text style={styles.reactionEmojiText}>{emoji}</Text>
                        </TouchableOpacity>
                      );
                    })}
                    {/* "+" opens the OS keyboard to react with any emoji. */}
                    <TouchableOpacity
                      activeOpacity={0.7}
                      style={styles.reactionAddButton}
                      accessibilityLabel={t('trip.chat.reactionPickMore')}
                      onPress={() => emojiInputRef.current?.focus()}>
                      <Ionicons name="add" size={22} color="#5c6370" />
                    </TouchableOpacity>
                  </View>
                </Pressable>
              </Pressable>
              {/* Off-screen host for the emoji keyboard — focusing it opens
                  the keyboard; the first emoji typed becomes the reaction. */}
              <TextInput
                ref={emojiInputRef}
                value={emojiInputValue}
                onChangeText={handleEmojiInputChange}
                style={styles.emojiHiddenInput}
                autoCorrect={false}
                caretHidden
              />
            </Modal>

            {/* Same iOS nested-Modal workaround as the image viewer above:
                the top-level UserProfileCard instance can't present while
                the chat Modal is open, which made tapping a chat avatar do
                nothing. This nested instance owns the card while chat is
                open; the outer one is gated to !chatOpen. */}
            <UserProfileCard
              userId={chatOpen ? profileCardUserId : null}
              onClose={() => setProfileCardUserId(null)}
              onReport={profileCardUserId && profileCardUserId !== user?.id
                ? (name) => {
                    setProfileCardUserId(null);
                    setTimeout(() => showReportMenu('user', profileCardUserId, profileCardUserId, name), 320);
                  }
                : undefined}
            />
          </View>
        </Modal>

        <ModalSheet visible={spotifyModalOpen} onClose={() => setSpotifyModalOpen(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <View style={[styles.sheetContent, { paddingBottom: Math.max(insets.bottom, 18) + 12 }]}>
              <View style={styles.sheetHandle} />
              <View style={styles.sheetHeader}>
                <View>
                  <Text style={styles.sheetEyebrow}>{t('trip.sharedSpotifyEyebrow')}</Text>
                  <Text style={styles.sheetTitle}>{t('trip.spotifyForEvent')}</Text>
                </View>
                <TouchableOpacity style={styles.sheetCloseButton} activeOpacity={0.88} onPress={() => setSpotifyModalOpen(false)}>
                  <Ionicons name="close" size={20} color="#161821" />
                </TouchableOpacity>
              </View>

              <View style={styles.spotifySheetBody}>
                <Text style={styles.spotifySheetCopy}>{t('trip.spotifyPasteHint')}</Text>
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
                    returnKeyType="done"
                    onSubmitEditing={() => Keyboard.dismiss()}
                  />
                </Animated.View>
                <View style={styles.spotifySheetButtons}>
                  <TouchableOpacity activeOpacity={0.88} style={styles.spotifySheetSecondaryButton} onPress={() => void handleSaveTripSpotify(null)}>
                    <Text style={styles.spotifySheetSecondaryButtonText}>{t('common.remove')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={0.9}
                    style={[styles.spotifySheetPrimaryButton, spotifySaving ? styles.spotifySheetPrimaryButtonDisabled : null]}
                    disabled={spotifySaving}
                    onPress={() => void handleSaveTripSpotify(spotifyUrlDraft)}>
                    <Text style={styles.spotifySheetPrimaryButtonText}>{spotifySaving ? t('trip.saving') : t('trip.saveLink')}</Text>
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
                          <Text style={styles.categoryModalCount}>{t('trip.activitiesCount', { count: selected.items.length })}</Text>
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
                                      {formatActivityDate(activity.date, locale)}
                                    </Text>
                                  </View>
                                  <Ionicons name="chevron-forward" size={18} color="#c5cad2" />
                                </>
                              ) : (
                                <>
                                  <View>
                                    <Text style={styles.categoryModalActivityTitle}>{t('trip.oneHiddenSidequest')}</Text>
                                    <Text style={styles.categoryModalActivityDate} numberOfLines={1}>
                                      {formatTimeUntilReveal(activity.revealAt, t)}
                                    </Text>
                                  </View>
                                  <View style={styles.lockedBadge}>
                                    <Text style={styles.lockedBadgeText}>{t('trip.locked')}</Text>
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

        {/* Gated to !chatOpen — while chat is open the nested instance
            inside the chat Modal presents instead (iOS can't stack a
            second top-level Modal over an open one). */}
        <UserProfileCard
          userId={chatOpen ? null : profileCardUserId}
          onClose={() => setProfileCardUserId(null)}
          onReport={profileCardUserId && profileCardUserId !== user?.id
            ? (name) => {
                setProfileCardUserId(null);
                setTimeout(() => showReportMenu('user', profileCardUserId, profileCardUserId, name), 320);
              }
            : undefined}
        />
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

// Plain (non-animated, by design — keeps this dependency-free and cheap)
// placeholder rows shown only on a true cold-start chat load, alternating
// sides so it reads as "messages are coming" rather than a generic spinner.
function ChatLoadingSkeleton() {
  const widths = [0.55, 0.4, 0.62];
  return (
    <View style={styles.chatSkeletonWrap}>
      {widths.map((width, i) => (
        <View
          key={i}
          style={[
            styles.chatSkeletonBubble,
            { width: `${width * 100}%`, alignSelf: i % 2 === 0 ? 'flex-start' : 'flex-end' },
          ]}
        />
      ))}
    </View>
  );
}

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

function formatTripDateRange(startDate: string | undefined, endDate: string | undefined, locale: string, t: (key: string, vars?: Record<string, string | number>) => string) {
  if (!startDate || !endDate) return t('trip.datesComingSoon');
  const formatter = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' });
  return `${formatter.format(new Date(`${startDate}T12:00:00`))} - ${formatter.format(new Date(`${endDate}T12:00:00`))}`;
}

function formatActivityDate(date: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(`${date}T12:00:00`));
}

function formatDayHeaderDate(dateIso: string, locale: string) {
  const d = new Date(`${dateIso.slice(0, 10)}T12:00:00`);
  if (isNaN(d.getTime())) return '';
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(d);
  const monthDay = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(d);
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

function formatTimeUntilReveal(revealAt: string | null | undefined, t: (key: string, vars?: Record<string, string | number>) => string) {
  if (!revealAt) return t('trip.revealsSoon');
  const now = Date.now();
  const reveal = new Date(revealAt).getTime();
  const diffMs = reveal - now;

  if (diffMs <= 0) return t('trip.revealed');

  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) {
    return t('trip.revealsInDHM', { days, hours, minutes });
  }
  if (hours > 0) {
    return t('trip.revealsInHM', { hours, minutes });
  }
  return t('trip.revealsInM', { minutes });
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

function formatChatTimestamp(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(new Date(value));
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
    top: 64,
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
  // Top-left location pill — matches components/big-hero-card.tsx's
  // bigHeroTopRow/bigHeroLocPill/bigHeroLocText exactly, so the preview
  // card looks the same here as it does on Home.
  heroTopRow: {
    position: 'absolute',
    top: 18,
    left: 18,
    right: 18,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  heroLocPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 100,
    backgroundColor: 'rgba(0,0,0,0.42)',
    maxWidth: '70%',
  },
  heroLocText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  heroBody: {
    padding: 22,
  },
  heroTitle: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.6,
    lineHeight: 32,
    marginBottom: 6,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  heroDate: {
    color: 'rgba(255,255,255,0.92)',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
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
  functionsCard: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 14,
    paddingVertical: 16,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#eceef2',
    backgroundColor: '#fff',
  },
  functionsCardIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff0f4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  functionsCardBody: {
    flex: 1,
  },
  functionsCardTitle: {
    color: '#161821',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  functionsCardSubtitle: {
    marginTop: 2,
    color: '#8a909d',
    fontSize: 12.5,
    fontWeight: '600',
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
    // Fixed so swapping the label for a spinner (or "Invite" -> "Adding...")
    // never resizes the button — it used to visibly shift/resize every time
    // inviteSubmitting flipped, since width was purely text-driven.
    minWidth: 92,
    // Never shrink — the email input next to it (flex: 1) is what gives up
    // width if the row is ever tight, not this button.
    flexShrink: 0,
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
  personMenuButton: {
    padding: 6,
    marginLeft: 4,
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
  /* Chat reactions */
  reactionChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 4,
  },
  reactionChipsRowOwn: {
    justifyContent: 'flex-end',
  },
  reactionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: '#f1f3f7',
    borderWidth: 1,
    borderColor: '#e4e7ee',
  },
  reactionChipMine: {
    backgroundColor: '#ffe9ef',
    borderColor: '#ff4f74',
  },
  reactionChipText: {
    fontSize: 12,
    color: '#3c4250',
    fontWeight: '600',
  },
  reactionBackdrop: {
    flex: 1,
    // Light dim so the lifted (scaled-up) message stays visible behind the
    // picker — the iMessage-style "message gets a bit bigger" effect.
    backgroundColor: 'rgba(10,12,18,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  reactionPickerCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.18,
    shadowRadius: 32,
    elevation: 10,
  },
  reactionEmojiRow: {
    flexDirection: 'row',
    gap: 6,
  },
  reactionEmojiButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionEmojiButtonMine: {
    backgroundColor: '#ffe9ef',
  },
  reactionEmojiText: {
    fontSize: 24,
  },
  reactionAddButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f3f7',
  },
  emojiHiddenInput: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
    top: -100,
  },

  chatBubbleWrap: {
    position: 'absolute',
    left: 22,
  },
  // Sits right of the chat bubble (22 + 58 + 12).
  toolsBubbleWrap: {
    position: 'absolute',
    left: 92,
  },
  toolsBubble: {
    width: 58,
    height: 58,
    borderRadius: RADIUS.circle,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#eceef2',
    shadowColor: '#11131a',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
  toolsList: { gap: 8, paddingBottom: 8 },
  toolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#eceef2',
    backgroundColor: '#fff',
  },
  toolRowIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolRowLabel: {
    flex: 1,
    color: '#161821',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.3,
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
    gap: 2,
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
    marginVertical: 1,
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
    marginVertical: 1,
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
  chatMessagePending: {
    opacity: 0.55,
  },
  chatBubbleCardFailed: {
    borderWidth: 1.5,
    borderColor: COLORS.error,
  },
  chatStatusPending: {
    alignSelf: 'flex-end',
    marginTop: 3,
    fontSize: 11,
    fontWeight: '600',
    color: '#a4aab4',
  },
  chatStatusFailed: {
    alignSelf: 'flex-end',
    marginTop: 3,
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.error,
  },
  chatErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: COLORS.errorLight,
    borderWidth: 1,
    borderColor: COLORS.errorBorder,
  },
  chatErrorBannerText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.error,
  },
  chatSkeletonWrap: {
    flex: 1,
    paddingTop: 18,
    gap: 10,
  },
  chatSkeletonBubble: {
    height: 38,
    borderRadius: 18,
    backgroundColor: '#f0f1f4',
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
  chatBlockNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: '#f0f2f5',
    borderRadius: 10,
    marginBottom: 6,
  },
  chatBlockNoticeText: {
    flex: 1,
    fontSize: 12,
    color: '#5c6370',
    fontWeight: '500',
  },
  chatHiddenNotice: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    alignItems: 'center',
  },
  chatHiddenNoticeText: {
    fontSize: 11,
    color: '#a3a9b4',
    fontWeight: '500',
  },
  chatBlockedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fef3c7',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#fcd34d',
  },
  chatBlockedBannerText: {
    flex: 1,
    fontSize: 12,
    color: '#92400e',
    fontWeight: '600',
  },
  chatAuthorBlocked: {
    fontSize: 12,
    fontWeight: '600',
    color: '#b0b6c1',
    marginBottom: 3,
  },
  chatBubbleBlocked: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: '#f0f2f5',
    borderRadius: 14,
    borderTopLeftRadius: 4,
    alignSelf: 'flex-start',
  },
  chatBubbleBlockedText: {
    fontSize: 13,
    color: '#a3a9b4',
    fontStyle: 'italic',
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
    // Multiline TextInput defaults to top-aligned text on both platforms —
    // without this the placeholder/draft sits at the top of the 54px box
    // instead of centered. textAlignVertical only affects Android; the
    // paddingVertical keeps a single line of text centered on iOS too.
    paddingVertical: 15,
    textAlignVertical: 'center',
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
