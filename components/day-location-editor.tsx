// "Location" editor for a single trip day — sets the TripDayLocation anchor
// that the backend's TripDayLocationService carries forward until another
// day sets a new one. This is the ONLY configuration UI for the feature; the
// Weather page just renders whatever the backend resolves, and never runs
// carry-forward logic itself.

import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import ModalSheet from '@/components/modal-sheet';
import { useI18n } from '@/components/i18n-provider';
import { useTheme } from '@/components/theme-provider';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { AppTheme } from '@/constants/themes';
import { deleteTripDayLocation, setTripDayLocation } from '@/lib/day-location-api';
import { fetchPlaceDetails, fetchPlaceSuggestions, type PlaceAutocompleteSuggestion } from '@/lib/maps-api';
import type { StoredMapPlace } from '@/lib/sidequest-location';
import type { TripDayLocation } from '@/lib/types';

type Props = {
  visible: boolean;
  onClose: () => void;
  tripId: string;
  date: string; // YYYY-MM-DD
  // The resolved entry for exactly this date (explicit pick, carried
  // forward, or the trip destination fallback) — null only when the trip has
  // no destination and no anchors at all yet.
  current: TripDayLocation | null;
  // The single unambiguous activity location for this day, when exactly one
  // distinct place exists among that day's activities. Never guesses between
  // several — the caller passes null whenever there's more than one.
  suggestedPlace?: StoredMapPlace | null;
  onChanged: (updated: TripDayLocation | null) => void;
};

export default function DayLocationEditor({ visible, onClose, tripId, date, current, suggestedPlace, onChanged }: Props) {
  const { t, language } = useI18n();
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const locale = language === 'sv' ? 'sv-SE' : 'en-US';

  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceAutocompleteSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState('');
  const pickedLabelRef = useRef<string | null>(null);
  const selectionTokenRef = useRef(0);

  useEffect(() => {
    if (!visible) return;
    setQuery(current?.locationLabel ?? '');
    pickedLabelRef.current = current?.isExplicit ? (current?.locationLabel ?? null) : null;
    selectionTokenRef.current += 1;
    setSuggestions([]);
    setError('');
  }, [visible, date, current]);

  useEffect(() => {
    if (!visible) return;
    const trimmed = query.trim();
    if (trimmed.length < 2 || trimmed === pickedLabelRef.current) {
      setSuggestions([]);
      setSuggestionsLoading(false);
      return;
    }
    setSuggestionsLoading(true);
    const handle = setTimeout(() => {
      void fetchPlaceSuggestions(trimmed)
        .then((items) => setSuggestions(items.slice(0, 5)))
        .catch(() => setSuggestions([]))
        .finally(() => setSuggestionsLoading(false));
    }, 260);
    return () => clearTimeout(handle);
  }, [query, visible]);

  function handleQueryChange(value: string) {
    setQuery(value);
    if (pickedLabelRef.current && value.trim() !== pickedLabelRef.current) {
      pickedLabelRef.current = null;
      selectionTokenRef.current += 1;
    }
  }

  async function commit(label: string, latitude: number, longitude: number, placeId: string | null) {
    setSaving(true);
    setError('');
    try {
      const result = await setTripDayLocation(tripId, date, { locationLabel: label, latitude, longitude, placeId });
      onChanged(result);
      onClose();
    } catch {
      setError(t('dayLocation.saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  function handlePickSuggestion(suggestion: PlaceAutocompleteSuggestion) {
    const label = suggestion.primaryText.trim();
    pickedLabelRef.current = label;
    selectionTokenRef.current += 1;
    const token = selectionTokenRef.current;
    setQuery(label);
    setSuggestions([]);
    Keyboard.dismiss();

    void (async () => {
      try {
        let latitude = suggestion.latitude ?? null;
        let longitude = suggestion.longitude ?? null;
        if ((latitude == null || longitude == null) && !suggestion.placeId.startsWith('osm:')) {
          const details = await fetchPlaceDetails(suggestion.placeId);
          latitude = details.latitude ?? null;
          longitude = details.longitude ?? null;
        }
        if (selectionTokenRef.current !== token) return; // superseded by a newer pick/edit/close
        if (latitude == null || longitude == null) {
          setError(t('dayLocation.saveFailed'));
          return;
        }
        await commit(label, latitude, longitude, suggestion.placeId);
      } catch {
        if (selectionTokenRef.current === token) setError(t('dayLocation.saveFailed'));
      }
    })();
  }

  function handleUseSuggestedPlace() {
    if (!suggestedPlace) return;
    const label = suggestedPlace.name.trim();
    pickedLabelRef.current = label;
    selectionTokenRef.current += 1;
    const token = selectionTokenRef.current;
    setQuery(label);
    setSuggestions([]);
    Keyboard.dismiss();

    void (async () => {
      try {
        let latitude = suggestedPlace.latitude ?? null;
        let longitude = suggestedPlace.longitude ?? null;
        if ((latitude == null || longitude == null) && !suggestedPlace.placeId.startsWith('osm:')) {
          const details = await fetchPlaceDetails(suggestedPlace.placeId);
          latitude = details.latitude ?? null;
          longitude = details.longitude ?? null;
        }
        if (selectionTokenRef.current !== token) return;
        if (latitude == null || longitude == null) {
          setError(t('dayLocation.saveFailed'));
          return;
        }
        await commit(label, latitude, longitude, suggestedPlace.placeId);
      } catch {
        if (selectionTokenRef.current === token) setError(t('dayLocation.saveFailed'));
      }
    })();
  }

  async function handleRemove() {
    setRemoving(true);
    setError('');
    try {
      await deleteTripDayLocation(tripId, date);
      onChanged(null);
      onClose();
    } catch {
      setError(t('dayLocation.removeFailed'));
    } finally {
      setRemoving(false);
    }
  }

  const dateLabel = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${date}T12:00:00`));
  const showSuggestedPlace = Boolean(
    suggestedPlace && suggestedPlace.placeId !== current?.placeId && suggestedPlace.name.trim() !== pickedLabelRef.current,
  );
  const busy = saving || removing;

  return (
    <ModalSheet visible={visible} onClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>{t('dayLocation.title')}</Text>
              <Text style={styles.dateLabel}>{dateLabel}</Text>
            </View>
            <TouchableOpacity accessibilityRole="button" onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={20} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <Text style={styles.description}>{t('dayLocation.description')}</Text>

          <View style={styles.inputRow}>
            <Ionicons name="location-outline" size={18} color={theme.colors.textMeta} />
            <TextInput
              value={query}
              onChangeText={handleQueryChange}
              placeholder={t('dayLocation.searchPlaceholder')}
              placeholderTextColor={theme.colors.textMeta}
              keyboardAppearance={theme.keyboardAppearance}
              style={styles.input}
              editable={!busy}
              autoFocus={!current?.isExplicit}
            />
            {suggestionsLoading ? <ActivityIndicator size="small" color={theme.colors.textMeta} /> : null}
          </View>

          {suggestions.length > 0 ? (
            <View style={styles.suggestions}>
              {suggestions.map((item) => (
                <TouchableOpacity
                  key={item.placeId}
                  activeOpacity={0.9}
                  style={styles.suggestionRow}
                  disabled={busy}
                  onPress={() => handlePickSuggestion(item)}>
                  <Ionicons name="location-outline" size={16} color={theme.colors.primary} />
                  <View style={styles.suggestionCopy}>
                    <Text style={styles.suggestionTitle} numberOfLines={1}>{item.primaryText}</Text>
                    {item.secondaryText ? <Text style={styles.suggestionSubtitle} numberOfLines={1}>{item.secondaryText}</Text> : null}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}

          {showSuggestedPlace ? (
            <TouchableOpacity activeOpacity={0.9} style={styles.reuseRow} disabled={busy} onPress={handleUseSuggestedPlace}>
              <Ionicons name="sparkles-outline" size={16} color={theme.colors.primary} />
              <Text style={styles.reuseText} numberOfLines={1}>{t('dayLocation.reuseActivityLocation', { place: suggestedPlace!.name })}</Text>
            </TouchableOpacity>
          ) : null}

          <Text style={styles.explainer}>{t('dayLocation.carryForwardExplainer')}</Text>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.footer}>
            {current?.isExplicit ? (
              <TouchableOpacity activeOpacity={0.85} style={styles.removeButton} disabled={busy} onPress={handleRemove}>
                {removing ? <ActivityIndicator size="small" color={theme.colors.error} /> : (
                  <>
                    <Ionicons name="trash-outline" size={16} color={theme.colors.error} />
                    <Text style={styles.removeButtonText}>{t('dayLocation.remove')}</Text>
                  </>
                )}
              </TouchableOpacity>
            ) : <View />}
            {saving ? (
              <View style={styles.savingRow}>
                <ActivityIndicator size="small" color={theme.colors.primary} />
                <Text style={styles.savingText}>{t('dayLocation.saving')}</Text>
              </View>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ModalSheet>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      paddingTop: 20,
      paddingBottom: 4,
    },
    headerCopy: {
      flex: 1,
    },
    title: {
      fontSize: 20,
      fontWeight: '800',
      color: theme.colors.textPrimary,
    },
    dateLabel: {
      marginTop: 2,
      fontSize: 13,
      fontWeight: '600',
      textTransform: 'capitalize',
      color: theme.colors.textSecondary,
    },
    closeButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.isDark ? theme.colors.bgLightest : '#f1f3f7',
    },
    description: {
      marginTop: 14,
      fontSize: 14,
      lineHeight: 19,
      color: theme.colors.textSecondary,
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginTop: 16,
      minHeight: 52,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.isDark ? theme.colors.borderInput : '#e6e9ef',
      backgroundColor: theme.isDark ? theme.colors.bgLightest : '#f9fafc',
      paddingHorizontal: 14,
    },
    input: {
      flex: 1,
      fontSize: 16,
      color: theme.isDark ? theme.colors.textPrimary : '#161821',
    },
    suggestions: {
      marginTop: 8,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.isDark ? theme.colors.borderInput : '#e6e9ef',
      backgroundColor: theme.isDark ? theme.colors.bgLightest : '#f9fafc',
      overflow: 'hidden',
    },
    suggestionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    suggestionCopy: {
      flex: 1,
    },
    suggestionTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.isDark ? theme.colors.textPrimary : '#161821',
    },
    suggestionSubtitle: {
      fontSize: 12,
      color: theme.colors.textMeta,
      marginTop: 1,
    },
    reuseRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 14,
      backgroundColor: theme.isDark ? theme.colors.bgLightest : '#f4f0ff',
    },
    reuseText: {
      flex: 1,
      fontSize: 13,
      fontWeight: '600',
      color: theme.colors.primary,
    },
    explainer: {
      marginTop: 14,
      fontSize: 12,
      lineHeight: 17,
      color: theme.colors.textMeta,
    },
    error: {
      marginTop: 10,
      fontSize: 13,
      color: theme.colors.error,
    },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 18,
      paddingBottom: 24,
      minHeight: 36,
    },
    removeButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    removeButtonText: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.colors.error,
    },
    savingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    savingText: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.colors.textSecondary,
    },
  });
