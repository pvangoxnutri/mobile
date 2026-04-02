import { StyleSheet, Text, View } from 'react-native';

type BrandMarkProps = {
  size?: 'sm' | 'md' | 'lg';
};

const SIZE_MAP = {
  sm: {
    fontSize: 34,
    letterSpacing: -1.9,
    dot: 12,
    dotRadius: 6,
    dotMarginBottom: 5,
    dotMarginLeft: 4,
  },
  md: {
    fontSize: 46,
    letterSpacing: -2.6,
    dot: 16,
    dotRadius: 8,
    dotMarginBottom: 7,
    dotMarginLeft: 4,
  },
  lg: {
    fontSize: 54,
    letterSpacing: -3,
    dot: 18,
    dotRadius: 9,
    dotMarginBottom: 8,
    dotMarginLeft: 4,
  },
} as const;

export default function BrandMark({ size = 'md' }: BrandMarkProps) {
  const config = SIZE_MAP[size];

  return (
    <View style={styles.row}>
      <Text style={[styles.text, { fontSize: config.fontSize, letterSpacing: config.letterSpacing }]}>SideQuest</Text>
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
  },
});
