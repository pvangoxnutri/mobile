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

import { Animated, BackHandler, Dimensions, Platform, Pressable, StyleSheet, View } from 'react-native';
import { ReactNode, useEffect } from 'react';
import { useModalSpring } from '@/hooks/useMotion';
import { MOTION_SPRING } from '@/MOTION_CONSTANTS';
import { COLORS, SHADOWS, SPACING } from '@/constants/design-tokens';

interface ModalSheetProps {
  visible: boolean;
  children: ReactNode;
  onClose: () => void;
  height?: number;
  /** Slower, weightier entry glide (MOTION_SPRING.graceful) instead of the
   *  standard spring — for sheets that should feel deliberate. */
  slowEntry?: boolean;
  /** Size the sheet to its content instead of the fixed `height`, capped at
   *  90% of the screen. For short sheets (e.g. a fixed list of rows) this
   *  avoids the large empty gap a fixed height leaves below the content. */
  autoHeight?: boolean;
}

const { height: screenHeight } = Dimensions.get('window');

export default function ModalSheet({ visible, children, onClose, height = screenHeight * 0.75, slowEntry = false, autoHeight = false }: ModalSheetProps) {
  const { translateY, backdropOpacity, scaleValue, start, animatedSheetStyle, animatedBackdropStyle } = useModalSpring({
    autoStart: false,
    onComplete: undefined,
    triggerHaptics: true,
    // Start fully below the sheet so opening is a real slide-up from
    // off-screen. In autoHeight mode the content height isn't known up
    // front, so start from the full screen height (always off-screen).
    initialTranslateY: autoHeight ? screenHeight : height,
    entrySpring: slowEntry ? MOTION_SPRING.graceful : MOTION_SPRING.standard,
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

  // Unlike RN's <Modal>, this sheet is a plain View overlay, so Android's
  // system back would pop the whole screen underneath instead of closing
  // the sheet. Intercept back while open — real <Modal>s stacked above
  // still win since they capture back natively before JS handlers run.
  useEffect(() => {
    if (!visible || Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose]);

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
          autoHeight ? { maxHeight: screenHeight * 0.9 } : { height },
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
    // Inset all sheet content from the screen edges so headers, close
    // buttons and rows don't sit flush against the rounded corners (which
    // looked like they spilled off the sides).
    paddingHorizontal: SPACING.xl,
    ...SHADOWS.floating,
  },
});
