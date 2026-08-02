import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ModalSheet from '@/components/modal-sheet';
import { useI18n } from '@/components/i18n-provider';
import { useTheme } from '@/components/theme-provider';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { apiJson } from '@/lib/api';
import type { Quest } from '@/lib/types';
import type { AppTheme } from '@/constants/themes';

// ──────────────────────────────────────────────────────────────────────────
// GLUNO — choosing which Adventure the conversation is about.
//
// The header used to show the word "Global", which is a developer's word for
// "no trip is selected". It told the user nothing they wanted to know and
// implied a mode rather than a capability — and it was not tappable, so
// somebody looking at it had no way to act on what it said.
//
// It now says "All Adventures", which is what it actually means: Gluno can
// help across everything, and will ask which trip when it matters. And it
// opens a real picker.
//
// TWO KINDS OF SCOPE, AND THEY MUST NOT BLUR. Choosing here switches to a
// DIFFERENT conversation — the one belonging to that Adventure, with its own
// history. Answering a clarification card scopes a single turn and leaves the
// conversation where it was. The header is deliberate; the card is contextual.
// ──────────────────────────────────────────────────────────────────────────

/**
 * Tall enough for several Adventures without becoming a full-screen takeover.
 *
 * Fixed rather than content-sized: see the ModalSheet call below.
 */
const SHEET_HEIGHT = 460;

export type GlunoScopeChoice = {
  /** Null means all Adventures — the global conversation. */
  tripId: string | null;
  title: string | null;
};

type Props = {
  /** The Adventure currently in scope, or null for all of them. */
  tripId: string | null;
  /** The verified title. Null while unverified or when scope is all. */
  tripTitle: string | null;
  /** True while the backend has not yet confirmed the scope. */
  checking?: boolean;
  onChange: (choice: GlunoScopeChoice) => void;
};

function GlunoScopePicker({ tripId, tripTitle, checking = false, onChange }: Props) {
  const styles = useThemedStyles(createStyles);
  const { theme } = useTheme();
  const { t } = useI18n();

  const [open, setOpen] = useState(false);
  const [trips, setTrips] = useState<Quest[] | null>(null);
  const [failed, setFailed] = useState(false);

  // Loaded when the sheet opens, not on mount. The pill is on screen for every
  // Gluno turn and most people never tap it — fetching every trip on the off
  // chance would be a request per conversation opened.
  useEffect(() => {
    if (!open || trips !== null) return;

    let cancelled = false;
    setFailed(false);

    apiJson<Quest[]>('/api/trips')
      .then((rows) => {
        if (!cancelled) setTrips(rows);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [open, trips]);

  // Ongoing, then upcoming, then past — and nearest first inside each group.
  // What somebody is doing now is what they are most likely asking about.
  const ordered = useMemo(() => {
    if (!trips) return [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const rank = (trip: Quest) => {
      const start = new Date(trip.startDate);
      const end = trip.endDate ? new Date(trip.endDate) : null;

      if (start <= today && (!end || end >= today)) return 0;
      return start > today ? 1 : 2;
    };

    return [...trips].sort((a, b) => {
      const byGroup = rank(a) - rank(b);
      if (byGroup !== 0) return byGroup;

      const left = new Date(a.startDate).getTime();
      const right = new Date(b.startDate).getTime();

      // Nearest first among upcoming, most recent first among past.
      return rank(a) === 2 ? right - left : left - right;
    });
  }, [trips]);

  const choose = useCallback(
    (choice: GlunoScopeChoice) => {
      setOpen(false);
      // Same scope tapped again is a no-op rather than a reload — switching
      // conversations discards an in-flight turn, and doing that for nothing
      // would look like the app losing the answer.
      if (choice.tripId !== tripId) onChange(choice);
    },
    [onChange, tripId],
  );

  const scoped = tripId != null && !checking;
  const label = checking
    ? t('gluno.scope.checking')
    : scoped
      ? tripTitle?.trim() || t('gluno.scope.adventure')
      : t('gluno.scope.global');

  return (
    <>
      <TouchableOpacity
        style={[styles.pill, scoped && styles.pillScoped]}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={t('gluno.scope.pick')}
        onPress={() => setOpen(true)}>
        <Ionicons
          name={scoped ? 'map-outline' : 'albums-outline'}
          size={11}
          color={scoped ? theme.colors.primary : theme.colors.textMeta}
        />
        <Text style={[styles.pillText, scoped && styles.pillTextScoped]} numberOfLines={1}>
          {label}
        </Text>
        <Ionicons
          name="chevron-down"
          size={11}
          color={scoped ? theme.colors.primary : theme.colors.textMeta}
        />
      </TouchableOpacity>

      {/* ── Height, and why it is fixed ──────────────────────────────────
          NOT autoHeight. That sizes the sheet to its content, and a
          ScrollView inside a content-sized parent collapses to nothing: the
          parent asks the child how tall it wants to be, and a ScrollView
          answers "however much you give me" — which is zero. The sheet
          opened, the title rendered, and the entire list was invisible.

          A fixed height gives the ScrollView something to fill, so the list
          scrolls inside it instead of dictating it. */}
      <ModalSheet visible={open} onClose={() => setOpen(false)} height={SHEET_HEIGHT}>
        <Text style={styles.sheetTitle}>{t('gluno.scope.pick')}</Text>

        <ScrollView
          style={styles.sheetList}
          contentContainerStyle={styles.sheetContent}
          showsVerticalScrollIndicator={false}
          // The sheet's own backdrop must not swallow a scroll gesture that
          // starts on a row.
          keyboardShouldPersistTaps="handled">
          {/* Always first, always present. "All Adventures" is a real choice
              rather than the absence of one, and somebody who scoped into a
              trip needs a way back out. */}
          <Row
            title={t('gluno.scope.global')}
            subtitle={t('gluno.scope.allSubtitle')}
            icon="albums-outline"
            selected={tripId === null}
            onPress={() => choose({ tripId: null, title: null })}
            styles={styles}
            theme={theme}
          />

          {/* Loading is its own state, distinct from empty. An empty list
              shown while the fetch is still running reads as "you have no
              Adventures", which is a different and alarming claim. */}
          {trips === null && !failed ? (
            <View style={styles.loading}>
              <ActivityIndicator size="small" color={theme.colors.textMuted} />
            </View>
          ) : null}

          {ordered.map((trip) => (
            <Row
              key={trip.id}
              title={trip.title?.trim() || t('home.defaultTripName')}
              subtitle={describe(trip)}
              icon="map-outline"
              selected={tripId === trip.id}
              onPress={() => choose({ tripId: trip.id, title: trip.title ?? null })}
              styles={styles}
              theme={theme}
            />
          ))}

          {/* Only when the API actually returned nothing. */}
          {trips !== null && ordered.length === 0 ? (
            <Text style={styles.empty}>{t('gluno.scope.empty')}</Text>
          ) : null}

          {/* A failed fetch gets a retry rather than an empty list — the
              difference between "you have none" and "I couldn't ask" matters
              to somebody who knows they have four. */}
          {failed ? (
            <TouchableOpacity
              style={styles.retry}
              activeOpacity={0.75}
              accessibilityRole="button"
              onPress={() => {
                setFailed(false);
                setTrips(null);
              }}>
              <Ionicons name="refresh" size={15} color={theme.colors.primary} />
              <Text style={styles.retryText}>{t('gluno.error.retry')}</Text>
            </TouchableOpacity>
          ) : null}
        </ScrollView>
      </ModalSheet>
    </>
  );
}

/**
 * "12 aug – 16 aug" or the destination, whichever is there.
 *
 * Never an id: the row identifies a trip to a person, and a person recognises
 * it by where and when, not by a guid.
 */
function describe(trip: Quest): string | undefined {
  const parts: string[] = [];

  const start = formatShort(trip.startDate);
  const end = trip.endDate ? formatShort(trip.endDate) : null;

  if (start) parts.push(end ? `${start} – ${end}` : start);
  if (trip.destination?.trim()) parts.push(trip.destination.trim());

  return parts.length > 0 ? parts.join(' · ') : undefined;
}

function formatShort(value?: string | null): string | null {
  if (!value) return null;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;

  return parsed.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function Row({
  title,
  subtitle,
  icon,
  selected,
  onPress,
  styles,
  theme,
}: {
  title: string;
  subtitle?: string;
  icon: string;
  selected: boolean;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
  theme: AppTheme;
}) {
  return (
    <TouchableOpacity
      style={[styles.row, selected && styles.rowSelected]}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={title}
      onPress={onPress}>
      <Ionicons
        name={icon as never}
        size={18}
        color={selected ? theme.colors.primary : theme.colors.textMeta}
      />

      <View style={styles.rowCopy}>
        {/* No numberOfLines on the title: the tail of a long Adventure name is
            often what distinguishes two trips to the same place. */}
        <Text style={[styles.rowTitle, selected && styles.rowTitleSelected]}>{title}</Text>
        {subtitle ? (
          <Text style={styles.rowSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {selected ? (
        <Ionicons name="checkmark" size={18} color={theme.colors.primary} />
      ) : null}
    </TouchableOpacity>
  );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    maxWidth: 150,
    paddingHorizontal: 9,
    // Tall enough to hit without being a button competing with the header.
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: theme.colors.surfaceElevated,
  },
  pillScoped: {
    backgroundColor: theme.isDark ? theme.colors.primaryLight12 : '#fff0f4',
  },
  pillText: {
    flexShrink: 1,
    fontSize: 11.5,
    fontWeight: '600',
    color: theme.colors.textMeta,
  },
  pillTextScoped: {
    color: theme.colors.primary,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: theme.colors.textPrimary,
    marginBottom: 10,
  },
  sheetList: {
    // Fills the fixed sheet rather than trying to size it. See the comment at
    // the ModalSheet above for why that distinction is the whole bug.
    flex: 1,
  },
  sheetContent: {
    paddingBottom: 12,
  },
  retry: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 16,
  },
  retryText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: theme.colors.primary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 12,
    borderRadius: 14,
    marginBottom: 4,
  },
  rowSelected: {
    backgroundColor: theme.isDark ? theme.colors.primaryLight12 : '#fff0f4',
  },
  rowCopy: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.textPrimary,
  },
  rowTitleSelected: {
    color: theme.colors.primary,
  },
  rowSubtitle: {
    fontSize: 12.5,
    color: theme.colors.textMeta,
  },
  loading: {
    paddingVertical: 18,
    alignItems: 'center',
  },
  empty: {
    paddingVertical: 18,
    textAlign: 'center',
    fontSize: 13,
    color: theme.colors.textMuted,
  },
});

export default memo(GlunoScopePicker);
