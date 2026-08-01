import { memo, useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useI18n } from '@/components/i18n-provider';
import { useTheme } from '@/components/theme-provider';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { voteOnGlunoDecision, type GlunoGroupDecision } from '@/lib/gluno-group';
import type { AppTheme } from '@/constants/themes';

// ──────────────────────────────────────────────────────────────────────────
// GLUNO — a group decision, in the chat.
//
// What this card deliberately does NOT show: who voted for what. Only counts.
// A poll that reveals individual votes is one people answer strategically
// rather than honestly, and in a group of friends planning a holiday that is
// the difference between a useful answer and a polite one.
//
// It also never shows whose constraint caused a conflict. The group screen
// knows a constraint exists; it does not know whose, because the backend never
// sends that.
//
// Voting is optimistic on the SELECTION only — the counts come from the
// server's tally, never from local arithmetic, because a client that counts
// its own poll is a client that can be wrong about one.
// ──────────────────────────────────────────────────────────────────────────

type Props = {
  decision: GlunoGroupDecision;
  /** Replaces the card's data after a vote, without reloading the chat. */
  onUpdated?: (decision: GlunoGroupDecision) => void;
};

function GlunoPollCard({ decision, onUpdated }: Props) {
  const styles = useThemedStyles(createStyles);
  const { theme } = useTheme();
  const { t } = useI18n();

  const [voting, setVoting] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const isOpen = decision.status === 'pending';

  const vote = useCallback(
    async (optionId: string | null) => {
      // One in-flight vote at a time. A double tap must not produce two
      // requests racing to set different options.
      if (voting != null || !isOpen) return;

      setVoting(optionId ?? 'abstain');
      setFailed(false);

      try {
        const updated = await voteOnGlunoDecision(decision.id, optionId);
        onUpdated?.(updated);
      } catch {
        // A failed vote leaves the previous state on screen. The server is the
        // source of truth for the tally, so nothing local needs unwinding.
        setFailed(true);
      } finally {
        setVoting(null);
      }
    },
    [decision.id, isOpen, onUpdated, voting],
  );

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="people-outline" size={16} color={theme.colors.primary} />
        <Text style={styles.eyebrow}>{t('gluno.group.decision')}</Text>
      </View>

      <Text style={styles.question}>{decision.question}</Text>

      {decision.options.map((option) => {
        const chosen = decision.myVote === option.id;
        const isWinner = decision.acceptedOptionId === option.id;
        const busy = voting === option.id;

        return (
          <TouchableOpacity
            key={option.id}
            style={[styles.option, chosen && styles.optionChosen, isWinner && styles.optionWinner]}
            activeOpacity={isOpen ? 0.85 : 1}
            disabled={!isOpen || voting != null}
            accessibilityRole="radio"
            accessibilityState={{ selected: chosen, disabled: !isOpen }}
            onPress={() => void vote(option.id)}>
            <View style={styles.optionHeader}>
              <Text style={styles.optionLabel} numberOfLines={2}>{option.label}</Text>
              {busy ? (
                <ActivityIndicator size="small" color={theme.colors.primary} />
              ) : (
                // A count, never a name. Who chose what is not on this screen
                // and not in the payload.
                <Text style={styles.optionVotes}>{option.votes}</Text>
              )}
            </View>

            {option.summary ? (
              <Text style={styles.optionSummary} numberOfLines={2}>{option.summary}</Text>
            ) : null}
          </TouchableOpacity>
        );
      })}

      {isOpen ? (
        <TouchableOpacity
          style={styles.abstain}
          activeOpacity={0.8}
          disabled={voting != null}
          accessibilityRole="button"
          onPress={() => void vote(null)}>
          <Text style={styles.abstainText}>{t('gluno.group.abstain')}</Text>
        </TouchableOpacity>
      ) : null}

      <View style={styles.footer}>
        <Text style={styles.meta}>
          {t('gluno.group.responded', {
            responded: String(decision.responded),
            total: String(decision.groupSize),
          })}
        </Text>

        {/* A tie is a real outcome, and the card says so rather than showing a
            winner nobody picked. */}
        {decision.isTie ? <Text style={styles.tie}>{t('gluno.group.tie')}</Text> : null}
      </View>

      {failed ? <Text style={styles.error}>{t('gluno.group.voteFailed')}</Text> : null}
    </View>
  );
}

// Memoised on the fields that change what this card draws. The chat re-renders
// on every keystroke in the composer, and a poll card re-laying its options
// each time is exactly the work that makes typing feel sticky.
export default memo(GlunoPollCard, (previous, next) =>
  previous.decision.id === next.decision.id
  && previous.decision.status === next.decision.status
  && previous.decision.myVote === next.decision.myVote
  && previous.decision.responded === next.decision.responded
  && previous.decision.acceptedOptionId === next.decision.acceptedOptionId
  && previous.decision.options === next.decision.options
  && previous.onUpdated === next.onUpdated);

const createStyles = (theme: AppTheme) => StyleSheet.create({
  card: {
    marginTop: 10,
    padding: 14,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.borderPrimary,
    backgroundColor: theme.colors.surfaceElevated,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  eyebrow: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: theme.colors.primary,
  },
  question: {
    marginTop: 8,
    marginBottom: 4,
    fontSize: 14.5,
    fontWeight: '700',
    lineHeight: 20,
    color: theme.colors.textPrimary,
  },
  option: {
    marginTop: 8,
    padding: 11,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.borderInput,
    backgroundColor: theme.colors.bgLight,
  },
  optionChosen: {
    borderColor: theme.colors.primary,
  },
  optionWinner: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.surfaceElevated,
  },
  optionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  optionLabel: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: '600',
    color: theme.colors.textPrimary,
  },
  optionVotes: {
    minWidth: 18,
    textAlign: 'right',
    fontSize: 13,
    fontWeight: '800',
    color: theme.colors.textMeta,
  },
  optionSummary: {
    marginTop: 5,
    fontSize: 12,
    lineHeight: 17,
    color: theme.colors.textMeta,
  },
  abstain: {
    marginTop: 10,
    paddingVertical: 8,
    alignItems: 'center',
  },
  abstainText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  footer: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  meta: {
    fontSize: 11.5,
    color: theme.colors.textMuted,
  },
  tie: {
    fontSize: 11.5,
    fontWeight: '700',
    color: theme.colors.textSecondary,
  },
  error: {
    marginTop: 8,
    fontSize: 11.5,
    color: theme.colors.error,
  },
});
