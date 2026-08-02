import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useI18n } from '@/components/i18n-provider';
import { useTheme } from '@/components/theme-provider';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { GlunoPlace } from '@/lib/gluno';
import type { AppTheme } from '@/constants/themes';

// ──────────────────────────────────────────────────────────────────────────
// GLUNO — one real place, from an external travel-data provider.
//
// Reusable on purpose: this is the shape a future propose_activity will build
// on, so everything a user needs to judge a place lives here rather than in
// Gluno's prose. That is also why the answer text stays short — the numbers
// are on the card, not in the paragraph.
//
// Three rules this component enforces:
//
//   • **Attribution rides on the card, not the list.** Every card names its
//     own provider. Two providers' results in one answer can never end up
//     under one attribution, and Gluno's own reasoning is visually separate
//     from the provider's numbers (the "why" row is SideQuest's, the rating
//     row is the provider's).
//
//   • **Absent stays absent.** A missing rating, price or photo renders
//     nothing — never a zero, a dash presented as data, or "no reviews". The
//     provider not returning something is not a fact about the place.
//
//   • **No layout shift.** The media area is a fixed height whether or not
//     there is a photo, so a list of cards does not reflow as images resolve.
// ──────────────────────────────────────────────────────────────────────────

/** Ranking signals worth surfacing, in priority order. The rest stay internal. */
const SIGNAL_KEYS: Record<string, string> = {
  highly_rated: 'gluno.place.signal.highlyRated',
  very_many_reviews: 'gluno.place.signal.veryManyReviews',
  many_reviews: 'gluno.place.signal.manyReviews',
  very_close: 'gluno.place.signal.veryClose',
  walkable: 'gluno.place.signal.walkable',
  matches_budget: 'gluno.place.signal.matchesBudget',
  matches_request: 'gluno.place.signal.matchesRequest',
  matches_category: 'gluno.place.signal.matchesCategory',
  high_rating_few_reviews: 'gluno.place.signal.fewReviews',
  few_reviews: 'gluno.place.signal.fewReviews',
  no_rating: 'gluno.place.signal.noRating',
};

const MAX_SIGNALS = 2;

/** Brand names are not translated; unknown ids fall back to the raw value. */
function providerName(provider: string) {
  return provider === 'tripadvisor' ? 'Tripadvisor' : provider;
}

const CATEGORY_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  restaurant: 'restaurant-outline',
  attraction: 'camera-outline',
  hotel: 'bed-outline',
  general: 'location-outline',
};

export default function GlunoPlaceCard({ place }: { place: GlunoPlace }) {
  const styles = useThemedStyles(createStyles);
  const { theme } = useTheme();
  const { t, language } = useI18n();

  // Belt-and-braces: the backend already restricts links to the provider's own
  // hosts, but this component is what actually hands a URL to the browser.
  const link = place.providerUrl?.startsWith('https://') ? place.providerUrl : null;

  const signals = place.signals
    .map((signal) => SIGNAL_KEYS[signal])
    .filter((key): key is string => Boolean(key))
    .slice(0, MAX_SIGNALS);

  const ratingText = place.rating != null
    ? place.rating.toLocaleString(language === 'sv' ? 'sv-SE' : 'en-GB', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      })
    : null;
  const scaleText = place.ratingScaleMax != null ? `/${place.ratingScaleMax}` : '';

  const distanceText = place.distanceKm != null
    ? place.distanceKm < 1
      ? t('gluno.place.distanceMeters', { meters: Math.round(place.distanceKm * 1000) })
      : t('gluno.place.distanceKm', { km: place.distanceKm.toFixed(1) })
    : null;

  return (
    <View style={styles.card}>
      <View style={styles.media}>
        {place.imageUrl ? (
          <Image
            source={{ uri: place.imageUrl }}
            style={styles.image}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={160}
            accessibilityIgnoresInvertColors
          />
        ) : (
          // Same height as a real photo — the placeholder is what keeps a
          // list of cards from reflowing.
          <View style={styles.imagePlaceholder}>
            <Ionicons
              name={CATEGORY_ICONS[place.category] ?? CATEGORY_ICONS.general}
              size={26}
              color={theme.colors.textMuted}
            />
          </View>
        )}
      </View>

      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={2}>{place.name}</Text>

        {place.categoryLabel ? (
          <Text style={styles.category} numberOfLines={1}>{place.categoryLabel}</Text>
        ) : null}

        {/* Provider facts. Everything on this row came from the provider. */}
        {(ratingText || place.priceLevel) ? (
          <View style={styles.factsRow}>
            {ratingText ? (
              <View style={styles.fact}>
                <Ionicons name="star" size={12} color={theme.colors.warning} />
                <Text style={styles.factStrong}>{ratingText}{scaleText}</Text>
                {place.reviewCount != null ? (
                  <Text style={styles.factMuted}>
                    {t('gluno.place.reviews', { count: place.reviewCount })}
                  </Text>
                ) : null}
              </View>
            ) : null}

            {place.priceLevel ? (
              <View style={styles.fact}>
                <Text style={styles.factMuted}>{place.priceLevel}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {(place.address || distanceText) ? (
          <View style={styles.addressRow}>
            <Ionicons name="location-outline" size={12} color={theme.colors.textMuted} />
            <Text style={styles.address} numberOfLines={1}>
              {[distanceText, place.address].filter(Boolean).join(' · ')}
            </Text>
          </View>
        ) : null}

        {/* SideQuest's own reasons, kept visually apart from the facts above
            so they cannot read as something the provider said. */}
        {signals.length > 0 ? (
          <View style={styles.signalRow}>
            {signals.map((key) => (
              <View key={key} style={styles.signalChip}>
                <Text style={styles.signalText}>{t(key)}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.footer}>
          <Text style={styles.attribution} numberOfLines={1}>
            {t('gluno.place.attribution', { provider: providerName(place.provider) })}
          </Text>

          {link ? (
            <TouchableOpacity
              style={styles.linkButton}
              activeOpacity={0.85}
              accessibilityRole="link"
              accessibilityLabel={t('gluno.place.readMore', { provider: providerName(place.provider) })}
              // The app's existing in-app browser, same as every other
              // external link in SideQuest.
              onPress={() => void WebBrowser.openBrowserAsync(link)}>
              <Text style={styles.linkText}>{t('gluno.place.readMoreShort')}</Text>
              <Ionicons name="open-outline" size={13} color={theme.colors.primary} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Not a disabled button: applying a suggestion is a later step, and a
            greyed-out "Add" invites taps that do nothing. */}
        <Text style={styles.hint}>{t('gluno.place.askToAdd')}</Text>
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
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.borderPrimary,
  },
  media: {
    // Fixed regardless of whether a photo exists — see the placeholder note.
    height: 132,
    backgroundColor: theme.colors.bgLight,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    padding: 13,
  },
  name: {
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 20,
    color: theme.colors.textPrimary,
  },
  category: {
    marginTop: 2,
    fontSize: 12,
    color: theme.colors.textMeta,
  },
  factsRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    // Wraps rather than truncating on a narrow phone.
    flexWrap: 'wrap',
    gap: 12,
  },
  fact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  factStrong: {
    fontSize: 13,
    fontWeight: '800',
    color: theme.colors.textPrimary,
  },
  factMuted: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  addressRow: {
    marginTop: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  address: {
    flex: 1,
    fontSize: 12,
    color: theme.colors.textMeta,
  },
  signalRow: {
    marginTop: 9,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  signalChip: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: theme.colors.primaryLight12,
  },
  signalText: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  footer: {
    marginTop: 11,
    paddingTop: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.borderPrimary,
  },
  attribution: {
    flex: 1,
    fontSize: 10.5,
    color: theme.colors.textMuted,
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  linkText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: theme.colors.primary,
  },
  hint: {
    marginTop: 8,
    fontSize: 11,
    fontStyle: 'italic',
    color: theme.colors.textMuted,
  },
});
