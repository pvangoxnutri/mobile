import { Stack } from 'expo-router';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useI18n, type AppLanguage } from '@/components/i18n-provider';
import { PRIMARY_COLOR } from '@/constants/colors';

export default function SettingsScreen() {
  const { language, setLanguage, t } = useI18n();

  const handleLanguageChange = async (newLanguage: AppLanguage) => {
    await setLanguage(newLanguage);
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Settings', headerShown: true }} />
      <ScrollView contentContainerStyle={styles.screen} showsVerticalScrollIndicator={false}>
        <View style={styles.container}>
          <Text style={styles.title}>{t('settings.title')}</Text>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('auth.language')}</Text>
            <View style={styles.languageGrid}>
              <TouchableOpacity
                activeOpacity={0.88}
                style={[styles.languageButton, language === 'sv' && styles.languageButtonActive]}
                onPress={() => void handleLanguageChange('sv')}>
                <Text style={styles.flagEmoji}>🇸🇪</Text>
                <Text style={[styles.languageButtonText, language === 'sv' && styles.languageButtonTextActive]}>
                  {t('auth.language_sv')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.88}
                style={[styles.languageButton, language === 'en' && styles.languageButtonActive]}
                onPress={() => void handleLanguageChange('en')}>
                <Text style={styles.flagEmoji}>🇺🇸</Text>
                <Text style={[styles.languageButtonText, language === 'en' && styles.languageButtonTextActive]}>
                  {t('auth.language_en')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flexGrow: 1,
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  container: {
    gap: 32,
  },
  title: {
    fontSize: 32,
    fontWeight: '900',
    color: '#151722',
    letterSpacing: -1.2,
  },
  section: {
    gap: 14,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#161821',
    letterSpacing: 0.5,
  },
  languageGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  languageButton: {
    flex: 1,
    paddingHorizontal: 18,
    paddingVertical: 20,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#ebedf2',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  flagEmoji: {
    fontSize: 42,
  },
  languageButtonActive: {
    backgroundColor: PRIMARY_COLOR,
    borderColor: PRIMARY_COLOR,
  },
  languageButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#5a6072',
  },
  languageButtonTextActive: {
    color: '#fff',
  },
});
