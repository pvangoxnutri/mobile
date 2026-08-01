import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import GlunoMascot from '@/components/gluno/GlunoMascot';
import { useI18n } from '@/components/i18n-provider';
import { useTheme } from '@/components/theme-provider';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { AppTheme } from '@/constants/themes';

// ──────────────────────────────────────────────────────────────────────────
// GLUNO — what a brand-new conversation looks like.
//
// An empty chat screen tells the user nothing about what the assistant can do,
// and "ask me anything" is the least useful prompt there is. So the empty
// state does the work a first message would: it says what Gluno is for, and
// offers concrete starting points.
//
// The suggestions differ by scope on purpose. With an Adventure open, "what is
// missing from this trip?" is answerable and "recommend a destination" is not;
// globally it is the other way round. Tapping one fills the composer rather
// than sending immediately — these are openers a user will often want to edit
// ("build a weekend itinerary" → "…for Copenhagen in June").
//
// Rendered only while the conversation has no messages; the screen drops it
// the moment there is any content.
// ──────────────────────────────────────────────────────────────────────────

const GLOBAL_SUGGESTIONS = [
  'gluno.suggest.global.plan',
  'gluno.suggest.global.destination',
  'gluno.suggest.global.weekend',
] as const;

const TRIP_SUGGESTIONS = [
  'gluno.suggest.trip.review',
  'gluno.suggest.trip.missing',
  'gluno.suggest.trip.emptyDay',
  'gluno.suggest.trip.nearby',
] as const;

type Props = {
  scoped: boolean;
  onSuggestion: (text: string) => void;
  disabled?: boolean;
};

export default function GlunoEmptyState({ scoped, onSuggestion, disabled = false }: Props) {
  const styles = useThemedStyles(createStyles);
  const { theme } = useTheme();
  const { t } = useI18n();

  const suggestions = scoped ? TRIP_SUGGESTIONS : GLOBAL_SUGGESTIONS;

  return (
    <View style={styles.container}>
      <GlunoMascot size={72} state="idle" loop />
      <Text style={styles.title}>{t('gluno.empty.title')}</Text>
      <Text style={styles.body}>{t('gluno.empty.body')}</Text>

      <View style={styles.suggestions}>
        {suggestions.map((key) => (
          <TouchableOpacity
            key={key}
            style={[styles.suggestion, disabled && styles.suggestionDisabled]}
            activeOpacity={0.85}
            disabled={disabled}
            accessibilityRole="button"
            onPress={() => onSuggestion(t(key))}>
            <Text style={styles.suggestionText}>{t(key)}</Text>
            <Ionicons name="arrow-forward" size={14} color={theme.colors.primary} />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingTop: 28,
    paddingBottom: 12,
    paddingHorizontal: 4,
  },
  title: {
    marginTop: 12,
    fontSize: 19,
    fontWeight: '800',
    color: theme.colors.textPrimary,
  },
  body: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    color: theme.colors.textSecondary,
    maxWidth: 300,
  },
  suggestions: {
    marginTop: 22,
    alignSelf: 'stretch',
    gap: 8,
  },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.borderPrimary,
  },
  suggestionDisabled: {
    opacity: 0.45,
  },
  suggestionText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textPrimary,
  },
});
