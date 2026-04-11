import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { AppLanguage } from '@/components/i18n-provider';
import { useAppTheme } from '@/contexts/app-theme-context';

type LanguageOption = {
  code: AppLanguage;
  badge: 'SV' | 'GB';
  flagUri: string;
  name: string;
  nativeName: string;
};

const LANGUAGE_OPTIONS: LanguageOption[] = [
  { code: 'en', badge: 'GB', name: 'English', nativeName: 'English', flagUri: 'https://flagcdn.com/w40/gb.png' },
  { code: 'sv', badge: 'SV', name: 'Swedish', nativeName: 'Svenska', flagUri: 'https://flagcdn.com/w40/se.png' },
];

export default function LanguagePicker({
  value,
  onChange,
  label,
  searchPlaceholder = 'Search language',
}: {
  value: AppLanguage;
  onChange: (next: AppLanguage) => void;
  label: string;
  searchPlaceholder?: string;
}) {
  const theme = useAppTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selected = LANGUAGE_OPTIONS.find((option) => option.code === value) ?? LANGUAGE_OPTIONS[0];
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!normalizedQuery) return LANGUAGE_OPTIONS;
    return LANGUAGE_OPTIONS.filter((option) =>
      `${option.name} ${option.nativeName} ${option.code} ${option.badge}`.toLowerCase().includes(normalizedQuery),
    );
  }, [normalizedQuery]);

  return (
    <View>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Pressable style={styles.trigger} onPress={() => setOpen(true)}>
        <View style={styles.triggerLeft}>
          <Image source={{ uri: selected.flagUri }} style={styles.flagImage} />
          <Text style={styles.triggerText}>{selected.badge}</Text>
        </View>
        <Ionicons name="chevron-down" size={18} color="#8a8f9b" />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={() => setOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{label}</Text>
              <TouchableOpacity onPress={() => setOpen(false)} style={styles.closeButton}>
                <Ionicons name="close" size={20} color="#6f7582" />
              </TouchableOpacity>
            </View>

            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={searchPlaceholder}
              placeholderTextColor="#a2a8b3"
              style={styles.searchInput}
              autoCapitalize="none"
            />

            <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
              {filtered.map((option) => {
                const active = option.code === value;
                return (
                  <TouchableOpacity
                    key={option.code}
                    style={[styles.optionRow, active ? styles.optionRowActive : null]}
                    activeOpacity={0.85}
                    onPress={() => {
                      onChange(option.code);
                      setOpen(false);
                      setQuery('');
                    }}>
                    <View style={styles.optionLeft}>
                      <Image source={{ uri: option.flagUri }} style={styles.flagImage} />
                      <View>
                        <Text style={styles.optionNative}>{option.badge}</Text>
                        <Text style={styles.optionMeta}>{option.nativeName}</Text>
                      </View>
                    </View>
                    {active ? <Ionicons name="checkmark-circle" size={20} color={theme.primary} /> : null}
                  </TouchableOpacity>
                );
              })}
              {filtered.length === 0 ? <Text style={styles.empty}>No matches</Text> : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  fieldLabel: {
    color: '#4b515d',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3,
    marginBottom: 8,
  },
  trigger: {
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e4e7ee',
    backgroundColor: '#f9fafc',
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
    borderColor: '#d9dfea',
    backgroundColor: '#f3f5fa',
  },
  triggerText: {
    color: '#20232c',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(12,16,26,0.45)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  sheet: {
    borderRadius: 18,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e7eaf0',
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
    color: '#12141a',
    fontSize: 18,
    fontWeight: '800',
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f2f4f8',
  },
  searchInput: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e4e7ee',
    backgroundColor: '#f9fafc',
    paddingHorizontal: 12,
    fontSize: 15,
    color: '#151a24',
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
    backgroundColor: '#fff3f6',
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  optionNative: {
    color: '#131722',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1,
  },
  optionMeta: {
    color: '#7e8593',
    fontSize: 12,
    marginTop: 1,
  },
  empty: {
    color: '#7e8593',
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 12,
  },
});
