// One day's places: the main location plus any additional stops, in visit
// order. Add, edit, remove and reorder all live here rather than inline in the
// feed.
//
// Reordering is deliberately NOT nested drag-and-drop inside the feed. The feed
// already wraps every row in DraggableDayList's long-press Pan gesture, and a
// second draggable list inside one of those rows would compete for the same
// gesture — a hold would be ambiguous between "reorder the places" and "move the
// activity". A sheet owns its own gesture space, so the drag is unambiguous.

import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import DayLocationEditor from '@/components/day-location-editor';
import DraggableDayList from '@/components/draggable-day-list';
import ModalSheet from '@/components/modal-sheet';
import { useI18n } from '@/components/i18n-provider';
import { useTheme } from '@/components/theme-provider';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { DayLocationEntriesController } from '@/hooks/use-day-location-entries';
import type { AppTheme } from '@/constants/themes';
import type { StoredMapPlace } from '@/lib/sidequest-location';
import type { TripDayLocation, TripDayLocationEntry } from '@/lib/types';

type Props = {
  visible: boolean;
  onClose: () => void;
  tripId: string;
  date: string; // YYYY-MM-DD
  /** The resolved entry for this date — used only to seed the main-location
   * picker when the day has no stored rows yet. */
  resolved: TripDayLocation | null;
  suggestedPlace?: StoredMapPlace | null;
  controller: DayLocationEntriesController;
  /** Lets the feed refresh the resolved timeline (and with it the slideshow)
   * after the stored rows change. */
  onChanged: () => void;
};

export default function DayLocationsSheet({
  visible,
  onClose,
  tripId,
  date,
  resolved,
  suggestedPlace,
  controller,
  onChanged,
}: Props) {
  const { t, language } = useI18n();
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const locale = language === 'sv' ? 'sv-SE' : 'en-US';

  const stored = controller.forDate(date);

  // Which picker is open on top of this sheet: a brand-new additional stop, or
  // one existing place being edited.
  const [picker, setPicker] = useState<{ mode: 'add' } | { mode: 'edit'; entry: TripDayLocationEntry } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [reordering, setReordering] = useState(false);

  // Local mirror so a drag looks instant. Rebuilt from the controller whenever
  // the real order changes, which is also the rollback: a failed reorder simply
  // leaves the server order in place and this snaps back to it.
  const [draftOrder, setDraftOrder] = useState<TripDayLocationEntry[]>(stored);
  const storedKey = useMemo(() => stored.map((e) => e.id).join(','), [stored]);
  useEffect(() => {
    setDraftOrder(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storedKey]);

  useEffect(() => {
    if (!visible) {
      setPicker(null);
      setError('');
    }
  }, [visible]);

  const dateLabel = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(
    new Date(`${date}T12:00:00`),
  );

  async function handleReorder(next: TripDayLocationEntry[]) {
    const previous = draftOrder;
    setDraftOrder(next);
    setError('');
    setReordering(true);
    try {
      await controller.reorder(date, next.map((e) => e.id));
      onChanged();
    } catch {
      // Restore the order the user saw before the drag — the server never
      // accepted the new one, so showing it would be a lie.
      setDraftOrder(previous);
      setError(t('dayLocation.reorderFailed'));
    } finally {
      setReordering(false);
    }
  }

  function confirmRemove(entry: TripDayLocationEntry) {
    Alert.alert(t('dayLocation.removeConfirmTitle'), t('dayLocation.removeConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.remove'),
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setBusyId(entry.id);
            setError('');
            try {
              await controller.removeEntry(entry.id);
              onChanged();
            } catch {
              setError(t('dayLocation.removeFailed'));
            } finally {
              setBusyId(null);
            }
          })();
        },
      },
    ]);
  }

  return (
    <>
      <ModalSheet visible={visible && !picker} onClose={onClose} autoHeight>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>{t('dayLocation.title')}</Text>
              <Text style={styles.dateLabel}>{dateLabel}</Text>
            </View>
            <TouchableOpacity accessibilityRole="button" onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={20} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {stored.length === 0 ? (
            // No stored rows: this day is either empty or showing a carried-
            // forward value. Either way the only meaningful action is to set
            // the day's MAIN location, through the existing flow.
            <>
              <Text style={styles.description}>{t('dayLocation.description')}</Text>
              <TouchableOpacity
                activeOpacity={0.9}
                style={styles.primaryAction}
                accessibilityRole="button"
                onPress={() => setPicker({ mode: 'add' })}>
                <Ionicons name="location-outline" size={16} color="#fff" />
                <Text style={styles.primaryActionText}>{t('dayLocation.setLocation')}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.description}>{t('dayLocation.reorderHint')}</Text>

              <View style={styles.list}>
                <DraggableDayList
                  items={draftOrder}
                  keyExtractor={(entry) => entry.id}
                  enabled={!reordering && busyId === null && draftOrder.length > 1}
                  onReorder={(next) => void handleReorder(next)}
                  renderItem={(entry, isDragging) => {
                    const isMain = draftOrder[0]?.id === entry.id;
                    return (
                      <View style={[styles.row, isDragging ? styles.rowDragging : null]}>
                        <Ionicons
                          name={isMain ? 'location' : 'ellipse-outline'}
                          size={15}
                          color={isMain ? theme.colors.primary : theme.colors.textMeta}
                        />
                        <View style={styles.rowCopy}>
                          <Text style={styles.rowLabel} numberOfLines={1}>
                            {entry.locationLabel}
                          </Text>
                          <Text style={styles.rowRole}>
                            {isMain ? t('dayLocation.mainLocation') : t('dayLocation.additionalStop')}
                          </Text>
                        </View>
                        {busyId === entry.id ? (
                          <ActivityIndicator size="small" color={theme.colors.textMeta} />
                        ) : (
                          <>
                            <TouchableOpacity
                              accessibilityRole="button"
                              accessibilityLabel={t('dayLocation.editLocation')}
                              style={styles.rowAction}
                              onPress={() => setPicker({ mode: 'edit', entry })}>
                              <Ionicons name="pencil" size={15} color={theme.colors.textSecondary} />
                            </TouchableOpacity>
                            <TouchableOpacity
                              accessibilityRole="button"
                              accessibilityLabel={t('dayLocation.removeLocation')}
                              style={styles.rowAction}
                              onPress={() => confirmRemove(entry)}>
                              <Ionicons name="trash-outline" size={15} color={theme.colors.error} />
                            </TouchableOpacity>
                          </>
                        )}
                      </View>
                    );
                  }}
                />
              </View>

              <TouchableOpacity
                activeOpacity={0.9}
                style={styles.addAnother}
                accessibilityRole="button"
                onPress={() => setPicker({ mode: 'add' })}>
                <Ionicons name="add" size={16} color={theme.colors.primary} />
                <Text style={styles.addAnotherText} numberOfLines={2}>
                  {t('dayLocation.addAnother')}
                </Text>
              </TouchableOpacity>
            </>
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Text style={styles.explainer}>{t('dayLocation.carryForwardExplainer')}</Text>
        </View>
      </ModalSheet>

      {/* The SAME Places picker the day's main location uses — only where it
          saves differs, via commitOverride. Editing keeps an entry's position:
          the update endpoint never touches sortIndex, so the main location
          stays main and an additional stop stays additional. */}
      {picker ? (
        <DayLocationEditor
          visible
          onClose={() => setPicker(null)}
          tripId={tripId}
          date={date}
          current={picker.mode === 'edit' ? null : stored.length === 0 ? resolved : null}
          suggestedPlace={picker.mode === 'add' ? suggestedPlace : null}
          hideRemove
          titleOverride={
            picker.mode === 'edit' ? t('dayLocation.editLocation') : t('dayLocation.addAnother')
          }
          commitOverride={async (input) => {
            if (picker.mode === 'edit') {
              await controller.updateEntry(picker.entry.id, input);
            } else {
              await controller.addEntry(date, input);
            }
            onChanged();
          }}
          onChanged={() => {}}
        />
      ) : null}
    </>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    sheet: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 20, gap: 12 },
    header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    headerCopy: { flex: 1, minWidth: 0 },
    title: { fontSize: 18, fontWeight: '800', color: theme.colors.textPrimary },
    dateLabel: { marginTop: 2, fontSize: 13, color: theme.colors.textSecondary },
    closeButton: { padding: 4 },
    description: { fontSize: 13, lineHeight: 18, color: theme.colors.textSecondary },
    list: { marginTop: 2 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 8,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.isDark ? theme.colors.borderInput : '#e7e9ee',
      backgroundColor: theme.isDark ? theme.colors.bgLightest : '#fff',
    },
    rowDragging: { borderColor: theme.colors.primary },
    rowCopy: { flex: 1, minWidth: 0 },
    rowLabel: { fontSize: 14, fontWeight: '700', color: theme.colors.textPrimary },
    rowRole: { marginTop: 2, fontSize: 11, color: theme.colors.textMeta },
    rowAction: { padding: 6 },
    primaryAction: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      minHeight: 46,
      paddingHorizontal: 16,
      borderRadius: 23,
      backgroundColor: theme.colors.primary,
    },
    primaryActionText: { flexShrink: 1, fontSize: 14, fontWeight: '800', color: '#fff' },
    addAnother: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 6,
      minHeight: 40,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 1.5,
      borderStyle: 'dashed',
      borderColor: theme.isDark ? theme.colors.primaryLight20 : '#ff9cb0',
      backgroundColor: theme.isDark ? theme.colors.primaryLight08 : '#fff0f3',
    },
    addAnotherText: { flexShrink: 1, fontSize: 13, fontWeight: '700', color: theme.colors.primary },
    error: { fontSize: 13, fontWeight: '600', color: theme.colors.error },
    explainer: { fontSize: 12, lineHeight: 17, color: theme.colors.textMeta },
  });
