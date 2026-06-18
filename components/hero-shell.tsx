import type { ReactNode } from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

// HeroShell — shared visual primitive for every cover/hero image in the app.
// Responsibilities (and ONLY these):
//   - container border radius
//   - container shadow / elevation
//   - image rendering with resizeMode 'cover'
//   - image fallback handling (dark solid OR consumer-provided node)
//   - 3-layer gradient overlay (legibility for any content on top)
//
// HeroShell does NOT own:
//   - title, meta, status chips, top rows, action buttons
//   - any screen-specific content
//
// Consumers pass their own content as children. Children render on top of
// the gradient layers. Use absolute positioning for floating elements (e.g.
// pills, edit buttons) and rely on the shell's optional justifyContent for
// flex-anchored bottom content (e.g. titles, meta blocks).

type Props = {
  imageUrl?: string | null;
  // Optional custom fallback rendered when imageUrl is empty. If omitted, the
  // shell renders its default dark solid background.
  fallback?: ReactNode;
  // Forwarded to the underlying <Image>. Useful for "hidden / reveal" effects.
  imageBlurRadius?: number;
  // Layout overrides — typically just minHeight / width / justifyContent for
  // content alignment. The shell's radius / shadow / overlay are not
  // overridable by design.
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
};

export default function HeroShell({ imageUrl, fallback, imageBlurRadius, style, children }: Props) {
  return (
    <View style={[styles.shell, style]}>
      {imageUrl ? (
        <Image
          source={{ uri: imageUrl }}
          style={styles.image}
          resizeMode="cover"
          blurRadius={imageBlurRadius}
        />
      ) : fallback ? (
        <View style={styles.image}>{fallback}</View>
      ) : (
        <View style={[styles.image, styles.defaultFallback]} />
      )}

      {/* Stacked semi-transparent layers fake a bottom-to-top dark gradient
          without pulling in expo-linear-gradient. Keeps text legible on
          top of any photo (or the dark fallback). */}
      <View pointerEvents="none" style={styles.gradient1} />
      <View pointerEvents="none" style={styles.gradient2} />
      <View pointerEvents="none" style={styles.gradient3} />

      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
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
  image: {
    ...StyleSheet.absoluteFillObject,
  },
  defaultFallback: {
    backgroundColor: '#3a2c26',
  },
  gradient1: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '40%',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  gradient2: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: '40%',
    height: '20%',
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  gradient3: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: '60%',
    height: '15%',
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
});
