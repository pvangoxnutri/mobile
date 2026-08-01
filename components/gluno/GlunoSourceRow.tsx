import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useI18n } from '@/components/i18n-provider';
import { useTheme } from '@/components/theme-provider';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { GlunoSource } from '@/lib/gluno';
import type { AppTheme } from '@/constants/themes';

// ──────────────────────────────────────────────────────────────────────────
// GLUNO — where the answer's facts came from.
//
// The design problem here is trust versus noise. A chat that cites everything
// reads as a research paper and nobody looks at any of it; a chat that cites
// nothing gives the user no way to tell a verified travel time from a guess.
//
// The resolution: one quiet row of chips under the message, collapsed by
// SOURCE rather than by fact — fourteen route legs are one "Route data" chip.
// Tapping opens the detail: what it supports, and when it was checked. That
// keeps the default reading experience conversational while making the
// provenance one tap away for anyone who wants it.
//
// Place attribution is deliberately NOT here. It belongs on the place card,
// next to the rating it supports, where a provider's terms expect it and where
// it actually means something.
//
// Nothing internal is ever shown: no evidence ids, no tool names, no database
// ids, no prompt fragments.
// ──────────────────────────────────────────────────────────────────────────

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  route: 'navigate-outline',
  live: 'megaphone-outline',
  weather: 'partly-sunny-outline',
  hours: 'time-outline',
  plan: 'map-outline',
  provider: 'globe-outline',
};

type Props = {
  sources: GlunoSource[];
};

export default function GlunoSourceRow({ sources }: Props) {
  const styles = useThemedStyles(createStyles);
  const { theme } = useTheme();
  const { t, language } = useI18n();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState<GlunoSource | null>(null);

  if (sources.length === 0) return null;

  function formatVerified(iso: string | null) {
    if (!iso) return null;
    try {
      return new Date(iso).toLocaleString(language === 'sv' ? 'sv-SE' : 'en-GB', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return null;
    }
  }

  return (
    <>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>{t('gluno.sources.label')}</Text>

        {sources.map((source, index) => (
          <TouchableOpacity
            key={`${source.kind}-${index}`}
            style={styles.chip}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel={`${source.label}. ${source.supports}`}
            onPress={() => setOpen(source)}>
            <Ionicons
              name={ICONS[source.kind] ?? 'information-circle-outline'}
              size={12}
              color={theme.colors.textMuted}
            />
            <Text style={styles.chipText} numberOfLines={1}>
              {source.label}
            </Text>
            {/* Stale data is labelled, never hidden — an old value can still be
                the most useful thing available, as long as nobody reads it as
                "right now". */}
            {source.isStale ? <Text style={styles.staleDot}>·</Text> : null}
          </TouchableOpacity>
        ))}
      </View>

      <Modal
        visible={open != null}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(null)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(null)}>
          <Pressable
            style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}
            onPress={(event) => event.stopPropagation()}>
            <View style={styles.sheetHandle} />

            {open ? (
              <>
                <View style={styles.sheetHeader}>
                  <Ionicons
                    name={ICONS[open.kind] ?? 'information-circle-outline'}
                    size={19}
                    color={theme.colors.primary}
                  />
                  <Text style={styles.sheetTitle}>{open.label}</Text>
                </View>

                <Text style={styles.sheetSupports}>{open.supports}</Text>

                {open.provider ? (
                  <Text style={styles.sheetMeta}>
                    {t('gluno.sources.provider')}: {open.provider === 'tripadvisor' ? 'Tripadvisor' : open.provider}
                  </Text>
                ) : null}

                {formatVerified(open.verifiedAt) ? (
                  <Text style={styles.sheetMeta}>
                    {t('gluno.sources.verifiedAt')}: {formatVerified(open.verifiedAt)}
                  </Text>
                ) : null}

                {open.isStale ? (
                  <Text style={styles.sheetStale}>{t('gluno.sources.stale')}</Text>
                ) : null}
              </>
            ) : null}

            <TouchableOpacity
              style={styles.closeButton}
              activeOpacity={0.85}
              accessibilityRole="button"
              onPress={() => setOpen(null)}>
              <Text style={styles.closeText}>{t('gluno.sources.close')}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingLeft: 2,
  },
  rowLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    color: theme.colors.textMuted,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: 190,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: theme.colors.bgLight,
  },
  chipText: {
    flexShrink: 1,
    fontSize: 11,
    color: theme.colors.textMeta,
  },
  staleDot: {
    fontSize: 13,
    fontWeight: '800',
    color: theme.colors.textMuted,
  },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    paddingHorizontal: 20,
    paddingTop: 10,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    backgroundColor: theme.colors.surface,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.sheetHandle,
    marginBottom: 16,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  sheetTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    color: theme.colors.textPrimary,
  },
  sheetSupports: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 20,
    color: theme.colors.textSecondary,
  },
  sheetMeta: {
    marginTop: 8,
    fontSize: 12.5,
    color: theme.colors.textMeta,
  },
  sheetStale: {
    marginTop: 10,
    fontSize: 12.5,
    lineHeight: 18,
    color: theme.colors.textMuted,
  },
  closeButton: {
    marginTop: 18,
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: theme.colors.bgLight,
  },
  closeText: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.textSecondary,
  },
});
