import { Ionicons } from '@expo/vector-icons';
import { Animated, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useCallback, useMemo, useRef, useEffect } from 'react';
import { SPACING, TYPOGRAPHY, RADIUS } from '@/constants/design-tokens';
import { useTheme } from '@/components/theme-provider';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { AppTheme } from '@/constants/themes';
import { useScalePress } from '@/hooks/useMotion';
import { useI18n } from '@/components/i18n-provider';
import ActivityImageFallback from '@/components/activity-image-fallback';
import { DEFAULT_BLUR, extractBlur } from '@/lib/activity-blur';

interface HiddenSidequestCardProps {
  id: string;
  revealAt?: string | null;
  imageUrl?: string | null;
  category?: string | null;
  description?: string | null;
  onPress: () => void;
  timeLabel?: string;
  formatTimeUntilReveal: (revealAt?: string | null) => string;
}

// Same row shape as a normal (visible) activity row in the trip timeline —
// same image box, same title/subtitle/time layout — so a hidden SideQuest
// sits in the feed exactly where it would for its own creator, just with the
// cover photo blurred and a lock badge over it instead of the real title.
export default function HiddenSidequestCard({
  id,
  revealAt,
  imageUrl,
  category,
  description,
  onPress,
  timeLabel,
  formatTimeUntilReveal,
}: HiddenSidequestCardProps) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const shimmerOpacityRef = useRef(new Animated.Value(1)).current;
  const blurAmount = useMemo(() => extractBlur(description) ?? DEFAULT_BLUR, [description]);

  // Check if reveal is imminent (within 1 hour)
  const isRevealImminent = useMemo(() => {
    if (!revealAt) return false;
    const now = Date.now();
    const reveal = new Date(revealAt).getTime();
    const diffMs = reveal - now;
    return diffMs > 0 && diffMs <= 3600000; // Within 1 hour
  }, [revealAt]);

  // Scale press animation
  const { handlePressIn, handlePressOut, animatedStyle } = useScalePress({
    scale: 0.96,
    triggerHaptics: true,
  });

  // Start shimmer animation when reveal is imminent
  useEffect(() => {
    if (isRevealImminent) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(shimmerOpacityRef, {
            toValue: 0.7,
            duration: 1500,
            useNativeDriver: true,
          }),
          Animated.timing(shimmerOpacityRef, {
            toValue: 1,
            duration: 1500,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      shimmerOpacityRef.setValue(1);
    }
  }, [isRevealImminent, shimmerOpacityRef]);

  const handlePress = useCallback(() => {
    handlePressOut();
    onPress();
  }, [handlePressOut, onPress]);

  return (
    <TouchableOpacity
      key={id}
      activeOpacity={0.86}
      style={styles.timelineRow}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}>
      <Animated.View style={[styles.timelineIconWrap, animatedStyle]}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.timelineIcon} blurRadius={blurAmount} />
        ) : (
          <ActivityImageFallback category={category} size="small" style={styles.timelineIcon} />
        )}
        <Animated.View style={[styles.lockScrim, { opacity: shimmerOpacityRef }]}>
          <Ionicons name="lock-closed" size={15} color={theme.colors.white} />
        </Animated.View>
        {isRevealImminent && (
          <View style={styles.revealBadge}>
            <View style={styles.revealDot} />
          </View>
        )}
      </Animated.View>

      <View style={styles.timelineBody}>
        <Text style={styles.timelineTitle} numberOfLines={1}>
          {t('trip.hiddenQuest')}
        </Text>
        <Text style={styles.timelineSubtitle} numberOfLines={1}>
          {formatTimeUntilReveal(revealAt)}
        </Text>
      </View>

      {timeLabel ? <Text style={styles.timelineTime}>{timeLabel}</Text> : null}
    </TouchableOpacity>
  );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  // Mirrors app/trip/[id]/index.tsx's own timelineRow/timelineIconWrap/
  // timelineIcon/timelineBody/timelineTitle/timelineSubtitle/timelineTime
  // exactly, so a hidden card lines up pixel-for-pixel with a visible one.
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.md,
    // Dark: the warm sealed-parchment wash (the app-wide hidden/"mystery
    // envelope" family — see calendar's sealed upcoming cards) so the row
    // reads sealed against normal rows without glaring; never pure black.
    // Light: transparent exactly as pre-theming — the radius is invisible on
    // a transparent background, so light stays pixel-identical. No padding or
    // border is added so the row keeps lining up with visible rows.
    backgroundColor: theme.isDark ? theme.colors.sealedSurface : 'transparent',
    borderRadius: theme.isDark ? RADIUS.sm : 0,
  },
  timelineIconWrap: {
    width: 42,
    height: 42,
  },
  timelineIcon: {
    width: 42,
    height: 42,
    borderRadius: RADIUS.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockScrim: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: RADIUS.xs,
    // On-photo scrim over the blurred cover — identical in both themes, like
    // the shared image-overlay tokens (photos stay photos regardless of theme).
    backgroundColor: 'rgba(15, 17, 23, 0.38)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  revealBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 16,
    height: 16,
    borderRadius: 999,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  revealDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    // Stays white in both themes — a dot on the brand-pink badge.
    backgroundColor: theme.colors.white,
  },
  timelineBody: {
    flex: 1,
    minWidth: 0,
  },
  timelineTitle: {
    ...TYPOGRAPHY.cardTitle,
    color: theme.colors.textPrimary,
    fontWeight: '800',
  },
  timelineSubtitle: {
    marginTop: 2,
    ...TYPOGRAPHY.meta,
    color: theme.colors.textMeta,
    fontWeight: '500',
  },
  timelineTime: {
    ...TYPOGRAPHY.meta,
    color: theme.colors.textMeta,
    marginLeft: SPACING.sm,
  },
});
