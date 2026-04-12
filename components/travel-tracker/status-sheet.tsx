import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/contexts/app-theme-context';
import { getCountryFlag, type Country, type CountryStatus } from './country-data';

interface StatusSheetProps {
  country: Country | null;
  currentStatus: CountryStatus;
  visible: boolean;
  onSelect: (status: CountryStatus) => void;
  onClose: () => void;
}

interface Option {
  status: CountryStatus;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  bg: string;
  color: string;
}

export default function StatusSheet({ country, currentStatus, visible, onSelect, onClose }: StatusSheetProps) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(300)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, damping: 20, stiffness: 180 }),
        Animated.timing(fadeAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: 300, duration: 200, useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 0, duration: 180, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, slideAnim, fadeAnim]);

  const options: Option[] = [
    { status: 'visited', label: 'Visited', icon: 'checkmark-circle', bg: theme.primary12, color: theme.primary },
    { status: 'planned', label: 'Planning to visit', icon: 'bookmark', bg: theme.secondary12, color: theme.secondary },
    { status: 'living', label: 'I live here', icon: 'home', bg: '#FEF3C7', color: '#D97706' },
    { status: 'none', label: 'Clear status', icon: 'close-circle-outline', bg: '#F4F5F7', color: '#8A909D' },
  ];

  if (!country) return null;

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <Animated.View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 20) + 8, transform: [{ translateY: slideAnim }] }]}>
        {/* Handle */}
        <View style={styles.handle} />

        {/* Country header */}
        <View style={styles.countryHeader}>
          <Text style={styles.flagText}>{getCountryFlag(country)}</Text>
          <View style={styles.countryInfo}>
            <Text style={styles.countryName}>{country.name}</Text>
            <Text style={styles.continentLabel}>{country.continent}</Text>
          </View>
        </View>

        {/* Options */}
        <View style={styles.options}>
          {options.map((opt, index) => {
            const isActive = currentStatus === opt.status;
            return (
              <View key={opt.status}>
                {index > 0 ? <View style={styles.divider} /> : null}
                <TouchableOpacity
                  style={[styles.optionRow, isActive && { backgroundColor: opt.bg }]}
                  activeOpacity={0.75}
                  onPress={() => onSelect(opt.status)}>
                  <View style={[styles.optionIcon, { backgroundColor: opt.bg }]}>
                    <Ionicons name={opt.icon} size={20} color={opt.color} />
                  </View>
                  <Text style={[styles.optionLabel, isActive && { color: opt.color, fontWeight: '700' }]}>{opt.label}</Text>
                  {isActive ? <Ionicons name="checkmark" size={18} color={opt.color} style={styles.activeCheck} /> : null}
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10,13,22,0.42)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingTop: 12,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.10,
    shadowRadius: 24,
    elevation: 20,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#DDE1EA',
    marginBottom: 20,
  },
  countryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#EDF0F5',
    marginBottom: 8,
  },
  flagText: {
    fontSize: 42,
    lineHeight: 50,
  },
  countryInfo: {
    flex: 1,
  },
  countryName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#141720',
    letterSpacing: -0.6,
  },
  continentLabel: {
    marginTop: 2,
    fontSize: 14,
    color: '#8A909D',
    fontWeight: '500',
  },
  options: {
    borderRadius: 20,
    overflow: 'hidden',
    marginTop: 6,
  },
  divider: {
    height: 1,
    backgroundColor: '#EDF0F5',
    marginLeft: 60,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderRadius: 16,
    gap: 14,
  },
  optionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionLabel: {
    flex: 1,
    fontSize: 16,
    color: '#1B1E28',
    fontWeight: '500',
  },
  activeCheck: {
    marginRight: 4,
  },
});
