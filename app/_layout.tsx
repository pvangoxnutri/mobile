import { ThemeProvider as NavigationThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as NavigationBar from 'expo-navigation-bar';
import * as SplashScreen from 'expo-splash-screen';
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

// Keep the native splash (a plain brand-colored surface — see app.json) up
// only until the THEME is known, which is a single AsyncStorage read. At that
// point StartupScreen can paint the identical surface in the correct
// appearance, so the hand-off is invisible.
//
// This used to wait for auth to finish, which meant the native splash covered
// the entire session restore + /api/auth/sync round trip — seconds on a cold
// backend, with no way to show anything branded underneath. Auth now resolves
// behind StartupScreen instead of in front of a frozen native image.
void SplashScreen.preventAutoHideAsync().catch(() => {});
// Safety net: if the theme read somehow never settles, the user must not be
// stranded on a native splash with no JS underneath it.
setTimeout(() => void SplashScreen.hideAsync().catch(() => {}), 10_000);

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
  const { theme, hydrated } = useTheme();

  // Keep the native chrome in sync with the explicit theme: the root view
  // color (shows behind transitions and edge-to-edge system bars) and the
  // Android navigation-bar button brightness.
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(theme.colors.bgPrimary).catch(() => {});
    if (Platform.OS === 'android') {
      void NavigationBar.setButtonStyleAsync(theme.isDark ? 'light' : 'dark').catch(() => {});
    }
  }, [theme]);

  // The hand-off. Ordered after the effect above on purpose: the root view is
  // already the right colour before the native splash lifts, so there is no
  // frame where a dark user could see the light default underneath.
  useEffect(() => {
    if (!hydrated) return;
    markStartup('[LAYOUT] theme hydrated → hiding native splash');
    void SplashScreen.hideAsync().catch(() => {});
  }, [hydrated]);

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
                <Stack.Screen name="forgot-password" options={{ headerShown: false }} />
                <Stack.Screen name="reset-password" options={{ headerShown: false }} />
                <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
                <Stack.Screen name="travel-tracker" options={{ headerShown: false }} />
                {/* IN DEVELOPMENT — Gluno. Reachable only from entry points
                    gated by ENABLE_GLUNO_ASSISTANT; registering the route
                    itself is inert without one. */}
                <Stack.Screen name="gluno" options={{ headerShown: false }} />
                <Stack.Screen name="previous-adventures" options={{ headerShown: false }} />
                <Stack.Screen name="share/[shareCode]" options={{ headerShown: false }} />
                <Stack.Screen name="invite/[code]" options={{ headerShown: false }} />
                <Stack.Screen name="trip/[id]" options={{ headerShown: false }} />
                <Stack.Screen name="trip/[id]/settings" options={{ headerShown: false }} />
                <Stack.Screen name="trip/[id]/split" options={{ headerShown: false }} />
                <Stack.Screen name="trip/[id]/documents" options={{ headerShown: false }} />
                <Stack.Screen name="trip/[id]/sidequest/new" options={{ headerShown: false }} />
                <Stack.Screen name="trip/[id]/sidequest/[sidequestId]" options={{ headerShown: false }} />
              </Stack>
                <StatusBar style={theme.statusBarStyle} />
              </View>
            </AuthGate>
          </AuthProvider>
        </I18nProvider>
      </NavigationThemeProvider>
  );
}
