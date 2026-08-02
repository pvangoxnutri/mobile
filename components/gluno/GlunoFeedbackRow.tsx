import { memo, useCallback, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useI18n } from '@/components/i18n-provider';
import { useTheme } from '@/components/theme-provider';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import {
  resolveGlunoCandidate,
  sendGlunoFeedback,
  type GlunoFeedbackReason,
  type GlunoPreferenceCandidate,
} from '@/lib/gluno-feedback';
import type { AppTheme } from '@/constants/themes';

// ──────────────────────────────────────────────────────────────────────────
// GLUNO — was that answer any use?
//
// Deliberately two small words and no stars. A rating widget invites people to
// score an assistant, which produces numbers nobody can act on; "helpful / not
// helpful" plus one optional reason produces a signal that maps to something
// concrete — too many stops, too far to walk, wrong information.
//
// The reasons are a CLOSED list. Free text is optional, capped, sanitised
// server-side, and is never read as an instruction — it is shown back to its
// author and counted, and that is all.
//
// A second tap on the same verdict is a no-op rather than a duplicate, so a
// double tap cannot inflate anything.
// ──────────────────────────────────────────────────────────────────────────

/**
 * Which reasons to offer, by what the answer was.
 *
 * Tailored because a generic list gets ignored: somebody who just got a day
 * plan has different complaints from somebody who asked where the packing list
 * lives, and offering "too much walking" on the latter reads as noise.
 */
const REASONS_BY_SHAPE: Record<string, GlunoFeedbackReason[]> = {
  day_plan: ['too_busy', 'too_much_walking', 'too_expensive', 'not_relevant', 'other'],
  recommendation: ['not_relevant', 'too_expensive', 'already_planned', 'provider_information_wrong', 'other'],
  app_help: ['factual_correction', 'not_relevant', 'other'],
  default: ['factual_correction', 'wrong_reference', 'not_relevant', 'too_slow', 'other'],
};

const REASON_KEYS: Record<GlunoFeedbackReason, string> = {
  factual_correction: 'gluno.feedback.reason.wrongInfo',
  wrong_reference: 'gluno.feedback.reason.misunderstood',
  not_relevant: 'gluno.feedback.reason.notRelevant',
  too_busy: 'gluno.feedback.reason.tooBusy',
  too_much_walking: 'gluno.feedback.reason.tooMuchWalking',
  too_expensive: 'gluno.feedback.reason.tooExpensive',
  too_slow: 'gluno.feedback.reason.tooLong',
  already_planned: 'gluno.feedback.reason.alreadyPlanned',
  provider_information_wrong: 'gluno.feedback.reason.wrongInfo',
  other: 'gluno.feedback.reason.other',
};

type Props = {
  messageId: string;
  conversationId: string;
  tripId?: string | null;
  /** 'day_plan' | 'recommendation' | 'app_help' | undefined — picks the reasons. */
  shape?: string;
};

function GlunoFeedbackRow({ messageId, conversationId, tripId, shape }: Props) {
  const styles = useThemedStyles(createStyles);
  const { theme } = useTheme();
  const { t } = useI18n();

  const [verdict, setVerdict] = useState<'helpful' | 'not_helpful' | null>(null);
  const [showReasons, setShowReasons] = useState(false);
  const [sending, setSending] = useState(false);
  // Surfaced only when the backend says a pattern has JUST crossed its
  // evidence threshold. Asking earlier is guessing; asking every turn is
  // nagging — so this is normally null and the row stays two small words.
  const [candidate, setCandidate] = useState<GlunoPreferenceCandidate | null>(null);

  const send = useCallback(
    async (eventType: string, reason?: GlunoFeedbackReason) => {
      if (sending) return;
      setSending(true);

      try {
        const result = await sendGlunoFeedback({
          conversationId,
          tripId: tripId ?? null,
          messageId,
          eventType,
          reason,
        });

        if (result?.readyCandidate) setCandidate(result.readyCandidate);
      } catch {
        // A failed signal is not worth an error message. The answer is still
        // on screen and nothing about the user's plan depends on this.
      } finally {
        setSending(false);
      }
    },
    [conversationId, messageId, sending, tripId],
  );

  const answerCandidate = useCallback(
    async (confirm: boolean, scope?: string) => {
      const pending = candidate;
      if (!pending) return;

      // Dismissed immediately, before the request. A no means never asked
      // again, and leaving the question on screen while a network call decides
      // that reads as if the answer did not take.
      setCandidate(null);

      try {
        await resolveGlunoCandidate(pending.id, confirm, scope);
      } catch {
        // Same reasoning as above: nothing the user can act on, and their plan
        // is unaffected either way.
      }
    },
    [candidate],
  );

  const choose = useCallback(
    (next: 'helpful' | 'not_helpful') => {
      // Same verdict twice: nothing to record. The backend treats it as a
      // no-op too, so this is belt and braces on the cheap side.
      if (verdict === next) return;

      setVerdict(next);
      setShowReasons(next === 'not_helpful');
      void send(next === 'helpful' ? 'response_helpful' : 'response_not_helpful');
    },
    [send, verdict],
  );

  const reasons = REASONS_BY_SHAPE[shape ?? 'default'] ?? REASONS_BY_SHAPE.default;

  return (
    <View>
      <View style={styles.row}>
        <TouchableOpacity
          style={styles.button}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityState={{ selected: verdict === 'helpful' }}
          accessibilityLabel={t('gluno.feedback.helpful')}
          onPress={() => choose('helpful')}>
          <Ionicons
            name={verdict === 'helpful' ? 'thumbs-up' : 'thumbs-up-outline'}
            size={13}
            color={verdict === 'helpful' ? theme.colors.primary : theme.colors.textMuted}
          />
          <Text style={[styles.label, verdict === 'helpful' && styles.labelActive]}>
            {t('gluno.feedback.helpful')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.button}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityState={{ selected: verdict === 'not_helpful' }}
          accessibilityLabel={t('gluno.feedback.notHelpful')}
          onPress={() => choose('not_helpful')}>
          <Ionicons
            name={verdict === 'not_helpful' ? 'thumbs-down' : 'thumbs-down-outline'}
            size={13}
            color={verdict === 'not_helpful' ? theme.colors.textSecondary : theme.colors.textMuted}
          />
          <Text style={[styles.label, verdict === 'not_helpful' && styles.labelActive]}>
            {t('gluno.feedback.notHelpful')}
          </Text>
        </TouchableOpacity>
      </View>

      {/* "Shall I assume this?" — asked once, with the scope named.
          The narrow choice comes first and is the one styled as the answer:
          "future trips too" is a bigger commitment than anything a tap on a
          chat message should make by default. */}
      {candidate ? (
        <View style={styles.candidate}>
          <Text style={styles.candidateTitle}>{t('gluno.feedback.candidateTitle')}</Text>
          <Text style={styles.candidateValue}>{candidate.proposedValue}</Text>

          <View style={styles.candidateActions}>
            <TouchableOpacity
              style={[styles.candidateButton, styles.candidateButtonPrimary]}
              activeOpacity={0.8}
              accessibilityRole="button"
              onPress={() => void answerCandidate(true, candidate.tripId ? 'trip' : 'conversation')}>
              <Text style={styles.candidateButtonPrimaryText}>
                {candidate.tripId ? t('gluno.feedback.scopeTrip') : t('gluno.feedback.scopeConversation')}
              </Text>
            </TouchableOpacity>

            {candidate.tripId ? (
              <TouchableOpacity
                style={styles.candidateButton}
                activeOpacity={0.8}
                accessibilityRole="button"
                onPress={() => void answerCandidate(true, 'global')}>
                <Text style={styles.candidateButtonText}>{t('gluno.feedback.scopeGlobal')}</Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              style={styles.candidateButton}
              activeOpacity={0.8}
              accessibilityRole="button"
              onPress={() => void answerCandidate(false)}>
              <Text style={styles.candidateButtonText}>{t('gluno.feedback.decline')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {/* At most five, and free text is never required — a form nobody fills
          in produces no signal at all. */}
      {showReasons ? (
        <View style={styles.reasons}>
          {reasons.slice(0, 5).map((reason) => (
            <TouchableOpacity
              key={reason}
              style={styles.reason}
              activeOpacity={0.75}
              accessibilityRole="button"
              onPress={() => {
                setShowReasons(false);
                void send(reason === 'other' ? 'other' : reason, reason);
              }}>
              <Text style={styles.reasonText}>{t(REASON_KEYS[reason])}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
    </View>
  );
}

// Memoised on identity: this row sits under every answer, and the chat
// re-renders on every keystroke in the composer.
export default memo(GlunoFeedbackRow, (previous, next) =>
  previous.messageId === next.messageId && previous.shape === next.shape);

const createStyles = (theme: AppTheme) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 4,
    paddingLeft: 2,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
  },
  label: {
    fontSize: 11,
    color: theme.colors.textMuted,
  },
  labelActive: {
    fontWeight: '700',
    color: theme.colors.textSecondary,
  },
  reasons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
    paddingLeft: 2,
  },
  reason: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: theme.colors.bgLight,
  },
  reasonText: {
    fontSize: 11.5,
    color: theme.colors.textSecondary,
  },
  candidate: {
    marginTop: 8,
    padding: 10,
    borderRadius: 12,
    backgroundColor: theme.colors.bgLight,
  },
  candidateTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: theme.colors.textSecondary,
  },
  candidateValue: {
    marginTop: 2,
    fontSize: 12.5,
    color: theme.colors.textPrimary,
  },
  candidateActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  candidateButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: theme.colors.bgLightest,
  },
  candidateButtonPrimary: {
    backgroundColor: theme.colors.primary,
  },
  candidateButtonText: {
    fontSize: 11.5,
    color: theme.colors.textSecondary,
  },
  candidateButtonPrimaryText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: theme.colors.white,
  },
});
