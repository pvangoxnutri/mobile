import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/components/theme-provider';

type BrandMarkProps = {
  size?: 'sm' | 'md' | 'lg';
  // The wordmark is a BRAND ASSET, not themed text: ink (#111217) on light
  // surfaces, white on dark ones — never gray, never tinted. 'adaptive' is
  // for hosts whose surface follows the theme (the tab header pill);
  // screens with a fixed light surface (splash, auth heroes) keep the
  // default ink in both themes until their surfaces are themed.
  tone?: 'ink' | 'adaptive';
};

// lineHeight is set explicitly to iOS's natural value (≈ fontSize × 1.175)
// so iOS renders unchanged while Android — whose Roboto metrics otherwise
// produce a taller text box with a lower bottom edge — is forced to the exact
// same box. The pink dot anchors to the box bottom (flex-end), so a matching
// box is what keeps the dot aligned the same on both platforms.
const SIZE_MAP = {
  sm: {
    fontSize: 26,
    lineHeight: 31,
    letterSpacing: -1.5,
    dot: 10,
    dotRadius: 5,
    dotMarginBottom: 4,
    dotMarginLeft: 3,
  },
  md: {
    fontSize: 46,
    lineHeight: 54,
    letterSpacing: -2.6,
    dot: 16,
    dotRadius: 8,
    dotMarginBottom: 7,
    dotMarginLeft: 4,
  },
  lg: {
    fontSize: 54,
    lineHeight: 63,
    letterSpacing: -3,
    dot: 18,
    dotRadius: 9,
    dotMarginBottom: 8,
    dotMarginLeft: 4,
  },
} as const;

export default function BrandMark({ size = 'md', tone = 'ink' }: BrandMarkProps) {
  const config = SIZE_MAP[size];
  const { theme } = useTheme();
  const wordmarkColor = tone === 'adaptive' && theme.isDark ? '#ffffff' : '#111217';

  return (
    <View style={styles.row}>
      <Text style={[styles.text, { color: wordmarkColor, fontSize: config.fontSize, lineHeight: config.lineHeight, letterSpacing: config.letterSpacing }]}>SideQuest</Text>
      <View
        style={{
          width: config.dot,
          height: config.dot,
          borderRadius: config.dotRadius,
          marginLeft: config.dotMarginLeft,
          marginBottom: config.dotMarginBottom,
          backgroundColor: '#ff9cab',
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  text: {
    color: '#111217',
    fontWeight: '900',
    // Android adds vertical font padding by default, which made the large
    // logo type look too tall vs iOS. Remove it so the wordmark sits tight.
    includeFontPadding: false,
  },
});
