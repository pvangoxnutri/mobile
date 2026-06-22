import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View } from 'react-native';

import { AuthGate, AuthProvider } from '@/components/auth-provider';
import { I18nProvider } from '@/components/i18n-provider';
import { NetworkStatusBar } from '@/components/network-status-bar';
import { PushNotificationBootstrap } from '@/components/push-notification-bootstrap';
import { useColorScheme } from 'react-native';
import { markStartup } from '@/lib/startup-timing'; // TEMPORARY — see lib/startup-timing.ts

export const unstable_settings = {
  anchor: '(tabs)',
};

markStartup('[LAYOUT] _layout.tsx module evaluated');

export default function RootLayout() {
  const colorScheme = useColorScheme();
  markStartup('[LAYOUT] RootLayout render');

  return (
    <SafeAreaProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <I18nProvider>
          <AuthProvider>
            <AuthGate>
              <View style={{ flex: 1 }}>
                <PushNotificationBootstrap />
                <NetworkStatusBar />
                <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="index" options={{ headerShown: false }} />
                <Stack.Screen name="(auth)/login" options={{ headerShown: false }} />
                <Stack.Screen name="create-trip" options={{ headerShown: false }} />
                <Stack.Screen name="settings" options={{ headerShown: false }} />
                <Stack.Screen name="forgot-password" options={{ headerShown: false }} />
                <Stack.Screen name="reset-password" options={{ headerShown: false }} />
                <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
                <Stack.Screen name="travel-tracker" options={{ headerShown: false }} />
                <Stack.Screen name="previous-adventures" options={{ headerShown: false }} />
                <Stack.Screen name="share/[shareCode]" options={{ headerShown: false }} />
                <Stack.Screen name="trip/[id]" options={{ headerShown: false }} />
                <Stack.Screen name="trip/[id]/settings" options={{ headerShown: false }} />
                <Stack.Screen name="trip/[id]/split" options={{ headerShown: false }} />
                <Stack.Screen name="trip/[id]/sidequest/new" options={{ headerShown: false }} />
                <Stack.Screen name="trip/[id]/sidequest/[sidequestId]" options={{ headerShown: false }} />
                <Stack.Screen name="modal" options={{ presentation: 'modal', headerShown: false }} />
              </Stack>
                <StatusBar style="dark" />
              </View>
            </AuthGate>
          </AuthProvider>
        </I18nProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
