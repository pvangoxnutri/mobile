/**
 * CountryPicker — reusable multi-select for ISO country codes.
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
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/contexts/app-theme-context';
import { COUNTRIES, getCountryFlag } from './country-data';

interface CountryPickerProps {
  value: string[];
  onChange: (codes: string[]) => void;
  label?: string;
}

export default function CountryPicker({ value, onChange, label = 'Countries' }: CountryPickerProps) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const selectedSet = useMemo(() => new Set(value), [value]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter((c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q));
  }, [search]);

  // Sort: selected first, then alphabetical
  const sorted = useMemo(
    () => [...filtered].sort((a, b) => {
      const aS = selectedSet.has(a.code) ? 0 : 1;
      const bS = selectedSet.has(b.code) ? 0 : 1;
      if (aS !== bS) return aS - bS;
      return a.name.localeCompare(b.name);
    }),
    [filtered, selectedSet],
  );

  function toggle(code: string) {
    if (selectedSet.has(code)) {
      onChange(value.filter((c) => c !== code));
    } else {
      onChange([...value, code]);
    }
  }

  const selectedCountries = COUNTRIES.filter((c) => selectedSet.has(c.code))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      {/* ── Trigger ─────────────────────────────────────────────────────────── */}
      <TouchableOpacity style={[styles.trigger, { borderColor: '#E4E7EE' }]} activeOpacity={0.8} onPress={() => setOpen(true)}>
        <View style={styles.triggerLeft}>
          <Ionicons name="earth-outline" size={18} color={theme.secondary} style={styles.triggerIcon} />
          <Text style={[styles.triggerLabel, { color: theme.secondary }]}>{label}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#B2B7C0" />
      </TouchableOpacity>

      {/* ── Selected chips ───────────────────────────────────────────────────── */}
      {selectedCountries.length > 0 ? (
        <View style={styles.chips}>
          {selectedCountries.map((c) => (
            <TouchableOpacity key={c.code} style={[styles.chip, { backgroundColor: theme.secondary12, borderColor: theme.secondary20 }]} activeOpacity={0.75} onPress={() => toggle(c.code)}>
              <Text style={styles.chipFlag}>{getCountryFlag(c)}</Text>
              <Text style={[styles.chipName, { color: theme.secondary }]} numberOfLines={1}>{c.name}</Text>
              <Ionicons name="close" size={13} color={theme.secondary} />
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {/* ── Modal ───────────────────────────────────────────────────────────── */}
      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
        <View style={[styles.modal, { paddingTop: Math.max(insets.top, 16) }]}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select countries</Text>
            <TouchableOpacity onPress={() => { setOpen(false); setSearch(''); }} hitSlop={12}>
              <Ionicons name="checkmark-circle" size={28} color={theme.primary} />
            </TouchableOpacity>
          </View>

          {/* Selected count */}
          {value.length > 0 ? (
            <View style={[styles.countBanner, { backgroundColor: theme.secondary08 }]}>
              <Text style={[styles.countBannerText, { color: theme.secondary }]}>
                {value.length} {value.length === 1 ? 'country' : 'countries'} selected
              </Text>
              <TouchableOpacity onPress={() => onChange([])} hitSlop={8}>
                <Text style={[styles.clearAll, { color: theme.secondary }]}>Clear all</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Search */}
          <View style={styles.searchWrap}>
            <Ionicons name="search-outline" size={17} color="#9AA2AE" />
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Search countries…"
              placeholderTextColor="#B0B7C3"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {search.length > 0 ? (
              <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
                <Ionicons name="close-circle" size={17} color="#B0B7C3" />
              </TouchableOpacity>
            ) : null}
          </View>

          {/* List */}
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {sorted.map((country, index) => {
              const selected = selectedSet.has(country.code);
              return (
                <View key={country.code}>
                  {index > 0 ? <View style={styles.divider} /> : null}
                  <TouchableOpacity style={styles.row} activeOpacity={0.7} onPress={() => toggle(country.code)}>
                    <Text style={styles.rowFlag}>{getCountryFlag(country)}</Text>
                    <View style={styles.rowText}>
                      <Text style={[styles.rowName, selected && { color: theme.primary, fontWeight: '700' }]}>{country.name}</Text>
                      <Text style={styles.rowContinent}>{country.continent}</Text>
                    </View>
                    <View style={[styles.checkbox, selected && { backgroundColor: theme.primary, borderColor: theme.primary }]}>
                      {selected ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
                    </View>
                  </TouchableOpacity>
                </View>
              );
            })}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 50,
    backgroundColor: '#FAFBFC',
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
    backgroundColor: '#fff',
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
    color: '#141720',
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
    borderColor: '#E2E5EE',
    backgroundColor: '#F7F8FA',
    paddingHorizontal: 13,
    height: 46,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#1B1E28',
  },
  divider: {
    height: 1,
    backgroundColor: '#F3F5F9',
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
  rowName: { fontSize: 16, color: '#1B1E28', fontWeight: '500' },
  rowContinent: { fontSize: 12, color: '#9AA2AE', marginTop: 1 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#D8DCE6',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
