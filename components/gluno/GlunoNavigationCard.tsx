import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useI18n } from '@/components/i18n-provider';
import { useTheme } from '@/components/theme-provider';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { GlunoNavigation } from '@/lib/gluno';
import { canOpenGlunoNavigation, openGlunoNavigation } from '@/lib/gluno-navigation';
import type { AppTheme } from '@/constants/themes';

// ──────────────────────────────────────────────────────────────────────────
// GLUNO — "here's where that lives" card.
//
// Deliberately NOT a proposal card. A proposal changes the Adventure and says
// so; this only opens a screen, and the visual difference matters: a user who
// cannot tell "I moved your museum" from "here's the screen where you can"
// will eventually trust neither.
//
// So: no "suggested change" badge, no applied state, no status. One label, one
// line of reason, one Open button. If this build cannot open the target — a
// newer backend offering a screen that does not exist here — the card renders
// nothing rather than a button that dead-ends.
// ──────────────────────────────────────────────────────────────────────────

export default function GlunoNavigationCard({ navigation }: { navigation: GlunoNavigation }) {
  const styles = useThemedStyles(createStyles);
  const { theme } = useTheme();
  const { t } = useI18n();

  if (!canOpenGlunoNavigation(navigation)) return null;

  return (
    <View style={styles.card}>
      <View style={styles.body}>
        <Ionicons name="compass-outline" size={16} color={theme.colors.textSecondary} />
        <View style={styles.copy}>
          <Text style={styles.label} numberOfLines={1}>{navigation.label}</Text>
          {navigation.reason ? (
            <Text style={styles.reason} numberOfLines={2}>{navigation.reason}</Text>
          ) : null}
        </View>
      </View>

      <TouchableOpacity
        style={styles.button}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={`${t('gluno.navigation.open')} — ${navigation.label}`}
        // The only thing that ever navigates. Pushed, so back returns to the
        // conversation.
        onPress={() => openGlunoNavigation(navigation)}>
        <Text style={styles.buttonText}>{t('gluno.navigation.open')}</Text>
        <Ionicons name="arrow-forward" size={14} color={theme.colors.white} />
      </TouchableOpacity>
    </View>
  );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  card: {
    marginTop: 10,
    padding: 12,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: theme.colors.bgLight,
  },
  body: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  copy: {
    flex: 1,
  },
  label: {
    fontSize: 13.5,
    fontWeight: '800',
    color: theme.colors.textPrimary,
  },
  reason: {
    marginTop: 2,
    fontSize: 11.5,
    lineHeight: 16,
    color: theme.colors.textMeta,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: theme.colors.primary,
  },
  buttonText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: theme.colors.white,
  },
});
