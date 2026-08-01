import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useI18n } from '@/components/i18n-provider';
import { useTheme } from '@/components/theme-provider';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { GlunoProposal } from '@/lib/gluno';
import type { AppTheme } from '@/constants/themes';

// ──────────────────────────────────────────────────────────────────────────
// GLUNO — proposal preview card.
//
// A proposal is a change Gluno suggests, already validated against the
// Adventure by the backend but NOT saved. Everything about this card is built
// around making that unmissable: the "Suggested change" badge, the muted
// palette, and a footer that says applying is still to come rather than a
// button that looks tappable and isn't.
//
// Two hard rules:
//   • never render raw tool JSON — every kind below reads named fields and
//     formats them; an unrecognised kind falls back to the backend's own
//     one-line summary instead of dumping a payload
//   • never crash the chat — a future action type, a missing field or a
//     malformed date all degrade to something readable
// ──────────────────────────────────────────────────────────────────────────

type Props = {
  proposal: GlunoProposal;
  /** Opens the review sheet. Absent for a card rendered read-only. */
  onReview?: (proposal: GlunoProposal) => void;
  onDismiss?: (proposal: GlunoProposal) => void;
};

function text(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function list(payload: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const value = payload[key];
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object') : [];
}

/** ISO date → a short, localized, human date. Unparseable input is passed through. */
function formatDate(iso: string | null, locale: string): string | null {
  if (!iso) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(date.getTime())) return iso;

  try {
    return date.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });
  } catch {
    return iso;
  }
}

function joinDateTime(date: string | null, time: string | null) {
  return [date, time].filter(Boolean).join(' · ') || null;
}

export default function GlunoProposalCard({ proposal, onReview, onDismiss }: Props) {
  const styles = useThemedStyles(createStyles);
  const { theme } = useTheme();
  const { t, language } = useI18n();
  const locale = language === 'sv' ? 'sv-SE' : 'en-GB';

  const payload = (proposal.payload ?? {}) as Record<string, unknown>;

  const { icon, title, rows, extra } = describe(proposal, payload, locale, t);

  // Only a proposal that still exists server-side and is not terminal can be
  // acted on. A legacy proposal (empty id) predates the apply flow entirely.
  const actionable =
    proposal.id.length > 0 &&
    (proposal.status === 'pending' || proposal.status === 'failed') &&
    Boolean(onReview);

  return (
    <View style={styles.card}>
      <View style={styles.badgeRow}>
        <Ionicons name="sparkles" size={12} color={theme.colors.primary} />
        <Text style={styles.badge}>{t('gluno.proposal.badge')}</Text>
      </View>

      <View style={styles.titleRow}>
        <Ionicons name={icon} size={16} color={theme.colors.textSecondary} />
        <Text style={styles.title}>{title}</Text>
      </View>

      {rows.map((row) => (
        <View key={row.label} style={styles.row}>
          <Text style={styles.rowLabel}>{row.label}</Text>
          <Text style={styles.rowValue} numberOfLines={3}>{row.value}</Text>
        </View>
      ))}

      {extra.length > 0 && (
        <View style={styles.extraList}>
          {extra.map((line, index) => (
            <View key={index} style={styles.extraRow}>
              <Text style={styles.extraMarker}>{index + 1}.</Text>
              <Text style={styles.extraText} numberOfLines={2}>{line}</Text>
            </View>
          ))}
        </View>
      )}

      {/* The footer is the whole safety story in one place: a proposal is
          never applied by tapping the card, only through Review — and the
          status here is the SERVER's, not something the app decided. */}
      {actionable ? (
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.secondaryAction}
            activeOpacity={0.85}
            accessibilityRole="button"
            onPress={() => onDismiss?.(proposal)}>
            <Text style={styles.secondaryActionText}>{t('gluno.proposal.dismiss')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.primaryAction}
            activeOpacity={0.85}
            accessibilityRole="button"
            onPress={() => onReview?.(proposal)}>
            <Text style={styles.primaryActionText}>{t('gluno.proposal.review')}</Text>
            <Ionicons name="arrow-forward" size={14} color={theme.colors.white} />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.footer}>
          <Ionicons
            name={statusIcon(proposal.status)}
            size={13}
            color={proposal.status === 'applied' ? theme.colors.success : theme.colors.textMuted}
          />
          <Text
            style={[styles.footerText, proposal.status === 'applied' && styles.footerTextApplied]}>
            {statusText(proposal, t)}
          </Text>
          {proposal.status === 'applying' ? (
            <ActivityIndicator size="small" color={theme.colors.textMuted} />
          ) : null}
        </View>
      )}
    </View>
  );
}

function statusIcon(status: GlunoProposal['status']): keyof typeof Ionicons.glyphMap {
  switch (status) {
    case 'applied':
      return 'checkmark-circle';
    case 'rejected':
      return 'close-circle-outline';
    case 'stale':
      return 'refresh-circle-outline';
    case 'failed':
      return 'alert-circle-outline';
    default:
      return 'time-outline';
  }
}

/// The one line that says where this proposal stands. `stale` gets its own
/// sentence because it is the only status the user can act on — by asking
/// Gluno for a fresh suggestion.
function statusText(proposal: GlunoProposal, t: (key: string) => string) {
  switch (proposal.status) {
    case 'applied':
      return t('gluno.proposal.applied');
    case 'rejected':
      return t('gluno.proposal.dismissed');
    case 'applying':
      return t('gluno.proposal.applying');
    case 'stale':
      return t('gluno.proposal.stale');
    case 'failed':
      return t('gluno.proposal.failed');
    default:
      // A status this build has never heard of. Deliberately NOT the stale
      // copy: "no longer current" is a claim about the user's suggestion, and
      // making it about a status we cannot read is inventing a fact.
      return t('gluno.proposal.unknownStatus');
  }
}

type Described = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  rows: { label: string; value: string }[];
  extra: string[];
};

function describe(
  proposal: GlunoProposal,
  payload: Record<string, unknown>,
  locale: string,
  t: (key: string, vars?: Record<string, string | number>) => string,
): Described {
  const rows: { label: string; value: string }[] = [];
  const push = (label: string, value: string | null) => {
    if (value) rows.push({ label, value });
  };

  switch (proposal.kind) {
    case 'activity': {
      push(t('gluno.proposal.field.what'), text(payload, 'title'));
      push(t('gluno.proposal.field.when'), joinDateTime(formatDate(text(payload, 'date'), locale), text(payload, 'time')));
      const end = joinDateTime(formatDate(text(payload, 'endDate'), locale), text(payload, 'endTime'));
      push(t('gluno.proposal.field.until'), end);
      push(t('gluno.proposal.field.notes'), text(payload, 'description'));
      return { icon: 'add-circle-outline', title: t('gluno.proposal.activity'), rows, extra: [] };
    }

    case 'day_plan': {
      const activities = list(payload, 'activities');
      push(t('gluno.proposal.field.day'), formatDate(text(payload, 'date'), locale));
      push(
        t('gluno.proposal.field.items'),
        activities.length === 1
          ? t('gluno.proposal.itemCountOne')
          : t('gluno.proposal.itemCount', { count: activities.length }),
      );
      const extra = activities.map((activity) =>
        [text(activity, 'time'), text(activity, 'title')].filter(Boolean).join(' · ') || t('gluno.proposal.untitled'));
      return { icon: 'calendar-outline', title: t('gluno.proposal.dayPlan'), rows, extra };
    }

    case 'day_location': {
      push(t('gluno.proposal.field.day'), formatDate(text(payload, 'date'), locale));
      push(t('gluno.proposal.field.place'), text(payload, 'label'));
      return { icon: 'location-outline', title: t('gluno.proposal.dayLocation'), rows, extra: [] };
    }

    case 'activity_move': {
      push(t('gluno.proposal.field.what'), text(payload, 'title'));
      push(t('gluno.proposal.field.from'), joinDateTime(formatDate(text(payload, 'fromDate'), locale), text(payload, 'fromTime')));
      push(t('gluno.proposal.field.to'), joinDateTime(formatDate(text(payload, 'toDate'), locale), text(payload, 'toTime')));
      return { icon: 'swap-horizontal-outline', title: t('gluno.proposal.move'), rows, extra: [] };
    }

    case 'trip_dates': {
      push(t('gluno.proposal.field.start'), formatDate(text(payload, 'startDate'), locale));
      const end = formatDate(text(payload, 'endDate'), locale);
      push(t('gluno.proposal.field.end'), end ?? t('gluno.proposal.openEnded'));
      return { icon: 'calendar-number-outline', title: t('gluno.proposal.tripDates'), rows, extra: [] };
    }

    default:
      // A tool type this build has never heard of. The backend's own summary
      // is always a plain sentence, so it is the safe thing to show — and the
      // card still reads as a suggestion rather than as broken output.
      return { icon: 'sparkles-outline', title: t('gluno.proposal.generic'), rows: [], extra: [] };
  }
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  card: {
    marginTop: 10,
    padding: 14,
    borderRadius: 16,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.borderPrimary,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  badge: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: theme.colors.primary,
  },
  titleRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    flex: 1,
    fontSize: 14.5,
    fontWeight: '800',
    color: theme.colors.textPrimary,
  },
  row: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  rowLabel: {
    width: 76,
    fontSize: 12,
    color: theme.colors.textMeta,
  },
  rowValue: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: theme.colors.textPrimary,
  },
  extraList: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.borderPrimary,
    gap: 5,
  },
  extraRow: {
    flexDirection: 'row',
    gap: 8,
  },
  extraMarker: {
    minWidth: 16,
    fontSize: 12.5,
    fontWeight: '700',
    color: theme.colors.textMeta,
  },
  extraText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 18,
    color: theme.colors.textSecondary,
  },
  footer: {
    marginTop: 12,
    paddingTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.borderPrimary,
  },
  footerText: {
    flex: 1,
    fontSize: 11.5,
    color: theme.colors.textMuted,
  },
  footerTextApplied: {
    color: theme.colors.success,
    fontWeight: '700',
  },
  actions: {
    marginTop: 12,
    paddingTop: 10,
    flexDirection: 'row',
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.borderPrimary,
  },
  secondaryAction: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bgLight,
  },
  secondaryActionText: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.textSecondary,
  },
  primaryAction: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primary,
  },
  primaryActionText: {
    fontSize: 13,
    fontWeight: '800',
    color: theme.colors.white,
  },
});
