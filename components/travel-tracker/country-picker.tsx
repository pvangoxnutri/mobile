/**
 * CountryPicker â€” reusable multi-select for ISO country codes.
 *
 * Usage:
 *   <CountryPicker value={codes} onChange={setCodes} />
 *
 * Shows selected countries as flag+name chips inline.
 * Tapping opens a searchable modal list with checkmarks.
 */

import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import {
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COUNTRIES, getCountryFlag } from './country-data';
import {
  compareCountriesByLocalizedName,
  getLocalizedContinentName,
  getLocalizedCountryName,
} from './country-i18n';
import { useI18n } from '@/components/i18n-provider';
import { useTheme } from '@/components/theme-provider';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { AppTheme } from '@/constants/themes';

interface CountryPickerProps {
  value: string[];
  onChange: (codes: string[]) => void;
  label?: string;
}

export default function CountryPicker({ value, onChange, label = 'Countries' }: CountryPickerProps) {
  const { language } = useI18n();
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const selectedSet = useMemo(() => new Set(value), [value]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter((c) =>
      getLocalizedCountryName(c, language).toLowerCase().includes(q) ||
      c.name.toLowerCase().includes(q) ||
      c.code.toLowerCase().includes(q),
    );
  }, [search, language]);

  // Sort: selected first, then alphabetical by the localized name (so
  // Swedish Å/Ö go to the end on sv, but mid-alphabet on en).
  const sorted = useMemo(
    () => [...filtered].sort((a, b) => {
      const aS = selectedSet.has(a.code) ? 0 : 1;
      const bS = selectedSet.has(b.code) ? 0 : 1;
      if (aS !== bS) return aS - bS;
      return compareCountriesByLocalizedName(a, b, language);
    }),
    [filtered, selectedSet, language],
  );

  function toggle(code: string) {
    if (selectedSet.has(code)) {
      onChange(value.filter((c) => c !== code));
    } else {
      onChange([...value, code]);
    }
  }

  const selectedCountries = COUNTRIES.filter((c) => selectedSet.has(c.code))
    .sort((a, b) => compareCountriesByLocalizedName(a, b, language));

  return (
    <>
      {/* â”€â”€ Trigger â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <TouchableOpacity style={[styles.trigger, { borderColor: theme.isDark ? theme.colors.borderInput : '#E4E7EE' }]} activeOpacity={0.8} onPress={() => setOpen(true)}>
        <View style={styles.triggerLeft}>
          <Ionicons name="earth-outline" size={18} color={theme.colors.secondary} style={styles.triggerIcon} />
          <Text style={[styles.triggerLabel, { color: theme.colors.secondary }]}>{label}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={theme.isDark ? theme.colors.textMuted : '#B2B7C0'} />
      </TouchableOpacity>

      {/* â”€â”€ Selected chips â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {selectedCountries.length > 0 ? (
        <View style={styles.chips}>
          {selectedCountries.map((c) => (
            // Teal stays the chips' semantic hue in both themes — dark uses
            // washes of the lifted dark secondary (#22aec7), as elsewhere.
            <TouchableOpacity key={c.code} style={[styles.chip, { backgroundColor: theme.isDark ? 'rgba(34,174,199,0.16)' : 'rgba(13, 144, 168, 0.12)', borderColor: theme.isDark ? 'rgba(34,174,199,0.3)' : 'rgba(13, 144, 168, 0.20)' }]} activeOpacity={0.75} onPress={() => toggle(c.code)}>
              <Text style={styles.chipFlag}>{getCountryFlag(c)}</Text>
              <Text style={[styles.chipName, { color: theme.colors.secondary }]} numberOfLines={1}>{getLocalizedCountryName(c, language)}</Text>
              <Ionicons name="close" size={13} color={theme.colors.secondary} />
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {/* â”€â”€ Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
        <KeyboardAvoidingView style={[styles.modal, { paddingTop: Math.max(insets.top, 16) }]} behavior="padding">
          {/* Header */}
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select countries</Text>
            <TouchableOpacity onPress={() => { setOpen(false); setSearch(''); }} hitSlop={12}>
              <Ionicons name="checkmark-circle" size={28} color={theme.colors.primary} />
            </TouchableOpacity>
          </View>

          {/* Selected count */}
          {value.length > 0 ? (
            <View style={[styles.countBanner, { backgroundColor: theme.isDark ? 'rgba(34,174,199,0.12)' : 'rgba(13, 144, 168, 0.08)' }]}>
              <Text style={[styles.countBannerText, { color: theme.colors.secondary }]}>
                {value.length} {value.length === 1 ? 'country' : 'countries'} selected
              </Text>
              <TouchableOpacity onPress={() => onChange([])} hitSlop={8}>
                <Text style={[styles.clearAll, { color: theme.colors.secondary }]}>Clear all</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Search */}
          <View style={styles.searchWrap}>
            <Ionicons name="search-outline" size={17} color={theme.isDark ? theme.colors.textMeta : '#9AA2AE'} />
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Search countries..."
              placeholderTextColor={theme.isDark ? theme.colors.placeholderText : '#B0B7C3'}
              keyboardAppearance={theme.keyboardAppearance}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              onSubmitEditing={() => Keyboard.dismiss()}
            />
            {search.length > 0 ? (
              <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
                <Ionicons name="close-circle" size={17} color={theme.isDark ? theme.colors.textMuted : '#B0B7C3'} />
              </TouchableOpacity>
            ) : null}
          </View>

          {/* List — virtualized so the ~200-country list mounts fast on
              Android (a plain ScrollView.map rendered every row up front). */}
          <FlatList
            data={sorted}
            keyExtractor={(country) => country.code}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={14}
            windowSize={11}
            ItemSeparatorComponent={() => <View style={styles.divider} />}
            renderItem={({ item: country }) => {
              const selected = selectedSet.has(country.code);
              return (
                <TouchableOpacity style={styles.row} activeOpacity={0.7} onPress={() => toggle(country.code)}>
                  <Text style={styles.rowFlag}>{getCountryFlag(country)}</Text>
                  <View style={styles.rowText}>
                    <Text style={[styles.rowName, selected && { color: theme.colors.primary, fontWeight: '700' }]}>{getLocalizedCountryName(country, language)}</Text>
                    <Text style={styles.rowContinent}>{getLocalizedContinentName(country.continent, language)}</Text>
                  </View>
                  <View style={[styles.checkbox, selected && { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }]}>
                    {selected ? <Ionicons name="checkmark" size={14} color={theme.colors.white} /> : null}
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 50,
    backgroundColor: theme.isDark ? theme.colors.bgLightest : '#FAFBFC',
  },
  triggerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  triggerIcon: {},
  triggerLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 10,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipFlag: { fontSize: 16 },
  chipName: { fontSize: 13, fontWeight: '600', maxWidth: 120 },
  modal: {
    flex: 1,
    // Sheet/modal surface — light literal equals surfaceElevated exactly.
    backgroundColor: theme.colors.surfaceElevated,
    paddingHorizontal: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: theme.isDark ? theme.colors.textPrimary : '#141720',
    letterSpacing: -0.8,
  },
  countBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
  },
  countBannerText: { fontSize: 14, fontWeight: '600' },
  clearAll: { fontSize: 13, fontWeight: '700' },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    // Light literal equals the borderInput token exactly.
    borderColor: theme.colors.borderInput,
    backgroundColor: theme.isDark ? theme.colors.bgLight : '#F7F8FA',
    paddingHorizontal: 13,
    height: 46,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: theme.isDark ? theme.colors.textPrimary : '#1B1E28',
  },
  divider: {
    height: 1,
    backgroundColor: theme.isDark ? theme.colors.borderPrimary : '#F3F5F9',
    marginLeft: 56,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  rowFlag: { fontSize: 24, width: 32, textAlign: 'center' },
  rowText: { flex: 1 },
  rowName: { fontSize: 16, color: theme.isDark ? theme.colors.textPrimary : '#1B1E28', fontWeight: '500' },
  rowContinent: { fontSize: 12, color: theme.isDark ? theme.colors.textMeta : '#9AA2AE', marginTop: 1 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: theme.isDark ? theme.colors.borderInput : '#D8DCE6',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

