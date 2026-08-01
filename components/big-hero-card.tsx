import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import Avatar from '@/components/avatar';
import SlideshowCover, {
  useActiveSlideLabel,
  useActiveSlideLabelValue,
  useActiveSlideValue,
  type ActiveSlideLabelChannel,
  type SlideshowItem,
} from '@/components/slideshow-cover';
import WeatherIcon from '@/components/weather-icon';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { AppTheme } from '@/constants/themes';
import type { Quest } from '@/lib/types';
import { getTripDayProgress, isOpenEnded } from '@/lib/trip-dates';
import { pickVisibleMembers } from '@/lib/trip-members';
import { selectSlideWeather } from '@/lib/slide-weather';
import type { TripWeather, WeatherCondition } from '@/lib/weather-api';

// ── Public types ────────────────────────────────────────────────────────────

export type TripMember = {
  id: string;
  name: string;
  avatarUrl?: string | null;
  isOwner: boolean;
  isOnline?: boolean;
  // Ordering key — see lib/trip-members.ts. Absent on payloads cached before
  // the server started sending it.
  joinedAt?: string | null;
};

export type TripWithEvent = {
  quest: Quest;
  nextEventDate: Date;
  nextEventLabel: string;
  upcomingEvents: { label: string; date: Date }[];
  isOngoing?: boolean;
};

// How many member avatars the hero row shows. The adventure header uses the
// same number, from the same shared selector, so the two surfaces cannot show
// different people.
export const MAX_HERO_AVATARS = 3;

// ── Helpers used by hero and consumers ──────────────────────────────────────

/**
 * Day-of-trip progress. `totalDays` is null for an open-ended adventure —
 * there is no total to count towards, so callers render "Day 4" rather than
 * inventing a denominator.
 */
export function getTripDayInfo(
  startDateStr?: string | null,
  endDateStr?: string | null,
  now: Date = new Date(),
) {
  return getTripDayProgress(startDateStr, endDateStr, now);
}

export function formatTimeLeft(
  targetDateStr: string | undefined,
  now: Date,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string | null {
  if (!targetDateStr) return null;
  const target = new Date(targetDateStr);
  const targetEnd = new Date(target.getFullYear(), target.getMonth(), target.getDate(), 23, 59, 59);
  const diffMs = targetEnd.getTime() - now.getTime();
  if (diffMs <= 0) return null;
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  const hours = Math.floor((diffMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  return t('home.time_left', { days, hours });
}

export function getInitials(name?: string | null) {
  if (!name) return 'SQ';
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase()).join('') || 'SQ';
}

function formatCardDateRange(
  startDate: string | undefined | null,
  endDate: string | undefined | null,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string | null {
  if (!startDate) return null;
  const fmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
  const startLabel = fmt.format(new Date(`${startDate}T12:00:00`));
  // Open-ended: name the state rather than leaving a start date that reads as
  // a one-day adventure, or a dash pointing at nothing.
  if (!endDate) return `${startLabel} · ${t('trip.ongoing')}`;
  return `${startLabel} – ${fmt.format(new Date(`${endDate}T12:00:00`))}`;
}

// ── Component ───────────────────────────────────────────────────────────────

export type BigHeroCardProps = {
  trip: TripWithEvent;
  width: number;
  cardHeight: number;
  members: TripMember[];
  sealedCount?: number;
  failedAvatars?: Set<string>;
  onAvatarError?: (id: string) => void;
  now: Date;
  t: (key: string, vars?: Record<string, string | number>) => string;
  /** When set, replaces the navigation behaviour (tap → trip detail) with this callback.
   *  Used by create-trip's live preview where there's no trip to navigate to yet. */
  onPress?: () => void;
  /** Forces the Enter pill to be hidden — useful when previewing a draft. */
  hideEnterButton?: boolean;
  /** Subtle start-day (or today's, when ongoing) forecast. Null/absent hides
   *  the row entirely — the card never shows fake weather. */
  weather?: { condition: WeatherCondition; tempMaxC: number; locationLabel?: string } | null;
  /** The trip's whole forecast. The weather row picks from it through the
   *  shared selector, so it follows the slide's PLACE and not just its date —
   *  no second fetch, no request to race. Absent → the row stays on `weather`
   *  as before. */
  tripWeather?: TripWeather | null;
  /** Slideshow cover: structured slides (built by buildSlideshowItems) —
   *  each carries its day's resolved feed location, and the pill follows
   *  the slide on screen. Absent/empty → the classic static cover. */
  slideshowItems?: SlideshowItem[];
  /** Only the visible carousel card animates — off-screen cards render their
   *  first image statically with no timer. */
  slideshowActive?: boolean;
  /** The single static location name (current day's resolved feed location
   *  → first day → destination), shown when the slideshow has no label to
   *  offer. Null/absent + no destination → the pill is hidden entirely. */
  staticLocationLabel?: string | null;
};

export function BigHeroCard({
  trip,
  width,
  cardHeight,
  members,
  sealedCount = 0,
  failedAvatars,
  onAvatarError,
  now,
  t,
  onPress,
  hideEnterButton = false,
  weather = null,
  tripWeather = null,
  slideshowItems,
  slideshowActive = false,
  staticLocationLabel = null,
}: BigHeroCardProps) {
  const styles = useThemedStyles(createStyles);
  const quest = trip.quest;
  // Channel carrying the current slide's location — set by the slideshow
  // at the exact moment a crossfade completes (same timer as the image).
  // Only the tiny pill component subscribes: a slide flip must never
  // re-render this whole card. Shared machinery with the trip header.
  const activeSlide = useActiveSlideLabel();
  const isOngoing = trip.isOngoing;
  const dayInfo = getTripDayInfo(quest.startDate, quest.endDate, now);
  // An ongoing adventure with no end date has no countdown to show — there is
  // nothing to count down TO. The LIVE pill still carries the state.
  const timeLeft = isOngoing
    ? (isOpenEnded(quest.endDate) ? null : formatTimeLeft(quest.endDate ?? undefined, now, t))
    : formatTimeLeft(quest.startDate, now, t);
  // Deduped and ordered here as well as by the caller, so this card shows the
  // same three people in the same order as the adventure header no matter which
  // screen passed the list in.
  const { visible: visibleAvatars } = pickVisibleMembers(members, MAX_HERO_AVATARS);

  const handlePress = onPress ?? (() => router.push(`/trip/${quest.id}`));

  // Slideshow cover when the trip provides slides; otherwise the classic
  // static cover. Same absolute-fill layout either way — overlays, radius
  // and heights are untouched.
  const coverItems: SlideshowItem[] =
    slideshowItems && slideshowItems.length > 0
      ? slideshowItems
      : quest.imageUrl
        ? [{ key: quest.imageUrl, imageUri: quest.imageUrl }]
        : [];
  const hasSlideshow = !!slideshowItems && slideshowItems.length > 0;
  // ONE name on the pill, following the image when the slideshow runs:
  // current slide's day location → static rule → destination → hidden.
  const pillFallback = staticLocationLabel ?? (quest.destination?.trim() || null);

  return (
    <TouchableOpacity
      activeOpacity={0.94}
      onPress={handlePress}
      style={[styles.bigHeroCard, { width, height: cardHeight }]}>
      {coverItems.length > 0 ? (
        <SlideshowCover
          items={coverItems}
          active={slideshowActive}
          onSlideChange={activeSlide.onSlideChange}
        />
      ) : (
        <View style={[styles.bigHeroImage, styles.bigHeroImageFallback]} />
      )}

      {/* Stacked semi-transparent layers fake a bottom-to-top dark gradient
          for legibility — only over the dark fallback. Skipped entirely when
          there's a real photo, per product decision (accepts that text/
          buttons may be harder to read on a bright or busy photo). */}
      {coverItems.length === 0 ? (
        <>
          <View pointerEvents="none" style={styles.bigHeroGradient1} />
          <View pointerEvents="none" style={styles.bigHeroGradient2} />
          <View pointerEvents="none" style={styles.bigHeroGradient3} />
          <View pointerEvents="none" style={styles.bigHeroGradient4} />
          <View pointerEvents="none" style={styles.bigHeroGradient5} />
          <View pointerEvents="none" style={styles.bigHeroGradient6} />
        </>
      ) : null}

      {/* Top row: location pill (left) + LIVE / UPCOMING pill (right).
          ONE name only — the slide's own day location while the slideshow
          runs, else the static rule; hidden entirely when nothing real
          exists (no empty pin, no "A · B" pairs). */}
      <View style={styles.bigHeroTopRow}>
        <BigHeroLocationPill
          channel={activeSlide}
          hasSlideshow={hasSlideshow}
          fallback={pillFallback}
          styles={styles}
        />
        {isOngoing ? (
          <View style={styles.bigHeroLivePill}>
            <View style={styles.bigHeroLiveDot} />
            <Text style={styles.bigHeroLiveText}>LIVE</Text>
          </View>
        ) : timeLeft ? (
          <View style={styles.bigHeroUpcomingPill}>
            <Text style={styles.bigHeroUpcomingText}>{timeLeft.toUpperCase()}</Text>
          </View>
        ) : null}
      </View>

      {/* Bottom content: day-of-trip line, title, avatars + sealed + Enter */}
      <View style={styles.bigHeroBottom}>
        {dayInfo && isOngoing ? (
          <Text style={styles.bigHeroDayLine}>
            {/* No total for an open-ended adventure — "Day 4 of 4" would be a
                lie that changes every midnight. */}
            {dayInfo.totalDays === null
              ? t('home.day_of_trip_open', { day: dayInfo.dayOfTrip })
              : t('home.day_of_trip', { day: dayInfo.dayOfTrip, total: dayInfo.totalDays })}
            {timeLeft ? ` · ${timeLeft}` : ''}
          </Text>
        ) : null}
        <Text style={styles.bigHeroTitle} numberOfLines={2}>
          {quest.title?.trim() || t('home.defaultTripName')}
        </Text>
        {formatCardDateRange(quest.startDate, quest.endDate, t) ? (
          <Text style={styles.bigHeroDateLine} numberOfLines={1}>
            {formatCardDateRange(quest.startDate, quest.endDate, t)}
          </Text>
        ) : null}

        <View style={styles.bigHeroFooter}>
          {visibleAvatars.length > 0 ? (
            <View style={styles.bigHeroAvatars}>
              {visibleAvatars.map((member, idx) => (
                <View
                  key={member.id}
                  style={[
                    styles.bigHeroAvatar,
                    { marginLeft: idx === 0 ? 0 : -12, zIndex: visibleAvatars.length - idx },
                  ]}>
                  <Avatar
                    uri={member.avatarUrl}
                    name={member.name}
                    fallbackText={getInitials(member.name)}
                    forceFallback={failedAvatars?.has(member.id)}
                    onError={() => onAvatarError?.(member.id)}
                    size={28}
                    online={member.isOnline}
                    onlineDotOnPhoto
                  />
                </View>
              ))}
            </View>
          ) : null}

          {sealedCount > 0 ? (
            <View style={styles.bigHeroSealed}>
              <Ionicons name="lock-closed" size={12} color="rgba(255,255,255,0.92)" />
              <Text style={styles.bigHeroSealedText}>{sealedCount} sealed</Text>
            </View>
          ) : null}

          <BigHeroWeather
            channel={activeSlide}
            hasSlideshow={hasSlideshow}
            fallback={weather}
            tripWeather={tripWeather}
            styles={styles}
          />

          <View style={{ flex: 1 }} />
          {!hideEnterButton ? (
            <View style={styles.bigHeroEnter}>
              <Text style={styles.bigHeroEnterText}>{t('home.enter') || 'Enter'}</Text>
              <Ionicons name="arrow-forward" size={13} color="#14161d" />
            </View>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

/**
 * The weather row, following the slideshow.
 *
 * Subscribes to the same channel the location pill uses — the one the
 * slideshow updates when a crossfade completes — so the row and the image can
 * never disagree about which day is on screen. It subscribes HERE rather than
 * in BigHeroCard for the same reason the pill does: a slide flips every 5 s
 * and must cost one tiny render, not a whole card (or Home) re-render.
 *
 * No fetching happens here, and none is needed: the trip's forecast already
 * arrives as a per-day array where each day carries the location the backend
 * resolved it from, so following the slideshow is a lookup. That also means
 * there is no request to race — a fast swipe changes which day is READ, never
 * which response wins.
 */
function BigHeroWeather({
  channel,
  hasSlideshow,
  fallback,
  tripWeather,
  styles,
}: {
  channel: ActiveSlideLabelChannel;
  hasSlideshow: boolean;
  fallback: { condition: WeatherCondition; tempMaxC: number; locationLabel?: string } | null;
  tripWeather: TripWeather | null;
  styles: ReturnType<typeof createStyles>;
}) {
  const slide = useActiveSlideValue(channel);

  const tripFallback = fallback
    ? {
        condition: fallback.condition,
        tempMaxC: fallback.tempMaxC,
        locationLabel: fallback.locationLabel ?? '',
      }
    : null;

  // The SAME selector the adventure header uses. Slideshow off, or a cover
  // slide belonging to no day, resolves to the trip fallback the card has
  // always shown.
  const resolved = selectSlideWeather(
    hasSlideshow ? { dayLocationId: slide.dayLocationId, date: slide.date, locationLabel: slide.label } : null,
    tripWeather,
    tripFallback,
  );

  // Null means nothing truthful is available for THIS slide's place — hide the
  // row rather than show the previous place's numbers under the new one.
  if (!resolved) return null;

  return (
    <View style={styles.bigHeroWeather}>
      {/* No color override — the shared per-condition accents in WeatherIcon
          apply (amber sun etc.), identical to the trip header's chip. */}
      <WeatherIcon condition={resolved.condition} size={13} />
      <Text style={styles.bigHeroWeatherText}>{Math.round(resolved.tempMaxC)}°</Text>
    </View>
  );
}

// The ONLY part of the card that re-renders when the slideshow flips —
// subscribing here (not in BigHeroCard) keeps the every-5-seconds update
// away from the avatars/weather/footer tree, so a transition costs one
// tiny pill render instead of a whole-card one (the whole-card version
// was a visible hitch right as each crossfade settled).
function BigHeroLocationPill({
  channel,
  hasSlideshow,
  fallback,
  styles,
}: {
  channel: ActiveSlideLabelChannel;
  hasSlideshow: boolean;
  fallback: string | null;
  styles: ReturnType<typeof createStyles>;
}) {
  const slideLabel = useActiveSlideLabelValue(channel);
  const label = (hasSlideshow ? slideLabel : null) ?? fallback;
  // The empty view keeps the top row's space-between pushing LIVE right.
  if (!label) return <View />;
  return (
    <View style={styles.bigHeroLocPill}>
      <Ionicons name="location" size={12} color="#fff" />
      <Text style={styles.bigHeroLocText} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

// Everything painted ON the photo — the black gradient stack, the rgba
// pills, white text with scrims, the white Enter pill and the white avatar
// ring — is INTENTIONAL image-overlay styling, identical in both themes so
// photos stay vibrant and text stays readable regardless of appearance. Only
// the card shadow and the semantic LIVE-dot green go through the theme.
const createStyles = (theme: AppTheme) => StyleSheet.create({
  bigHeroCard: {
    borderRadius: 32,
    overflow: 'hidden',
    backgroundColor: '#2a2a2a',
    position: 'relative',
    ...theme.shadows.strong,
  },
  bigHeroImage: {
    ...StyleSheet.absoluteFillObject,
  },
  bigHeroImageFallback: {
    backgroundColor: '#3a2c26',
  },
  bigHeroGradient1: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    height: '15%',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  bigHeroGradient2: {
    position: 'absolute',
    left: 0, right: 0, bottom: '15%',
    height: '12%',
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  bigHeroGradient3: {
    position: 'absolute',
    left: 0, right: 0, bottom: '27%',
    height: '12%',
    backgroundColor: 'rgba(0,0,0,0.30)',
  },
  bigHeroGradient4: {
    position: 'absolute',
    left: 0, right: 0, bottom: '39%',
    height: '12%',
    backgroundColor: 'rgba(0,0,0,0.20)',
  },
  bigHeroGradient5: {
    position: 'absolute',
    left: 0, right: 0, bottom: '51%',
    height: '12%',
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  bigHeroGradient6: {
    position: 'absolute',
    left: 0, right: 0, bottom: '63%',
    height: '12%',
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  bigHeroTopRow: {
    position: 'absolute',
    top: 18, left: 18, right: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  bigHeroLocPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 100,
    backgroundColor: 'rgba(0,0,0,0.42)',
    maxWidth: '70%',
  },
  bigHeroLocText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  bigHeroLivePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 100,
    backgroundColor: 'rgba(20,22,29,0.7)',
  },
  bigHeroLiveDot: {
    width: 8, height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.success,
  },
  bigHeroLiveText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  bigHeroUpcomingPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 100,
    backgroundColor: 'rgba(20,22,29,0.7)',
  },
  bigHeroUpcomingText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  bigHeroBottom: {
    position: 'absolute',
    left: 22, right: 22, bottom: 22,
  },
  bigHeroDayLine: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  bigHeroTitle: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.6,
    lineHeight: 32,
    marginBottom: 14,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  bigHeroDateLine: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: -0.2,
    marginTop: -8,
    marginBottom: 14,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  bigHeroFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bigHeroAvatars: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  // A THIN translucent-white ring (1px, not the old heavy 2px solid) —
  // just enough separation from any cover photo without looking like a
  // sticker. The dot pairs with Avatar's onlineDotOnPhoto variant.
  bigHeroAvatar: {
    width: 30, height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.75)',
    // Solid fill behind initials-fallbacks: Avatar's own fallback color is
    // translucent in dark mode (rgba), which read see-through on cover
    // photos — this is the same solid the wrapper had pre-redesign. Photo
    // avatars cover it completely.
    backgroundColor: '#fff1f5',
    alignItems: 'center',
    justifyContent: 'center',
    // No overflow:hidden — Avatar clips its own image; the online dot needs
    // to render on the circle's edge without being cut.
  },
  bigHeroSealed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  bigHeroWeather: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  bigHeroWeatherText: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 12,
    fontWeight: '700',
  },
  bigHeroSealedText: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 12,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  bigHeroEnter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 100,
    backgroundColor: '#fff',
  },
  bigHeroEnterText: {
    color: '#14161d',
    fontSize: 13,
    fontWeight: '800',
  },
});
