import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { AppLanguage } from '@/components/i18n-provider';
import { useTheme } from '@/components/theme-provider';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { AppTheme } from '@/constants/themes';

type LanguageOption = {
  code: AppLanguage;
  displayName: string;
  nativeName: string;
  flagUri: string;
};

const LANGUAGE_OPTIONS: LanguageOption[] = [
  { code: 'en', displayName: 'English', nativeName: 'English', flagUri: 'https://flagcdn.com/w40/us.png' },
  { code: 'sv', displayName: 'Svenska', nativeName: 'Svenska', flagUri: 'https://flagcdn.com/w40/se.png' },
];

export default function LanguagePicker({
  value,
  onChange,
  label,
}: {
  value: AppLanguage;
  onChange: (next: AppLanguage) => void;
  label: string;
}) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [open, setOpen] = useState(false);
  const selected = LANGUAGE_OPTIONS.find((option) => option.code === value) ?? LANGUAGE_OPTIONS[0];

  return (
    <View>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Pressable style={styles.trigger} onPress={() => setOpen(true)}>
        <View style={styles.triggerLeft}>
          <Image source={{ uri: selected.flagUri }} style={styles.flagImage} />
          <Text style={styles.triggerText}>{selected.displayName}</Text>
        </View>
        <Ionicons name="chevron-down" size={18} color={theme.colors.textMeta} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={() => setOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{label}</Text>
              <TouchableOpacity onPress={() => setOpen(false)} style={styles.closeButton}>
                <Ionicons name="close" size={20} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
              {LANGUAGE_OPTIONS.map((option) => {
                const active = option.code === value;
                return (
                  <TouchableOpacity
                    key={option.code}
                    style={[styles.optionRow, active ? styles.optionRowActive : null]}
                    activeOpacity={0.85}
                    onPress={() => {
                      onChange(option.code);
                      setOpen(false);
                    }}>
                    <View style={styles.optionLeft}>
                      <Image source={{ uri: option.flagUri }} style={styles.flagImage} />
                      <View>
                        <Text style={styles.optionNative}>{option.displayName}</Text>
                        <Text style={styles.optionMeta}>{option.nativeName}</Text>
                      </View>
                    </View>
                    {active ? <Ionicons name="checkmark-circle" size={20} color={theme.colors.primary} /> : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  fieldLabel: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3,
    marginBottom: 8,
  },
  trigger: {
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.borderInput,
    backgroundColor: theme.colors.bgLightest,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  triggerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  flagImage: {
    width: 22,
    height: 16,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: theme.colors.borderPrimary,
    backgroundColor: theme.colors.bgLight,
  },
  triggerText: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  backdrop: {
    flex: 1,
    backgroundColor: theme.isDark ? theme.colors.backdropModal : 'rgba(12,16,26,0.45)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  sheet: {
    borderRadius: 18,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.borderPrimary,
    maxHeight: 420,
    padding: 14,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sheetTitle: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bgLight,
  },
  list: {
    marginTop: 10,
  },
  optionRow: {
    minHeight: 56,
    borderRadius: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  optionRowActive: {
    backgroundColor: theme.colors.avatarLight,
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  optionNative: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1,
  },
  optionMeta: {
    color: theme.colors.textMeta,
    fontSize: 12,
    marginTop: 1,
  },
  empty: {
    color: theme.colors.textMeta,
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 12,
  },
});

