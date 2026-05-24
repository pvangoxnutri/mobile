import { StyleSheet, TextInput as RNTextInput, View, Text } from 'react-native';
import { SPACING, TYPOGRAPHY, COLORS, INPUT, SHADOWS } from '@/constants/design-tokens';

interface TextInputProps {
  placeholder: string;
  value: string;
  onChangeText: (text: string) => void;
  label?: string;
  error?: string;
  multiline?: boolean;
  maxLength?: number;
  keyboardType?: 'default' | 'email-address' | 'numeric' | 'decimal-pad';
  returnKeyType?: 'done' | 'go' | 'next' | 'search' | 'send';
  onSubmitEditing?: () => void;
  editable?: boolean;
  style?: any;
}

export function TextInput({
  placeholder,
  value,
  onChangeText,
  label,
  error,
  multiline = false,
  maxLength,
  keyboardType = 'default',
  returnKeyType = 'done',
  onSubmitEditing,
  editable = true,
  style,
}: TextInputProps) {
  return (
    <View style={style}>
      {label && <Text style={styles.label}>{label}</Text>}
      <RNTextInput
        style={[
          styles.input,
          error && styles.inputError,
          multiline && styles.multiline,
          !editable && styles.disabled,
        ]}
        placeholder={placeholder}
        placeholderTextColor={COLORS.placeholderText}
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        maxLength={maxLength}
        keyboardType={keyboardType}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
        editable={editable}
      />
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    ...TYPOGRAPHY.label,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: SPACING.md,
  },
  input: {
    height: INPUT.height,
    borderRadius: INPUT.borderRadius,
    borderWidth: INPUT.borderWidth,
    borderColor: COLORS.borderInput,
    backgroundColor: COLORS.bgLightest,
    paddingHorizontal: INPUT.paddingHorizontal,
    fontSize: TYPOGRAPHY.body.fontSize,
    color: COLORS.textPrimary,
    fontWeight: TYPOGRAPHY.body.fontWeight,
    ...SHADOWS.subtle,
  },
  inputError: {
    borderColor: COLORS.error,
  },
  multiline: {
    minHeight: INPUT.minHeight,
    paddingVertical: SPACING.lg,
    textAlignVertical: 'top',
  },
  disabled: {
    opacity: 0.5,
    backgroundColor: COLORS.bgLight,
  },
  error: {
    ...TYPOGRAPHY.meta,
    fontWeight: '500',
    color: COLORS.error,
    marginTop: SPACING.md,
  },
});
