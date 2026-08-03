import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/components/auth-provider';
import GlunoComposer from '@/components/gluno/GlunoComposer';
import GlunoEmptyState from '@/components/gluno/GlunoEmptyState';
import GlunoMascot from '@/components/gluno/GlunoMascot';
import GlunoMessageRow from '@/components/gluno/GlunoMessageRow';
import GlunoProposalReview from '@/components/gluno/GlunoProposalReview';
import GlunoScopePicker from '@/components/gluno/GlunoScopePicker';
import { useI18n } from '@/components/i18n-provider';
import { useTheme } from '@/components/theme-provider';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { invalidateTripCache } from '@/lib/cache';
import {
  applyGlunoProposal,
  getCurrentGlunoConversation,
  getGlunoMessagePage,
  getGlunoStatus,
  rejectGlunoProposal,
  createGlunoIdempotencyKey,
  isGlunoCancellation,
  addGlunoRecommendedPlace,
  refreshGlunoPlaceSuggestions,
  resolveGlunoClarification,
  searchGlunoClarification,
  sendGlunoMessage,
  updateGlunoProposal,
  type GlunoApiMessage,
  type GlunoClarification,
  type GlunoClarificationOption,
  type GlunoPlace,
  type GlunoApplyResponse,
  type GlunoProposal,
  type GlunoRequestError,
  type GlunoTurnAction,
  type GlunoStatus,
} from '@/lib/gluno';
import { buildGlunoDebugExport } from '@/lib/gluno-debug-export';
import {
  mergeGlunoMessages,
  readGlunoCache,
  writeGlunoCache,
  type GlunoChatMessage,
} from '@/lib/gluno-cache';
import type { AppTheme } from '@/constants/themes';

// ──────────────────────────────────────────────────────────────────────────
// GLUNO — the assistant chat screen.
//
// A real pushed screen, not a sheet: it has its own back navigation, its own
// header identity, and a conversation that outlives a tab switch. It is
// deliberately NOT the Adventure chat with a different avatar — the member
// chat is a stream of short messages between people, this is a Q&A with an
// expert, and the two need different shapes (see GlunoMessageRow).
//
// Three behaviours worth knowing before changing anything here:
//
//   • Opening never creates a conversation. The screen asks the backend for
//     the CURRENT one for this scope; a conversation row is written only when
//     the first message is actually sent. Otherwise every open would leave an
//     empty conversation behind.
//
//   • The list is inverted. That is what makes "load older when you scroll up"
//     the same mechanic as onEndReached, and it keeps scroll position stable
//     when a page is prepended — a non-inverted list visibly jumps.
//
//   • Auto-scroll is conditional. Reading back through an answer while Gluno
//     is still writing must not yank the view to the bottom, so the list only
//     follows new content when the user is already near it.
// ──────────────────────────────────────────────────────────────────────────

/** How close to the newest message counts as "following along". */
const NEAR_BOTTOM_THRESHOLD_PX = 90;

/**
 * How long a turn has to take before it says it is working.
 *
 * Long enough that a fast answer never flashes a status, short enough that a
 * slow one is never a silent screen. Roughly the point where a wait stops
 * reading as responsiveness and starts reading as nothing happening.
 */
const WAITING_VISIBLE_AFTER_MS = 350;

function createLocalId() {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * API shape → what the list renders. System and tool turns never become rows.
 *
 * `live` marks rows applied straight from a turn RESPONSE, as opposed to a
 * history or page load. It describes the transport, nothing else — the
 * producing code path is `responseOrigin`, which both kinds of row may carry.
 */
function toChatMessages(messages: GlunoApiMessage[], live = false): GlunoChatMessage[] {
  return messages
    .filter((message) => message.isRenderable)
    .map((message) => ({
      live: live || undefined,
      id: message.id,
      role: message.role === 'assistant' ? ('gluno' as const) : ('user' as const),
      text: message.text,
      createdAt: message.createdAt,
      proposals: message.proposals?.length ? message.proposals : undefined,
      places: message.places?.length ? message.places : undefined,
      navigations: message.navigations?.length ? message.navigations : undefined,
      sources: message.sources?.length ? message.sources : undefined,
      // Restored from history, so reopening the chat brings the card back
      // rather than a question with nothing to tap.
      clarification: message.clarification ?? undefined,
      // The producing branch, now stored server-side — history rows carry it
      // too. Which TRANSPORT delivered the row is `live`, set only by the
      // handler that applied a live response; the two are separate facts.
      responseOrigin: message.responseOrigin ?? undefined,
    }));
}

export default function GlunoScreen() {
  const styles = useThemedStyles(createStyles);
  const { theme } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const params = useLocalSearchParams<{ tripId?: string; tripTitle?: string; screen?: string }>();
  const tripId = typeof params.tripId === 'string' && params.tripId.length > 0 ? params.tripId : null;
  const tripTitle = typeof params.tripTitle === 'string' ? params.tripTitle : null;
  // Where the user opened Gluno from. Only shortens help — the backend drops
  // anything it does not recognise, and nothing acts on it.
  const fromScreen = typeof params.screen === 'string' && params.screen.length > 0 ? params.screen : null;

  const userId = user?.id ?? 'anonymous';

  /**
   * THE authoritative scope identity. Everything else is derived from it.
   *
   * Before this existed the screen had several competing truths — the route
   * param, the cached entry, the conversation's own tripId, and the header
   * label — and switching Adventure moved them at different times.
   */
  const scope = tripId ? `adventure:${tripId}` : 'all_adventures';

  const cached = readGlunoCache(userId, tripId);

  /**
   * Which scope the state held by this component belongs to.
   *
   * THE BUG THIS FIXES. Choosing an Adventure calls router.replace on the same
   * route, so the param changes and the component does NOT remount — every
   * useState initialiser above keeps the previous Adventure's values. The
   * cache-mirror effect below has tripId in its dependencies, so it fired
   * immediately and wrote the OLD conversation's messages under the NEW
   * scope's key. That entry carries loaded: true, so the loader then skipped
   * the fetch and the new Adventure showed the old one's chat under its name,
   * permanently and across switches.
   */
  const stateScope = useRef(scope);

  const [conversationId, setConversationId] = useState<string | null>(cached?.conversationId ?? null);
  // Route param first (instant on open), replaced by the API's value as soon
  // as a conversation is loaded or created — that one survives a rename.
  const [tripName, setTripName] = useState<string | null>(cached?.tripTitle ?? tripTitle);
  const [messages, setMessages] = useState<GlunoChatMessage[]>(cached?.messages ?? []);
  const [hasMore, setHasMore] = useState(cached?.hasMore ?? false);
  const [loading, setLoading] = useState(!cached?.loaded);
  /**
   * The server has confirmed what scope this conversation actually has.
   *
   * Until it does the pill shows nothing rather than the route's claim: a pill
   * that says "Semester 2026" and then turns out to be a global chat has
   * already told the user something untrue.
   */
  const [scopeVerified, setScopeVerified] = useState(Boolean(cached?.loaded));
  /** Membership is gone. Distinct from a failed load, and not recoverable here. */
  const [scopeLost, setScopeLost] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [sending, setSending] = useState(false);
  /**
   * Whether the waiting line has earned its place on screen.
   *
   * SEPARATE FROM `sending` because a fast answer should not flash a status and
   * take it away again — that reads as a glitch, not as progress. Below the
   * threshold the turn simply completes and the answer appears.
   */
  const [waitingVisible, setWaitingVisible] = useState(false);
  const [status, setStatus] = useState<GlunoStatus | null>(null);
  /** Drives only the composer's bottom inset — see the listener below. */
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  /** The check is in flight. Distinct from "the answer was no". */
  const [statusLoading, setStatusLoading] = useState(true);
  /** The check could not complete AND we have nothing older to fall back on. */
  const [statusFailed, setStatusFailed] = useState(false);
  const [draft, setDraft] = useState('');
  const [loadFailed, setLoadFailed] = useState(false);
  const [reviewProposal, setReviewProposal] = useState<GlunoProposal | null>(null);
  const [applying, setApplying] = useState(false);
  /** A day plan being re-laid by the schedule engine after an edit. */
  const [revalidating, setRevalidating] = useState(false);
  const [applyNotice, setApplyNotice] = useState<string | null>(null);
  /** A transcript copy in flight. Blocks a second press. */
  const [copying, setCopying] = useState(false);

  // ── The atomic scope switch ───────────────────────────────────────────
  //
  // Adjusted during RENDER rather than in an effect, deliberately: an effect
  // runs after the commit, so the previous Adventure's messages would paint
  // once under the new Adventure's name before being replaced. Setting state
  // here makes React re-render before committing, so that frame never reaches
  // the screen — and, critically, it happens BEFORE the cache-mirror effect
  // below can write the old state under the new key.
  if (stateScope.current !== scope) {
    stateScope.current = scope;

    const entry = readGlunoCache(userId, tripId);

    setConversationId(entry?.conversationId ?? null);
    setTripName(entry?.tripTitle ?? tripTitle);
    setMessages(entry?.messages ?? []);
    setHasMore(entry?.hasMore ?? false);
    setLoading(!entry?.loaded);
    setScopeVerified(Boolean(entry?.loaded));
    // Per-scope conditions. Carrying them across would report the previous
    // Adventure's problem as this one's.
    setScopeLost(false);
    setLoadFailed(false);
    setSending(false);
    setWaitingVisible(false);
  }

  const listRef = useRef<FlatList<GlunoChatMessage>>(null);
  const inputRef = useRef<TextInput>(null);
  const nearBottomRef = useRef(true);
  const mountedRef = useRef(true);
  /** Read inside the status check without making it depend on the state. */
  const statusRef = useRef<GlunoStatus | null>(null);
  /** The turn in flight, so Stop can abort exactly it and no other. */
  const abortRef = useRef<AbortController | null>(null);
  /** localId -> idempotency key, so a retry reuses the original message's key. */
  const idempotencyKeysRef = useRef(new Map<string, string>());

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Only to decide whether the home-indicator inset still applies below the
  // composer. `Will*` on iOS so the padding changes with the keyboard's own
  // animation rather than a frame after it; Android only emits `Did*`.
  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setKeyboardVisible(true));
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardVisible(false));

    return () => { show.remove(); hide.remove(); };
  }, []);

  useEffect(() => { statusRef.current = status; }, [status]);

  // Mirror every change into the session cache so leaving and coming back is
  // instant and does not re-fetch. In memory only — see lib/gluno-cache.ts.
  useEffect(() => {
    // Belt to the render-phase reset's braces. The state and the key must
    // describe the same scope; writing one Adventure's messages under
    // another's key is the failure this whole block exists to prevent, and it
    // is invisible once it has happened.
    if (stateScope.current !== scope) return;

    writeGlunoCache(userId, tripId, { conversationId, tripTitle: tripName, messages, hasMore, loaded: !loading });
  }, [scope, userId, tripId, conversationId, tripName, messages, hasMore, loading]);

  // Availability first: a screen that cannot answer should say so before the
  // user types a question into it.
  //
  // A FAILED CHECK IS NOT AN ANSWER. A timeout, a sleeping backend or a phone
  // on a bad connection says nothing about whether Gluno exists in this
  // environment — so it becomes a retry error, never the "not available here"
  // notice. Getting that wrong tells someone the feature was taken away when
  // their wifi dropped.
  const checkStatus = useCallback(async () => {
    setStatusFailed(false);
    setStatusLoading(true);

    try {
      const result = await getGlunoStatus();
      if (mountedRef.current) setStatus(result);
    } catch {
      if (!mountedRef.current) return;

      // A previous good answer stays on screen. It was true a moment ago and
      // is far better evidence than a request that did not complete.
      if (!statusRef.current) setStatusFailed(true);
    } finally {
      if (mountedRef.current) setStatusLoading(false);
    }
  }, []);

  useEffect(() => { void checkStatus(); }, [checkStatus]);

  // One page, once per scope per session. Anything already cached is shown as
  // it is — re-fetching on every open is exactly what point 3 of the brief
  // rules out, and conversations only ever change from this device.
  useEffect(() => {
    if (cached?.loaded) return;

    let cancelled = false;
    setLoading(true);
    setLoadFailed(false);

    getCurrentGlunoConversation(tripId)
      .then((detail) => {
        if (cancelled) return;
        if (!detail) {
          // No conversation for this scope yet. Not an error — the first
          // message creates one, and it will carry this tripId.
          setScopeVerified(true);
          return;
        }

        // ── The scope the SERVER says this conversation has ───────────────
        //
        // Not the route parameter. A conversation is trip-scoped because its
        // row says so, and a URL saying `?tripId=…` is a request, not a fact.
        //
        // The backend query is exact, so a mismatch here means something is
        // genuinely wrong — a cached id from another Adventure, a hand-edited
        // link. Either way the safe move is to use nothing: an empty chat that
        // scopes correctly on the first message beats one showing another
        // Adventure's turns under this Adventure's name.
        const serverTripId = detail.conversation.tripId ?? null;

        if (serverTripId !== tripId) {
          setScopeVerified(true);
          return;
        }

        setConversationId(detail.conversation.id);
        setTripName(detail.conversation.tripTitle ?? tripTitle);
        setMessages(toChatMessages(detail.messages));
        setHasMore(detail.hasMore);
        setScopeVerified(true);
      })
      .catch((error: Error & { status?: number }) => {
        if (cancelled) return;

        // Membership went while they were away. Said plainly rather than
        // quietly reopening as a global chat — silently widening somebody's
        // scope is how a question about a private trip gets asked in the open.
        if (error?.status === 403 || error?.status === 404) {
          setScopeLost(true);
          return;
        }

        setLoadFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // `cached` is read once at mount for this scope; re-running on every cache
    // write would re-enter the fetch after each message.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  const scrollToLatest = useCallback(() => {
    // Inverted list: offset 0 IS the newest message.
    requestAnimationFrame(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }));
  }, []);

  const appendAndFollow = useCallback(
    (updater: (current: GlunoChatMessage[]) => GlunoChatMessage[]) => {
      setMessages(updater);
      if (nearBottomRef.current) scrollToLatest();
    },
    [scrollToLatest],
  );

  async function deliver(text: string, localId: string, idempotencyKey: string) {
    // One controller per in-flight turn. Stop aborts this one; a late response
    // from a previous, already-abandoned turn is ignored by the identity check
    // below rather than being allowed to overwrite the current state.
    const controller = new AbortController();
    abortRef.current = controller;
    setSending(true);

    // ── The waiting line ──────────────────────────────────────────────────
    //
    // Held back briefly so a turn that answers quickly never shows one. A
    // status that appears and vanishes inside a couple of frames reads as a
    // flicker, and the answer arriving IS the feedback in that case.
    const waitTimer = setTimeout(() => setWaitingVisible(true), WAITING_VISIBLE_AFTER_MS);

    try {
      const turn = await sendGlunoMessage({
        message: text,
        conversationId,
        tripId,
        screen: fromScreen,
        idempotencyKey,
        signal: controller.signal,
      });

      // A response that arrives after the user stopped, or after they started
      // another turn, must not touch the list.
      if (abortRef.current !== controller) return true;

      setConversationId(turn.conversation.id);
      setTripName(turn.conversation.tripTitle ?? tripTitle);
      // The turn's conversation is authoritative about scope too. A first
      // message into an empty Adventure chat is exactly where the pill goes
      // from unverified to verified.
      setScopeVerified(true);

      if (__DEV__) {
        // A fixed vocabulary value and an id. Never the answer, never the
        // question — and never on screen.
        console.log(
          `[GLUNO] turn origin=${turn.responseOrigin ?? 'none'} `
          + `messageId=${turn.assistantMessage.id}`,
        );
      }

      // The optimistic row is REPLACED by the server's, not joined by it —
      // same list position, real id, real timestamp, no duplicate.
      appendAndFollow((current) => {
        const withoutLocal = current.filter((message) => message.id !== localId);
        const rows = toChatMessages([turn.userMessage, turn.assistantMessage], true);

        // The card belongs to the assistant turn that asked the question.
        const last = rows[rows.length - 1];
        if (turn.clarification && last) last.clarification = turn.clarification;
        // Kept on the row so a copied transcript can say which path wrote it.
        if (turn.responseOrigin && last) last.responseOrigin = turn.responseOrigin;
        // Same for a retry the server offered — it belongs to the turn that
        // failed, not to the screen.
        if (turn.action && last) last.action = turn.action;

        return mergeGlunoMessages(withoutLocal, rows);
      });
      return true;
    } catch (error) {
      if (abortRef.current !== controller) return true;

      // A deliberate stop is not a failure. The question stays in the list,
      // unmarked, and the user can send another straight away — a red bubble
      // here would tell them something broke when they chose it.
      if (isGlunoCancellation(error)) {
        setMessages((current) =>
          current.map((message) =>
            message.id === localId ? { ...message, pending: false, failed: false } : message,
          ),
        );
        return true;
      }

      const failure = error as GlunoRequestError;
      if (failure.status === 503) {
        // The backend refused this turn as unavailable. Re-ask rather than
        // assuming: 503 is also what a restarting or briefly overloaded
        // backend returns, and latching the screen to "not available here"
        // over one request would outlive the cause.
        void checkStatus();
      }

      setMessages((current) =>
        current.map((message) =>
          message.id === localId
            ? {
                ...message,
                pending: false,
                failed: true,
                errorStatus: failure.status,
                failureCode: failure.code,
                // Whether retry is honest comes from the SERVER. Only it knows
                // if a missing key (never) or a timeout (often) caused this.
                //
                // Left UNDEFINED when the server said nothing, rather than
                // defaulted to true. Defaulting here overwrote the absence
                // before the row could see it, so the row's own knowledge of
                // which codes are terminal never got a chance to apply.
                retryable: failure.retryable,
              }
            : message,
        ),
      );
      return false;
    } finally {
      // Cleared whatever happened — answered, failed or stopped. A pending
      // timer would otherwise reveal the status after the turn was over.
      clearTimeout(waitTimer);
      setWaitingVisible(false);

      if (abortRef.current === controller) {
        abortRef.current = null;
        setSending(false);
      }
    }
  }

  /**
   * Answers a clarification and appends the continuation.
   *
   * The original question is NOT resent — the backend remembers which turn it
   * was asking about. What lands here is the answer to that question, so the
   * card is marked resolved in place and the reply appears under it.
   */
  const handleResolveClarification = useCallback(
    async (clarification: GlunoClarification, option: GlunoClarificationOption) => {
      try {
        const turn = await resolveGlunoClarification(
          clarification.id,
          option.key,
          // Bound to the CHOICE, so a double tap or a retry after a dropped
          // connection resolves to the same continuation rather than asking
          // Gluno the question twice.
          `clar-${clarification.id}-${option.key}`,
        );

        setConversationId(turn.conversation.id);

        appendAndFollow((current) => {
          // Mark the card answered in place. It stays on screen as a record of
          // what was chosen rather than vanishing under the reply.
          const withResolved = current.map((message) =>
            message.clarification?.id === clarification.id
              ? {
                  ...message,
                  clarification: {
                    ...message.clarification,
                    status: 'resolved',
                    selectedKey: option.key,
                  },
                }
              : message);

          return mergeGlunoMessages(
            withResolved, toChatMessages([turn.assistantMessage], true));
        });
      } catch {
        // The question stays on screen and stays answerable. Losing it would
        // mean retyping something the user already asked.
        setApplyNotice(t('gluno.clarify.failed'));
      }
    },
    [appendAndFollow, t],
  );

  /**
   * Turns a recommended place into a proposal and appends the result.
   *
   * NEVER A DIRECT WRITE. The response carries whatever the backend decided
   * the next step is — a proposal card to review, or a question about which
   * Adventure or which day — and the plan changes only when the user applies
   * it.
   */
  /**
   * Runs an add and appends whatever came back.
   *
   * ONE FUNCTION FOR THE BUTTON AND THE RETRY, which is the point: a retry is
   * the same call with the same ids, not a re-sent chat message. Nothing about
   * the place travels — the route already identifies it.
   */
  const runAddPlace = useCallback(
    async (
      messageId: string,
      optionKey: string,
      options?: { date?: string | null; idempotencyKey?: string | null },
    ) => {
      // The scope this action belongs to. An add started in one Adventure must
      // never append its answer to another — the request is already bound to a
      // conversation server-side, so the only way it could is by landing in
      // the wrong list here.
      const startedIn = stateScope.current;

      const turn = await addGlunoRecommendedPlace(messageId, optionKey, {
        date: options?.date ?? undefined,
        // Reused across retries so a dropped connection — or a retry after a
        // provider failure — cannot add twice.
        idempotencyKey: options?.idempotencyKey ?? `place-${messageId}-${optionKey}`,
      });

      if (stateScope.current !== startedIn) return;

      appendAndFollow((current) => {
        const rows = toChatMessages([turn.assistantMessage], true);
        const last = rows[rows.length - 1];

        // The card belongs to the turn that produced it.
        if (turn.clarification && last) last.clarification = turn.clarification;
        // And so does a retry the server offered for this same add.
        if (turn.action && last) last.action = turn.action;

        return mergeGlunoMessages(current, rows);
      });
    },
    [appendAndFollow],
  );

  /**
   * Copies the conversation as plain text for a bug report.
   *
   * DEVELOPMENT ONLY — the button that calls this is behind __DEV__, so no
   * store build ever renders it.
   *
   * The transcript is built by a pure function that names every field it
   * includes, so nothing can arrive in an export by being added to the message
   * type later. See lib/gluno-debug-export.ts.
   */
  const handleCopyTranscript = useCallback(async () => {
    if (copying) return;

    setCopying(true);
    try {
      await Clipboard.setStringAsync(buildGlunoDebugExport({
        scope,
        scopeLabel: tripName ?? t('gluno.scope.global'),
        conversationId,
        tripId,
        messages,
      }));

      setApplyNotice(t('gluno.debug.copied'));
    } catch {
      // Neutral, and never the clipboard's own error — it says nothing a
      // person can act on.
      setApplyNotice(t('gluno.debug.copyFailed'));
    } finally {
      setCopying(false);
    }
  }, [copying, scope, tripName, conversationId, tripId, messages, t]);

  const handleAddPlace = useCallback(
    (messageId: string, place: GlunoPlace) => runAddPlace(messageId, place.optionKey),
    [runAddPlace],
  );

  /**
   * Resumes the add the server said could be tried again.
   *
   * THE BUG THIS REPLACES. The user was told to retype "lägg till Casas de
   * Pilatos". Every id needed to try again was already known server-side, so
   * this sends those back to the same route — no new user row, nothing through
   * the composer, no model, and the same idempotency key so a slow first
   * attempt that eventually succeeded cannot produce a second proposal.
   */
  const handleTurnAction = useCallback(
    async (action: GlunoTurnAction) => {
      if (!action.messageId) return;

      // TWO DIFFERENT THINGS, deliberately not merged into one call. One tries
      // the SAME place again; the other asks for a whole new shortlist because
      // that place is gone. Sharing an implementation would eventually share a
      // bug, and the two have opposite idempotency needs.
      if (action.type === 'retry_place_add') {
        if (!action.optionKey) return;

        await runAddPlace(action.messageId, action.optionKey, {
          // Carries the day the user already chose, so the retry does not ask
          // for it a second time.
          date: action.date,
          idempotencyKey: action.idempotencyKey,
        });
        return;
      }

      if (action.type === 'show_new_place_suggestions') {
        const startedIn = stateScope.current;

        const turn = await refreshGlunoPlaceSuggestions(
          action.messageId,
          // A FRESH key per press. This is a new list each time, not a retry of
          // one attempt — two deliberate presses are two legitimate asks, and
          // reusing a key would replay the first list instead of searching.
          createGlunoIdempotencyKey(),
        );

        if (stateScope.current !== startedIn) return;

        appendAndFollow((current) => {
          const rows = toChatMessages([turn.assistantMessage], true);
          const last = rows[rows.length - 1];

          if (turn.action && last) last.action = turn.action;

          // The old block keeps its text but loses its button: the action it
          // carried has been spent, and leaving it live would offer to fetch
          // again something already on screen.
          const spent = current.map((row) =>
            row.action?.type === 'show_new_place_suggestions'
              && row.action.messageId === action.messageId
              ? { ...row, action: undefined }
              : row);

          return mergeGlunoMessages(spent, rows);
        });
      }
    },
    [appendAndFollow, runAddPlace],
  );

  /**
   * Searches within a clarification's own scope and swaps in the results.
   *
   * The question stays exactly where it is; only what can answer it changes.
   * Returns the count so the card can say "nothing matched" without inventing
   * an error.
   */
  const handleSearchClarification = useCallback(
    async (clarification: GlunoClarification, query: string) => {
      const updated = await searchGlunoClarification(clarification.id, query);

      setMessages((current) =>
        current.map((message) =>
          message.clarification?.id === clarification.id
            ? { ...message, clarification: updated }
            : message));

      return updated.options.length;
    },
    [],
  );

  async function handleSend() {
    const text = draft.trim();
    if (!text || sending || composerDisabled) return;

    const localId = createLocalId();
    // Generated once here and carried through every retry of THIS message, so
    // a dropped connection cannot produce two answers.
    const idempotencyKey = createGlunoIdempotencyKey();
    idempotencyKeysRef.current.set(localId, idempotencyKey);

    appendAndFollow((current) => [
      ...current,
      { id: localId, role: 'user', text, createdAt: new Date().toISOString(), pending: true },
    ]);
    // Cleared only now, once the message has been accepted into the list —
    // and restored below if the call fails and the field is still empty.
    setDraft('');

    const ok = await deliver(text, localId, idempotencyKey);
    if (!ok) {
      setDraft((current) => (current.trim().length === 0 ? text : current));
    }
  }

  /** Aborts the turn in flight. Nothing is stored server-side either. */
  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setSending(false);
  }, []);

  async function handleRetry(message: GlunoChatMessage) {
    if (sending) return;

    // Retry mutates the existing row rather than pushing a new one, so a
    // failed turn can never leave two copies of the same question behind.
    setMessages((current) =>
      current.map((entry) =>
        entry.id === message.id
          ? {
              ...entry,
              pending: true,
              failed: false,
              // Cleared, not carried. The previous attempt's code and retry
              // flag describe an outcome that is being replaced — leaving
              // them meant a retry that failed differently could still be
              // read through the old attempt's metadata.
              failureCode: undefined,
              errorStatus: undefined,
              retryable: undefined,
            }
          : entry,
      ),
    );

    // The SAME key as the original attempt. A new one would make the backend
    // treat this as a fresh question and answer it twice.
    const key = idempotencyKeysRef.current.get(message.id) ?? createGlunoIdempotencyKey();
    idempotencyKeysRef.current.set(message.id, key);

    await deliver(message.text, message.id, key);
  }

  async function handleLoadOlder() {
    if (loadingOlder || !hasMore || !conversationId) return;

    const oldest = messages.find((message) => !message.pending && !message.id.startsWith('local-'));
    if (!oldest) return;

    setLoadingOlder(true);
    try {
      const page = await getGlunoMessagePage(conversationId, oldest.createdAt);
      setMessages((current) => mergeGlunoMessages(toChatMessages(page.messages), current));
      setHasMore(page.hasMore);
    } catch {
      // A failed older-page load must not disturb what is already on screen;
      // the user can scroll up again to retry.
    } finally {
      setLoadingOlder(false);
    }
  }

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    nearBottomRef.current = event.nativeEvent.contentOffset.y <= NEAR_BOTTOM_THRESHOLD_PX;
  }

  // ── Proposals ───────────────────────────────────────────────────────────
  //
  // Nothing here changes an Adventure by itself. Review opens the sheet, apply
  // sends one explicit request, and the card only shows "applied" after the
  // server has said so — the local status always comes from the response, never
  // from optimism.

  /** Replaces a proposal wherever it appears, keeping everything else intact. */
  const patchProposal = useCallback((updated: GlunoProposal) => {
    setMessages((current) =>
      current.map((message) =>
        message.proposals?.some((proposal) => proposal.id === updated.id)
          ? {
              ...message,
              proposals: message.proposals.map((proposal) =>
                proposal.id === updated.id ? updated : proposal,
              ),
            }
          : message,
      ),
    );
  }, []);

  /**
   * Refreshes exactly the Adventure that changed — its trips, activities, day
   * locations, weather and the home list — and nothing else. A blanket cache
   * clear here would throw away every other trip the user has open.
   *
   * A refresh failure does NOT undo the apply: the change is already saved, so
   * the card stays "applied" and the user is told to pull to refresh.
   */
  const refreshAfterApply = useCallback((response: GlunoApplyResponse) => {
    const changedTripId = response.changes.tripId ?? tripId;
    if (!changedTripId) return;

    try {
      invalidateTripCache(changedTripId);
    } catch {
      setApplyNotice(t('gluno.proposal.refreshFailed'));
    }
  }, [tripId, t]);

  function absorb(response: GlunoApplyResponse) {
    patchProposal(response.proposal);
    if (reviewProposal?.id === response.proposal.id) setReviewProposal(response.proposal);
    return response.proposal.status;
  }

  async function handleApply(payload: Record<string, unknown>) {
    const proposal = reviewProposal;
    if (!proposal || applying) return;

    setApplying(true);
    setApplyNotice(null);

    try {
      // Save the user's edits first, so what gets applied is exactly what they
      // just reviewed rather than Gluno's original.
      const edited = await updateGlunoProposal(proposal.id, payload);
      absorb(edited);

      if (edited.proposal.status !== 'pending') {
        setApplyNotice(noticeFor(edited, t));
        return;
      }

      const applied = await applyGlunoProposal(proposal.id);
      const status = absorb(applied);

      if (status === 'applied') {
        refreshAfterApply(applied);
        setReviewProposal(null);
      } else {
        setApplyNotice(noticeFor(applied, t));
      }
    } catch {
      setApplyNotice(t('gluno.proposal.applyFailed'));
    } finally {
      setApplying(false);
    }
  }

  /**
   * Sends an edited day plan back to be re-laid by the schedule engine.
   *
   * Reordering stops or changing how long one takes moves every travel time
   * after it. Recomputing that in the app would mean a second scheduler that
   * could quietly disagree with the one that validates at apply — so the
   * server re-lays it and this screen renders whatever comes back, warnings
   * and dropped stops included.
   */
  async function handleRevalidate(payload: Record<string, unknown>) {
    const proposal = reviewProposal;
    if (!proposal || applying || revalidating) return;

    setRevalidating(true);
    try {
      absorb(await updateGlunoProposal(proposal.id, payload));
    } catch {
      // A failed re-lay leaves the previous schedule on screen. Apply still
      // re-validates server-side, so a stale preview cannot save a broken day.
      setApplyNotice(t('gluno.proposal.refreshFailed'));
    } finally {
      setRevalidating(false);
    }
  }

  async function handleDismissProposal(proposal: GlunoProposal) {
    if (applying) return;

    try {
      const response = await rejectGlunoProposal(proposal.id);
      absorb(response);
      if (reviewProposal?.id === proposal.id) setReviewProposal(null);
    } catch {
      setApplyNotice(t('gluno.proposal.applyFailed'));
    }
  }

  // Only when the backend has EXPLICITLY said the core cannot answer. Not
  // while the check is running, and not because it failed to complete — those
  // are a spinner and a retry, in that order.
  const unavailable = status != null && status.available === false;
  const notConfigured = status?.reason === 'not_configured';
  // The composer is closed while we genuinely do not know yet, so a question
  // typed into it cannot be lost a moment later.
  // Lost access closes the composer too: a message sent from here would be
  // answered globally, which is the widening this whole check exists to stop.
  const composerDisabled = unavailable || scopeLost || (statusLoading && status == null);
  // ── What the pill is allowed to claim ─────────────────────────────────
  //
  // Scoped only once the server has confirmed it. Before that the pill is
  // blank rather than optimistic — naming an Adventure and then turning out to
  // be a global chat has already misled somebody, and the pill is the only
  // thing on screen telling them which plan Gluno can see.
  const scoped = tripId != null && scopeVerified && !scopeLost;

  // Inverted list wants newest first; the state stays chronological so every
  // merge, cursor and cache read can reason about it normally.
  const inverted = useMemo(() => [...messages].reverse(), [messages]);
  const showEmptyState = !loading && messages.length === 0;

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 18) + 4 }]}>
        <TouchableOpacity
          style={styles.headerButton}
          activeOpacity={0.86}
          accessibilityRole="button"
          accessibilityLabel={t('common.goBack')}
          onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={23} color={theme.colors.textPrimary} />
        </TouchableOpacity>

        <View style={styles.headerIdentity}>
          <GlunoMascot size={34} state="idle" loop={false} />
          <View style={styles.headerCopy}>
            <Text style={styles.headerTitle}>{t('gluno.name')}</Text>
            <Text style={styles.headerSubtitle} numberOfLines={1}>{t('gluno.tagline')}</Text>
          </View>
        </View>

        {/* Scope is identity here, not metadata: the same question means
            different things globally and inside an Adventure. */}
        {/* A real chooser, not a label. Switching here opens the conversation
            belonging to that Adventure — a different history, not a re-scoped
            copy of this one. */}
        <GlunoScopePicker
          tripId={scoped ? tripId : null}
          tripTitle={tripName}
          checking={tripId != null && !scopeVerified && !scopeLost}
          onChange={(choice) => {
            // Any in-flight turn belongs to the scope being left. Its answer
            // would arrive into a conversation it was never about.
            abortRef.current?.abort();
            abortRef.current = null;

            router.replace({
              pathname: '/gluno',
              params: {
                ...(choice.tripId ? { tripId: choice.tripId } : {}),
                ...(choice.title ? { tripTitle: choice.title } : {}),
              },
            } as never);
          }}
        />

        {/* ── Copy transcript ─────────────────────────────────────────────
            DEVELOPMENT ONLY. Placed after the scope picker so it cannot get
            between the pill and its sheet, and rendered as a bare icon so it
            takes no width from the Adventure name beside it. */}
        {__DEV__ ? (
          <TouchableOpacity
            style={styles.headerButton}
            activeOpacity={0.75}
            disabled={copying}
            accessibilityRole="button"
            accessibilityLabel={t('gluno.debug.copy')}
            onPress={handleCopyTranscript}>
            {copying ? (
              <ActivityIndicator size="small" color={theme.colors.textMeta} />
            ) : (
              <Ionicons name="copy-outline" size={17} color={theme.colors.textMeta} />
            )}
          </TouchableOpacity>
        ) : null}

        {/* The header ends at the scope picker. The preferences door that used
            to sit here is gone; the screen and the backend behind it are
            untouched, and nothing in the chat links to it any more. */}
      </View>

      {/* Three distinct states, and conflating any two of them is the bug this
          block exists to avoid: still checking, could not check, and checked —
          the answer was no. Only the last one may say Gluno is not available. */}
      {statusLoading && status == null ? (
        <View style={styles.notice}>
          <ActivityIndicator size="small" color={theme.colors.textMeta} />
          <View style={styles.noticeCopy}>
            <Text style={styles.noticeText}>{t('gluno.state.checking')}</Text>
          </View>
        </View>
      ) : statusFailed ? (
        <View style={styles.notice}>
          <Ionicons name="cloud-offline-outline" size={16} color={theme.colors.textMeta} />
          <View style={styles.noticeCopy}>
            <Text style={styles.noticeText}>{t('gluno.state.checkFailed')}</Text>
          </View>
          <TouchableOpacity
            activeOpacity={0.8}
            accessibilityRole="button"
            onPress={() => void checkStatus()}>
            <Text style={styles.noticeAction}>{t('gluno.state.retryCheck')}</Text>
          </TouchableOpacity>
        </View>
      ) : unavailable ? (
        <View style={styles.notice}>
          <Ionicons name="information-circle-outline" size={16} color={theme.colors.textMeta} />
          <View style={styles.noticeCopy}>
            <Text style={styles.noticeText}>
              {notConfigured ? t('gluno.state.notConfigured') : t('gluno.state.unavailable')}
            </Text>
            {/* Development only: a production user has no way to act on this
                and should never be shown backend configuration. */}
            {__DEV__ && notConfigured ? (
              <Text style={styles.noticeHint}>{t('gluno.state.notConfiguredHint')}</Text>
            ) : null}
          </View>
        </View>
      ) : null}

      {/* Android is left to the OS. app.json sets
          softwareKeyboardLayoutMode: "resize", so the window already shrinks
          when the keyboard opens — a "height" behaviour on top of that
          compensates twice and leaves a gap the size of the composer.

          This is a PUSHED screen, so there is no tab bar underneath and the
          offset is genuinely zero. */}
      <KeyboardAvoidingView
        style={styles.body}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}>
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
          </View>
        ) : showEmptyState ? (
          <View style={styles.emptyWrapper}>
            <GlunoEmptyState
              scoped={Boolean(tripId)}
              disabled={composerDisabled}
              onSuggestion={(text) => {
                setDraft(text);
                inputRef.current?.focus();
              }}
            />
            {/* Access went while they were away. Said out loud rather than
                quietly reopening as a global chat — silently widening
                somebody's scope is how a question about a private trip gets
                asked in the open. */}
            {scopeLost ? (
              <Text style={styles.inlineError}>{t('gluno.scope.lost')}</Text>
            ) : loadFailed ? (
              <Text style={styles.inlineError}>{t('gluno.error.generic')}</Text>
            ) : null}
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={inverted}
            inverted
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <GlunoMessageRow
                message={item}
                conversationId={conversationId}
                tripId={tripId}
                onRetry={handleRetry}
                onReviewProposal={(proposal) => {
                  setApplyNotice(null);
                  setReviewProposal(proposal);
                }}
                onDismissProposal={handleDismissProposal}
                onResolveClarification={handleResolveClarification}
                onSearchClarification={handleSearchClarification}
                onAddPlace={handleAddPlace}
                onTurnAction={handleTurnAction}
              />
            )}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            onScroll={handleScroll}
            scrollEventThrottle={64}
            // Inverted: the "end" is the oldest message, i.e. scrolling up.
            onEndReached={handleLoadOlder}
            onEndReachedThreshold={0.4}
            ListFooterComponent={
              loadingOlder ? (
                <View style={styles.olderLoader}>
                  <ActivityIndicator size="small" color={theme.colors.textMuted} />
                </View>
              ) : null
            }
            // Inverted list: the header renders below the newest message.
            ListHeaderComponent={
              sending && waitingVisible ? (
                <View style={styles.thinkingRow}>
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                  {/* ONE sentence for the whole wait. Rotating through several
                      reads as a progress bar that knows something it does not,
                      and the destination is the only detail here that is
                      genuinely known — it comes from the user's own Adventure,
                      never from a provider. */}
                  <Text style={styles.thinkingText} numberOfLines={1}>
                    {tripTitle
                      ? t('gluno.state.thinkingAbout', { trip: tripTitle })
                      : t('gluno.state.thinking')}
                  </Text>
                </View>
              ) : null
            }
          />
        )}

        {applyNotice ? (
          <View style={styles.applyNotice}>
            <Ionicons name="information-circle-outline" size={15} color={theme.colors.textMeta} />
            <Text style={styles.applyNoticeText}>{applyNotice}</Text>
          </View>
        ) : null}

        {/* The home-indicator inset belongs BELOW the composer only while the
            keyboard is closed. With it open the keyboard already covers that
            strip, so keeping the inset pushes the text field a full 34pt above
            the keyboard — the gap this screen had. */}
        <View style={{ paddingBottom: keyboardVisible ? 6 : Math.max(insets.bottom, 10) }}>
          <GlunoComposer
            ref={inputRef}
            value={draft}
            onChangeText={setDraft}
            onSend={handleSend}
            sending={sending}
            onStop={handleStop}
            disabled={composerDisabled}
          />
        </View>
      </KeyboardAvoidingView>

      <GlunoProposalReview
        proposal={reviewProposal}
        visible={reviewProposal != null}
        applying={applying}
        onClose={() => {
          if (!applying) setReviewProposal(null);
        }}
        onApply={handleApply}
        onRevalidate={(payload) => void handleRevalidate(payload)}
        revalidating={revalidating}
        onDismiss={() => {
          if (reviewProposal) void handleDismissProposal(reviewProposal);
        }}
      />
    </View>
  );
}

/**
 * The one line shown when an apply did not go through.
 *
 * Mapped from the server's STATUS, never from its message text — a backend
 * sentence is neither localised nor guaranteed to be free of internal detail.
 */
function noticeFor(response: GlunoApplyResponse, t: (key: string) => string) {
  switch (response.proposal.status) {
    case 'stale':
      return t('gluno.proposal.staleNotice');
    case 'rejected':
      return t('gluno.proposal.dismissed');
    case 'applied':
      return t('gluno.proposal.applied');
    default:
      return t('gluno.proposal.applyFailed');
  }
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.bgPrimary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.borderPrimary,
    backgroundColor: theme.colors.bgPrimary,
  },
  headerButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.borderPrimary,
  },
  headerIdentity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerCopy: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: theme.colors.textPrimary,
  },
  headerSubtitle: {
    marginTop: 1,
    fontSize: 11.5,
    color: theme.colors.textMeta,
  },
  scopePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: 118,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: theme.colors.bgLight,
  },
  scopePillScoped: {
    backgroundColor: theme.colors.primaryLight12,
  },
  scopeText: {
    flexShrink: 1,
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.textMeta,
  },
  scopeTextScoped: {
    color: theme.colors.primary,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: theme.colors.bgLight,
  },
  noticeCopy: {
    flex: 1,
  },
  noticeText: {
    fontSize: 12.5,
    lineHeight: 18,
    color: theme.colors.textSecondary,
  },
  noticeHint: {
    marginTop: 4,
    fontSize: 11,
    lineHeight: 16,
    color: theme.colors.textMuted,
  },
  noticeAction: {
    fontSize: 12.5,
    fontWeight: '800',
    color: theme.colors.primary,
  },
  body: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyWrapper: {
    flex: 1,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  inlineError: {
    marginTop: 16,
    textAlign: 'center',
    fontSize: 12.5,
    color: theme.colors.textMuted,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
  },
  thinkingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  thinkingText: {
    fontSize: 12.5,
    color: theme.colors.textMeta,
  },
  olderLoader: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  applyNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 11,
    borderRadius: 12,
    backgroundColor: theme.colors.bgLight,
  },
  applyNoticeText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 18,
    color: theme.colors.textSecondary,
  },
});
