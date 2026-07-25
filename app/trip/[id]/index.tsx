import AsyncStorage from '@react-native-async-storage/async-storage';
import { FontAwesome, Ionicons } from '@expo/vector-icons';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as Linking from 'expo-linking';
import { BlurView } from 'expo-blur';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
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
  type StyleProp,
  StyleSheet,
  Text,
  TextInput,
  type TextStyle,
  TouchableOpacity,
  View,
  type ViewStyle,
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
import {
  buildSlideshowItems,
  pickStaticLocationLabel,
  useActiveSlideLabel,
  useActiveSlideLabelValue,
  type ActiveSlideLabelChannel,
} from '@/components/slideshow-cover';
import ModalSheet from '@/components/modal-sheet';
import DayLocationEditor from '@/components/day-location-editor';
import { EmptyState } from '@/components/ui/empty-state';
import { useKeyboardFocusScroll } from '@/hooks/useKeyboardFocusScroll';
import { PRESENCE_POLL_FAST_MS, useMembersPresencePoll } from '@/hooks/use-presence-poll';
import { apiFetch, apiJson } from '@/lib/api';
import { getCurrentPermissionStatus, maybeRequestPushPermission } from '@/lib/push-notifications';
import WeatherIcon from '@/components/weather-icon';
import { conditionLabelKey, currentRelevantDay, fetchTripWeather, getCachedTripWeather, type TripWeather } from '@/lib/weather-api';
import { fetchTripDayLocations, getCachedTripDayLocations } from '@/lib/day-location-api';
import { extractStoredMapPlace, type StoredMapPlace } from '@/lib/sidequest-location';
import { loadNotificationPreferences, saveNotificationPreferences } from '@/lib/social';
import { addDaysIso, formatNights, isStay, stayNightDates, stayNights } from '@/lib/stay';
import { getCached, setCached, invalidateCache, invalidateTripCache } from '@/lib/cache';
import { uploadImageIfNeeded } from '@/lib/uploads';
import { isSealedInLists } from '@/lib/activity-blur';
import type { Quest, SideQuestActivity, TripInvite, LinkPreview, TripDayLocation } from '@/lib/types';
import { SPACING, RADIUS, TYPOGRAPHY } from '@/constants/design-tokens';
import { useTheme } from '@/components/theme-provider';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { AppTheme } from '@/constants/themes';

type ChatReaction = {
  emoji: string;
  count: number;
  reactedByMe: boolean;
};

// Per-trip "last read chat" marker. Persisted so the unread dot survives
// app restarts — the old in-memory-only ref reset to "24h ago" on every
// mount and re-lit the dot for messages the user had already read.
const chatLastReadKey = (tripId: string) => `chat_last_read_${tripId}`;

// One row in the trip feed's flat drag list: day headers act as the drop
// context that decides an activity's date; activities are the draggables.
// Hotel stays additionally project quiet, non-draggable rows onto the days
// they cover: a "night X of Y" row per intermediate night and a check-out
// row on the check-out day (Concept B).
type FeedRow =
  | { kind: 'day'; date: string }
  | { kind: 'activity'; activity: SideQuestActivity }
  | { kind: 'stayNight'; activity: SideQuestActivity; night: number; totalNights: number }
  | { kind: 'stayCheckout'; activity: SideQuestActivity };

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

// The six quick reactions shown in the picker row.
const REACTION_EMOJIS = ['❤️', '😂', '😮', '😢', '👍', '👎'];

// In-app emoji grid shown when "+" is tapped. iOS can't force the OS emoji
// keyboard, so we present a curated in-app picker instead — landing the user
// straight in emoji selection. The backend accepts any emoji.
const EMOJI_GRID = [
  '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍',
  '😂', '🤣', '😅', '😊', '😍', '😘', '😎', '🤩',
  '😮', '😯', '😲', '🥳', '🤯', '😱', '😢', '😭',
  '😡', '👍', '👎', '👏', '🙌', '🙏', '💪', '🔥',
  '🎉', '✨', '⭐', '💯', '✅', '❌', '❓', '❗',
  '🍺', '🍷', '🍕', '☀️', '🌊', '✈️', '🚗', '⛵',
];

// Maps a known SystemEventType to its translated rendering. Falls back to
// the message's own (English, backend-authored) text for unknown/missing
// event types — covers chat history from before this field existed.
function renderSystemMessage(message: ChatMsg, t: (key: string, vars?: Record<string, string | number>) => string): string {
  if (message.systemEventType === 'member_joined') {
    // Accounts created before the signup name requirement can have an empty
    // name — " har gått med." reads broken, so fall back to a generic word.
    const name = message.userName?.trim() ? message.userName : t('trip.chat.someoneFallback');
    return t('trip.chat.systemMemberJoined', { name });
  }
  return message.text;
}

// Below this distance (px) from the bottom of the chat list, an incoming
// message is still allowed to auto-scroll the view — beyond it, the user is
// treated as "reading history" and left alone.
const CHAT_NEAR_BOTTOM_THRESHOLD = 80;

// Typing indicator cadence: the first keystroke marks typing immediately,
// continued typing refreshes the server stamp at most every 1.2 s (well
// inside the server's typing expiry) and 1.8 s without a keystroke sends
// an explicit stop — so it's never one request per keystroke, but stale
// "is typing" never outlives real typing by more than ~2 s either.
const TYPING_REFRESH_MS = 1200;
const TYPING_IDLE_STOP_MS = 1800;

// How often the open chat re-fetches the presence/typing list. This poll is
// the receiver's typing latency floor, so it runs sub-second — but ONLY
// while the chat modal is open AND the app is active (the chat lifecycle
// effect owns the single timer and tears it down on close/background).
const CHAT_PRESENCE_POLL_MS = 800;

// Chat composer input: compact single line at rest, grows with the text up
// to ~5 lines, then scrolls internally instead of growing further.
const CHAT_INPUT_MIN_HEIGHT = 38;
const CHAT_INPUT_MAX_HEIGHT = 118;
// The input's paddingVertical (9 + 9). iOS reports contentSize WITHOUT the
// padding while Android includes it — the growth math compensates on iOS.
const CHAT_INPUT_VERTICAL_PADDING = 18;

type ChatPresenceUser = {
  userId: string;
  userName: string;
  avatarUrl?: string | null;
  isTyping?: boolean;
};

type TripMember = {
  id: string;
  name: string;
  avatarUrl?: string | null;
  isOwner: boolean;
  isOnline?: boolean;
};

export default function TripDetailsScreen() {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView | null>(null);
  // Live scroll metrics for the drag-to-reorder auto-scroll (see
  // DraggableDayList's autoScroll prop) — refs, not state, since they update
  // on every scroll frame.
  const scrollYRef = useRef(0);
  const scrollContentHeightRef = useRef(0);
  const scrollViewportHeightRef = useRef(0);
  // Which trip the focus effect last loaded — scroll to top only when the
  // screen shows a NEW trip, never when returning from a detail screen
  // (going back must land where the user left off).
  const lastFocusedTripIdRef = useRef<string | null>(null);
  const { id, openChat: openChatParam } = useLocalSearchParams<{ id: string; openChat?: string }>();
  const { user } = useAuth();
  const { t, language } = useI18n();
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const locale = language === 'sv' ? 'sv-SE' : 'en-US';
  const [trip, setTrip] = useState<Quest | null>(null);
  const [tripWeather, setTripWeather] = useState<TripWeather | null>(() => (id ? getCachedTripWeather(id) : null));
  // Resolved per-day location timeline — the backend's TripDayLocationService
  // already carried anchors forward and applied the destination fallback, so
  // this is just rendered as-is, never recomputed on the client.
  const [dayLocations, setDayLocations] = useState<TripDayLocation[]>(() => (id ? getCachedTripDayLocations(id) ?? [] : []));
  const [dayLocationEditorDate, setDayLocationEditorDate] = useState<string | null>(null);
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
  // Whether the in-app emoji grid (opened via "+") is showing.
  const [emojiGridOpen, setEmojiGridOpen] = useState(false);
  // Measured on-screen rect of the long-pressed bubble, so the reaction
  // overlay can keep the message in its EXACT position (lifted forward +
  // enlarged) with the reaction bar anchored just above it.
  const bubbleRefs = useRef<Map<string, View>>(new Map());
  const [reactionRect, setReactionRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [inviteComposerOpen, setInviteComposerOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  // Android only: while the keyboard is up, the chat panel's decorative
  // margins (insets + 12) turn into dead gaps and Android keyboards are tall
  // to begin with — the user saw a squeezed sliver of chat. Instead of
  // trusting KeyboardAvoidingView (whose behavior depends on whether the
  // modal window resizes, which varies by OS/edge-to-edge), measure where
  // the keyboard top actually lands relative to the modal window and set the
  // exact bottom margin needed: keyboard overlap + 6. If the window already
  // resized, overlap measures ~0 and the panel just keeps a slim 6dp margin.
  // null = keyboard closed → the normal decorative margins apply. iOS (which
  // was fine) never attaches these listeners.
  const chatBackdropRef = useRef<View>(null);
  const [chatKbOverlap, setChatKbOverlap] = useState<number | null>(null);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      const keyboardTop = e.endCoordinates.screenY;
      // Give a possible window resize a beat to settle before measuring
      // (same delay useKeyboardFocusScroll needs on Android).
      setTimeout(() => {
        const node = chatBackdropRef.current;
        if (!node) return;
        node.measureInWindow((_x, y, _width, height) => {
          setChatKbOverlap(Math.max(0, y + height - keyboardTop));
        });
      }, 80);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => setChatKbOverlap(null));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatDraft, setChatDraft] = useState('');
  const [chatInputHeight, setChatInputHeight] = useState(CHAT_INPUT_MIN_HEIGHT);
  const [chatSending, setChatSending] = useState(false);
  const [chatPendingImage, setChatPendingImage] = useState<string | null>(null);
  // One picker/camera flow at a time — double-taps and gallery+camera races
  // are ignored while a native picker is already up.
  const chatPickerBusyRef = useRef(false);
  const chatPresenceInFlightRef = useRef(false);
  const chatPresencePendingRef = useRef(false);
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
  // Typing indicator (see TYPING_* constants): last state sent to the
  // server, when `true` was last sent, and the inactivity-stop timer.
  const typingSentRef = useRef(false);
  const typingLastSentAtRef = useRef(0);
  const typingIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
      if (lastFocusedTripIdRef.current !== id) {
        lastFocusedTripIdRef.current = id;
        scrollRef.current?.scrollTo({ x: 0, y: 0, animated: false });
      }
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
            // Persisted last-read wins over the in-memory 24h fallback —
            // otherwise every remount re-flagged already-read messages.
            const storedLastRead = await AsyncStorage.getItem(chatLastReadKey(id));
            if (storedLastRead && storedLastRead > lastReadAtRef.current) {
              lastReadAtRef.current = storedLastRead;
            }
            const latestMsgs = await apiJson<ChatMsg[]>(`/api/trips/${id}/chat?since=${encodeURIComponent(lastReadAtRef.current)}`);
            if (!active) return;
            // Only real messages from OTHERS count as unread: your own sends,
            // system rows ("X har gått med") and deletion tombstones (which
            // deliberately ride the since-cursor with a bumped timestamp)
            // must never light the dot.
            const hasUnread = latestMsgs.some((m) => !m.isSystem && m.userId !== user?.id);
            setChatUnread(hasUnread);
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

  // Weather summary — fully independent of the trip load: fires after the
  // screen is focused, renders from cache instantly, fails silently. A
  // weather problem can never delay or break the trip itself.
  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      let active = true;
      const cached = getCachedTripWeather(id);
      if (cached) setTripWeather(cached);
      fetchTripWeather(id)
        .then((data) => {
          if (active) setTripWeather(data);
        })
        .catch(() => {
          // Keep whatever we had — the strip simply doesn't update.
        });
      return () => {
        active = false;
      };
    }, [id]),
  );

  // Same cached-then-refresh pattern for the day-location timeline that
  // feeds the itinerary's day-header pins.
  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      let active = true;
      const cached = getCachedTripDayLocations(id);
      if (cached) setDayLocations(cached);
      fetchTripDayLocations(id)
        .then((data) => {
          if (active) setDayLocations(data);
        })
        .catch(() => {});
      return () => {
        active = false;
      };
    }, [id]),
  );

  // Live presence: the focus load above fetches members once, but the online
  // dots (members sheet + chat avatars) would then freeze until the next
  // focus. Re-poll members while this screen stays open — fast only while a
  // view that actually shows the dots is open, ambient 30s otherwise.
  useMembersPresencePoll<TripMember>(
    id ? [id] : [],
    (_tripId, memberData) => {
      setMembers(memberData);
    },
    // The hero shows live online dots now — a single trip is cheap enough
    // to always poll at the fast cadence while this screen is focused.
    PRESENCE_POLL_FAST_MS,
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

  // The feed as ONE flat drag list: day-header rows interleaved with
  // activity rows, covering EVERY day of the trip (empty days included) so
  // an activity can be dragged onto any date — the day rows are the drop
  // context that decides the new date. Falls back to only dates that have
  // activities when the trip's range isn't loaded yet.
  const feedRows = useMemo<FeedRow[]>(() => {
    const dates = new Set<string>(activityDayGroups.map((g) => g.date));
    const start = trip?.startDate?.slice(0, 10);
    const end = trip?.endDate?.slice(0, 10);
    if (start && end && start <= end) {
      let cursor = new Date(`${start}T12:00:00`);
      const last = new Date(`${end}T12:00:00`);
      // Hard cap keeps a mis-dated trip (or year-long range) from exploding
      // the feed with hundreds of empty headers.
      for (let i = 0; cursor <= last && i < 62; i++) {
        dates.add(cursor.toISOString().slice(0, 10));
        cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
      }
    }

    // Hotel stays project ambient rows onto covered days. Sealed stays
    // project NOTHING — night rows and checkout would leak the reveal
    // (the server also withholds endDate from non-owners while sealed).
    const nightRowsByDate = new Map<string, Extract<FeedRow, { kind: 'stayNight' }>[]>();
    const checkoutRowsByDate = new Map<string, Extract<FeedRow, { kind: 'stayCheckout' }>[]>();
    for (const group of activityDayGroups) {
      for (const activity of group.items) {
        if (!isStay(activity) || isSealedInLists(activity)) continue;
        const totalNights = stayNights(activity);
        const nightDates = stayNightDates(activity);
        nightDates.forEach((nightDate, i) => {
          dates.add(nightDate);
          if (i === 0) return; // check-in day carries the anchor card itself
          if (!nightRowsByDate.has(nightDate)) nightRowsByDate.set(nightDate, []);
          nightRowsByDate.get(nightDate)!.push({ kind: 'stayNight', activity, night: i + 1, totalNights });
        });
        const checkoutDate = activity.endDate!.slice(0, 10);
        dates.add(checkoutDate);
        if (!checkoutRowsByDate.has(checkoutDate)) checkoutRowsByDate.set(checkoutDate, []);
        checkoutRowsByDate.get(checkoutDate)!.push({ kind: 'stayCheckout', activity });
      }
    }

    const byDate = new Map(activityDayGroups.map((g) => [g.date, g.items]));
    const rows: FeedRow[] = [];
    for (const date of [...dates].sort()) {
      rows.push({ kind: 'day', date });
      // Quiet stay context first ("night 2 of 3" / "check-out"), then the
      // day's own draggable activities.
      for (const nightRow of nightRowsByDate.get(date) ?? []) rows.push(nightRow);
      for (const checkoutRow of checkoutRowsByDate.get(date) ?? []) rows.push(checkoutRow);
      for (const activity of byDate.get(date) ?? []) rows.push({ kind: 'activity', activity });
    }
    return rows;
  }, [activityDayGroups, trip?.startDate, trip?.endDate]);

  const dayLocationByDate = useMemo(() => new Map(dayLocations.map((d) => [d.date, d])), [dayLocations]);

  // The hero pill's ONE location name. Current day = today clamped into the
  // trip's dates (before the trip → the first day's plan; after the trip →
  // no current day). The resolved day-location timeline wins, the typed
  // destination is the fallback, and empty/whitespace values hide the pill
  // entirely — never an empty pin, never "A · B" pairs.
  const heroLocationLabel = useMemo(
    () =>
      pickStaticLocationLabel(dayLocations, trip?.startDate, trip?.endDate, trip?.destination)
      ?? null,
    [dayLocations, trip?.startDate, trip?.endDate, trip?.destination],
  );

  // Structured slides: image + the source day's resolved feed location.
  // Rebuilt whenever activities OR day locations change (a feed edit
  // invalidates the trip cache → both refetch → labels follow along).
  const slideshowItems = useMemo(
    () =>
      trip
      && trip.slideshowEnabled !== false
      && !(trip.visibility === 'hidden' && !trip.isRevealed)
        ? buildSlideshowItems(trip.imageUrl, activities, dayLocations, {
            startDate: trip.startDate,
            endDate: trip.endDate,
            destination: trip.destination,
          })
        : undefined,
    [trip, activities, dayLocations],
  );
  // Channel carrying the slide currently ON SCREEN — flipped by the
  // slideshow itself at the exact moment a crossfade completes. Only the
  // tiny HeroSlideLocationPill subscribes: a slide flip must never
  // re-render this whole screen (that was a visible hitch on every
  // transition). Shared machinery with the Home card.
  const activeSlide = useActiveSlideLabel();
  const heroHasSlideshow = !!slideshowItems && slideshowItems.length > 0;

  // The hero weather chip and the compact strip both show the day that is
  // relevant RIGHT NOW (today → nearest upcoming → latest known), not
  // blindly days[0] (= the trip's first day, which is a past date once the
  // trip is running). Same tripWeather data as the full Weather page.
  const headerWeatherDay = currentRelevantDay(tripWeather);

  // Exactly one distinct activity location on a day → offer to reuse it in
  // the editor. Two or more → never guess, offer nothing.
  const suggestedPlaceByDate = useMemo(() => {
    const map = new Map<string, StoredMapPlace | null>();
    for (const group of activityDayGroups) {
      const places = new Map<string, StoredMapPlace>();
      for (const activity of group.items) {
        const place = extractStoredMapPlace(activity.description);
        if (place?.placeId) places.set(place.placeId, place);
      }
      map.set(group.date, places.size === 1 ? [...places.values()][0] : null);
    }
    return map;
  }, [activityDayGroups]);

  const memberAvatarMap = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const m of members) map.set(m.id, m.avatarUrl ?? null);
    return map;
  }, [members]);

  // Who to show as "typing" — never yourself, never blocked users. Name
  // fallback mirrors the rest of the chat UI.
  const typingLabel = useMemo(() => {
    const typers = chatPresence.filter(
      (u) => u.isTyping && u.userId !== user?.id && !blockedUserIds.has(u.userId),
    );
    if (typers.length === 0) return null;
    const nameOf = (typer: ChatPresenceUser) => typer.userName?.trim() || t('trip.chat.someoneFallback');
    if (typers.length === 1) return t('trip.chat.typingOne', { name: nameOf(typers[0]) });
    if (typers.length === 2) return t('trip.chat.typingTwo', { name1: nameOf(typers[0]), name2: nameOf(typers[1]) });
    return t('trip.chat.typingMany', {
      name1: nameOf(typers[0]),
      name2: nameOf(typers[1]),
      count: typers.length - 2,
    });
  }, [chatPresence, user?.id, blockedUserIds, t]);

  const memberOnlineMap = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const m of members) map.set(m.id, m.isOnline ?? false);
    return map;
  }, [members]);

  // A hidden SideQuest is pointless if you never learn it was revealed —
  // when this trip contains one sealed for the viewer and their
  // notifications are off (OS permission or the app toggle), nudge once per
  // trip to enable them. "Not now" is remembered; own secrets never nag
  // (isHiddenForViewer is false for the creator).
  const hiddenNotifPromptCheckedRef = useRef(false);
  useEffect(() => {
    if (hiddenNotifPromptCheckedRef.current) return;
    if (!activities.some((a) => a.isHiddenForViewer)) return;
    hiddenNotifPromptCheckedRef.current = true;
    void (async () => {
      try {
        const dismissKey = `sidequest.hiddenNotifPrompt.${id}`;
        if (await AsyncStorage.getItem(dismissKey)) return;
        const [status, prefs] = await Promise.all([getCurrentPermissionStatus(), loadNotificationPreferences()]);
        if (status === 'unsupported') return;
        if (status === 'granted' && prefs.pushEnabled) return;
        Alert.alert(t('trip.hiddenNotifPrompt.title'), t('trip.hiddenNotifPrompt.body'), [
          {
            text: t('trip.hiddenNotifPrompt.later'),
            style: 'cancel',
            onPress: () => void AsyncStorage.setItem(dismissKey, '1').catch(() => {}),
          },
          {
            text: t('trip.hiddenNotifPrompt.enable'),
            onPress: () => {
              void (async () => {
                await AsyncStorage.setItem(dismissKey, '1').catch(() => {});
                await saveNotificationPreferences({ ...prefs, pushEnabled: true });
                // Same flow as Profile's toggle: force re-shows the OS dialog
                // whenever the system still allows it; permanently blocked
                // can only be fixed in the system settings.
                const outcome = await maybeRequestPushPermission({ force: true });
                if (outcome === 'blocked') {
                  Alert.alert(t('profile.notifications.osBlockedTitle'), t('profile.notifications.osBlockedBody'), [
                    { text: t('common.cancel'), style: 'cancel' },
                    { text: t('profile.notifications.openSettings'), onPress: () => void Linking.openSettings() },
                  ]);
                }
              })();
            },
          },
        ]);
      } catch {
        // Best-effort nudge — must never break the trip screen.
      }
    })();
  }, [activities, id, t]);

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

  // Foreground gate for the chat lifecycle. When the app leaves `active`
  // (backgrounded, app switcher, locked screen, system dialog) the whole
  // effect below tears down: heartbeat + polls stop and the presence DELETE
  // tells the backend the chat is no longer on screen — so chat pushes are
  // allowed immediately instead of being suppressed by a stale heartbeat.
  // Returning to `active` re-runs the effect: instant heartbeat, fresh
  // message/presence load, intervals restarted (never doubled — the effect
  // is the only owner of these timers).
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      setAppActive(state === 'active');
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!chatOpen || !appActive) return;

    lastReadAtRef.current = new Date().toISOString();
    void AsyncStorage.setItem(chatLastReadKey(id), lastReadAtRef.current).catch(() => {});
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
    const presencePollId = setInterval(() => void loadChatPresence(), CHAT_PRESENCE_POLL_MS);

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
      // No explicit `false` needed — the DELETE below clears the typing
      // stamp server-side; just stop the timer and reset local refs.
      clearTypingIdleTimer();
      typingSentRef.current = false;
      typingLastSentAtRef.current = 0;
      void apiFetch(`/api/trips/${id}/chat/presence`, { method: 'DELETE' }).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatOpen, id, appActive]);

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
    // The link goes INSIDE the message: Android's share sheet ignores the
    // separate `url` field entirely, and passing the trip cover image as
    // `url` (like before) made recipients open a raw JPEG instead of the
    // invite page. The raw invite code stays out of the text — it lives in
    // the link.
    const inviteUrl = `https://sidequesttravel.app/invite/${trip.inviteCode}`;
    await Share.share({
      title: t('trip.share.title', { title: shareTitle }),
      message: t('trip.share.message', { title: shareTitle, url: inviteUrl }),
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
        // Deletions arrive as tombstones on the SAME id (systemEventType
        // "message_deleted", timestamp bumped so they ride the since-cursor):
        // drop that message locally and never render the tombstone itself.
        // This must happen before the dedupe below — the id is already in
        // existingIds, so the tombstone would otherwise be skipped silently.
        const deletedIds = new Set(
          msgs.filter((m) => m.systemEventType === 'message_deleted').map((m) => m.id),
        );
        const incomingMsgs = deletedIds.size > 0 ? msgs.filter((m) => !deletedIds.has(m.id)) : msgs;
        setChatMessages((prev) => {
          const base = deletedIds.size > 0 ? prev.filter((m) => !deletedIds.has(m.id)) : prev;
          const existingIds = new Set(base.map((m) => m.id));
          let next = base;
          const trulyNew: ChatMsg[] = [];

          for (const incoming of incomingMsgs) {
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

  // Best-effort — typing must never surface errors, and a lost `false` is
  // cleaned up by the server's typing expiry anyway.
  function sendTypingState(isTyping: boolean) {
    typingSentRef.current = isTyping;
    if (isTyping) typingLastSentAtRef.current = Date.now();
    void apiFetch(`/api/trips/${id}/chat/presence`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isTyping }),
    }).catch(() => {
      // A silently dropped `true` must not leave the flag set — the NEXT
      // keystroke should retry immediately instead of sitting out the
      // refresh throttle believing the server already knows.
      if (isTyping) typingSentRef.current = false;
    });
  }

  function clearTypingIdleTimer() {
    if (typingIdleTimerRef.current) {
      clearTimeout(typingIdleTimerRef.current);
      typingIdleTimerRef.current = null;
    }
  }

  function stopTyping() {
    clearTypingIdleTimer();
    if (typingSentRef.current) sendTypingState(false);
  }

  function handleChatDraftChange(text: string) {
    setChatDraft(text);
    // Emptied input (backspace-to-empty, select-all + delete) stops
    // immediately — no lingering "skriver..." on a blank field.
    if (!text.trim()) {
      stopTyping();
      return;
    }
    const now = Date.now();
    if (!typingSentRef.current || now - typingLastSentAtRef.current >= TYPING_REFRESH_MS) {
      sendTypingState(true);
    }
    clearTypingIdleTimer();
    typingIdleTimerRef.current = setTimeout(() => {
      typingIdleTimerRef.current = null;
      if (typingSentRef.current) sendTypingState(false);
    }, TYPING_IDLE_STOP_MS);
  }

  async function loadChatPresence() {
    // Single-flight WITH pending rerun: one request at a time (a slow
    // network must never stack parallel requests — serialization also
    // guarantees an older response can never overwrite a newer one), but a
    // tick that lands mid-request marks pendingRefresh and re-fetches the
    // moment the request finishes — a status change is never delayed by
    // almost two full poll periods just because a tick was skipped.
    if (chatPresenceInFlightRef.current) {
      chatPresencePendingRef.current = true;
      return;
    }
    chatPresenceInFlightRef.current = true;
    try {
      do {
        chatPresencePendingRef.current = false;
        try {
          const data = await apiJson<ChatPresenceUser[]>(`/api/trips/${id}/chat/presence`);
          setChatPresence(data);
        } catch {}
      } while (chatPresencePendingRef.current);
    } finally {
      chatPresenceInFlightRef.current = false;
    }
  }

  function closeChat() {
    Keyboard.dismiss();
    // Everything that arrived while the chat was open has been on screen —
    // closing IS reading. Stamp + persist so neither this session's focus
    // check nor the next app start re-flags those messages.
    lastReadAtRef.current = new Date().toISOString();
    void AsyncStorage.setItem(chatLastReadKey(id), lastReadAtRef.current).catch(() => {});
    setChatUnread(false);
    setChatOpen(false);
  }

  async function handlePickChatImage() {
    if (chatImageUploading || chatSending || chatPickerBusyRef.current) return;
    chatPickerBusyRef.current = true;
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
    } finally {
      chatPickerBusyRef.current = false;
    }
  }

  // Camera twin of handlePickChatImage — the captured photo enters the exact
  // same pending-image → send → uploadImageIfNeeded pipeline; nothing is
  // uploaded or sent until the user explicitly hits send.
  async function handleTakeChatPhoto() {
    if (chatImageUploading || chatSending || chatPickerBusyRef.current) return;
    chatPickerBusyRef.current = true;
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        showChatError(
          permission.canAskAgain === false
            ? t('trip.error.cameraAccessSettings')
            : t('trip.error.cameraAccessRequired')
        );
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
      });
      if (result.canceled) return;
      const uri = result.assets?.[0]?.uri;
      if (!uri) {
        showChatError(t('trip.error.photoProcessFailed'));
        return;
      }
      setChatPendingImage(uri);
    } catch {
      // Deliberately no err.message here — never surface local file paths.
      showChatError(t('trip.error.cameraOpenFailed'));
    } finally {
      chatPickerBusyRef.current = false;
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
    // clear() does not reliably fire onContentSizeChange — snap the field
    // back to its compact single-line height explicitly.
    setChatInputHeight(CHAT_INPUT_MIN_HEIGHT);
    stopTyping();
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

  // Long-press entry: vibrate, measure the bubble's on-screen position, then
  // open the overlay. The message copy is rendered at that exact rect and
  // springs from its real size (1) to slightly enlarged (1.05) — it stays
  // put, just grows a little and lifts above the blur.
  function openReactionPicker(message: ChatMsg) {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setEmojiGridOpen(false);
    const show = () => {
      setReactionPickerMsg(message);
      reactionScaleAnim.setValue(1);
      Animated.spring(reactionScaleAnim, {
        toValue: 1.05,
        damping: 15,
        mass: 1,
        stiffness: 220,
        useNativeDriver: true,
      }).start();
    };
    const node = bubbleRefs.current.get(message.id);
    if (node && typeof node.measureInWindow === 'function') {
      node.measureInWindow((x, y, width, height) => {
        setReactionRect({ x, y, width, height });
        show();
      });
    } else {
      setReactionRect(null);
      show();
    }
  }

  function confirmDeleteMessage(message: ChatMsg) {
    closeReactionPicker();
    Alert.alert(t('trip.chat.deleteConfirmTitle'), t('trip.chat.deleteConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => void deleteChatMessage(message) },
    ]);
  }

  async function deleteChatMessage(message: ChatMsg) {
    // Optimistic removal; on failure a full reload restores the truth (a
    // plain rollback could drop messages polled in while the request ran,
    // since the `since` cursor has already advanced past them).
    setChatMessages((prev) => prev.filter((m) => m.id !== message.id));
    try {
      const res = await apiFetch(`/api/trips/${id}/chat/${message.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`delete failed: ${res.status}`);
    } catch {
      Alert.alert(t('trip.chat.deleteFailed'));
      void loadChatMessages(true);
    }
  }

  function closeReactionPicker() {
    setReactionPickerMsg(null);
    setReactionRect(null);
    setEmojiGridOpen(false);
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
    const senderOnline = !ownMessage && !!message.userId && (memberOnlineMap.get(message.userId) ?? false);
    const imageSource = message.localImageUri ?? message.imageUrl;
    // The reacted message is lifted forward in the overlay (see the reaction
    // Modal); the in-list bubble stays put behind the blur.
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
            {/* The bubble is a single Pressable (measured for the reaction
                overlay + long-press to react). It must be a DIRECT child of
                the flex-end wrap so chatBubbleCardOwn's maxWidth:70% resolves
                against the full row — an extra wrapper collapsed short
                messages to zero width. */}
            <Pressable
              collapsable={false}
              ref={(n) => {
                if (n) bubbleRefs.current.set(message.id, n as unknown as View);
                else bubbleRefs.current.delete(message.id);
              }}
              disabled={isPending || isFailed}
              onLongPress={() => openReactionPicker(message)}
              style={[
                styles.chatBubbleCard,
                styles.chatBubbleCardOwn,
                { backgroundColor: theme.colors.primary },
                isPending && styles.chatMessagePending,
                isFailed && styles.chatBubbleCardFailed,
              ]}>
              {message.text ? <ChatMessageText text={message.text} isOwn={true} /> : null}
              {message.linkPreview ? <LinkPreviewCardInline preview={message.linkPreview} isOwn={true} /> : null}
            </Pressable>
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
                fallbackBackgroundColor={theme.isDark ? theme.colors.textMuted : '#c2c8d2'}
                fallbackTextColor="#fff"
              />
            </View>
            <View style={styles.chatMessageContent}>
              <Text style={styles.chatAuthorBlocked}>{message.userName}</Text>
              <View style={styles.chatBubbleBlocked}>
                <Ionicons name="ban" size={12} color={theme.isDark ? theme.colors.textMeta : '#a3a9b4'} />
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
                online={senderOnline}
                fallbackBackgroundColor={theme.colors.avatarDark}
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
              <Pressable
                collapsable={false}
                ref={(n) => {
                  if (n) bubbleRefs.current.set(message.id, n as unknown as View);
                  else bubbleRefs.current.delete(message.id);
                }}
                onLongPress={() => openReactionPicker(message)}
                style={styles.chatBubbleCard}>
                {message.text ? <ChatMessageText text={message.text} isOwn={false} /> : null}
                {message.linkPreview ? <LinkPreviewCardInline preview={message.linkPreview} isOwn={false} /> : null}
              </Pressable>
              {renderReactionChips(message, false)}
            </View>
          </View>
        )}
      </View>
    );
  }

  // Same open logic the old Functions screen had before tools moved into
  // the bottom sheet (canOpenURL guard, then hand off to the Spotify app or
  // browser via the https universal link).
  async function openSpotifyLink(url: string) {
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) await Linking.openURL(url);
    } catch {
      // Nothing sensible to do — leave the sheet/screen as is.
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

  // Drop handler for the flat feed list: derives which day the dragged
  // activity landed under and whether that's a same-day reorder (existing
  // endpoint) or a cross-day move (dedicated move endpoint that changes the
  // activity's date and rewrites the target day's order atomically).
  function handleFeedReorder(rows: FeedRow[], draggedId: string) {
    let currentDate: string | null = null;
    const dayOrders = new Map<string, SideQuestActivity[]>();
    for (const row of rows) {
      if (row.kind === 'day') {
        currentDate = row.date;
        if (!dayOrders.has(row.date)) dayOrders.set(row.date, []);
        continue;
      }
      // Ambient stay rows are drop CONTEXT, never part of a day's order.
      if (row.kind !== 'activity') continue;
      // An activity dropped above the very first header belongs to the
      // first day (there is nothing above the trip's first date).
      const date = currentDate ?? rows.find((r): r is Extract<FeedRow, { kind: 'day' }> => r.kind === 'day')?.date;
      if (!date) continue;
      if (!dayOrders.has(date)) dayOrders.set(date, []);
      dayOrders.get(date)!.push(row.activity);
    }

    for (const [date, dayActivities] of dayOrders) {
      const dragged = dayActivities.find((a) => a.id === draggedId);
      if (!dragged) continue;
      if (dragged.date.slice(0, 10) === date) {
        void handleReorderActivities(date, dayActivities);
      } else {
        void handleMoveActivity(dragged, date, dayActivities);
      }
      return;
    }
  }

  async function handleMoveActivity(activity: SideQuestActivity, targetDate: string, targetDayOrder: SideQuestActivity[]) {
    // Hotel stays move as a whole: check-out shifts by the same number of
    // days (stay length preserved). Block the move up front when the
    // shifted stay would poke outside the trip — the server enforces the
    // same rule, but failing fast keeps the feed from flashing an invalid
    // optimistic state.
    let shiftedEndDate: string | null = null;
    if (isStay(activity)) {
      const deltaDays = Math.round(
        (new Date(`${targetDate}T12:00:00`).getTime() - new Date(`${activity.date.slice(0, 10)}T12:00:00`).getTime()) / 86_400_000,
      );
      shiftedEndDate = addDaysIso(activity.endDate!, deltaDays);
      const tripEnd = trip?.endDate?.slice(0, 10);
      if (tripEnd && shiftedEndDate > tripEnd) {
        Alert.alert(t('activity.stay.moveOutsideTripTitle'), t('activity.stay.moveOutsideTripBody'));
        return;
      }
    }

    const orderedIds = targetDayOrder.map((a) => a.id);
    const indexById = new Map(orderedIds.map((activityId, i) => [activityId, i]));

    // Optimistic: give the moved activity its new date and stamp the whole
    // target day's SortIndex so the feed reflects the drop immediately.
    setActivities((prev) =>
      prev.map((a) => {
        if (a.id === activity.id) {
          return { ...a, date: targetDate, endDate: shiftedEndDate ?? a.endDate, sortIndex: indexById.get(a.id) ?? 0 };
        }
        if (indexById.has(a.id)) return { ...a, sortIndex: indexById.get(a.id)! };
        return a;
      }),
    );

    try {
      const response = await apiFetch(`/api/trips/${id}/activities/${activity.id}/move`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: targetDate, activityIds: orderedIds }),
      });
      if (!response.ok) throw new Error(await response.text());
      invalidateCache(`/api/trips/${id}/activities`);
    } catch {
      // Never fail silently — a snapped-back card with no explanation reads
      // as a broken drag. Then resync with the server's actual state rather
      // than leaving a possibly-wrong optimistic move in place.
      Alert.alert(t('activity.moveFailedTitle'), t('activity.moveFailedBody'));
      try {
        const fresh = await apiJson<SideQuestActivity[]>(`/api/trips/${id}/activities`);
        setActivities(fresh);
      } catch {
        // best effort
      }
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
      // Same visible failure as a cross-day move, then resync with the
      // server's actual order rather than leaving a possibly-wrong
      // optimistic order in place.
      Alert.alert(t('activity.moveFailedTitle'), t('activity.moveFailedBody'));
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
          showsVerticalScrollIndicator={false}
          onScroll={(e) => {
            scrollYRef.current = e.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={16}
          onContentSizeChange={(_w, h) => {
            scrollContentHeightRef.current = h;
          }}
          onLayout={(e) => {
            scrollViewportHeightRef.current = e.nativeEvent.layout.height;
          }}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.backButton} activeOpacity={0.88} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={24} color={theme.isDark ? theme.colors.textPrimary : '#11131a'} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{trip?.title ?? t('home.defaultTripName')}</Text>
            <TouchableOpacity style={styles.settingsButton} activeOpacity={0.88} onPress={() => router.push(`/trip/${id}/settings`)}>
              <Ionicons name="settings-outline" size={20} color={theme.isDark ? theme.colors.textPrimary : '#11131a'} />
            </TouchableOpacity>
          </View>

          <HeroShell
            imageUrl={trip?.imageUrl}
            slideshowItems={slideshowItems}
            onSlideChange={activeSlide.onSlideChange}
            style={styles.heroCardSize}>
            {!trip?.imageUrl ? (
              <View style={styles.heroPatternRow}>
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <View key={i} style={styles.heroPatternCell} />
                ))}
              </View>
            ) : null}

            {/* ONE location name, never a combined "A · B" pair. With the
                slideshow on, the pill shows the CURRENT SLIDE's day
                location and flips together with the image; with it off,
                the static rule applies (current day → first day →
                destination). No label → no pill, never an empty pin. */}
            <HeroSlideLocationPill
              channel={activeSlide}
              hasSlideshow={heroHasSlideshow}
              staticLabel={heroLocationLabel}
              rowStyle={styles.heroTopRow}
              pillStyle={styles.heroLocPill}
              textStyle={styles.heroLocText}
            />

            <View style={styles.heroBody}>
              <Text style={styles.heroTitle} numberOfLines={2}>{trip?.title ?? t('trip.loadingAdventure')}</Text>
              <Text style={styles.heroDate}>{formatTripDateRange(trip?.startDate, trip?.endDate, locale, t)}</Text>
              {/* Same members preview as the Home card: overlapping
                  borderless avatars with live online dots, plus the compact
                  weather chip — kept visually in sync with
                  components/big-hero-card.tsx by hand. */}
              <View style={styles.heroFooterRow}>
                {members.length > 0 ? (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={styles.heroAvatarRow}
                    onPress={() => setPeopleSheetOpen(true)}>
                    {members.slice(0, 3).map((member, idx) => (
                      <View
                        key={member.id}
                        style={[
                          styles.heroAvatarWrap,
                          { marginLeft: idx === 0 ? 0 : -12, zIndex: 3 - idx },
                        ]}>
                        <Avatar
                          uri={member.avatarUrl}
                          name={member.name}
                          fallbackText={getInitials(member.name)}
                          size={28}
                          online={member.isOnline}
                          onlineDotOnPhoto
                        />
                      </View>
                    ))}
                  </TouchableOpacity>
                ) : null}
                {headerWeatherDay ? (
                  <View style={styles.heroWeatherChip}>
                    <WeatherIcon condition={headerWeatherDay.code} size={15} />
                    <Text style={styles.heroWeatherChipText}>
                      {Math.round(headerWeatherDay.tempMaxC)}°
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          </HeroShell>

          {/* Travelers/pending line — moved out of the hero so it sits
              between the cover and the weather section; still opens the
              members sheet like the old chips did. */}
          <TouchableOpacity
            activeOpacity={0.8}
            style={styles.travelersRow}
            onPress={() => setPeopleSheetOpen(true)}>
            <Text style={styles.travelersRowText} numberOfLines={1}>
              {t('trip.travelersCount', { count: members.length || 1 })} · {t('trip.pendingCount', { count: invites.length })}
            </Text>
          </TouchableOpacity>

          {/* Compact weather strip: start-day (or today's) forecast, or the
              closer-to-departure note. Hidden entirely when weather is
              unavailable or the destination has no coordinates — never fake
              weather. Tap opens the full Weather page. */}
          {tripWeather && (tripWeather.status === 'available' || tripWeather.status === 'too_early') ? (
            <TouchableOpacity
              style={styles.weatherStrip}
              activeOpacity={0.85}
              onPress={() => router.push(`/trip/${id}/weather`)}>
              {headerWeatherDay ? (
                <>
                  <WeatherIcon condition={headerWeatherDay.code} size={18} />
                  <Text style={styles.weatherStripText} numberOfLines={1}>
                    {Math.round(headerWeatherDay.tempMaxC)}° · {t(conditionLabelKey(headerWeatherDay.code))}
                  </Text>
                </>
              ) : (
                <>
                  <Ionicons name="partly-sunny-outline" size={16} color={theme.colors.textSecondary} />
                  <Text style={styles.weatherStripText} numberOfLines={1}>{t('weather.tooEarly')}</Text>
                </>
              )}
              <Ionicons name="chevron-forward" size={16} color={theme.isDark ? theme.colors.textMuted : '#b2b7c0'} />
            </TouchableOpacity>
          ) : null}

          {/* Trip tools moved out of the feed — the floating launcher next
              to the chat bubble opens them in a bottom sheet instead, so the
              feed stays focused on trip activity. */}

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionEyebrow}>{t('trip.feedEyebrow')}</Text>
          </View>

          {activityDayGroups.length > 0 ? (
            <DraggableDayList
              items={feedRows}
              keyExtractor={(row) =>
                row.kind === 'day' ? `day-${row.date}`
                : row.kind === 'stayNight' ? `stay-night-${row.activity.id}-${row.night}`
                : row.kind === 'stayCheckout' ? `stay-checkout-${row.activity.id}`
                : row.activity.id
              }
              // Reordering is a trip-wide collaborative action gated by
              // MembersCanEdit (or trip ownership) on the backend's
              // reorder/move endpoints — NOT per-activity canEdit, which is
              // creator-only for editing/deleting an activity's own
              // content. Using canEdit here would silently disable drag
              // for an entire day whenever its first item happens to be
              // someone else's activity, even for your own items below it.
              enabled={canManageTrip || (trip?.membersCanEdit ?? true)}
              // Day headers are drop context, never draggable themselves.
              isDraggable={(row) => row.kind === 'activity'}
              autoScroll={{
                scrollRef,
                scrollYRef,
                contentHeightRef: scrollContentHeightRef,
                viewportHeightRef: scrollViewportHeightRef,
              }}
              onReorder={(rows, draggedId) => handleFeedReorder(rows, draggedId)}
              renderItem={(row) => {
                if (row.kind === 'day') {
                  // One continuous journey: the connector runs behind the day
                  // headers too — the date label (opaque page-colored box)
                  // simply overlays it. Only the very first header lets the
                  // line begin at its own center instead of the top edge, so
                  // the itinerary has a visual start.
                  const isFirstFeedRow = feedRows[0] === row;
                  return (
                    <View style={[styles.dayGroup, styles.connectorHost]}>
                      <View
                        pointerEvents="none"
                        style={[styles.timelineConnector, isFirstFeedRow ? styles.timelineConnectorFromCenter : null]}
                      />
                      <View style={styles.dayHeader}>
                        <Text style={[styles.dayHeaderText, styles.dayHeaderTextOverlay]}>{formatDayHeaderDate(row.date, locale)}</Text>
                        <Text style={styles.dayHeaderDay}>{t('trip.dayNumber', { day: dayNumberRelative(row.date, trip?.startDate) })}</Text>
                        <View style={styles.dayHeaderLine} />
                      </View>
                      <TouchableOpacity
                        activeOpacity={0.7}
                        style={styles.dayLocationRow}
                        accessibilityRole="button"
                        onPress={() => setDayLocationEditorDate(row.date)}>
                        <Ionicons
                          name={dayLocationByDate.get(row.date) ? 'location' : 'add'}
                          size={12}
                          color={theme.colors.textMeta}
                        />
                        <Text style={styles.dayLocationText} numberOfLines={1}>
                          {dayLocationByDate.get(row.date)?.locationLabel ?? t('dayLocation.setLocation')}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  );
                }
                if (row.kind === 'stayNight' || row.kind === 'stayCheckout') {
                  const stay = row.activity;
                  const label =
                    row.kind === 'stayNight'
                      ? t('activity.stay.nightOf', { n: row.night, total: row.totalNights })
                      : stay.endTime
                        ? t('activity.stay.checkoutAt', { time: formatActivityTimeShort(stay.endTime) ?? stay.endTime })
                        : t('activity.stay.checkout');
                  return (
                    <View style={styles.connectorHost}>
                      <View pointerEvents="none" style={styles.timelineConnector} />
                    <TouchableOpacity
                      activeOpacity={0.75}
                      style={styles.stayRow}
                      accessibilityRole="button"
                      accessibilityLabel={`${stay.title ?? ''} ${label}`.trim()}
                      onPress={() => router.push(`/trip/${id}/sidequest/${stay.id}`)}>
                      <View style={styles.stayAccentBarSlim} />
                      <Ionicons
                        name={row.kind === 'stayNight' ? 'bed-outline' : 'log-out-outline'}
                        size={13}
                        color={theme.colors.stayTextMuted}
                      />
                      <Text style={styles.stayRowTitle} numberOfLines={1}>
                        {stay.title?.trim() || t('trip.activityFallbackTitle')}
                      </Text>
                      <Text style={styles.stayRowLabel}>{label}</Text>
                    </TouchableOpacity>
                    </View>
                  );
                }
                const activity = row.activity;
                  const hidden = isSealedInLists(activity);
                  const timeLabel = formatActivityTimeShort(activity.time);

                  if (hidden) {
                    return (
                      <View key={activity.id} style={styles.connectorHost}>
                        <View pointerEvents="none" style={styles.timelineConnector} />
                        <HiddenSidequestCard
                          id={activity.id}
                          revealAt={activity.revealAt}
                          imageUrl={activity.imageUrl}
                          category={activity.category}
                          description={activity.description}
                          timeLabel={timeLabel}
                          formatTimeUntilReveal={(revealAt) => formatTimeUntilReveal(revealAt, t)}
                          onPress={() => router.push(`/trip/${id}/sidequest/${activity.id}`)}
                        />
                      </View>
                    );
                  }

                  const stayCard = isStay(activity);
                  return (
                    // connectorHost carries the itinerary connector BEHIND the
                    // row: transparent rows show it running through the icon
                    // column, while opaque surfaces (hotel reservation cards)
                    // sit on top of it — the line passes underneath without a
                    // visual break since the host spans the card's margins too.
                    <View key={activity.id} style={styles.connectorHost}>
                      <View pointerEvents="none" style={styles.timelineConnector} />
                    <TouchableOpacity
                      activeOpacity={0.86}
                      style={[styles.timelineRow, stayCard ? styles.stayAnchorSurface : null]}
                      onPress={() => router.push(`/trip/${id}/sidequest/${activity.id}`)}>
                      {stayCard ? <View style={styles.stayAccentBar} /> : null}
                      <View style={styles.timelineIconWrap}>
                        {activity.imageUrl ? (
                          <Image source={{ uri: activity.imageUrl }} style={styles.timelineIcon} />
                        ) : (
                          <ActivityImageFallback category={activity.category} size="small" style={styles.timelineIcon} />
                        )}
                      </View>
                      <View style={styles.timelineBody}>
                        {stayCard ? (
                          <View style={styles.stayTitleRow}>
                            <Text style={[styles.timelineTitle, styles.stayTitleShrink]} numberOfLines={1}>
                              {activity.title?.trim() || t('trip.activityFallbackTitle')}
                            </Text>
                            <View style={styles.stayNightsPill}>
                              <Text style={styles.stayNightsPillText}>{formatNights(stayNights(activity), t)}</Text>
                            </View>
                          </View>
                        ) : (
                          <Text style={styles.timelineTitle} numberOfLines={1}>
                            {activity.title?.trim() || t('trip.activityFallbackTitle')}
                          </Text>
                        )}
                        <Text style={styles.timelineSubtitle} numberOfLines={1}>
                          {formatActivityAuthorSubtitle(activity)}
                        </Text>
                        {stayCard ? (
                          <View style={styles.stayBadgeRow}>
                            <Ionicons name="moon-outline" size={11} color={theme.colors.stayTextMuted} />
                            <Text style={styles.stayBadgeText} numberOfLines={1}>
                              {/* Dates only — the nights pill by the title
                                  already carries the stay length. */}
                              {formatStayDateRange(activity.date, activity.endDate!, locale)}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      {timeLabel ? <Text style={styles.timelineTime}>{timeLabel}</Text> : null}
                    </TouchableOpacity>
                    </View>
                  );
              }}
            />
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
          <TouchableOpacity activeOpacity={0.92} style={[styles.chatBubble, { backgroundColor: theme.colors.secondary, shadowColor: theme.colors.secondary }]} onPress={() => setChatOpen(true)}>
            <Ionicons name="chatbubble-ellipses-outline" size={20} color="#fff" />
            {chatUnread ? <View style={[styles.chatUnreadDot, { backgroundColor: theme.colors.primary }]} /> : null}
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
            <Ionicons name="grid-outline" size={20} color={theme.colors.primary} />
          </TouchableOpacity>
        </View>

        <View pointerEvents="box-none" style={[styles.floatingWrap, { bottom: Math.max(insets.bottom, 16) + 6 }]}>
          <TouchableOpacity activeOpacity={0.92} style={[styles.floatingButton, { backgroundColor: theme.colors.primary, shadowColor: theme.colors.primary }]} onPress={() => router.push(`/trip/${id}/sidequest/new`)}>
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={styles.floatingButtonText}>{t('trip.addActivity')}</Text>
          </TouchableOpacity>
        </View>

        {/* Trip tools sheet — every utility entry point in one place, off
            the feed. Navigation targets are unchanged; only the entry moved.
            autoHeight: size to the fixed row list (no empty gap below).
            slowEntry: the launcher sheet should glide up deliberately. */}
        <ModalSheet visible={toolsSheetOpen} autoHeight slowEntry onClose={() => setToolsSheetOpen(false)}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <View>
              <Text style={styles.sheetEyebrow}>{t('trip.functions.subtitle')}</Text>
              <Text style={styles.sheetTitle}>{t('trip.tools.title')}</Text>
            </View>
            <TouchableOpacity style={styles.sheetCloseButton} activeOpacity={0.88} onPress={() => setToolsSheetOpen(false)}>
              <Ionicons name="close" size={20} color={theme.colors.textPrimary} />
            </TouchableOpacity>
          </View>
          <View style={[styles.toolsList, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
            <TouchableOpacity
              style={styles.toolRow}
              activeOpacity={0.86}
              onPress={() => {
                setToolsSheetOpen(false);
                router.push(`/trip/${id}/split`);
              }}>
              <View style={[styles.toolRowIcon, { backgroundColor: theme.isDark ? theme.colors.primaryLight12 : '#fff0f4' }]}>
                <Ionicons name="calculator-outline" size={20} color={theme.colors.primary} />
              </View>
              <Text style={styles.toolRowLabel}>{t('trip.costSplit')}</Text>
              <Ionicons name="chevron-forward" size={18} color={theme.isDark ? theme.colors.textMuted : '#b2b7c0'} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.toolRow}
              activeOpacity={0.86}
              onPress={() => {
                setToolsSheetOpen(false);
                setSpotifyModalOpen(true);
              }}>
              <View style={[styles.toolRowIcon, { backgroundColor: theme.isDark ? theme.colors.successLight : '#e7f8ef' }]}>
                <FontAwesome name="spotify" size={20} color="#1cb35b" />
              </View>
              <Text style={styles.toolRowLabel}>{t('trip.tools.spotify')}</Text>
              {/* The old Functions screen had an "open" button for a saved
                  link that got lost when tools moved into this sheet — a
                  saved playlist was un-openable. Row still opens the editor;
                  this opens the link itself. */}
              {trip?.spotifyUrl ? (
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={styles.toolRowSpotifyOpen}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.open')}
                  onPress={() => void openSpotifyLink(trip.spotifyUrl!)}>
                  <Ionicons name="play" size={11} color="#1cb35b" />
                  <Text style={styles.toolRowSpotifyOpenText}>{t('common.open')}</Text>
                </TouchableOpacity>
              ) : null}
              <Ionicons name="chevron-forward" size={18} color={theme.isDark ? theme.colors.textMuted : '#b2b7c0'} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.toolRow}
              activeOpacity={0.86}
              onPress={() => {
                setToolsSheetOpen(false);
                router.push(`/trip/${id}/packing-list`);
              }}>
              <View style={[styles.toolRowIcon, { backgroundColor: theme.isDark ? 'rgba(59,130,246,0.16)' : '#eef4ff' }]}>
                <Ionicons name="checkmark-done-outline" size={20} color={theme.isDark ? '#60a5fa' : '#3b82f6'} />
              </View>
              <Text style={styles.toolRowLabel}>{t('trip.packingList.title')}</Text>
              <Ionicons name="chevron-forward" size={18} color={theme.isDark ? theme.colors.textMuted : '#b2b7c0'} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.toolRow}
              activeOpacity={0.86}
              onPress={() => {
                setToolsSheetOpen(false);
                router.push(`/trip/${id}/documents`);
              }}>
              <View style={[styles.toolRowIcon, { backgroundColor: theme.colors.primaryLight12 }]}>
                <Ionicons name="documents-outline" size={20} color={theme.colors.primary} />
              </View>
              <Text style={styles.toolRowLabel}>{t('trip.documents.title')}</Text>
              <Ionicons name="chevron-forward" size={18} color={theme.isDark ? theme.colors.textMuted : '#b2b7c0'} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.toolRow}
              activeOpacity={0.86}
              onPress={() => {
                setToolsSheetOpen(false);
                setPeopleSheetOpen(true);
              }}>
              <View style={[styles.toolRowIcon, { backgroundColor: theme.isDark ? 'rgba(147,51,234,0.2)' : '#f3e8ff' }]}>
                <Ionicons name="person-add-outline" size={20} color={theme.isDark ? '#a78bfa' : '#9333ea'} />
              </View>
              <Text style={styles.toolRowLabel}>{t('trip.tools.inviteFriends')}</Text>
              <Ionicons name="chevron-forward" size={18} color={theme.isDark ? theme.colors.textMuted : '#b2b7c0'} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.toolRow}
              activeOpacity={0.86}
              onPress={() => {
                setToolsSheetOpen(false);
                router.push(`/trip/${id}/settings`);
              }}>
              <View style={[styles.toolRowIcon, { backgroundColor: theme.isDark ? theme.colors.bgLight : '#f1f5f9' }]}>
                <Ionicons name="settings-outline" size={20} color={theme.isDark ? theme.colors.textSecondary : '#475569'} />
              </View>
              <Text style={styles.toolRowLabel}>{t('settings.title')}</Text>
              <Ionicons name="chevron-forward" size={18} color={theme.isDark ? theme.colors.textMuted : '#b2b7c0'} />
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
              <Ionicons name="close" size={20} color={theme.colors.textPrimary} />
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
                          online={member.isOnline}
                          fallbackBackgroundColor={theme.colors.avatarDark}
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
                          <Ionicons name="ellipsis-vertical" size={18} color={theme.isDark ? theme.colors.textMeta : '#8e95a2'} />
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
                          <Ionicons name="add" size={20} color={theme.colors.primary} />
                        </View>
                        <View style={styles.personCopy}>
                          <Text style={styles.personName}>{t('trip.inviteTraveler')}</Text>
                          <Text style={styles.personMeta}>{t('trip.inviteTravelerHint')}</Text>
                        </View>
                        <Ionicons name={inviteComposerOpen ? 'chevron-up' : 'chevron-forward'} size={18} color={theme.isDark ? theme.colors.textMeta : '#8e95a2'} />
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
                                placeholderTextColor={theme.isDark ? theme.colors.placeholderText : '#afb5bf'}
                                keyboardType="email-address"
                                autoCapitalize="none"
                                autoCorrect={false}
                                keyboardAppearance={theme.keyboardAppearance}
                                style={styles.inviteInput}
                                returnKeyType="done"
                                onSubmitEditing={() => Keyboard.dismiss()}
                              />
                            </Animated.View>
                            <TouchableOpacity
                              activeOpacity={0.9}
                              style={[styles.inviteAddButton, { backgroundColor: theme.colors.primary }, inviteSubmitting ? styles.inviteAddButtonDisabled : null]}
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
                              <Ionicons name="copy-outline" size={16} color={theme.colors.primary} />
                              <Text style={[styles.secondaryInviteButtonText, { color: theme.colors.primary }]}>{t('trip.copyCode')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity activeOpacity={0.9} style={styles.secondaryInviteButton} onPress={() => void handleShareInvite()}>
                              <Ionicons name="share-social-outline" size={16} color={theme.colors.primary} />
                              <Text style={[styles.secondaryInviteButtonText, { color: theme.colors.primary }]}>{t('common.share')}</Text>
                            </TouchableOpacity>
                          </View>

                          <View style={styles.inviteHintRow}>
                            <Text style={styles.inviteHintLabel}>{t('trip.invite_code_section')}</Text>
                            <Text style={[styles.inviteHintCode, { color: theme.colors.primary }]}>{trip?.inviteCode ?? '------'}</Text>
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
                          <Ionicons name="mail-outline" size={16} color={theme.isDark ? theme.colors.textSecondary : '#7a8290'} />
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
                              <ActivityIndicator size="small" color={theme.isDark ? theme.colors.textMeta : '#8e95a2'} />
                            ) : (
                              <Ionicons name="close-circle-outline" size={20} color={theme.isDark ? theme.colors.textMeta : '#8e95a2'} />
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
          <View ref={chatBackdropRef} style={styles.chatModalBackdrop}>
            <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={closeChat} />
            <KeyboardAvoidingView
              style={[
                styles.chatKeyboardAvoider,
                {
                  marginTop: chatKbOverlap !== null ? insets.top : insets.top + 12,
                  // Keyboard closed: sit directly on the safe area — the old
                  // extra +12 stacked on top of the inset AND the panel's own
                  // bottom padding, leaving a dead band under the composer.
                  // (8px floor keeps a hint of breathing room on devices
                  // with no bottom inset, e.g. hardware-button Androids.)
                  marginBottom: chatKbOverlap !== null ? chatKbOverlap + 6 : Math.max(insets.bottom, 8),
                },
              ]}
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={[styles.chatPanel, { paddingTop: 18, paddingBottom: 10 }]}>
              <View style={styles.chatPanelHeader}>
                <View style={styles.chatPanelHeaderLeft}>
                  <Text style={styles.chatPanelEyebrow}>{t('trip.groupChatEyebrow')}</Text>
                  <Text style={styles.chatPanelTitle}>{trip?.title ?? t('trip.adventureChatFallback')}</Text>
                </View>
                <TouchableOpacity style={styles.chatPanelClose} activeOpacity={0.88} onPress={closeChat}>
                  <Ionicons name="close" size={20} color={theme.colors.textPrimary} />
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
                      fallbackBackgroundColor={theme.isDark ? 'rgba(34,174,199,0.16)' : '#e8f4f7'}
                      fallbackTextColor={theme.colors.secondary}
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
                  <Ionicons name="alert-circle" size={14} color={theme.colors.error} />
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
                        <Ionicons name="ban-outline" size={13} color={theme.isDark ? theme.colors.warning : '#b45309'} />
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
                  <Ionicons name="ban-outline" size={14} color={theme.isDark ? theme.colors.textSecondary : '#5c6370'} />
                  <Text style={styles.chatBlockNoticeText}>
                    {t('trip.chat.blockedNotice', { name: blockChatNotice })}
                  </Text>
                </View>
              ) : null}

              {/* Fixed-height row so the indicator appearing/disappearing
                  never shifts the composer or covers the last message. */}
              <View style={styles.chatTypingRow}>
                {typingLabel ? (
                  <Text style={styles.chatTypingText} numberOfLines={1}>{typingLabel}</Text>
                ) : null}
              </View>

              <View style={styles.chatComposer}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={styles.chatAttachButton}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 6 }}
                  disabled={chatSending || chatImageUploading}
                  onPress={() => void handlePickChatImage()}>
                  <Ionicons name="image-outline" size={17} color={chatSending || chatImageUploading ? (theme.isDark ? theme.colors.textMuted : '#c2c8d2') : theme.colors.textPrimary} />
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={styles.chatAttachButton}
                  hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                  disabled={chatSending || chatImageUploading}
                  onPress={() => void handleTakeChatPhoto()}>
                  <Ionicons name="camera-outline" size={17} color={chatSending || chatImageUploading ? (theme.isDark ? theme.colors.textMuted : '#c2c8d2') : theme.colors.textPrimary} />
                </TouchableOpacity>
                <Animated.View style={{ flex: 1, minWidth: 0, opacity: chatInputOpacityRef }}>
                  <TextInput
                    ref={chatInputRef}
                    value={chatDraft}
                    onChangeText={handleChatDraftChange}
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
                    placeholderTextColor={theme.isDark ? theme.colors.placeholderText : '#afb5bf'}
                    keyboardAppearance={theme.keyboardAppearance}
                    style={[
                      styles.chatInput,
                      {
                        // Multi-line content anchors to the top (Android);
                        // the single-line rest state stays padding-centered.
                        // The HEIGHT itself is native: minHeight/maxHeight in
                        // the base style + intrinsic multiline sizing — no
                        // JS-driven height, so wrapping can never deadlock
                        // on a measurement round-trip.
                        textAlignVertical:
                          chatInputHeight > CHAT_INPUT_MIN_HEIGHT ? 'top' : 'center',
                      },
                    ]}
                    multiline
                    // Below max: scrolling off so the field grows with each
                    // wrapped line. At max: scrolling on for longer text.
                    // Gate is the MEASURED content height, not line width.
                    scrollEnabled={chatInputHeight >= CHAT_INPUT_MAX_HEIGHT}
                    onContentSizeChange={(e) => {
                      // Measurement only feeds the scroll gate and the text
                      // alignment — never the layout height. Equality guard
                      // prevents re-render loops.
                      const contentHeight =
                        Math.ceil(e.nativeEvent.contentSize.height)
                        + (Platform.OS === 'ios' ? CHAT_INPUT_VERTICAL_PADDING : 0);
                      const next = Math.min(
                        CHAT_INPUT_MAX_HEIGHT,
                        Math.max(CHAT_INPUT_MIN_HEIGHT, contentHeight),
                      );
                      setChatInputHeight((prev) => (prev === next ? prev : next));
                    }}
                  />
                </Animated.View>
                <TouchableOpacity
                  activeOpacity={0.9}
                  style={[
                    styles.chatSendButton,
                    { backgroundColor: theme.colors.primary },
                    (!chatDraft.trim() && !chatPendingImage) || chatSending || chatImageUploading ? styles.chatSendButtonDisabled : null,
                  ]}
                  hitSlop={{ top: 8, bottom: 8, left: 6, right: 8 }}
                  disabled={(!chatDraft.trim() && !chatPendingImage) || chatSending || chatImageUploading}
                  onPress={() => void handleSendChat()}>
                  <Ionicons name="send" size={13} color="#fff" style={{ marginLeft: 1 }} />
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
              <Pressable style={styles.reactionOverlay} onPress={closeReactionPicker}>
                {/* Blurred, dimmed chat behind — the message stays in place
                    and comes forward. The tint is deliberately "dark" in BOTH
                    themes: this overlay is an Instagram-style dim (see the
                    scrim below), so a theme-following light tint would wash
                    the light theme's approved look out. */}
                <BlurView intensity={38} tint="dark" style={StyleSheet.absoluteFill} />
                {/* Darker scrim so the dimmed chat reads clearly behind the
                    overlay (Instagram-style), not washed-out light. */}
                <View pointerEvents="none" style={styles.reactionScrim} />
                {reactionPickerMsg && reactionRect ? (
                  (() => {
                    const own = reactionPickerMsg.userId === user?.id;
                    const BAR_H = 68; // picker card: 44 button + 12*2 padding
                    const GAP = 12; // clear gap between the bar and the message
                    const barTop = Math.max(insets.top + 8, reactionRect.y - BAR_H - GAP);
                    return (
                      <>
                        {/* Reaction bar anchored just ABOVE the message. */}
                        <View style={[styles.reactionBarAnchor, { top: barTop }]} pointerEvents="box-none">
                          <Pressable style={styles.reactionPickerCard} onPress={() => {}}>
                            <View style={styles.reactionEmojiRow}>
                              {REACTION_EMOJIS.map((emoji) => {
                                const mine = reactionPickerMsg.reactions?.some(
                                  (r) => r.emoji === emoji && r.reactedByMe,
                                );
                                return (
                                  <TouchableOpacity
                                    key={emoji}
                                    activeOpacity={0.7}
                                    style={[styles.reactionEmojiButton, mine && styles.reactionEmojiButtonMine]}
                                    onPress={() => void handleToggleReaction(reactionPickerMsg.id, emoji)}>
                                    <Text style={styles.reactionEmojiText}>{emoji}</Text>
                                  </TouchableOpacity>
                                );
                              })}
                              {/* "+" opens the in-app emoji grid (bottom card). */}
                              <TouchableOpacity
                                activeOpacity={0.7}
                                style={[styles.reactionAddButton, emojiGridOpen && styles.reactionAddButtonActive]}
                                accessibilityLabel={t('trip.chat.reactionPickMore')}
                                onPress={() => setEmojiGridOpen((v) => !v)}>
                                <Ionicons name="add" size={22} color={emojiGridOpen ? theme.colors.primary : (theme.isDark ? theme.colors.textSecondary : '#5c6370')} />
                              </TouchableOpacity>
                            </View>
                          </Pressable>
                        </View>

                        {/* The reacted message at its EXACT position, lifted
                            forward and enlarged a little. pointerEvents none so
                            tapping it falls through to the backdrop = close. */}
                        <Animated.View
                          pointerEvents="none"
                          style={{
                            position: 'absolute',
                            top: reactionRect.y,
                            left: reactionRect.x,
                            // +1dp: Android's pixel rounding could make the
                            // clone's text area a hair narrower than the real
                            // bubble, re-wrapping the last word / a trailing
                            // space onto an extra empty-looking line.
                            width: Math.ceil(reactionRect.width) + 1,
                            transform: [{ scale: reactionScaleAnim }],
                          }}>
                          <View
                            style={[
                              styles.chatBubbleCard,
                              styles.reactionPreviewBubble,
                              own && [styles.chatBubbleCardOwn, { backgroundColor: theme.colors.primary }],
                              // Fill the measured rect exactly so the copy matches
                              // the real bubble (overrides the own-bubble maxWidth).
                              // Height is locked to the measured bubble and
                              // clipped, so a phantom wrapped line can never
                              // grow the clone taller than the original.
                              { width: '100%', maxWidth: '100%', alignSelf: 'stretch', height: Math.ceil(reactionRect.height), overflow: 'hidden' },
                            ]}>
                            {reactionPickerMsg.text ? (
                              <ChatMessageText text={reactionPickerMsg.text} isOwn={own} />
                            ) : null}
                            {reactionPickerMsg.linkPreview ? (
                              <LinkPreviewCardInline preview={reactionPickerMsg.linkPreview} isOwn={own} />
                            ) : null}
                          </View>
                        </Animated.View>

                        {/* Delete — own messages only, anchored just BELOW the
                            message (the clone scales ×1.05 around its center,
                            so offset by the grown half). */}
                        {own && !reactionPickerMsg.status ? (
                          <View
                            style={[
                              styles.reactionBarAnchor,
                              { top: reactionRect.y + Math.ceil(reactionRect.height * 1.03) + GAP },
                            ]}
                            pointerEvents="box-none">
                            <Pressable
                              style={styles.deleteActionCard}
                              onPress={() => confirmDeleteMessage(reactionPickerMsg)}>
                              <Ionicons name="trash-outline" size={18} color="#E5484D" />
                              <Text style={styles.deleteActionText}>{t('trip.chat.deleteMessage')}</Text>
                            </Pressable>
                          </View>
                        ) : null}

                        {/* In-app emoji grid (opened via "+") — bottom card. */}
                        {emojiGridOpen ? (
                          <View style={[styles.emojiGridBottom, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
                            <Pressable style={styles.emojiGridCard} onPress={() => {}}>
                              <ScrollView
                                style={{ maxHeight: 220 }}
                                contentContainerStyle={styles.emojiGridWrap}
                                showsVerticalScrollIndicator={false}>
                                {EMOJI_GRID.map((emoji) => (
                                  <TouchableOpacity
                                    key={emoji}
                                    activeOpacity={0.7}
                                    style={styles.emojiGridCell}
                                    onPress={() => void handleToggleReaction(reactionPickerMsg.id, emoji)}>
                                    <Text style={styles.emojiGridText}>{emoji}</Text>
                                  </TouchableOpacity>
                                ))}
                              </ScrollView>
                            </Pressable>
                          </View>
                        ) : null}
                      </>
                    );
                  })()
                ) : null}
              </Pressable>
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
                  <Ionicons name="close" size={20} color={theme.colors.textPrimary} />
                </TouchableOpacity>
              </View>

              <View style={styles.spotifySheetBody}>
                {/* Saved link is directly openable from here too. */}
                {trip?.spotifyUrl ? (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={styles.spotifySheetOpenRow}
                    accessibilityRole="button"
                    accessibilityLabel={t('common.open')}
                    onPress={() => void openSpotifyLink(trip.spotifyUrl!)}>
                    <FontAwesome name="spotify" size={16} color="#1cb35b" />
                    <Text style={styles.spotifySheetOpenText} numberOfLines={1}>
                      {trip.spotifyUrl}
                    </Text>
                    <Ionicons name="open-outline" size={16} color="#1cb35b" />
                  </TouchableOpacity>
                ) : null}
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
                    placeholderTextColor={theme.isDark ? theme.colors.placeholderText : '#a3a9b4'}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    keyboardAppearance={theme.keyboardAppearance}
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
                  <Ionicons name="chevron-down" size={24} color={theme.colors.textPrimary} />
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
                                  <Ionicons name="chevron-forward" size={18} color={theme.isDark ? theme.colors.textMuted : '#c5cad2'} />
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

        {id && dayLocationEditorDate ? (
          <DayLocationEditor
            visible={Boolean(dayLocationEditorDate)}
            onClose={() => setDayLocationEditorDate(null)}
            tripId={id}
            date={dayLocationEditorDate}
            current={dayLocationByDate.get(dayLocationEditorDate) ?? null}
            suggestedPlace={suggestedPlaceByDate.get(dayLocationEditorDate) ?? null}
            onChanged={() => {
              void fetchTripDayLocations(id).then(setDayLocations).catch(() => {});
              void fetchTripWeather(id).then(setTripWeather).catch(() => {});
            }}
          />
        ) : null}
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
// The ONLY part of the screen that re-renders when the slideshow flips —
// subscribing here (not in TripDetailsScreen) keeps the every-5-seconds
// label update away from the feed/chat/hero tree, so a transition costs
// one tiny pill render instead of a whole-screen one (the whole-screen
// version was a visible hitch right as each crossfade settled). With the
// slideshow on the pill follows the current slide; with it off it shows
// the static rule's label. No label → no pill row at all.
function HeroSlideLocationPill({
  channel,
  hasSlideshow,
  staticLabel,
  rowStyle,
  pillStyle,
  textStyle,
}: {
  channel: ActiveSlideLabelChannel;
  hasSlideshow: boolean;
  staticLabel: string | null;
  rowStyle: StyleProp<ViewStyle>;
  pillStyle: StyleProp<ViewStyle>;
  textStyle: StyleProp<TextStyle>;
}) {
  const slideLabel = useActiveSlideLabelValue(channel);
  const label = hasSlideshow ? slideLabel : staticLabel;
  if (!label) return null;
  return (
    <View style={rowStyle}>
      <View style={pillStyle}>
        <Ionicons name="location" size={12} color="#fff" />
        <Text style={textStyle} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </View>
  );
}

function ChatLoadingSkeleton() {
  const styles = useThemedStyles(createStyles);
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
  const styles = useThemedStyles(createStyles);
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
  const styles = useThemedStyles(createStyles);
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

function formatTripDateRange(startDate: string | undefined, endDate: string | undefined, locale: string, t: (key: string, vars?: Record<string, string | number>) => string) {
  if (!startDate || !endDate) return t('trip.datesComingSoon');
  const formatter = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' });
  return `${formatter.format(new Date(`${startDate}T12:00:00`))} - ${formatter.format(new Date(`${endDate}T12:00:00`))}`;
}

function formatActivityDate(date: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(`${date}T12:00:00`));
}

// Compact date pieces for the hotel reservation line. Swedish Intl short
// months carry a trailing period ("aug.") that reads noisy in a tight range,
// so it's trimmed — matching the approved mock ("5–7 aug").
function formatStayMonthShort(d: Date, locale: string) {
  return new Intl.DateTimeFormat(locale, { month: 'short' }).format(d).replace(/\.$/, '');
}

function formatStayDayMonth(dateIso: string, locale: string) {
  const d = new Date(`${dateIso.slice(0, 10)}T12:00:00`);
  const month = formatStayMonthShort(d, locale);
  return locale.startsWith('sv') ? `${d.getDate()} ${month}` : `${month} ${d.getDate()}`;
}

function formatStayDateRange(startIso: string, endIso: string, locale: string) {
  const start = new Date(`${startIso.slice(0, 10)}T12:00:00`);
  const end = new Date(`${endIso.slice(0, 10)}T12:00:00`);
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  if (sameMonth) {
    // "5–7 aug" (sv) / "Aug 5–7" (en) — each language's natural date order.
    return locale.startsWith('sv')
      ? `${start.getDate()}–${end.getDate()} ${formatStayMonthShort(end, locale)}`
      : `${formatStayMonthShort(end, locale)} ${start.getDate()}–${end.getDate()}`;
  }
  return `${formatStayDayMonth(startIso, locale)} – ${formatStayDayMonth(endIso, locale)}`;
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

const createStyles = (theme: AppTheme) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.bgPrimary,
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
    backgroundColor: theme.isDark ? theme.colors.bgLight : '#f5f6f8',
  },
  headerTitle: {
    flex: 1,
    marginLeft: 12,
    color: theme.isDark ? theme.colors.textPrimary : '#121317',
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
    backgroundColor: theme.isDark ? theme.colors.bgLight : '#f5f6f8',
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
    backgroundColor: theme.colors.pillDark42,
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
  // Members preview + weather chip inside the hero — mirrors the Home
  // card's footer (28px borderless avatars, -12 overlap, ring-free dots).
  heroFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  heroAvatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroAvatarWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.75)',
    // Solid fill behind initials-fallbacks (Avatar's dark-mode fallback is
    // translucent rgba) — same solid as pre-redesign; photos cover it.
    backgroundColor: '#fff1f5',
    alignItems: 'center',
    justifyContent: 'center',
    // No overflow:hidden — Avatar clips its own image; the online dot sits
    // on the circle's edge and must not be cut.
  },
  heroWeatherChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 100,
    backgroundColor: 'rgba(0,0,0,0.32)',
  },
  heroWeatherChipText: {
    color: '#fff',
    fontSize: 12.5,
    fontWeight: '700',
  },
  // The travelers/pending line between the hero and the weather strip —
  // replaces the old in-hero chips, still opens the members sheet.
  travelersRow: {
    marginTop: 10,
    alignSelf: 'flex-start',
    paddingVertical: 2,
  },
  travelersRowText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textSecondary,
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
    borderColor: theme.isDark ? theme.colors.borderPrimary : '#eaedf2',
    backgroundColor: theme.colors.surface,
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
    borderColor: theme.isDark ? theme.colors.borderPrimary : '#eceef2',
    backgroundColor: theme.colors.surface,
  },
  functionsCardIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.isDark ? theme.colors.primaryLight12 : '#fff0f4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  functionsCardBody: {
    flex: 1,
  },
  functionsCardTitle: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  functionsCardSubtitle: {
    marginTop: 2,
    color: theme.isDark ? theme.colors.textSecondary : '#8a909d',
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
    borderColor: theme.isDark ? theme.colors.borderPrimary : '#eaedf2',
    backgroundColor: theme.colors.surface,
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
    borderColor: theme.isDark ? theme.colors.borderPrimary : '#eceef2',
    backgroundColor: theme.colors.surface,
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
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  spotifyRowSubtitle: {
    marginTop: 2,
    color: theme.isDark ? theme.colors.textSecondary : '#8a909d',
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
    backgroundColor: theme.isDark ? theme.colors.successLight : '#e7f8ef',
  },
  spotifyRowBtnPrimaryText: {
    color: '#1cb35b',
    fontSize: 12,
    fontWeight: '800',
  },
  spotifyRowBtnGhost: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.isDark ? theme.colors.borderPrimary : '#e4e7ee',
  },
  spotifyRowBtnGhostText: {
    color: theme.colors.textPrimary,
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
    backgroundColor: theme.isDark ? theme.colors.bgLight : '#f3f6f4',
    marginRight: 8,
  },
  spotifyCopy: {
    flex: 1,
  },
  spotifyLabel: {
    color: theme.isDark ? theme.colors.textPrimary : '#1b2029',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  spotifyHint: {
    marginTop: 1,
    color: theme.isDark ? theme.colors.textMeta : '#8a92a0',
    fontSize: 11,
    lineHeight: 15,
  },
  spotifyUrlText: {
    marginTop: 8,
    color: theme.isDark ? theme.colors.textSecondary : '#4f5866',
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
    backgroundColor: theme.isDark ? theme.colors.successLight : '#eef8f1',
    borderWidth: 1,
    borderColor: theme.isDark ? theme.colors.successBorder : '#d3e9da',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  spotifyPrimaryButtonText: {
    color: theme.isDark ? theme.colors.success : '#167a3a',
    fontSize: 12,
    fontWeight: '700',
  },
  spotifyGhostButton: {
    minWidth: 76,
    minHeight: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.isDark ? theme.colors.borderPrimary : '#e0e5ec',
    backgroundColor: theme.colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 10,
  },
  spotifyGhostButtonText: {
    color: theme.isDark ? theme.colors.textSecondary : '#4e5664',
    fontSize: 12,
    fontWeight: '700',
  },
  spotifyEmptyButton: {
    marginTop: 8,
    minHeight: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.isDark ? theme.colors.borderPrimary : '#dde4e8',
    backgroundColor: theme.colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  spotifyEmptyButtonText: {
    color: theme.isDark ? theme.colors.textSecondary : '#4e5664',
    fontSize: 12,
    fontWeight: '700',
  },
  spotifyMessage: {
    marginTop: 6,
    color: theme.isDark ? theme.colors.textSecondary : '#79838f',
    fontSize: 11,
    lineHeight: 15,
  },
  spotifySheetBody: {
    paddingTop: 18,
    gap: 14,
  },
  spotifySheetCopy: {
    color: theme.isDark ? theme.colors.textSecondary : '#6c7480',
    fontSize: 14,
    lineHeight: 21,
  },
  spotifyInput: {
    minHeight: 56,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.isDark ? theme.colors.borderInput : '#e5e8ee',
    backgroundColor: theme.isDark ? theme.colors.bgLightest : '#f9fbfc',
    paddingHorizontal: 16,
    color: theme.isDark ? theme.colors.textPrimary : '#141821',
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
    borderColor: theme.isDark ? theme.colors.borderInput : '#e4e8ef',
    backgroundColor: theme.isDark ? theme.colors.surfaceElevated : '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  spotifySheetSecondaryButtonText: {
    color: theme.isDark ? theme.colors.textSecondary : '#525a67',
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
    backgroundColor: theme.colors.backdropModal,
    justifyContent: 'flex-end',
  },
  sheetCard: {
    maxHeight: '82%',
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    backgroundColor: theme.colors.bgPrimary,
    paddingTop: SPACING.md,
    paddingHorizontal: SPACING.lg,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: RADIUS.circle,
    backgroundColor: theme.colors.sheetHandle,
  },
  sheetHeader: {
    marginTop: SPACING.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  sheetEyebrow: {
    ...TYPOGRAPHY.eyebrow,
    color: theme.colors.textMeta,
  },
  sheetTitle: {
    marginTop: SPACING.xs,
    ...TYPOGRAPHY.pageHeading,
    color: theme.colors.textPrimary,
  },
  sheetCloseButton: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.circle,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bgLight,
  },
  sheetContent: {
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.sm,
    gap: SPACING.lg,
  },
  inviteCard: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: theme.isDark ? theme.colors.borderPrimary : '#ebedf2',
    backgroundColor: theme.isDark ? theme.colors.surfaceElevated : '#fff',
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: theme.isDark ? 0.2 : 0.04,
    shadowRadius: 20,
    elevation: theme.isDark ? 0 : 4,
  },
  inviteHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  inviteEyebrow: {
    color: theme.isDark ? theme.colors.textMeta : '#97a0ad',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  inviteTitle: {
    marginTop: 6,
    color: theme.colors.textPrimary,
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
    backgroundColor: theme.isDark ? theme.colors.primaryLight08 : '#fff3f6',
    borderWidth: 1,
    borderColor: theme.isDark ? theme.colors.primaryLight20 : '#ffd4de',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  inviteCodePillText: {
    color: theme.colors.primary,
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
    borderColor: theme.isDark ? theme.colors.borderInput : '#e6e9ef',
    backgroundColor: theme.isDark ? theme.colors.bgLightest : '#f9fafc',
    paddingHorizontal: 16,
    color: theme.colors.textPrimary,
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
    backgroundColor: theme.colors.primary,
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
    borderColor: theme.isDark ? theme.colors.primaryLight20 : '#ffd4de',
    backgroundColor: theme.isDark ? theme.colors.surfaceElevated : '#fff',
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  secondaryInviteButtonText: {
    color: theme.colors.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  inviteMessage: {
    marginTop: 12,
    color: theme.colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  peopleSection: {
    borderRadius: 26,
    borderWidth: 1,
    borderColor: theme.isDark ? theme.colors.borderPrimary : '#ebedf2',
    backgroundColor: theme.isDark ? theme.colors.surfaceElevated : '#fff',
    padding: 18,
  },
  peopleSectionTitle: {
    color: theme.colors.textPrimary,
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
    borderBottomColor: theme.isDark ? theme.colors.borderPrimary : '#f1f3f6',
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
    backgroundColor: theme.colors.avatarDark,
    marginRight: 12,
  },
  pendingAvatar: {
    backgroundColor: theme.isDark ? theme.colors.bgLight : '#f3f5f8',
  },
  inviteAvatar: {
    backgroundColor: theme.isDark ? theme.colors.primaryLight08 : '#fff2f5',
    borderWidth: 1.5,
    borderColor: theme.isDark ? theme.colors.primaryLight20 : '#ffd4de',
  },
  personCopy: {
    flex: 1,
  },
  personMenuButton: {
    padding: 6,
    marginLeft: 4,
  },
  personName: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  personMeta: {
    marginTop: 3,
    color: theme.isDark ? theme.colors.textSecondary : '#7b828e',
    fontSize: 13,
    fontWeight: '600',
  },
  peopleEmpty: {
    color: theme.isDark ? theme.colors.textSecondary : '#7b828e',
    fontSize: 14,
    fontWeight: '600',
  },
  inviteInlineWrap: {
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: theme.isDark ? theme.colors.borderPrimary : '#f1f3f6',
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
    backgroundColor: theme.isDark ? theme.colors.primaryLight08 : '#fff5f7',
    borderWidth: 1,
    borderColor: theme.isDark ? theme.colors.primaryLight20 : '#ffd6df',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  inviteHintLabel: {
    color: theme.isDark ? theme.colors.textSecondary : '#8f5665',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
  },
  inviteHintCode: {
    color: theme.colors.primary,
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
    color: theme.colors.textMeta,
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
    backgroundColor: theme.isDark ? theme.colors.primaryLight08 : '#fff6f8',
    borderWidth: 1,
    borderColor: theme.isDark ? theme.colors.primaryLight20 : '#ffd8e2',
  },
  miniCalendarWeekday: {
    color: theme.isDark ? theme.colors.primary : '#cf295f',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  miniCalendarDay: {
    marginTop: SPACING.xs,
    color: theme.colors.textPrimary,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  sectionEyebrow: {
    ...TYPOGRAPHY.eyebrow,
    color: theme.colors.textMeta,
  },
  sectionTitle: {
    marginTop: SPACING.sm,
    ...TYPOGRAPHY.pageHeading,
    color: theme.colors.textPrimary,
    fontSize: 30,
    lineHeight: 34,
    letterSpacing: -1.2,
  },
  sectionCopy: {
    marginTop: SPACING.sm,
    ...TYPOGRAPHY.body,
    color: theme.colors.textSecondary,
    lineHeight: 22,
  },
  emptyState: {
    marginTop: 18,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: theme.isDark ? theme.colors.borderPrimary : '#ebedf2',
    backgroundColor: theme.colors.surface,
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
    backgroundColor: theme.isDark ? theme.colors.bgLight : '#f5f6f8',
  },
  emptyTitle: {
    marginTop: 18,
    color: theme.colors.textPrimary,
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.8,
  },
  emptyCopy: {
    marginTop: 10,
    color: theme.isDark ? theme.colors.textSecondary : '#79808c',
    fontSize: 15,
    lineHeight: 23,
    textAlign: 'center',
  },
  errorText: {
    marginTop: 18,
    color: theme.colors.error,
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
    backgroundColor: theme.isDark ? theme.colors.avatarDark : '#f1f3f7',
    borderWidth: 1,
    borderColor: theme.isDark ? theme.colors.borderPrimary : '#e4e7ee',
  },
  reactionChipMine: {
    backgroundColor: theme.isDark ? theme.colors.primaryLight12 : '#ffe9ef',
    borderColor: theme.colors.primary,
  },
  reactionChipText: {
    fontSize: 12,
    color: theme.isDark ? theme.colors.textPrimary : '#3c4250',
    fontWeight: '600',
  },
  reactionOverlay: {
    flex: 1,
  },
  reactionScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  // Full-width strip anchored (via inline `top`) just above the message;
  // the picker card centers horizontally within it.
  reactionBarAnchor: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    // Keeps the bar off the screen edges — at full size the card is ~372dp
    // wide (7×44 buttons + gaps + padding), wider than narrow Android
    // screens (360dp), so the buttons below shrink to fit inside this.
    paddingHorizontal: 12,
  },
  reactionPickerCard: {
    maxWidth: '100%',
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: theme.isDark ? StyleSheet.hairlineWidth : 0,
    borderColor: theme.colors.borderPrimary,
    borderRadius: 28,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: theme.isDark ? 0.5 : 0.25,
    shadowRadius: 32,
    elevation: theme.isDark ? 0 : 12,
  },
  reactionEmojiRow: {
    flexDirection: 'row',
    gap: 6,
  },
  reactionEmojiButton: {
    // flexBasis instead of a fixed width lets all buttons compress evenly
    // on screens too narrow for the full-size bar (≈40dp each at 360dp).
    flexBasis: 44,
    flexShrink: 1,
    minWidth: 0,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionEmojiButtonMine: {
    backgroundColor: theme.isDark ? theme.colors.primaryLight12 : '#ffe9ef',
  },
  reactionEmojiText: {
    fontSize: 24,
  },
  reactionAddButton: {
    flexBasis: 44,
    flexShrink: 1,
    minWidth: 0,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.isDark ? theme.colors.avatarDark : '#f1f3f7',
  },
  reactionAddButtonActive: {
    backgroundColor: theme.isDark ? theme.colors.primaryLight12 : '#ffe9ef',
  },
  // The reacted message copy, rendered at its exact rect and lifted forward
  // with a soft shadow so it reads above the blur.
  reactionPreviewBubble: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: theme.isDark ? 0.5 : 0.35,
    shadowRadius: 22,
    elevation: theme.isDark ? 0 : 12,
  },
  deleteActionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: theme.isDark ? StyleSheet.hairlineWidth : 0,
    borderColor: theme.colors.borderPrimary,
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: theme.isDark ? 0.4 : 0.2,
    shadowRadius: 24,
    elevation: theme.isDark ? 0 : 10,
  },
  deleteActionText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#E5484D',
  },
  emojiGridBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  emojiGridCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: theme.isDark ? StyleSheet.hairlineWidth : 0,
    borderColor: theme.colors.borderPrimary,
    borderRadius: 22,
    paddingHorizontal: 12,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: theme.isDark ? 0.5 : 0.25,
    shadowRadius: 32,
    elevation: theme.isDark ? 0 : 12,
  },
  emojiGridWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 4,
  },
  emojiGridCell: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiGridText: {
    fontSize: 24,
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
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.isDark ? theme.colors.borderPrimary : '#eceef2',
    shadowColor: '#11131a',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: theme.isDark ? 0.4 : 0.12,
    shadowRadius: 24,
    elevation: theme.isDark ? 0 : 8,
  },
  // marginTop adds breathing room between the "Reseverktyg" header and the
  // first row; paddingBottom is overridden inline with the safe-area inset.
  toolsList: { gap: 8, marginTop: 20, paddingBottom: 8 },
  toolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.isDark ? theme.colors.borderPrimary : '#eceef2',
    backgroundColor: theme.isDark ? theme.colors.surfaceElevated : '#fff',
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
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  toolRowSpotifyOpen: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 14,
    backgroundColor: theme.isDark ? theme.colors.successLight : '#e7f8ef',
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 6,
  },
  toolRowSpotifyOpenText: {
    color: '#1cb35b',
    fontSize: 12,
    fontWeight: '800',
  },
  spotifySheetOpenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 14,
    backgroundColor: theme.isDark ? theme.colors.successLight : '#e7f8ef',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  spotifySheetOpenText: {
    flex: 1,
    color: theme.isDark ? theme.colors.success : '#14803c',
    fontSize: 13,
    fontWeight: '600',
  },
  chatBubble: {
    width: 58,
    height: 58,
    borderRadius: RADIUS.circle,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.secondary,
    shadowColor: theme.colors.secondary,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: theme.isDark ? 0.45 : 0.22,
    shadowRadius: 24,
    elevation: theme.isDark ? 0 : 8,
  },
  chatUnreadDot: {
    position: 'absolute',
    top: SPACING.sm,
    right: SPACING.sm,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: theme.colors.primary,
    borderWidth: 2,
    borderColor: theme.colors.bgPrimary,
  },
  chatModalBackdrop: {
    flex: 1,
    backgroundColor: theme.isDark ? theme.colors.backdropModal : 'rgba(9,11,17,0.42)',
    paddingHorizontal: 14,
  },
  chatKeyboardAvoider: {
    flex: 1,
  },
  chatPanel: {
    flex: 1,
    borderRadius: 30,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: theme.isDark ? StyleSheet.hairlineWidth : 0,
    borderColor: theme.colors.borderPrimary,
    paddingHorizontal: 16,
  },
  chatPanelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.isDark ? theme.colors.borderPrimary : '#eef1f5',
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
    borderBottomColor: theme.isDark ? theme.colors.borderPrimary : '#eef1f5',
  },
  chatPresenceBubble: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: theme.isDark ? 'rgba(34,174,199,0.16)' : '#e8f4f7',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: theme.colors.surfaceElevated,
  },
  chatPresenceBubbleText: {
    fontSize: 10,
    fontWeight: '800',
    color: theme.colors.secondary,
  },
  chatPresenceLabel: {
    ...TYPOGRAPHY.meta,
    color: theme.colors.textSecondary,
    fontWeight: '600',
    marginLeft: 2,
  },
  chatTypingRow: {
    height: 18,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  chatTypingText: {
    ...TYPOGRAPHY.meta,
    fontStyle: 'italic',
    color: theme.isDark ? theme.colors.textMeta : '#8a919d',
  },
  weatherStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.isDark ? theme.colors.borderPrimary : '#eef1f5',
    backgroundColor: theme.isDark ? theme.colors.bgLightest : '#fff',
  },
  weatherStripText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textPrimary,
  },
  chatPanelEyebrow: {
    ...TYPOGRAPHY.eyebrow,
    color: theme.colors.textMeta,
  },
  chatPanelTitle: {
    marginTop: SPACING.xs,
    ...TYPOGRAPHY.pageHeading,
    color: theme.colors.textPrimary,
    fontSize: 26,
  },
  chatPanelClose: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.isDark ? theme.colors.bgLight : '#f5f6f8',
  },
  floatingButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: theme.colors.primary,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: theme.isDark ? 0.45 : 0.24,
    shadowRadius: 24,
    elevation: theme.isDark ? 0 : 8,
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
    color: theme.isDark ? theme.colors.textMeta : '#a4aab4',
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
    color: theme.isDark ? theme.colors.textMeta : '#a4aab4',
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
    backgroundColor: theme.colors.avatarDark,
    alignItems: 'center',
    justifyContent: 'center',
    // No overflow:hidden — Avatar clips its own image and the online dot
    // must be able to sit on the circle's edge.
    flexShrink: 0,
  },
  chatMessageContent: {
    flex: 1,
    minWidth: 0,
    maxWidth: '70%',
  },
  chatAuthor: {
    marginBottom: 3,
    color: theme.isDark ? theme.colors.textSecondary : '#9aa2ae',
    fontSize: 11,
    fontWeight: '700',
  },
  chatBubbleCard: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    borderRadius: 20,
    backgroundColor: theme.isDark ? theme.colors.avatarDark : '#f3f5f8',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  chatBubbleCardOwn: {
    alignSelf: 'flex-end',
    maxWidth: '70%',
    backgroundColor: theme.colors.primary,
  },
  chatMessagePending: {
    opacity: 0.55,
  },
  chatBubbleCardFailed: {
    borderWidth: 1.5,
    borderColor: theme.colors.error,
  },
  chatStatusPending: {
    alignSelf: 'flex-end',
    marginTop: 3,
    fontSize: 11,
    fontWeight: '600',
    color: theme.isDark ? theme.colors.textMeta : '#a4aab4',
  },
  chatStatusFailed: {
    alignSelf: 'flex-end',
    marginTop: 3,
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.error,
  },
  chatErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: theme.colors.errorLight,
    borderWidth: 1,
    borderColor: theme.colors.errorBorder,
  },
  chatErrorBannerText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.error,
  },
  chatSkeletonWrap: {
    flex: 1,
    paddingTop: 18,
    gap: 10,
  },
  chatSkeletonBubble: {
    height: 38,
    borderRadius: 18,
    backgroundColor: theme.isDark ? theme.colors.avatarDark : '#f0f1f4',
  },
  chatBubbleText: {
    color: theme.colors.textPrimary,
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
    color: theme.colors.primary,
    textDecorationLine: 'underline',
  },
  linkPreviewInline: {
    flexDirection: 'row',
    borderRadius: 10,
    backgroundColor: theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0, 0, 0, 0.05)',
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
    color: theme.colors.textPrimary,
    marginBottom: 2,
  },
  linkPreviewInlineTitleOwn: {
    color: '#fff',
  },
  linkPreviewInlineDescription: {
    fontSize: 12,
    color: theme.isDark ? theme.colors.textSecondary : '#8a909d',
    marginBottom: 3,
  },
  linkPreviewInlineDescriptionOwn: {
    color: 'rgba(255, 255, 255, 0.8)',
  },
  linkPreviewInlineUrl: {
    fontSize: 11,
    color: theme.isDark ? theme.colors.textMeta : '#a4aab4',
    fontWeight: '500',
  },
  linkPreviewInlineUrlOwn: {
    color: 'rgba(255, 255, 255, 0.6)',
  },
  chatMeta: {
    marginTop: 4,
    color: theme.isDark ? theme.colors.textSecondary : '#9aa2ae',
    fontSize: 11,
    fontWeight: '700',
  },
  chatBlockNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: theme.isDark ? theme.colors.bgLight : '#f0f2f5',
    borderRadius: 10,
    marginBottom: 6,
  },
  chatBlockNoticeText: {
    flex: 1,
    fontSize: 12,
    color: theme.isDark ? theme.colors.textSecondary : '#5c6370',
    fontWeight: '500',
  },
  chatHiddenNotice: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    alignItems: 'center',
  },
  chatHiddenNoticeText: {
    fontSize: 11,
    color: theme.isDark ? theme.colors.textMeta : '#a3a9b4',
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
    backgroundColor: theme.isDark ? 'rgba(245,166,35,0.14)' : '#fef3c7',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.isDark ? 'rgba(245,166,35,0.35)' : '#fcd34d',
  },
  chatBlockedBannerText: {
    flex: 1,
    fontSize: 12,
    color: theme.isDark ? theme.colors.warning : '#92400e',
    fontWeight: '600',
  },
  chatAuthorBlocked: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.isDark ? theme.colors.textMuted : '#b0b6c1',
    marginBottom: 3,
  },
  chatBubbleBlocked: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: theme.isDark ? theme.colors.bgLight : '#f0f2f5',
    borderRadius: 14,
    borderTopLeftRadius: 4,
    alignSelf: 'flex-start',
  },
  chatBubbleBlockedText: {
    fontSize: 13,
    color: theme.isDark ? theme.colors.textMeta : '#a3a9b4',
    fontStyle: 'italic',
  },
  chatComposer: {
    flexDirection: 'row',
    // Bottom-anchored: when the input grows to multiple lines the buttons
    // stay naturally next to the last text line instead of floating mid-air.
    alignItems: 'flex-end',
    gap: 7,
    marginTop: 6,
  },
  // NO `flex` and NO fixed height here: the input must keep its intrinsic
  // content height so the multiline field wraps at the right edge and
  // grows natively between minHeight and maxHeight. Width comes from the
  // wrapper (flex: 1, minWidth: 0 in the composer row) via cross-axis
  // stretch — a flex-basis on the input itself defeats intrinsic sizing.
  chatInput: {
    minHeight: CHAT_INPUT_MIN_HEIGHT,
    maxHeight: CHAT_INPUT_MAX_HEIGHT,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: theme.isDark ? theme.colors.borderInput : '#e6e9ef',
    backgroundColor: theme.isDark ? theme.colors.bgLightest : '#f9fafc',
    paddingHorizontal: 12,
    // Multiline TextInput defaults to top-aligned text on both platforms —
    // without this the placeholder/draft sits at the top of the 38px box
    // instead of centered. textAlignVertical only affects Android; the
    // paddingVertical keeps a single line of text centered on iOS too.
    paddingVertical: 9,
    textAlignVertical: 'center',
    color: theme.colors.textPrimary,
    fontSize: 14,
  },
  chatSendButton: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primary,
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
  // Visually compact (roughly half the old 44px footprint) — the hitSlop
  // on the composer buttons keeps the effective touch target ~44px.
  chatAttachButton: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.isDark ? theme.colors.bgLight : '#f1f3f6',
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
    // paddingTop (not marginTop): visually identical for this transparent
    // full-width container, but keeps the day gap INSIDE the connector host
    // so the journey line runs unbroken through it.
    paddingTop: SPACING.xl,
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginBottom: SPACING.sm,
  },
  dayHeaderText: {
    ...TYPOGRAPHY.cardTitle,
    color: theme.colors.textPrimary,
    fontWeight: '800',
  },
  dayHeaderDay: {
    ...TYPOGRAPHY.meta,
    color: theme.colors.textMeta,
  },
  dayHeaderLine: {
    flex: 1,
    height: 1,
    backgroundColor: theme.colors.borderPrimary,
    marginLeft: SPACING.xs,
  },
  dayLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    marginTop: -4,
    marginBottom: SPACING.sm,
    paddingLeft: 2,
  },
  dayLocationText: {
    ...TYPOGRAPHY.meta,
    color: theme.colors.textMeta,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.md,
  },
  // ── Hotel-reservation surface family ─────────────────────────────────────
  // One visual identity chains the whole stay through the feed: the anchor
  // card on the check-in day, the "night X of Y" rows, and the check-out row
  // all share the amber wash + left accent bar (colors: the stay* theme tokens).
  // Quiet by design — elevation through tint, never shadow.
  stayAnchorSurface: {
    backgroundColor: theme.colors.staySurface,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    marginVertical: 2,
  },
  // The accent is the connector: identical x-position, width, radius and
  // vertical inset on EVERY stay row (anchor, nights, check-out), so the eye
  // chains them into one reservation across day groups — Apple
  // Calendar/Flighty rhythm, without a literal line through the feed.
  stayAccentBar: {
    position: 'absolute',
    left: 0,
    top: 8,
    bottom: 8,
    width: 3,
    borderRadius: 2,
    backgroundColor: theme.colors.stayAccent,
  },
  stayTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  stayTitleShrink: {
    flexShrink: 1,
  },
  stayNightsPill: {
    backgroundColor: theme.colors.stayPillBackground,
    borderWidth: 1,
    borderColor: theme.colors.stayPillBorder,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  stayNightsPillText: {
    color: theme.colors.stayTextMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: -0.1,
  },
  // Ambient continuation rows (night X of Y / check-out): the same family,
  // one shade lighter and compact — non-draggable context, not cards.
  stayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 8,
    // Same left inset as the anchor surface (SPACING.md) so text starts at
    // the same x throughout the reservation family.
    paddingLeft: SPACING.md,
    paddingRight: 10,
    backgroundColor: theme.colors.staySurfaceSubtle,
    borderRadius: RADIUS.sm,
    marginVertical: 2,
  },
  stayAccentBarSlim: {
    position: 'absolute',
    left: 0,
    top: 8,
    bottom: 8,
    width: 3,
    borderRadius: 2,
    backgroundColor: theme.colors.stayAccent,
  },
  stayRowTitle: {
    flexShrink: 1,
    color: theme.colors.stayText,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  stayRowLabel: {
    flex: 1,
    color: theme.colors.stayTextMuted,
    fontSize: 12,
    fontWeight: '600',
    opacity: 0.85,
  },
  // Anchor-card reservation line ("Incheckning 5 aug · Utcheckning 7 aug").
  stayBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  stayBadgeText: {
    color: theme.colors.stayTextMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  timelineTime: {
    ...TYPOGRAPHY.meta,
    color: theme.colors.textMeta,
    marginLeft: SPACING.sm,
  },
  // Continuous itinerary connector: one thin segment per feed row, absolute
  // behind the row content and spanning the host's FULL height (including
  // card margins), so consecutive rows' segments meet with no gaps. It runs
  // down the center of the 42px icon column (x = 21); opaque surfaces —
  // hotel reservation cards, night/checkout rows, dark sealed cards — simply
  // sit on top of it, letting the line pass underneath. Semantic divider
  // color in both themes.
  connectorHost: {
    position: 'relative',
  },
  timelineConnector: {
    position: 'absolute',
    left: 20,
    top: 0,
    bottom: 0,
    width: 2,
    borderRadius: 1,
    backgroundColor: theme.colors.borderPrimary,
  },
  // The trip's very first row: the journey line begins at the header's own
  // center rather than bleeding off the top of the feed.
  timelineConnectorFromCenter: {
    top: '50%',
  },
  // Day-header date label paints the page color behind itself so it overlays
  // the connector cleanly (no layout change — same text box, opaque fill).
  dayHeaderTextOverlay: {
    backgroundColor: theme.colors.bgPrimary,
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
    backgroundColor: theme.colors.avatarDark,
  },
  timelineBody: {
    flex: 1,
    minWidth: 0,
  },
  timelineTitle: {
    ...TYPOGRAPHY.cardTitle,
    color: theme.colors.textPrimary,
    fontWeight: '800',
  },
  timelineSubtitle: {
    marginTop: 2,
    ...TYPOGRAPHY.meta,
    color: theme.colors.textMeta,
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
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.isDark ? theme.colors.borderPrimary : '#ebedf2',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: theme.isDark ? 0.2 : 0.05,
    shadowRadius: 12,
    elevation: theme.isDark ? 0 : 2,
  },
  categoryCardAddButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primary,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: theme.isDark ? 0 : 4,
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
    color: theme.isDark ? theme.colors.textMeta : '#8a919d',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  categoryItemName: {
    marginTop: 4,
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  categoryCount: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.isDark ? theme.colors.textMeta : '#8a919d',
  },
  categoryModalOverlay: {
    flex: 1,
    backgroundColor: theme.isDark ? theme.colors.backdropModal : 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  categoryModalContent: {
    backgroundColor: theme.colors.surfaceElevated,
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
    backgroundColor: theme.isDark ? theme.colors.bgLight : '#f5f6f8',
  },
  categoryModalAddButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primary,
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
    color: theme.isDark ? theme.colors.textMeta : '#8a919d',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  categoryModalCount: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textPrimary,
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
    backgroundColor: theme.isDark ? theme.colors.bgLightest : '#f9fafc',
    borderWidth: 1,
    borderColor: theme.isDark ? theme.colors.borderPrimary : '#ebedf2',
  },
  lockedBadge: {
    backgroundColor: theme.isDark ? theme.colors.bgLight : '#f5f6f8',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  lockedBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: theme.isDark ? theme.colors.textMeta : '#8a919d',
    letterSpacing: 0.5,
  },
  categoryModalActivityTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  categoryModalActivityDate: {
    fontSize: 13,
    color: theme.isDark ? theme.colors.textMeta : '#8a919d',
    marginTop: 4,
  },
});
