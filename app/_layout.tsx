import { ThemeProvider as NavigationThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as NavigationBar from 'expo-navigation-bar';
import * as SystemUI from 'expo-system-ui';
import 'react-native-reanimated';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Platform, View } from 'react-native';

import { AuthGate, AuthProvider } from '@/components/auth-provider';
import { I18nProvider } from '@/components/i18n-provider';
import { NetworkStatusBar } from '@/components/network-status-bar';
import { PushNotificationBootstrap } from '@/components/push-notification-bootstrap';
import { ThemeProvider, useTheme } from '@/components/theme-provider';
import { markStartup } from '@/lib/startup-timing'; // TEMPORARY — see lib/startup-timing.ts

export const unstable_settings = {
  anchor: '(tabs)',
};

markStartup('[LAYOUT] _layout.tsx module evaluated');

export default function RootLayout() {
  markStartup('[LAYOUT] RootLayout render');

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaProvider>
      {/* Appearance is an explicit SideQuest preference (Light/Dark only) —
          the app deliberately never follows the device color scheme. */}
      <ThemeProvider>
        <ThemedRoot />
      </ThemeProvider>
    </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function ThemedRoot() {
  const { theme } = useTheme();

  // Keep the native chrome in sync with the explicit theme: the root view
  // color (shows behind transitions and edge-to-edge system bars) and the
  // Android navigation-bar button brightness.
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(theme.colors.bgPrimary).catch(() => {});
    if (Platform.OS === 'android') {
      void NavigationBar.setButtonStyleAsync(theme.isDark ? 'light' : 'dark').catch(() => {});
    }
  }, [theme]);

  return (
      <NavigationThemeProvider value={theme.navTheme}>
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
                <Stack.Screen name="invite/[code]" options={{ headerShown: false }} />
                <Stack.Screen name="trip/[id]" options={{ headerShown: false }} />
                <Stack.Screen name="trip/[id]/settings" options={{ headerShown: false }} />
                <Stack.Screen name="trip/[id]/split" options={{ headerShown: false }} />
                <Stack.Screen name="trip/[id]/sidequest/new" options={{ headerShown: false }} />
                <Stack.Screen name="trip/[id]/sidequest/[sidequestId]" options={{ headerShown: false }} />
                <Stack.Screen name="modal" options={{ presentation: 'modal', headerShown: false }} />
              </Stack>
                <StatusBar style={theme.statusBarStyle} />
              </View>
            </AuthGate>
          </AuthProvider>
        </I18nProvider>
      </NavigationThemeProvider>
  );
}
