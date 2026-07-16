import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getCountryFlag, type Country, type CountryStatus } from './country-data';
import { getLocalizedContinentName, getLocalizedCountryName } from './country-i18n';
import { useI18n } from '@/components/i18n-provider';
import { useTheme } from '@/components/theme-provider';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { AppTheme } from '@/constants/themes';

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
  const { t, language } = useI18n();
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
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

  // Status hues are semantic identity (visited = brand pink, planned = teal,
  // living = amber): dark swaps each wash/ink for a readable variant of the
  // SAME hue — matching the badge treatment on the Travel Tracker screen.
  const options: Option[] = [
    { status: 'visited', label: t('travel.status.visited'), icon: 'checkmark-circle', bg: theme.colors.primaryLight12, color: theme.colors.primary },
    { status: 'planned', label: t('travel.status.planning'), icon: 'bookmark', bg: theme.isDark ? 'rgba(34,174,199,0.16)' : 'rgba(13, 144, 168, 0.12)', color: theme.colors.secondary },
    { status: 'living', label: t('travel.status.living'), icon: 'home', bg: theme.isDark ? 'rgba(232,164,74,0.16)' : '#FEF3C7', color: theme.isDark ? '#e8a44a' : '#D97706' },
    { status: 'none', label: t('travel.status.clear'), icon: 'close-circle-outline', bg: theme.isDark ? theme.colors.bgLight : '#F4F5F7', color: theme.isDark ? theme.colors.textMeta : '#8A909D' },
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
            <Text style={styles.countryName}>{getLocalizedCountryName(country, language)}</Text>
            <Text style={styles.continentLabel}>{getLocalizedContinentName(country.continent, language)}</Text>
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

const createStyles = (theme: AppTheme) => StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.isDark ? theme.colors.backdropModal : 'rgba(10,13,22,0.42)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: theme.colors.surfaceElevated,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    borderWidth: theme.isDark ? StyleSheet.hairlineWidth : 0,
    borderBottomWidth: 0,
    borderColor: theme.colors.borderPrimary,
    paddingTop: 12,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: theme.isDark ? 0.5 : 0.10,
    shadowRadius: 24,
    elevation: theme.isDark ? 0 : 20,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.sheetHandle,
    marginBottom: 20,
  },
  countryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: theme.isDark ? theme.colors.borderPrimary : '#EDF0F5',
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
    color: theme.isDark ? theme.colors.textPrimary : '#141720',
    letterSpacing: -0.6,
  },
  continentLabel: {
    marginTop: 2,
    fontSize: 14,
    color: theme.isDark ? theme.colors.textMeta : '#8A909D',
    fontWeight: '500',
  },
  options: {
    borderRadius: 20,
    overflow: 'hidden',
    marginTop: 6,
  },
  divider: {
    height: 1,
    backgroundColor: theme.isDark ? theme.colors.borderPrimary : '#EDF0F5',
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
    color: theme.isDark ? theme.colors.textPrimary : '#1B1E28',
    fontWeight: '500',
  },
  activeCheck: {
    marginRight: 4,
  },
});

