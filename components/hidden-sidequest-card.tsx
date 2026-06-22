import { Ionicons } from '@expo/vector-icons';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useCallback, useMemo, useRef, useEffect } from 'react';
import { COLORS, SPACING, TYPOGRAPHY, RADIUS } from '@/constants/design-tokens';
import { useScalePress } from '@/hooks/useMotion';
import { useI18n } from '@/components/i18n-provider';

interface HiddenSidequestCardProps {
  id: string;
  revealAt?: string | null;
  onPress: () => void;
  timeLabel?: string;
  formatTimeUntilReveal: (revealAt?: string | null) => string;
}

export default function HiddenSidequestCard({
  id,
  revealAt,
  onPress,
  timeLabel,
  formatTimeUntilReveal,
}: HiddenSidequestCardProps) {
  const { t } = useI18n();
  const shimmerOpacityRef = useRef(new Animated.Value(1)).current;

  // Check if reveal is imminent (within 1 hour)
  const isRevealImminent = useMemo(() => {
    if (!revealAt) return false;
    const now = Date.now();
    const reveal = new Date(revealAt).getTime();
    const diffMs = reveal - now;
    return diffMs > 0 && diffMs <= 3600000; // Within 1 hour
  }, [revealAt]);

  // Scale press animation
  const { scaleValue, handlePressIn, handlePressOut, animatedStyle } = useScalePress({
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
        <Animated.View
          style={[
            styles.timelineIcon,
            styles.timelineIconHidden,
            { opacity: shimmerOpacityRef },
          ]}>
          <Ionicons name="lock-closed" size={18} color="#fff" />
          {isRevealImminent && (
            <View style={styles.revealBadge}>
              <View style={styles.revealDot} />
            </View>
          )}
        </Animated.View>
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

const styles = StyleSheet.create({
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    marginLeft: SPACING.lg,
  },
  timelineIconWrap: {
    width: 42,
    height: 42,
  },
  timelineIcon: {
    width: 42,
    height: 42,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineIconHidden: {
    backgroundColor: COLORS.primary,
  },
  revealBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 16,
    height: 16,
    borderRadius: 999,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  revealDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: '#fff',
  },
  timelineBody: {
    flex: 1,
    minWidth: 0,
  },
  timelineTitle: {
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    fontWeight: '800',
    marginBottom: 2,
  },
  timelineSubtitle: {
    ...TYPOGRAPHY.meta,
    color: COLORS.textSecondary,
  },
  timelineTime: {
    ...TYPOGRAPHY.meta,
    color: COLORS.textSecondary,
    fontWeight: '600',
    marginLeft: SPACING.sm,
  },
});
