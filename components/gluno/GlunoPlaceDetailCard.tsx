import { memo, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useI18n } from '@/components/i18n-provider';
import { useTheme } from '@/components/theme-provider';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { GlunoPlace } from '@/lib/gluno';
import type { AppTheme } from '@/constants/themes';

// ──────────────────────────────────────────────────────────────────────────
// GLUNO — one recommended place, in enough detail to decide on.
//
// Opens inline under the shortlist rather than as a screen or a sheet. The
// decision is "does this belong in our trip", and that is a question about the
// conversation around it — pushing a screen would take the plan out of view at
// exactly the moment it matters.
//
// ONE PRIMARY ACTION. Add. Everything else here is information; a card with
// four buttons makes somebody choose between actions before choosing about the
// place.
//
// EVERY FACT ON THIS CARD CAME FROM A PROVIDER. Nothing is written by a model,
// and an absent field renders as absent — a missing rating shows nothing
// rather than a zero, and a missing image leaves a placeholder rather than a
// picture of something else.
// ──────────────────────────────────────────────────────────────────────────

type Props = {
  place: GlunoPlace;
  /** The add request is in flight. */
  adding?: boolean;
  /** Already turned into a proposal — Add is spent. */
  added?: boolean;
  onAdd: (place: GlunoPlace) => void;
  onBack: () => void;
};

function GlunoPlaceDetailCard({ place, adding = false, added = false, onAdd, onBack }: Props) {
  const styles = useThemedStyles(createStyles);
  const { theme } = useTheme();
  const { t } = useI18n();

  // A provider URL can rot. When it does the card keeps working — the picture
  // was never the reason to add somewhere.
  const [imageFailed, setImageFailed] = useState(false);

  const hasImage = Boolean(place.imageUrl) && !imageFailed;

  return (
    <View style={styles.card}>
      {hasImage ? (
        <Image
          source={{ uri: place.imageUrl! }}
          style={styles.image}
          resizeMode="cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        // Deliberately not a stock photo of somewhere similar. Showing the
        // wrong building is worse than showing none.
        <View style={styles.imageFallback}>
          <Ionicons name="image-outline" size={22} color={theme.colors.textMuted} />
        </View>
      )}

      <View style={styles.body}>
        <Text style={styles.name}>{place.name}</Text>

        <Text style={styles.meta} numberOfLines={2}>
          {[place.categoryLabel || place.category, place.address].filter(Boolean).join(' · ')}
        </Text>

        {/* Only from the provider, and only when it gave one. */}
        {typeof place.rating === 'number' ? (
          <View style={styles.factRow}>
            <Ionicons name="star" size={13} color={theme.colors.primary} />
            <Text style={styles.fact}>
              {place.rating.toFixed(1)}
              {place.ratingScaleMax ? `/${place.ratingScaleMax}` : ''}
              {place.reviewCount ? ` · ${place.reviewCount}` : ''}
            </Text>
          </View>
        ) : null}

        {place.priceLevel ? (
          <View style={styles.factRow}>
            <Ionicons name="pricetag-outline" size={13} color={theme.colors.textMeta} />
            <Text style={styles.fact}>{place.priceLevel}</Text>
          </View>
        ) : null}

        {place.openingHours?.length ? (
          <View style={styles.factRow}>
            <Ionicons name="time-outline" size={13} color={theme.colors.textMeta} />
            <Text style={styles.fact} numberOfLines={2}>
              {place.openingHours.slice(0, 2).join(' · ')}
            </Text>
          </View>
        ) : null}

        {/* The provider's own summary. Capped: this is a card in a chat, and a
            full review page belongs on the provider's site. */}
        {place.reviewSummary ? (
          <Text style={styles.summary} numberOfLines={4}>
            {place.reviewSummary}
          </Text>
        ) : null}

        {/* Attribution rides on the individual result, next to the rating it
            supports — where the provider's terms expect it and where it means
            something to a reader. */}
        {place.sourceAttribution ? (
          <Text style={styles.attribution}>{place.sourceAttribution}</Text>
        ) : null}

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.add, (adding || added) && styles.addSpent]}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityState={{ busy: adding, disabled: added }}
            accessibilityLabel={t('gluno.place.add')}
            // Guards a double tap locally as well as server-side.
            disabled={adding || added}
            onPress={() => onAdd(place)}>
            {adding ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name={added ? 'checkmark' : 'add'} size={16} color="#fff" />
                <Text style={styles.addText}>
                  {added ? t('gluno.place.added') : t('gluno.place.add')}
                </Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.back}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel={t('gluno.place.back')}
            onPress={onBack}>
            <Text style={styles.backText}>{t('gluno.place.back')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  card: {
    marginTop: 8,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: theme.colors.surfaceElevated,
  },
  image: {
    width: '100%',
    // Enough to recognise a place, not so much that the card becomes a poster
    // and the Add button falls below the fold.
    height: 132,
  },
  imageFallback: {
    width: '100%',
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.isDark ? theme.colors.bgLight : '#f1f2f5',
  },
  body: {
    padding: 14,
    gap: 5,
  },
  name: {
    fontSize: 16.5,
    fontWeight: '800',
    color: theme.colors.textPrimary,
  },
  meta: {
    fontSize: 12.5,
    color: theme.colors.textMeta,
  },
  factRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 1,
  },
  fact: {
    flex: 1,
    fontSize: 12.5,
    color: theme.colors.textSecondary,
  },
  summary: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18.5,
    color: theme.colors.textSecondary,
  },
  attribution: {
    marginTop: 2,
    fontSize: 10.5,
    color: theme.colors.textMuted,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
  },
  add: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    backgroundColor: theme.colors.primary,
  },
  addSpent: {
    opacity: 0.6,
  },
  addText: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#fff',
  },
  back: {
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  backText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: theme.colors.textMeta,
  },
});

export default memo(GlunoPlaceDetailCard);
