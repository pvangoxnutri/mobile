import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { memo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import GlunoMascot from '@/components/gluno/GlunoMascot';
import GlunoNavigationCard from '@/components/gluno/GlunoNavigationCard';
import GlunoFeedbackRow from '@/components/gluno/GlunoFeedbackRow';
import GlunoClarificationCard from '@/components/gluno/GlunoClarificationCard';
import GlunoSourceRow from '@/components/gluno/GlunoSourceRow';
import GlunoPlaceCard from '@/components/gluno/GlunoPlaceCard';
import GlunoPlaceDetailCard from '@/components/gluno/GlunoPlaceDetailCard';
import GlunoPlaceRecommendationList from '@/components/gluno/GlunoPlaceRecommendationList';
import GlunoProposalCard from '@/components/gluno/GlunoProposalCard';
import GlunoRichText from '@/components/gluno/GlunoRichText';
import { useI18n } from '@/components/i18n-provider';
import { useTheme } from '@/components/theme-provider';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { GlunoClarification, GlunoClarificationOption, GlunoPlace, GlunoProposal } from '@/lib/gluno';
import type { GlunoChatMessage } from '@/lib/gluno-cache';
import type { AppTheme } from '@/constants/themes';

// ──────────────────────────────────────────────────────────────────────────
// GLUNO — one turn in the chat.
//
// The two roles are deliberately NOT symmetric, which is the main way this
// screen stops feeling like the group chat:
//
//   • the user's message keeps the app's normal sent-message shape — a narrow
//     right-aligned bubble, exactly where a sent message belongs
//   • Gluno's answer is not a bubble at all. It is a wide left-aligned block
//     with the mascot beside it, because these answers are structured (lists,
//     plans, headings) and squeezing them into a 82%-wide tinted bubble makes
//     them unreadable
//
// Timestamps are present but quiet — a chat with a person is about when things
// were said; a chat with an assistant is about what it said.
// ──────────────────────────────────────────────────────────────────────────

type Props = {
  message: GlunoChatMessage;
  /** Null before the first turn creates one — feedback needs somewhere to land. */
  conversationId?: string | null;
  tripId?: string | null;
  onRetry?: (message: GlunoChatMessage) => void;
  /** Opens the review sheet for a pending proposal. */
  onReviewProposal?: (proposal: GlunoProposal) => void;
  onDismissProposal?: (proposal: GlunoProposal) => void;
  /** Resolves a clarification in place and appends the continuation. */
  onResolveClarification?: (
    clarification: GlunoClarification, option: GlunoClarificationOption) => Promise<void>;
  /** Searches within the clarification scope. Returns the result count. */
  onSearchClarification?: (clarification: GlunoClarification, query: string) => Promise<number>;
  /**
   * Turns a recommended place into a proposal.
   *
   * Never a direct write — the response carries the same proposal card a chat
   * turn would, and the change happens only when the user applies it.
   */
  onAddPlace?: (messageId: string, place: GlunoPlace) => Promise<void>;
};

function formatTime(iso: string, locale: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

/**
 * Backend failure codes the chat has copy for.
 *
 * Anything NOT in here falls through to the generic line. A future backend
 * adding a code this build has never seen must render as "something went
 * wrong" — never as a crash and never as a raw code on screen.
 */
const FAILURE_COPY: Record<string, string> = {
  ai_not_configured: 'gluno.error.notConfigured',
  model_not_configured: 'gluno.error.modelNotConfigured',
  user_usage_limit: 'gluno.error.usageLimit',
  global_usage_limit: 'gluno.error.usageLimit',
  ai_timeout: 'gluno.error.timeout',
  ai_rate_limited: 'gluno.error.busy',
  context_too_large: 'gluno.error.tooMuch',
  tool_budget_exceeded: 'gluno.error.tooMuch',
  // Everything below used to fall through to the generic line, which is how a
  // rejected API key and a model id that does not exist both read as "try
  // again" — advice that could never work.
  ai_refusal: 'gluno.error.refused',
  ai_malformed_response: 'gluno.error.malformed',
  grounding_failed: 'gluno.error.grounding',
  proposal_validation_failed: 'gluno.error.proposalInvalid',
  authorization_changed: 'gluno.error.accessChanged',
  tripadvisor_unavailable: 'gluno.error.providerUnavailable',
  routing_unavailable: 'gluno.error.providerUnavailable',
  weather_unavailable: 'gluno.error.providerUnavailable',
  // Turn-level refusals from the endpoint itself, not from the model. These
  // were the remaining hole: every one of them rendered as the generic line,
  // and `gluno_unavailable` is exactly what an environment with Gluno
  // switched off or unconfigured returns.
  gluno_unavailable: 'gluno.error.notConfigured',
  conversation_not_found: 'gluno.error.conversationGone',
  conversation_archived: 'gluno.error.conversationArchived',
  duplicate_in_flight: 'gluno.error.alreadySending',
  empty_message: 'gluno.error.emptyMessage',
  // Never reached the backend at all — a timeout or a dead connection.
  network_error: 'gluno.error.network',
};

/**
 * Codes that fail identically on every attempt.
 *
 * The backend decides retryability and sends it, so this is only the floor for
 * when it did not — an older or newer response shape, or a body that carried
 * the code but not the flag. Without it the client defaults to "retryable",
 * which for a rejected key means a button that can never work.
 *
 * Deliberately NOT a full mirror of the backend's table. Anything absent here
 * stays retryable, so a code this build has never seen still gets a retry —
 * the safe direction when we cannot tell.
 */
const NEVER_RETRYABLE = new Set([
  'ai_not_configured',
  'model_not_configured',
  'user_usage_limit',
  'global_usage_limit',
  'ai_refusal',
  'authorization_changed',
  'cancelled',
  'gluno_unavailable',
  'conversation_not_found',
  'conversation_archived',
  'empty_message',
  'duplicate_in_flight',
]);

function GlunoMessageRow({
  message,
  conversationId,
  tripId,
  onRetry,
  onReviewProposal,
  onDismissProposal,
  onResolveClarification,
  onSearchClarification,
  onAddPlace,
}: Props) {
  const styles = useThemedStyles(createStyles);
  const { theme } = useTheme();
  const { t, language } = useI18n();
  const locale = language === 'sv' ? 'sv-SE' : 'en-GB';

  /** Which recommendation's detail card is open. One at a time. */
  const [openPlaceKey, setOpenPlaceKey] = useState<string | null>(null);
  /** The place whose Add is in flight. Guards a double tap locally. */
  const [addingKey, setAddingKey] = useState<string | null>(null);
  /** Already turned into a proposal — Add is spent for those. */
  const [addedKeys, setAddedKeys] = useState<string[]>([]);

  if (message.role === 'user') {
    return (
      <View style={styles.userRow}>
        <View style={styles.userColumn}>
          <View style={[styles.userBubble, message.pending && styles.userBubblePending]}>
            <Text style={styles.userText}>{message.text}</Text>
          </View>

          {message.failed ? (() => {
            const copyKey = message.failureCode ? FAILURE_COPY[message.failureCode] : undefined;
            const reason = message.errorStatus === 403
              ? t('gluno.error.forbidden')
              : copyKey
                ? t(copyKey)
                // No code at all. Since every live path now attaches one,
                // this is a row left over from an earlier session — say so
                // neutrally rather than describing a failure we cannot name.
                : message.failureCode === undefined && message.errorStatus === undefined
                  ? t('gluno.error.older')
                  : t('gluno.error.generic');

            // Retry is offered only where it is honest. A missing API key
            // fails identically on every tap, and a button that never works
            // is worse than no button.
            //
            // The backend's own verdict wins whenever it sent one — it knows
            // things the client cannot, like whether a provider is rate
            // limiting us. Only when the flag is absent does the client fall
            // back to what it knows about the code.
            const canRetry = typeof message.retryable === 'boolean'
              ? message.retryable
              : !(message.failureCode && NEVER_RETRYABLE.has(message.failureCode));

            return canRetry ? (
              <TouchableOpacity
                style={styles.retryRow}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={t('gluno.error.retry')}
                onPress={() => onRetry?.(message)}>
                <Ionicons name="refresh" size={12} color={theme.colors.error} />
                {/* A localised code — never the error's own message, which can
                    carry backend, SDK or timeout detail. */}
                <Text style={styles.retryText}>{reason}</Text>
                <Text style={styles.retryAction}>{t('gluno.error.retry')}</Text>
                {/* TEMPORARY, __DEV__ only — remove once the cause is known.
                    Codes and a status, never content. */}
                {__DEV__ ? (
                  <Text style={styles.devDetail}>
                    {`HTTP:${message.errorStatus ?? '-'} `}
                    {`Code:${message.failureCode ?? 'missing'} `}
                    {`Retry:${message.retryable ?? 'missing'}`}
                  </Text>
                ) : null}
              </TouchableOpacity>
            ) : (
              <View style={styles.retryRow}>
                <Ionicons name="information-circle-outline" size={12} color={theme.colors.textMeta} />
                <Text style={styles.retryText}>{reason}</Text>
                {/* TEMPORARY, __DEV__ only — see the retry branch above. */}
                {__DEV__ ? (
                  <Text style={styles.devDetail}>
                    {`HTTP:${message.errorStatus ?? '-'} `}
                    {`Code:${message.failureCode ?? 'missing'} `}
                    {`Retry:${message.retryable ?? 'missing'}`}
                  </Text>
                ) : null}
              </View>
            );
          })() : message.pending ? null : (
            <Text style={styles.userTimestamp}>{formatTime(message.createdAt, locale)}</Text>
          )}
        </View>
      </View>
    );
  }

  const proposals = message.proposals ?? [];
  const places = message.places ?? [];
  const openPlace = places.find((place) => place.optionKey === openPlaceKey) ?? null;
  const navigations = message.navigations ?? [];
  const sources = message.sources ?? [];

  return (
    <View style={styles.glunoRow}>
      <View style={styles.mascotSlot}>
        <GlunoMascot size={30} state="idle" loop={false} />
      </View>

      <View style={styles.glunoColumn}>
        <Text style={styles.glunoName}>{t('gluno.name')}</Text>

        <View style={styles.glunoBody}>
          <GlunoRichText text={message.text} />
        </View>

        {/* ── Places ──────────────────────────────────────────────────────
            One place is the answer, and a full card is the right size for it.
            SEVERAL are a shortlist: six full cards is a page nobody scrolls to
            the end of, so they become tappable rows and the detail opens
            underneath whichever one was chosen.

            Before this, several recommendations arrived as prose — the
            information was there and the action was not, and acting on one
            meant typing its name back. */}
        {places.length === 1 ? (
          <GlunoPlaceCard key={`${message.id}-${places[0].externalId}`} place={places[0]} />
        ) : places.length > 1 ? (
          <>
            <GlunoPlaceRecommendationList
              places={places}
              openKey={openPlaceKey}
              onSelect={(place) =>
                setOpenPlaceKey((current) =>
                  current === place.optionKey ? null : place.optionKey)
              }
            />

            {openPlace ? (
              <GlunoPlaceDetailCard
                place={openPlace}
                adding={addingKey === openPlace.optionKey}
                added={addedKeys.includes(openPlace.optionKey)}
                onAdd={async (place) => {
                  if (!onAddPlace || addingKey !== null) return;

                  setAddingKey(place.optionKey);
                  try {
                    await onAddPlace(message.id, place);
                    // Spent, so a second tap cannot produce a second proposal
                    // for the same place.
                    setAddedKeys((current) => [...current, place.optionKey]);
                  } finally {
                    setAddingKey(null);
                  }
                }}
                onBack={() => setOpenPlaceKey(null)}
              />
            ) : null}
          </>
        ) : null}

        {/* Last: a proposal is the thing to decide on, a place is what the
            answer is about, and "here's where that lives" is the footnote. */}
        {navigations.map((navigation, index) => (
          <GlunoNavigationCard key={`${message.id}-nav-${index}`} navigation={navigation} />
        ))}

        {proposals.map((proposal, index) => (
          <GlunoProposalCard
            key={proposal.id || `${message.id}-${index}`}
            proposal={proposal}
            onReview={onReviewProposal}
            onDismiss={onDismissProposal}
          />
        ))}

        {/* Below the answer and above the timestamp: present enough to be
            found, quiet enough that the chat still reads as a conversation. */}
        {/* Above the sources: the question is the actionable part of this
            turn, and burying it under attribution would hide it. */}
        {message.clarification && onResolveClarification ? (
          <GlunoClarificationCard
            clarification={message.clarification}
            onSelect={onResolveClarification}
            onSearch={onSearchClarification}
          />
        ) : null}

        <GlunoSourceRow sources={sources} />

        {/* Only on a finished answer that actually reasoned about something.
            Never on an error, a cancelled turn, or a bare navigation card —
            asking "was that helpful?" about a failure is not a question. */}
        {conversationId
          && !message.pending
          && !message.failed
          && message.text.trim().length > 0
          && !(navigations.length > 0 && places.length === 0 && proposals.length === 0) ? (
          <GlunoFeedbackRow
            messageId={message.id}
            conversationId={conversationId}
            tripId={tripId}
            shape={
              proposals.some((proposal) => proposal.kind === 'day_plan')
                ? 'day_plan'
                : places.length > 0
                  ? 'recommendation'
                  : undefined
            }
          />
        ) : null}

        <Text style={styles.glunoTimestamp}>{formatTime(message.createdAt, locale)}</Text>
      </View>
    </View>
  );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  // ── User ────────────────────────────────────────────────────────────────
  userRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 12,
  },
  userColumn: {
    maxWidth: '82%',
    alignItems: 'flex-end',
  },
  userBubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    borderBottomRightRadius: 5,
    backgroundColor: theme.colors.primary,
  },
  userBubblePending: {
    opacity: 0.55,
  },
  userText: {
    fontSize: 15,
    lineHeight: 21,
    color: theme.colors.white,
  },
  userTimestamp: {
    marginTop: 4,
    marginRight: 2,
    fontSize: 10.5,
    color: theme.colors.textMuted,
  },
  retryRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  retryText: {
    fontSize: 11.5,
    color: theme.colors.textSecondary,
  },
  devDetail: {
    fontSize: 9.5,
    color: theme.colors.textMuted,
  },
  retryAction: {
    fontSize: 11.5,
    fontWeight: '800',
    color: theme.colors.primary,
  },

  // ── Gluno ───────────────────────────────────────────────────────────────
  glunoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 14,
    // Only a small inset on the right: the answer gets the width it needs.
    paddingRight: 4,
  },
  mascotSlot: {
    width: 30,
    paddingTop: 12,
  },
  glunoColumn: {
    flex: 1,
  },
  glunoName: {
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 0.3,
    color: theme.colors.textMeta,
    marginBottom: 4,
  },
  glunoBody: {
    // No bubble fill and no border. A tinted container around a multi-block
    // answer reads as a quote box; plain text on the page reads as an answer.
    paddingRight: 4,
  },
  glunoTimestamp: {
    marginTop: 5,
    fontSize: 10.5,
    color: theme.colors.textMuted,
  },
});

// ──────────────────────────────────────────────────────────────────────────
// Memoised on the fields that actually change what this row draws.
//
// The chat list re-renders on every keystroke in the composer and on every
// tick of a pending turn. Without this, a conversation of forty answers
// re-parses forty markdown bodies and re-lays every place card each time —
// which is exactly the work that makes typing feel sticky on a mid-range
// phone.
//
// Compared explicitly rather than shallowly because `proposals`, `places` and
// `sources` are fresh array identities on every API response even when their
// contents are unchanged.
// ──────────────────────────────────────────────────────────────────────────
export default memo(GlunoMessageRow, (previous, next) => {
  const a = previous.message;
  const b = next.message;

  return previous.conversationId === next.conversationId
    && a.id === b.id
    && a.text === b.text
    && a.pending === b.pending
    && a.failed === b.failed
    && a.failureCode === b.failureCode
    && a.retryable === b.retryable
    && a.proposals === b.proposals
    && a.places === b.places
    && a.sources === b.sources
    && a.navigations === b.navigations
    && previous.onRetry === next.onRetry
    && previous.onReviewProposal === next.onReviewProposal
    && previous.onDismissProposal === next.onDismissProposal;
});
