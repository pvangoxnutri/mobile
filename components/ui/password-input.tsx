import { Ionicons } from '@expo/vector-icons';
import { forwardRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useI18n } from '@/components/i18n-provider';
import { useTheme } from '@/components/theme-provider';

// secureTextEntry is owned by the toggle — callers style/configure everything
// else exactly like a plain TextInput.
type PasswordInputProps = Omit<TextInputProps, 'secureTextEntry'>;

// Margins in the caller's input style must land on the wrapper, not the inner
// TextInput — otherwise the absolutely-positioned eye centers against the
// margin box instead of the visible field.
const OUTER_STYLE_KEYS = [
  'margin',
  'marginTop',
  'marginBottom',
  'marginLeft',
  'marginRight',
  'marginHorizontal',
  'marginVertical',
  'marginStart',
  'marginEnd',
  'alignSelf',
] as const;

export const PasswordInput = forwardRef<TextInput, PasswordInputProps>(function PasswordInput(
  { style, ...rest },
  ref,
) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const [visible, setVisible] = useState(false);

  const flattened: TextStyle = { ...(StyleSheet.flatten(style) ?? {}) };
  const outer: ViewStyle = {};
  for (const key of OUTER_STYLE_KEYS) {
    if (key in flattened) {
      (outer as Record<string, unknown>)[key] = flattened[key];
      delete flattened[key];
    }
  }

  return (
    <View style={outer}>
      <TextInput ref={ref} {...rest} style={[flattened, styles.inputClearance]} secureTextEntry={!visible} />
      <Pressable
        style={styles.toggle}
        onPress={() => setVisible((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={visible ? t('auth.hide_password') : t('auth.show_password')}>
        <Ionicons
          name={visible ? 'eye-off-outline' : 'eye-outline'}
          size={22}
          color={theme.colors.textSecondary}
        />
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  // Wins over the caller's paddingHorizontal so text never runs under the eye.
  inputClearance: {
    paddingRight: 48,
  },
  // Full field height (52–54pt) × 48pt wide — comfortably past the 44pt
  // minimum touch target.
  toggle: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
