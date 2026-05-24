/**
 * PREMIUM MODAL SHEET COMPONENT
 * Replaces basic React Native modals with weighted, physics-based animations
 *
 * Emotional intent:
 * - Feels physical and weighted (not bouncy)
 * - Smooth entry momentum (spring, not linear)
 * - Responsive backdrop dimming
 * - Tactile close interaction
 * - Returns to stillness after animation completes
 *
 * Important: Avoids bouncy or exaggerated motion
 */

import { Animated, Dimensions, Pressable, StyleSheet, View } from 'react-native';
import { ReactNode, useEffect } from 'react';
import { useModalSpring } from '@/hooks/useMotion';
import { COLORS, SHADOWS } from '@/constants/design-tokens';

interface ModalSheetProps {
  visible: boolean;
  children: ReactNode;
  onClose: () => void;
  height?: number;
}

const { height: screenHeight } = Dimensions.get('window');

export default function ModalSheet({ visible, children, onClose, height = screenHeight * 0.75 }: ModalSheetProps) {
  const { translateY, backdropOpacity, scaleValue, start, animatedSheetStyle, animatedBackdropStyle } = useModalSpring({
    autoStart: false,
    onComplete: undefined,
    triggerHaptics: true,
  });

  useEffect(() => {
    if (visible) {
      start();
    } else {
      // Animate out
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: screenHeight,
          damping: 14,
          mass: 1,
          stiffness: 200,
          overshootClamping: true,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, start, translateY, backdropOpacity]);

  if (!visible) return null;

  return (
    <View pointerEvents={visible ? 'auto' : 'none'} style={styles.container}>
      {/* Backdrop with fade-in/out animation */}
      <Animated.View
        style={[
          styles.backdrop,
          animatedBackdropStyle,
        ]}
        pointerEvents="box-none"
      >
        {/* Tap to close */}
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
      </Animated.View>

      {/* Sheet content with spring animation */}
      <Animated.View
        style={[
          styles.sheet,
          animatedSheetStyle,
          { height },
        ]}
      >
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.28)',
  },
  sheet: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    ...SHADOWS.floating,
  },
});
