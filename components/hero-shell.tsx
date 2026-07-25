import type { ReactNode } from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import SlideshowCover, { type SlideshowItem } from '@/components/slideshow-cover';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { AppTheme } from '@/constants/themes';

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
  // Slideshow cover: when set with ≥1 slide these replace imageUrl as the
  // image surface (crossfading when there are 2+). imageUrl stays the
  // fallback when the list is absent/empty. onSlideChange bubbles the
  // current slide so the consumer's location pill follows the image.
  slideshowItems?: SlideshowItem[];
  onSlideChange?: (item: SlideshowItem, index: number) => void;
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

export default function HeroShell({ imageUrl, slideshowItems, onSlideChange, fallback, imageBlurRadius, style, children }: Props) {
  const styles = useThemedStyles(createStyles);
  const hasSlideshow = !!slideshowItems && slideshowItems.length > 0;
  const hasAnyImage = hasSlideshow || !!imageUrl;
  return (
    <View style={[styles.shell, style]}>
      {hasSlideshow ? (
        <SlideshowCover items={slideshowItems!} blurRadius={imageBlurRadius} onSlideChange={onSlideChange} />
      ) : imageUrl ? (
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
          for legibility — only over the dark fallback. Skipped entirely when
          there's a real photo, per product decision (accepts that text/
          buttons may be harder to read on a bright or busy photo). */}
      {!hasAnyImage ? (
        <>
          <View pointerEvents="none" style={styles.gradient1} />
          <View pointerEvents="none" style={styles.gradient2} />
          <View pointerEvents="none" style={styles.gradient3} />
          <View pointerEvents="none" style={styles.gradient4} />
          <View pointerEvents="none" style={styles.gradient5} />
          <View pointerEvents="none" style={styles.gradient6} />
        </>
      ) : null}

      {children}
    </View>
  );
}

// The shell is an image surface: the loading placeholder (#2a2a2a), the dark
// hero fallback (#3a2c26) and the stacked black gradient layers are
// INTENTIONAL image-world constants — identical in both themes so photos and
// the content on them stay untouched. Only the card's drop shadow is themed
// (dark elevates through contrast, not Android elevation).
const createStyles = (theme: AppTheme) => StyleSheet.create({
  shell: {
    borderRadius: 32,
    overflow: 'hidden',
    backgroundColor: '#2a2a2a',
    position: 'relative',
    ...theme.shadows.strong,
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
    height: '15%',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  gradient2: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: '15%',
    height: '12%',
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  gradient3: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: '27%',
    height: '12%',
    backgroundColor: 'rgba(0,0,0,0.30)',
  },
  gradient4: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: '39%',
    height: '12%',
    backgroundColor: 'rgba(0,0,0,0.20)',
  },
  gradient5: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: '51%',
    height: '12%',
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  gradient6: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: '63%',
    height: '12%',
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
});
