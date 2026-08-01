import { forwardRef } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useI18n } from '@/components/i18n-provider';
import { useTheme } from '@/components/theme-provider';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { AppTheme } from '@/constants/themes';

// ──────────────────────────────────────────────────────────────────────────
// GLUNO — the composer.
//
// Its own component, not a copy of the Adventure chat's: that one is built for
// short group messages with an image button, this one is built for a question
// that might run several lines. The member chat is deliberately left alone.
//
// Deliberately NO onSubmitEditing. This is a multiline field, so Enter should
// insert a newline everywhere — wiring submit to it makes the return key
// ambiguous on a phone keyboard and, on web, turns Enter into a surprise
// submit in the middle of a sentence. Sending is the button, always.
// ──────────────────────────────────────────────────────────────────────────

type Props = {
  value: string;
  onChangeText: (next: string) => void;
  onSend: () => void;
  /** True while a message is in flight — blocks a second send of the same text. */
  sending: boolean;
  /**
   * Aborts the turn in flight.
   *
   * While Gluno is thinking the send button BECOMES stop. A separate control
   * would sit unused for the 95% of the time nothing is running, and the
   * gesture people reach for is the button they just pressed.
   */
  onStop?: () => void;
  /** True when Gluno can't answer at all (disabled / unconfigured). */
  disabled?: boolean;
};

const GlunoComposer = forwardRef<TextInput, Props>(function GlunoComposer(
  { value, onChangeText, onSend, sending, onStop, disabled = false },
  ref,
) {
  const styles = useThemedStyles(createStyles);
  const { theme } = useTheme();
  const { t } = useI18n();

  // Trim here as well as at send time: a field holding only spaces must not
  // look sendable.
  const canSend = value.trim().length > 0 && !sending && !disabled;
  const canStop = sending && onStop != null;
  const buttonEnabled = canSend || canStop;

  return (
    <View style={styles.container}>
      <TextInput
        ref={ref}
        value={value}
        onChangeText={onChangeText}
        placeholder={t('gluno.composer.placeholder')}
        placeholderTextColor={theme.colors.placeholderText}
        keyboardAppearance={theme.keyboardAppearance}
        style={styles.input}
        editable={!disabled}
        multiline
        // Grows to maxHeight, then scrolls instead of pushing the send button
        // off screen.
        scrollEnabled
        textAlignVertical="top"
        accessibilityLabel={t('gluno.composer.placeholder')}
      />

      <TouchableOpacity
        style={[styles.sendButton, !buttonEnabled && styles.sendButtonDisabled]}
        activeOpacity={0.85}
        disabled={!buttonEnabled}
        accessibilityRole="button"
        accessibilityState={{ disabled: !buttonEnabled }}
        accessibilityLabel={canStop ? t('gluno.composer.stop') : t('gluno.composer.send')}
        onPress={canStop ? onStop : onSend}>
        <Ionicons
          name={canStop ? 'stop' : 'arrow-up'}
          size={19}
          color={theme.colors.white}
        />
      </TouchableOpacity>
    </View>
  );
});

export default GlunoComposer;

const createStyles = (theme: AppTheme) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.borderPrimary,
    backgroundColor: theme.colors.bgPrimary,
  },
  input: {
    flex: 1,
    minHeight: 46,
    maxHeight: 132,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.borderInput,
    backgroundColor: theme.colors.bgLight,
    paddingHorizontal: 15,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 15,
    lineHeight: 20,
    color: theme.colors.textPrimary,
  },
  sendButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primary,
  },
  sendButtonDisabled: {
    opacity: 0.38,
  },
});
