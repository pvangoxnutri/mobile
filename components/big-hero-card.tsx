import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { PRIMARY_COLOR } from '@/constants/colors';
import type { Quest } from '@/lib/types';

// ── Public types ────────────────────────────────────────────────────────────

export type TripMember = {
  id: string;
  name: string;
  avatarUrl?: string | null;
  isOwner: boolean;
};

export type TripWithEvent = {
  quest: Quest;
  nextEventDate: Date;
  nextEventLabel: string;
  upcomingEvents: { label: string; date: Date }[];
  isOngoing?: boolean;
};

// ── Helpers used by hero and consumers ──────────────────────────────────────

export function getTripDayInfo(startDateStr?: string, endDateStr?: string, now: Date = new Date()) {
  if (!startDateStr || !endDateStr) return null;
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);
  const ms = 24 * 60 * 60 * 1000;
  const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / ms) + 1);
  const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startMid = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const dayOfTrip = Math.floor((todayMid.getTime() - startMid.getTime()) / ms) + 1;
  return { dayOfTrip, totalDays };
}

export function formatTimeLeft(targetDateStr?: string, now: Date = new Date()): string | null {
  if (!targetDateStr) return null;
  const target = new Date(targetDateStr);
  const targetEnd = new Date(target.getFullYear(), target.getMonth(), target.getDate(), 23, 59, 59);
  const diffMs = targetEnd.getTime() - now.getTime();
  if (diffMs <= 0) return null;
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  const hours = Math.floor((diffMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  return `${days}d ${hours}h left`;
}

export function getInitials(name?: string | null) {
  if (!name) return 'SQ';
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase()).join('') || 'SQ';
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
}: BigHeroCardProps) {
  const quest = trip.quest;
  const isOngoing = trip.isOngoing;
  const dayInfo = getTripDayInfo(quest.startDate, quest.endDate, now);
  const timeLeft = isOngoing
    ? formatTimeLeft(quest.endDate, now)
    : formatTimeLeft(quest.startDate, now);
  const visibleAvatars = members.slice(0, 3);

  const handlePress = onPress ?? (() => router.push(`/trip/${quest.id}`));

  return (
    <TouchableOpacity
      activeOpacity={0.94}
      onPress={handlePress}
      style={[styles.bigHeroCard, { width, height: cardHeight }]}>
      {quest.imageUrl ? (
        <Image source={{ uri: quest.imageUrl }} style={styles.bigHeroImage} resizeMode="cover" />
      ) : (
        <View style={[styles.bigHeroImage, styles.bigHeroImageFallback]} />
      )}

      {/* Stacked semi-transparent layers fake a bottom-to-top dark gradient
          for legibility — only over the dark fallback. Skipped entirely when
          there's a real photo, per product decision (accepts that text/
          buttons may be harder to read on a bright or busy photo). */}
      {!quest.imageUrl ? (
        <>
          <View pointerEvents="none" style={styles.bigHeroGradient1} />
          <View pointerEvents="none" style={styles.bigHeroGradient2} />
          <View pointerEvents="none" style={styles.bigHeroGradient3} />
          <View pointerEvents="none" style={styles.bigHeroGradient4} />
          <View pointerEvents="none" style={styles.bigHeroGradient5} />
          <View pointerEvents="none" style={styles.bigHeroGradient6} />
        </>
      ) : null}

      {/* Top row: location pill (left) + LIVE / UPCOMING pill (right) */}
      <View style={styles.bigHeroTopRow}>
        {quest.destination ? (
          <View style={styles.bigHeroLocPill}>
            <Ionicons name="location" size={12} color="#fff" />
            <Text style={styles.bigHeroLocText} numberOfLines={1}>{quest.destination}</Text>
          </View>
        ) : <View />}
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
            Day {dayInfo.dayOfTrip} of {dayInfo.totalDays}
            {timeLeft ? ` · ${timeLeft}` : ''}
          </Text>
        ) : null}
        <Text style={styles.bigHeroTitle} numberOfLines={2}>
          {quest.title?.trim() || t('home.defaultTripName')}
        </Text>

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
                  {member.avatarUrl && member.avatarUrl.trim() && !failedAvatars?.has(member.id) ? (
                    <Image
                      source={{ uri: member.avatarUrl }}
                      style={styles.bigHeroAvatarImage}
                      onError={() => onAvatarError?.(member.id)}
                    />
                  ) : (
                    <Text style={styles.bigHeroAvatarText}>{getInitials(member.name)}</Text>
                  )}
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

const styles = StyleSheet.create({
  bigHeroCard: {
    borderRadius: 32,
    overflow: 'hidden',
    backgroundColor: '#2a2a2a',
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 10,
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
    backgroundColor: '#3ddc8c',
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
  bigHeroFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bigHeroAvatars: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bigHeroAvatar: {
    width: 32, height: 32,
    borderRadius: 16,
    backgroundColor: '#fff1f5',
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  bigHeroAvatarImage: {
    width: '100%', height: '100%',
  },
  bigHeroAvatarText: {
    fontSize: 11,
    fontWeight: '800',
    color: PRIMARY_COLOR,
  },
  bigHeroSealed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
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
