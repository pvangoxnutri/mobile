import { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useI18n } from '@/components/i18n-provider';
import { useTheme } from '@/components/theme-provider';
import { getPasswordStrength, type PasswordStrength } from '@/lib/password-strength';
import { SPACING } from '@/constants/design-tokens';
import { MOTION_TIMING } from '@/MOTION_CONSTANTS';

// Semantic weak/medium/strong colors — the theme's error/warning/success
// tokens already carry deliberate dark-mode variants (e.g. brightened error),
// so meaning is preserved rather than dimmed.
const STRENGTH_META: Record<PasswordStrength, { colorKey: 'error' | 'warning' | 'success'; filledSegments: number; labelKey: string }> = {
  weak: { colorKey: 'error', filledSegments: 1, labelKey: 'auth.password_strength_weak' },
  medium: { colorKey: 'warning', filledSegments: 2, labelKey: 'auth.password_strength_medium' },
  strong: { colorKey: 'success', filledSegments: 3, labelKey: 'auth.password_strength_strong' },
};

const SEGMENT_COUNT = 3;

export default function PasswordStrengthMeter({ password }: { password: string }) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const opacity = useRef(new Animated.Value(0)).current;
  const strength = useMemo(() => getPasswordStrength(password), [password]);
  const meta = STRENGTH_META[strength];
  const config = { ...meta, color: theme.colors[meta.colorKey] };

  useEffect(() => {
    // Fades in the first time there's something to show; once visible it
    // just updates in place as the user keeps typing — no need to animate
    // back out, an empty field unmounts this entirely (see below).
    Animated.timing(opacity, {
      toValue: password ? 1 : 0,
      duration: MOTION_TIMING.quick,
      useNativeDriver: true,
    }).start();
  }, [password, opacity]);

  if (!password) return null;

  return (
    <Animated.View style={[styles.wrap, { opacity }]}>
      <View style={styles.track}>
        {Array.from({ length: SEGMENT_COUNT }, (_, i) => (
          <View
            key={i}
            style={[
              styles.segment,
              // Inactive track: the themed divider tone stays visible on both
              // light and dark input surfaces.
              { backgroundColor: i < config.filledSegments ? config.color : theme.colors.borderPrimary },
            ]}
          />
        ))}
      </View>
      <Text style={[styles.label, { color: config.color }]} numberOfLines={1}>
        {t(config.labelKey)}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: SPACING.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  track: {
    flex: 1,
    flexDirection: 'row',
    gap: 4,
  },
  segment: {
    flex: 1,
    height: 5,
    borderRadius: 3,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    minWidth: 60,
    textAlign: 'right',
  },
});
