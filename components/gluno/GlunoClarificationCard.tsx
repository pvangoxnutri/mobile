import { memo, useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useI18n } from '@/components/i18n-provider';
import { useTheme } from '@/components/theme-provider';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { GlunoClarification, GlunoClarificationOption } from '@/lib/gluno';
import type { AppTheme } from '@/constants/themes';

// ──────────────────────────────────────────────────────────────────────────
// GLUNO — a question with tappable answers.
//
// This exists because the alternative is worse in both directions. Gluno
// guessing which Adventure somebody meant plans the wrong holiday; Gluno
// asking them to type the name is slower than the tap they were already
// making.
//
// DELIBERATELY NOT A PROPOSAL CARD AND NOT A POLL. A proposal is a change to
// review and a poll is a group decision — both are weighty, both are bordered
// and titled. This is a question mid-sentence: no title, no border, a tint
// that reads as part of Gluno's own turn. Getting that wrong would make every
// "which one?" feel like a form.
//
// Rows, not chips. An Adventure carries a name, its dates and its stops, and
// three lines of that does not fit in a pill on a narrow phone.
// ──────────────────────────────────────────────────────────────────────────

type Props = {
  clarification: GlunoClarification;
  /** Resolves and returns the continuation. Errors are handled by the caller. */
  onSelect: (clarification: GlunoClarification, option: GlunoClarificationOption) => Promise<void>;
  onFreeText?: () => void;
  /** Searches within the clarification scope. Returns how many results came back. */
  onSearch?: (clarification: GlunoClarification, query: string) => Promise<number>;
};

function GlunoClarificationCard({ clarification, onSelect, onFreeText, onSearch }: Props) {
  const styles = useThemedStyles(createStyles);
  const { theme } = useTheme();
  const { t, language } = useI18n();

  // Which option is in flight. Only that row spins — the rest stay readable,
  // and the card does not become a blocked rectangle while one request runs.
  const [pending, setPending] = useState<string | null>(null);

  // The inline search, expanded in place. Never a navigation: leaving the chat
  // to answer a question about the chat is the thing this whole layer avoids.
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const runSearch = useCallback(async () => {
    // Guards a double Enter as well as a double tap. The backend is bounded
    // too, but a second identical search still costs a round trip.
    if (busy || !onSearch) return;

    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSearchError(t('gluno.clarify.searchTooShort'));
      return;
    }

    setBusy(true);
    setSearchError(null);

    try {
      const found = await onSearch(clarification, trimmed);
      // Nothing matched. The original options are still there, so say so
      // rather than leaving an empty card.
      if (found === 0) setSearchError(t('gluno.clarify.searchEmpty'));
      else setSearching(false);
    } catch {
      setSearchError(t('gluno.clarify.searchFailed'));
    } finally {
      setBusy(false);
    }
  }, [busy, clarification, onSearch, query, t]);

  const resolved = clarification.status !== 'pending';
  const selectedKey = clarification.selectedKey ?? null;
  // A resolved card is a record of what was chosen, not a control.
  const locked = resolved || pending !== null;

  const choose = useCallback(
    async (option: GlunoClarificationOption) => {
      // Guards the double tap locally as well as server-side. The backend is
      // idempotent, but a second request that returns the same answer still
      // costs a round trip and a flicker.
      if (locked || option.disabled) return;

      setPending(option.key);

      try {
        await onSelect(clarification, option);
      } finally {
        setPending(null);
      }
    },
    [clarification, locked, onSelect],
  );

  const conflict = clarification.conflict ?? null;

  // ── What the clash actually is ──────────────────────────────────────────
  //
  // "That clashes with something already planned" plus four buttons asks
  // somebody to choose without telling them what they are choosing about. The
  // day, the time and the names are the difference between a decision and a
  // guess.
  //
  // Every value here was written by the server. The card formats; it does not
  // interpret, and an unknown conflict type simply shows fewer lines rather
  // than falling back to something invented.
  const when = conflict
    ? [formatConflictDate(conflict.date, language), formatConflictTime(conflict.startTime, conflict.endTime)]
        .filter(Boolean)
        .join(' · ')
    : '';

  const titles = conflict?.affectedTitles?.filter((title) => title.trim().length > 0) ?? [];

  return (
    <View style={styles.card}>
      <Text style={styles.question}>{clarification.question}</Text>

      {conflict ? (
        <View style={styles.conflict}>
          {when ? <Text style={styles.conflictWhen}>{when}</Text> : null}

          {titles.length > 0 ? (
            <Text style={styles.conflictTitles} numberOfLines={2}>
              {titles.join(' · ')}
            </Text>
          ) : null}

          {/* The number turns "there isn't time" into something actionable:
              25 minutes is a different decision from two hours. */}
          {conflict.missingTravelMinutes ? (
            <Text style={styles.conflictTitles}>
              {t('gluno.conflict.travelShort', { minutes: conflict.missingTravelMinutes })}
            </Text>
          ) : null}

          {/* Why there are three options and not five. Without this the
              missing choices read as arbitrary rather than as a real
              constraint. */}
          {conflict.existingIsLocked ? (
            <View style={styles.conflictLocked}>
              <Ionicons name="lock-closed" size={12} color={theme.colors.textMeta} />
              <Text style={styles.conflictLockedText}>{t('gluno.conflict.locked')}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {clarification.options.map((option) => {
        const isSelected = selectedKey === option.key;
        const isPending = pending === option.key;

        return (
          <TouchableOpacity
            key={option.key}
            // The WHOLE row, not just the label. A two-line Adventure row with
            // a tappable title and dead space beside it is a target people
            // miss.
            style={[
              styles.option,
              isSelected && styles.optionSelected,
              option.disabled && styles.optionDisabled,
            ]}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected, disabled: locked || option.disabled }}
            accessibilityLabel={option.label}
            accessibilityHint={option.description ?? undefined}
            disabled={locked || option.disabled}
            onPress={() => void choose(option)}>
            {option.icon ? (
              <Ionicons
                name={option.icon as never}
                size={16}
                color={isSelected ? theme.colors.primary : theme.colors.textMeta}
              />
            ) : null}

            <View style={styles.optionCopy}>
              {/* No numberOfLines: a long Adventure name wraps rather than
                  being cut, because the tail is often what distinguishes two
                  trips to the same place. */}
              <Text style={[styles.optionLabel, isSelected && styles.optionLabelSelected]}>
                {option.label}
              </Text>

              {option.description ? (
                <Text style={styles.optionDescription} numberOfLines={2}>
                  {option.description}
                </Text>
              ) : null}

              {option.disabled && option.disabledReason ? (
                <Text style={styles.optionDisabledReason}>{option.disabledReason}</Text>
              ) : null}
            </View>

            {isPending ? (
              <ActivityIndicator size="small" color={theme.colors.textMuted} />
            ) : isSelected ? (
              <Ionicons name="checkmark" size={16} color={theme.colors.primary} />
            ) : null}
          </TouchableOpacity>
        );
      })}

      {/* The escape hatch. Present only when the answer genuinely might not be
          in the list — offering it every time teaches people to ignore the
          options. */}
      {clarification.allowFreeText && !resolved ? (
        searching ? (
          <View style={styles.searchBox}>
            <View style={styles.searchRow}>
              <TextInput
                style={styles.searchInput}
                value={query}
                onChangeText={setQuery}
                autoFocus
                returnKeyType="search"
                placeholder={t('gluno.clarify.searchPlaceholder')}
                placeholderTextColor={theme.colors.textMuted}
                editable={!busy}
                onSubmitEditing={() => void runSearch()}
              />

              {busy ? (
                <ActivityIndicator size="small" color={theme.colors.textMuted} />
              ) : (
                <TouchableOpacity
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={t('gluno.clarify.search')}
                  onPress={() => void runSearch()}>
                  <Ionicons name="search" size={17} color={theme.colors.primary} />
                </TouchableOpacity>
              )}
            </View>

            {/* Local to the card. A failed search must not push an error into
                the conversation — the question is still on screen and still
                answerable from the original list. */}
            {searchError ? <Text style={styles.searchError}>{searchError}</Text> : null}

            <TouchableOpacity
              activeOpacity={0.7}
              accessibilityRole="button"
              onPress={() => { setSearching(false); setQuery(''); setSearchError(null); }}>
              <Text style={styles.freeTextLabel}>{t('gluno.knows.cancel')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.freeText}
            activeOpacity={0.7}
            accessibilityRole="button"
            disabled={locked}
            onPress={() => { setSearching(true); onFreeText?.(); }}>
            <Text style={styles.freeTextLabel}>{t('gluno.clarify.somethingElse')}</Text>
          </TouchableOpacity>
        )
      ) : null}
    </View>
  );
}

// Memoised on what actually changes the card: the question's identity, its
// status, and which option was chosen.
export default memo(GlunoClarificationCard, (previous, next) =>
  previous.clarification.id === next.clarification.id
  && previous.clarification.status === next.clarification.status
  && previous.clarification.selectedKey === next.clarification.selectedKey
  && previous.onSelect === next.onSelect);

/**
 * "fredag 14 aug" — a weekday and a date, because a conflict is about a
 * specific day and "2026-08-14" makes people count.
 *
 * Returns empty rather than throwing on anything unparseable. The server sends
 * ISO dates; a card is not the place to find out it once did not.
 */
function formatConflictDate(date: string | null | undefined, language: string): string {
  if (!date) return '';

  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return '';

  return parsed.toLocaleDateString(language === 'sv' ? 'sv-SE' : 'en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });
}

/** "19:00–21:00", or just the start when there is no end. */
function formatConflictTime(start: string | null | undefined, end: string | null | undefined): string {
  if (!start) return '';
  return end ? `${start}–${end}` : start;
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  card: {
    marginTop: 8,
    padding: 10,
    borderRadius: 14,
    // A tint rather than a bordered container: this is part of Gluno's turn,
    // not a separate object to review.
    backgroundColor: theme.colors.bgLight,
  },
  question: {
    fontSize: 13.5,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    marginBottom: 8,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 6,
    backgroundColor: theme.colors.surfaceElevated,
  },
  optionSelected: {
    backgroundColor: theme.colors.primaryLight12,
  },
  optionDisabled: {
    opacity: 0.5,
  },
  optionCopy: {
    flex: 1,
  },
  optionLabel: {
    fontSize: 14,
    color: theme.colors.textPrimary,
  },
  optionLabelSelected: {
    fontWeight: '800',
    color: theme.colors.primary,
  },
  optionDescription: {
    marginTop: 2,
    fontSize: 11.5,
    lineHeight: 16,
    color: theme.colors.textMeta,
  },
  optionDisabledReason: {
    marginTop: 2,
    fontSize: 11,
    color: theme.colors.textMuted,
  },
  // Context, not a second question. Sits under the sentence and above the
  // choices, unbordered, so it reads as part of what Gluno just said rather
  // than as a panel to work through.
  conflict: {
    gap: 3,
    marginTop: -2,
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  conflictWhen: {
    fontSize: 12.5,
    fontWeight: '600',
    color: theme.colors.textMeta,
  },
  conflictTitles: {
    fontSize: 12.5,
    lineHeight: 17,
    color: theme.colors.textMuted,
  },
  conflictLocked: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  conflictLockedText: {
    fontSize: 11.5,
    color: theme.colors.textMeta,
  },
  freeText: {
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  searchBox: {
    gap: 8,
    marginTop: 4,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: theme.colors.surfaceElevated,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    padding: 0,
    color: theme.colors.textPrimary,
  },
  searchError: {
    fontSize: 11.5,
    color: theme.colors.textMeta,
  },
  freeTextLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    color: theme.colors.primary,
  },
});
