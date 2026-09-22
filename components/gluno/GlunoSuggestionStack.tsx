import { Ionicons } from '@expo/vector-icons';
import { useCallback } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import GlunoPlaceCard from '@/components/gluno/GlunoPlaceCard';
import { useI18n } from '@/components/i18n-provider';
import { useTheme } from '@/components/theme-provider';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { AppTheme } from '@/constants/themes';
import type { GlunoPlace } from '@/lib/gluno';

/**
 * One suggestion at a time, with the two answers it deserves.
 *
 * WHY A STACK RATHER THAN A LIST. Six recommendations as rows is a menu, and a
 * menu asks the user to compare six things before doing anything. One card at a
 * time asks a question they can actually answer — this one, or the next one —
 * and the photo, rating and category are the whole reason a place is worth
 * considering, none of which survives being squeezed into a row.
 *
 * THE CARD ITSELF IS NOT NEW. GlunoPlaceCard already renders the image, name,
 * category, rating, review count and price level, with "absent stays absent"
 * for every missing field. This adds the stack around it and nothing else, so
 * a suggestion looks exactly like a place everywhere else in SideQuest.
 *
 * NOTHING HERE IS PERSISTED. The places live in the screen's memory for as long
 * as the session does — the provider's terms permit showing this content, not
 * storing it, so it is deliberately never written anywhere.
 */
export default function GlunoSuggestionStack({
  place,
  position,
  total,
  busy,
  failureText,
  onDecline,
  onAdd,
}: {
  place: GlunoPlace;
  position: number;
  total: number;
  busy: boolean;
  /** Set when the last add failed. The card STAYS — see onAdd. */
  failureText: string | null;
  onDecline: () => void;
  onAdd: () => void;
}) {
  const styles = useThemedStyles(createStyles);
  const { theme } = useTheme();
  const { t } = useI18n();

  const handleDecline = useCallback(() => { if (!busy) onDecline(); }, [busy, onDecline]);
  const handleAdd = useCallback(() => { if (!busy) onAdd(); }, [busy, onAdd]);

  return (
    <View style={styles.stack}>
      <Text style={styles.counter}>
        {t('gluno.suggestions.position', { position: position + 1, total })}
      </Text>

      <GlunoPlaceCard place={place} />

      {failureText ? (
        <View style={styles.failure}>
          <Ionicons name="alert-circle-outline" size={14} color={theme.colors.textMeta} />
          <Text style={styles.failureText}>{failureText}</Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.action, styles.decline]}
          activeOpacity={0.8}
          disabled={busy}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          accessibilityLabel={t('gluno.suggestions.decline')}
          onPress={handleDecline}>
          <Ionicons name="close" size={17} color={theme.colors.textMeta} />
          <Text style={styles.declineLabel}>{t('gluno.suggestions.decline')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.action, styles.add, busy && styles.addBusy]}
          activeOpacity={0.8}
          disabled={busy}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy, busy }}
          accessibilityLabel={t('gluno.suggestions.add')}
          onPress={handleAdd}>
          {busy ? (
            <ActivityIndicator size="small" color={theme.colors.white} />
          ) : (
            <>
              <Ionicons name="add" size={18} color={theme.colors.white} />
              <Text style={styles.addLabel}>{t('gluno.suggestions.add')}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  stack: {
    marginTop: 10,
    gap: 10,
  },
  counter: {
    fontSize: 12,
    color: theme.colors.textMeta,
    fontWeight: '600',
  },
  failure: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  failureText: {
    flex: 1,
    fontSize: 13,
    color: theme.colors.textMeta,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  action: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
  },
  decline: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.borderPrimary,
    backgroundColor: theme.colors.surface,
  },
  declineLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.textMeta,
  },
  add: {
    backgroundColor: theme.colors.primary,
  },
  addBusy: {
    opacity: 0.7,
  },
  addLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.white,
  },
});
