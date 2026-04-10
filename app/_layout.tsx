import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthGate, AuthProvider } from '@/components/auth-provider';
import { I18nProvider } from '@/components/i18n-provider';
import { useColorScheme } from '@/hooks/use-color-scheme';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <SafeAreaProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <I18nProvider>
          <AuthProvider>
            <AuthGate>
              <Stack>
                <Stack.Screen name="index" options={{ headerShown: false }} />
                <Stack.Screen name="(auth)/login" options={{ headerShown: false }} />
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="forgot-password" options={{ headerShown: false }} />
                <Stack.Screen name="reset-password" options={{ headerShown: false }} />
                <Stack.Screen name="settings" options={{ headerShown: false }} />
                <Stack.Screen name="create-trip" options={{ headerShown: false }} />
                <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
                <Stack.Screen name="TMP_Navbar" options={{ headerShown: false }} />
                <Stack.Screen name="trip/[id]" options={{ headerShown: false }} />
                <Stack.Screen name="trip/[id]/settings" options={{ headerShown: false }} />
                <Stack.Screen name="trip/[id]/sidequest/new" options={{ headerShown: false }} />
                <Stack.Screen name="trip/[id]/sidequest/[sidequestId]" options={{ headerShown: false }} />
                <Stack.Screen name="trip/[id]/sidequest/[sidequestId]/edit" options={{ headerShown: false }} />
                <Stack.Screen name="trip/[id]/split" options={{ headerShown: false }} />
                <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
              </Stack>
              <StatusBar style="dark" />
            </AuthGate>
          </AuthProvider>
        </I18nProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
