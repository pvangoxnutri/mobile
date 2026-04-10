import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Currency = {
  code: string;
  name: string;
  flag: string;
};

function flag(cc: string) {
  return cc
    .toUpperCase()
    .split('')
    .map((c) => String.fromCodePoint(c.charCodeAt(0) - 65 + 0x1f1e6))
    .join('');
}

const CURRENCIES: Currency[] = [
  { code: 'SEK', name: 'Swedish Krona',        flag: flag('SE') },
  { code: 'EUR', name: 'Euro',                  flag: '🇪🇺' },
  { code: 'USD', name: 'US Dollar',             flag: flag('US') },
  { code: 'GBP', name: 'British Pound',         flag: flag('GB') },
  { code: 'NOK', name: 'Norwegian Krone',       flag: flag('NO') },
  { code: 'DKK', name: 'Danish Krone',          flag: flag('DK') },
  { code: 'ISK', name: 'Icelandic Króna',       flag: flag('IS') },
  { code: 'CHF', name: 'Swiss Franc',           flag: flag('CH') },
  { code: 'PLN', name: 'Polish Złoty',          flag: flag('PL') },
  { code: 'CZK', name: 'Czech Koruna',          flag: flag('CZ') },
  { code: 'HUF', name: 'Hungarian Forint',      flag: flag('HU') },
  { code: 'RON', name: 'Romanian Leu',          flag: flag('RO') },
  { code: 'BGN', name: 'Bulgarian Lev',         flag: flag('BG') },
  { code: 'HRK', name: 'Croatian Kuna',         flag: flag('HR') },
  { code: 'RSD', name: 'Serbian Dinar',         flag: flag('RS') },
  { code: 'BAM', name: 'Bosnian Mark',          flag: flag('BA') },
  { code: 'ALL', name: 'Albanian Lek',          flag: flag('AL') },
  { code: 'MKD', name: 'Macedonian Denar',      flag: flag('MK') },
  { code: 'TRY', name: 'Turkish Lira',          flag: flag('TR') },
  { code: 'RUB', name: 'Russian Ruble',         flag: flag('RU') },
  { code: 'UAH', name: 'Ukrainian Hryvnia',     flag: flag('UA') },
  { code: 'GEL', name: 'Georgian Lari',         flag: flag('GE') },
  { code: 'AMD', name: 'Armenian Dram',         flag: flag('AM') },
  { code: 'AZN', name: 'Azerbaijani Manat',     flag: flag('AZ') },
  { code: 'KZT', name: 'Kazakhstani Tenge',     flag: flag('KZ') },
  { code: 'AUD', name: 'Australian Dollar',     flag: flag('AU') },
  { code: 'NZD', name: 'New Zealand Dollar',    flag: flag('NZ') },
  { code: 'CAD', name: 'Canadian Dollar',       flag: flag('CA') },
  { code: 'JPY', name: 'Japanese Yen',          flag: flag('JP') },
  { code: 'CNY', name: 'Chinese Yuan',          flag: flag('CN') },
  { code: 'HKD', name: 'Hong Kong Dollar',      flag: flag('HK') },
  { code: 'SGD', name: 'Singapore Dollar',      flag: flag('SG') },
  { code: 'TWD', name: 'Taiwan Dollar',         flag: flag('TW') },
  { code: 'KRW', name: 'South Korean Won',      flag: flag('KR') },
  { code: 'THB', name: 'Thai Baht',             flag: flag('TH') },
  { code: 'VND', name: 'Vietnamese Dong',       flag: flag('VN') },
  { code: 'IDR', name: 'Indonesian Rupiah',     flag: flag('ID') },
  { code: 'MYR', name: 'Malaysian Ringgit',     flag: flag('MY') },
  { code: 'PHP', name: 'Philippine Peso',       flag: flag('PH') },
  { code: 'INR', name: 'Indian Rupee',          flag: flag('IN') },
  { code: 'PKR', name: 'Pakistani Rupee',       flag: flag('PK') },
  { code: 'BDT', name: 'Bangladeshi Taka',      flag: flag('BD') },
  { code: 'LKR', name: 'Sri Lankan Rupee',      flag: flag('LK') },
  { code: 'NPR', name: 'Nepalese Rupee',        flag: flag('NP') },
  { code: 'MMK', name: 'Myanmar Kyat',          flag: flag('MM') },
  { code: 'KHR', name: 'Cambodian Riel',        flag: flag('KH') },
  { code: 'LAK', name: 'Lao Kip',              flag: flag('LA') },
  { code: 'MNT', name: 'Mongolian Tögrög',      flag: flag('MN') },
  { code: 'AED', name: 'UAE Dirham',            flag: flag('AE') },
  { code: 'SAR', name: 'Saudi Riyal',           flag: flag('SA') },
  { code: 'QAR', name: 'Qatari Riyal',          flag: flag('QA') },
  { code: 'ILS', name: 'Israeli Shekel',        flag: flag('IL') },
  { code: 'EGP', name: 'Egyptian Pound',        flag: flag('EG') },
  { code: 'MAD', name: 'Moroccan Dirham',       flag: flag('MA') },
  { code: 'ZAR', name: 'South African Rand',    flag: flag('ZA') },
  { code: 'NGN', name: 'Nigerian Naira',        flag: flag('NG') },
  { code: 'KES', name: 'Kenyan Shilling',       flag: flag('KE') },
  { code: 'GHS', name: 'Ghanaian Cedi',         flag: flag('GH') },
  { code: 'BRL', name: 'Brazilian Real',        flag: flag('BR') },
  { code: 'ARS', name: 'Argentine Peso',        flag: flag('AR') },
  { code: 'CLP', name: 'Chilean Peso',          flag: flag('CL') },
  { code: 'COP', name: 'Colombian Peso',        flag: flag('CO') },
  { code: 'PEN', name: 'Peruvian Sol',          flag: flag('PE') },
  { code: 'MXN', name: 'Mexican Peso',          flag: flag('MX') },
];

type Props = {
  value: string;
  onChange: (code: string) => void;
};

export function CurrencyPicker({ value, onChange }: Props) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selected = CURRENCIES.find((c) => c.code === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return CURRENCIES;
    return CURRENCIES.filter(
      (c) => c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q),
    );
  }, [query]);

  function pick(code: string) {
    onChange(code);
    setOpen(false);
    setQuery('');
  }

  return (
    <>
      <TouchableOpacity style={styles.trigger} activeOpacity={0.8} onPress={() => setOpen(true)}>
        <Text style={styles.triggerFlag}>{selected?.flag ?? '🌐'}</Text>
        <Text style={styles.triggerCode}>{value || 'SEK'}</Text>
        <Ionicons name="chevron-down" size={14} color="#8a909b" />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={() => setOpen(false)} />
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8, zIndex: 1 }]}>
            <View style={styles.handle} />
            <Text style={styles.title}>Select Currency</Text>
            <View style={styles.searchRow}>
              <Ionicons name="search-outline" size={16} color="#8a909b" style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search currency or code…"
                placeholderTextColor="#afb5bf"
                value={query}
                onChangeText={setQuery}
                autoFocus
              />
              {query.length > 0 && (
                <TouchableOpacity onPress={() => setQuery('')}>
                  <Ionicons name="close-circle" size={16} color="#b0b6c0" />
                </TouchableOpacity>
              )}
            </View>
            <FlatList
              data={filtered}
              keyExtractor={(c) => c.code}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={styles.list}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.item, item.code === value && styles.itemActive]}
                  activeOpacity={0.75}
                  onPress={() => pick(item.code)}>
                  <Text style={styles.itemFlag}>{item.flag}</Text>
                  <Text style={styles.itemCode}>{item.code}</Text>
                  <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                  {item.code === value && (
                    <Ionicons name="checkmark" size={16} color="#ff4f74" />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#eaedf2',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#fafbfc',
    width: 90,
    justifyContent: 'center',
  },
  triggerFlag: {
    fontSize: 18,
    lineHeight: 22,
  },
  triggerCode: {
    fontSize: 14,
    fontWeight: '600',
    color: '#161821',
  },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 18,
    paddingTop: 12,
    maxHeight: '80%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#dde0e6',
    alignSelf: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#161821',
    marginBottom: 12,
    textAlign: 'center',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f5f8',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 10,
    gap: 8,
  },
  searchIcon: {},
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#161821',
  },
  list: {
    flex: 1,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f2f5',
    gap: 10,
  },
  itemActive: {
    backgroundColor: '#fff5f7',
    borderRadius: 10,
    paddingHorizontal: 8,
  },
  itemFlag: {
    fontSize: 22,
    width: 32,
    textAlign: 'center',
  },
  itemCode: {
    fontSize: 14,
    fontWeight: '700',
    color: '#161821',
    width: 44,
  },
  itemName: {
    flex: 1,
    fontSize: 13,
    color: '#5a6072',
  },
});
