import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ModalSheet from '@/components/modal-sheet';
import { useI18n } from '@/components/i18n-provider';
import { useTheme } from '@/components/theme-provider';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import {
  analyzeGlunoDocument,
  cancelGlunoDocumentAnalysis,
  createGlunoDocumentProposals,
  getGlunoDocumentAnalysis,
  type GlunoDocumentAnalysis,
  type GlunoDocumentError,
  type GlunoDocumentItem,
} from '@/lib/gluno-documents';
import type { AppTheme } from '@/constants/themes';

// ──────────────────────────────────────────────────────────────────────────
// GLUNO — reviewing what was read out of a booking document.
//
// This screen exists because an extraction is a MACHINE'S READING OF A
// PHOTOGRAPH of somebody's booking. It is right most of the time and
// confidently wrong the rest, and the failure mode — a wrong flight time in an
// itinerary the user believes they checked — is exactly the kind nobody
// catches until it matters.
//
// So: every item is opt-in, nothing is selected by default, and an ambiguous
// date cannot be accepted at all until the user resolves it. Selecting items
// produces PROPOSALS, which then go through the ordinary review-and-apply
// flow — a document gets no shortcut just because it looks official.
//
// What is deliberately not shown: raw OCR text, JSON, per-field internals, or
// a full confirmation number. A review screen full of machine output is not a
// review screen, and a booking reference on a phone in a café is a booking
// somebody else can change.
// ──────────────────────────────────────────────────────────────────────────

/**
 * Polling interval while an analysis runs.
 *
 * Deliberately unhurried, and it BACKS OFF. A document takes tens of seconds
 * to read; polling every second would produce forty requests to watch a
 * progress state that changes once.
 */
const POLL_INTERVAL_MS = 2500;
const MAX_POLLS = 40;

const TYPE_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  flight: 'airplane-outline',
  hotel: 'bed-outline',
  train: 'train-outline',
  ferry: 'boat-outline',
  bus: 'bus-outline',
  car_rental: 'car-outline',
  restaurant_reservation: 'restaurant-outline',
  activity_booking: 'ticket-outline',
};

type Props = {
  documentId: string | null;
  visible: boolean;
  onClose: () => void;
  /** Called once proposals exist, so the caller can point at the chat. */
  onProposalsCreated?: () => void;
};

export default function GlunoDocumentAnalysisSheet({
  documentId,
  visible,
  onClose,
  onProposalsCreated,
}: Props) {
  const styles = useThemedStyles(createStyles);
  const { theme } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();

  const [analysis, setAnalysis] = useState<GlunoDocumentAnalysis | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const pollsRef = useRef(0);

  // Polling stops the moment the sheet closes. A background timer hitting a
  // private endpoint after the user walked away is both wasteful and wrong.
  useEffect(() => {
    if (!visible || !documentId) {
      abortRef.current?.abort();
      abortRef.current = null;
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    abortRef.current = controller;
    pollsRef.current = 0;

    setAnalysis(null);
    setSelected(new Set());
    setFailure(null);
    setBusy(true);

    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll(analysisId: string) {
      if (cancelled || pollsRef.current >= MAX_POLLS) return;
      pollsRef.current += 1;

      try {
        const next = await getGlunoDocumentAnalysis(analysisId, controller.signal);
        if (cancelled) return;

        setAnalysis(next);

        if (next.status === 'pending' || next.status === 'processing') {
          timer = setTimeout(() => void poll(analysisId), POLL_INTERVAL_MS);
        } else {
          setBusy(false);
        }
      } catch {
        if (!cancelled) setBusy(false);
      }
    }

    analyzeGlunoDocument(documentId, controller.signal)
      .then((result) => {
        if (cancelled) return;
        setAnalysis(result);

        if (result.status === 'pending' || result.status === 'processing') {
          timer = setTimeout(() => void poll(result.id), POLL_INTERVAL_MS);
        } else {
          setBusy(false);
        }
      })
      .catch((error: GlunoDocumentError) => {
        if (cancelled || error.cancelled) return;
        setFailure(error.code ?? 'generic');
        setBusy(false);
      });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      controller.abort();
    };
  }, [visible, documentId]);

  const toggle = useCallback((itemId: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }, []);

  async function handleCreate() {
    if (!analysis || selected.size === 0 || creating) return;

    setCreating(true);
    try {
      await createGlunoDocumentProposals(analysis.id, [...selected]);
      onProposalsCreated?.();
      onClose();
    } catch (error) {
      setFailure((error as GlunoDocumentError).code ?? 'generic');
    } finally {
      setCreating(false);
    }
  }

  async function handleCancel() {
    if (!analysis) return;
    abortRef.current?.abort();
    try {
      await cancelGlunoDocumentAnalysis(analysis.id);
    } catch {
      // The sheet closes either way; a failed cancel is not worth a message.
    }
    onClose();
  }

  /**
   * An item the user must resolve before it can be accepted.
   *
   * An ambiguous date is genuinely un-guessable — accepting one would put
   * somebody on the wrong day with total confidence — and a blocker means the
   * reading contradicts itself.
   */
  function isSelectable(item: GlunoDocumentItem) {
    return item.blockers.length === 0
      && item.alternativeDateReadings.length === 0
      && item.confidenceBucket !== 'very_low';
  }

  const items = analysis?.items ?? [];
  const state = failure
    ? 'failed'
    : busy || analysis?.status === 'processing' || analysis?.status === 'pending'
      ? 'analyzing'
      : analysis?.status === 'superseded'
        ? 'superseded'
        : analysis?.status === 'failed'
          ? 'failed'
          : items.length === 0
            ? 'empty'
            : 'completed';

  return (
    <ModalSheet visible={visible} onClose={onClose} autoHeight slowEntry>
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
        <View style={styles.handle} />

        <View style={styles.header}>
          <Ionicons name="document-text-outline" size={19} color={theme.colors.primary} />
          <Text style={styles.title}>{t('gluno.documents.title')}</Text>
          <TouchableOpacity
            style={styles.closeButton}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={t('common.cancel')}
            onPress={state === 'analyzing' ? handleCancel : onClose}>
            <Ionicons name="close" size={18} color={theme.colors.textPrimary} />
          </TouchableOpacity>
        </View>

        {state === 'analyzing' && (
          <View style={styles.stateRow}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
            <Text style={styles.stateText}>{t('gluno.documents.analyzing')}</Text>
          </View>
        )}

        {state === 'failed' && (
          <Text style={styles.stateText}>{t('gluno.documents.failed')}</Text>
        )}

        {state === 'empty' && (
          <Text style={styles.stateText}>{t('gluno.documents.nothingFound')}</Text>
        )}

        {state === 'superseded' && (
          <Text style={styles.stateText}>{t('gluno.documents.superseded')}</Text>
        )}

        {state === 'completed' && (
          <>
            <Text style={styles.hint}>{t('gluno.documents.found')}</Text>

            <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
              {items.map((item) => {
                const selectable = isSelectable(item);
                const isSelected = selected.has(item.id);

                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.card, isSelected && styles.cardSelected]}
                    activeOpacity={selectable ? 0.85 : 1}
                    disabled={!selectable}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: isSelected, disabled: !selectable }}
                    onPress={() => selectable && toggle(item.id)}>
                    <View style={styles.cardHeader}>
                      <Ionicons
                        name={TYPE_ICONS[item.type] ?? 'bookmark-outline'}
                        size={17}
                        color={theme.colors.textSecondary}
                      />
                      <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
                      <Ionicons
                        name={isSelected ? 'checkbox' : selectable ? 'square-outline' : 'lock-closed-outline'}
                        size={18}
                        color={isSelected ? theme.colors.primary : theme.colors.textMuted}
                      />
                    </View>

                    {item.startDate ? (
                      <Text style={styles.cardMeta}>
                        {item.startDate}
                        {item.startTime ? ` · ${item.startTime}` : ''}
                        {/* The zone is shown rather than converted. A flight's
                            local departure time is the useful one, and
                            silently rebasing it to the phone's zone is how
                            people miss planes. */}
                        {item.timeZoneId ? ` (${item.timeZoneId})` : ''}
                      </Text>
                    ) : null}

                    {item.departureLocation && item.arrivalLocation ? (
                      <Text style={styles.cardMeta}>
                        {item.departureLocation} → {item.arrivalLocation}
                      </Text>
                    ) : item.address ? (
                      <Text style={styles.cardMeta}>{item.address}</Text>
                    ) : null}

                    {/* Masked, never full. Enough to recognise the booking, not
                        enough for anyone else to use it. */}
                    {item.maskedConfirmation ? (
                      <Text style={styles.cardMeta}>{item.maskedConfirmation}</Text>
                    ) : null}

                    {/* An ambiguous date is shown as the document PRINTED it,
                        with both readings, because that is the only honest way
                        to ask which one is right. */}
                    {item.alternativeDateReadings.length > 0 ? (
                      <Text style={styles.cardWarning}>
                        {t('gluno.documents.ambiguousDate')}
                        {item.startDateOriginalText ? ` "${item.startDateOriginalText}"` : ''}
                      </Text>
                    ) : null}

                    {item.isPossibleDuplicate ? (
                      <Text style={styles.cardWarning}>{t('gluno.documents.possibleDuplicate')}</Text>
                    ) : null}

                    {/* Confidence is surfaced only when it should change what
                        the user does. A badge on every card is noise. */}
                    {item.confidenceBucket === 'low' || item.confidenceBucket === 'very_low' ? (
                      <Text style={styles.cardWarning}>{t('gluno.documents.lowConfidence')}</Text>
                    ) : null}

                    {item.blockers.map((blocker, index) => (
                      <Text key={index} style={styles.cardBlocker}>{blocker}</Text>
                    ))}
                  </TouchableOpacity>
                );
              })}

              {/* Recorded as a fact about the document, never opened. */}
              {analysis?.containsQrCode ? (
                <Text style={styles.footnote}>{t('gluno.documents.qrPresent')}</Text>
              ) : null}
            </ScrollView>

            <TouchableOpacity
              style={[styles.primaryButton, selected.size === 0 && styles.buttonDisabled]}
              activeOpacity={0.85}
              disabled={selected.size === 0 || creating}
              accessibilityRole="button"
              onPress={handleCreate}>
              {creating ? (
                <ActivityIndicator size="small" color={theme.colors.white} />
              ) : (
                <Text style={styles.primaryText}>{t('gluno.documents.review')}</Text>
              )}
            </TouchableOpacity>
          </>
        )}
      </View>
    </ModalSheet>
  );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  sheet: {
    paddingHorizontal: 20,
    paddingTop: 10,
    maxHeight: '85%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.sheetHandle,
    marginBottom: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  title: {
    flex: 1,
    fontSize: 16.5,
    fontWeight: '800',
    color: theme.colors.textPrimary,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bgLight,
  },
  hint: {
    marginTop: 10,
    fontSize: 12.5,
    lineHeight: 18,
    color: theme.colors.textSecondary,
  },
  stateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 22,
  },
  stateText: {
    flex: 1,
    paddingVertical: 18,
    fontSize: 14,
    lineHeight: 20,
    color: theme.colors.textSecondary,
  },
  body: {
    marginTop: 12,
  },
  card: {
    marginBottom: 10,
    padding: 13,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.borderPrimary,
    backgroundColor: theme.colors.surfaceElevated,
  },
  cardSelected: {
    borderColor: theme.colors.primary,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  cardTitle: {
    flex: 1,
    fontSize: 14.5,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  cardMeta: {
    marginTop: 6,
    fontSize: 12.5,
    color: theme.colors.textMeta,
  },
  cardWarning: {
    marginTop: 7,
    fontSize: 11.5,
    lineHeight: 16,
    color: theme.colors.textMuted,
  },
  cardBlocker: {
    marginTop: 7,
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: '600',
    color: theme.colors.error,
  },
  footnote: {
    marginTop: 4,
    marginBottom: 10,
    fontSize: 11.5,
    color: theme.colors.textMuted,
  },
  primaryButton: {
    marginTop: 14,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primary,
  },
  primaryText: {
    fontSize: 14.5,
    fontWeight: '800',
    color: theme.colors.white,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
});
