import { memo } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/components/theme-provider';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { GlunoPlace } from '@/lib/gluno';
import type { AppTheme } from '@/constants/themes';

// ──────────────────────────────────────────────────────────────────────────
// GLUNO — several recommendations, as a shortlist.
//
// Gluno could already suggest Real Alcázar and five others, but they arrived
// as prose: to act on one, somebody had to read the paragraph, pick a name,
// and type it back. The information was there and the action was not.
//
// COMPACT ON PURPOSE, AND MUCH SMALLER THAN THE DETAIL CARD. Six full cards is
// a page nobody scrolls to the end of. A row is enough to choose FROM — a
// name, what it is, where it is — and everything else belongs behind the tap.
//
// Nothing here decides anything. A row carries the server's own option key and
// sends it back; the app never handles a provider id, a coordinate or a name
// as an identifier.
// ──────────────────────────────────────────────────────────────────────────

type Props = {
  places: GlunoPlace[];
  /** The row waiting on a request, if any. Only that one spins. */
  pendingKey?: string | null;
  /** The row whose detail card is currently open. */
  openKey?: string | null;
  onSelect: (place: GlunoPlace) => void;
};

function GlunoPlaceRecommendationList({ places, pendingKey, openKey, onSelect }: Props) {
  const styles = useThemedStyles(createStyles);
  const { theme } = useTheme();

  if (places.length === 0) return null;

  return (
    <View style={styles.list}>
      {places.map((place) => {
        const pending = pendingKey === place.optionKey;
        const open = openKey === place.optionKey;

        return (
          <TouchableOpacity
            key={place.optionKey}
            // The WHOLE row. A tappable name with dead space beside it is a
            // target people miss.
            style={[styles.row, open && styles.rowOpen]}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityState={{ selected: open, busy: pending }}
            accessibilityLabel={place.name}
            // Guards the double tap locally as well as server-side. A second
            // request that returns the same card still costs a round trip and
            // a flicker.
            disabled={pending}
            onPress={() => onSelect(place)}>
            <View style={styles.rowCopy}>
              {/* No numberOfLines: a long place name wraps rather than being
                  cut, because the tail is often what distinguishes two places
                  with the same first word. */}
              <Text style={[styles.name, open && styles.nameOpen]}>{place.name}</Text>

              <Text style={styles.meta} numberOfLines={1}>
                {[place.categoryLabel || place.category, place.address]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>

              {/* Only when the provider actually gave one. An absent rating
                  shows nothing rather than a placeholder that reads as zero. */}
              {typeof place.rating === 'number' ? (
                <View style={styles.ratingRow}>
                  <Ionicons name="star" size={11} color={theme.colors.primary} />
                  <Text style={styles.rating}>
                    {place.rating.toFixed(1)}
                    {place.ratingScaleMax ? `/${place.ratingScaleMax}` : ''}
                    {place.reviewCount ? ` · ${place.reviewCount}` : ''}
                  </Text>
                </View>
              ) : null}
            </View>

            {pending ? (
              <ActivityIndicator size="small" color={theme.colors.textMuted} />
            ) : (
              <Ionicons
                name={open ? 'chevron-up' : 'chevron-forward'}
                size={16}
                color={open ? theme.colors.primary : theme.colors.textMuted}
              />
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  list: {
    gap: 6,
    marginTop: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: theme.colors.surfaceElevated,
  },
  rowOpen: {
    backgroundColor: theme.isDark ? theme.colors.primaryLight12 : '#fff0f4',
  },
  rowCopy: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: 14.5,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  nameOpen: {
    color: theme.colors.primary,
  },
  meta: {
    fontSize: 12,
    color: theme.colors.textMeta,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 1,
  },
  rating: {
    fontSize: 11.5,
    color: theme.colors.textMeta,
  },
});

export default memo(GlunoPlaceRecommendationList);
