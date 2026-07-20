// In-app "new version available" nudge. Asks the backend what the latest
// store release is (GET /api/app/version) and offers the store page when
// the installed native version is older. Store-only distribution (OTA is
// disabled in app.json), so the store dialog is the only update path.
//
// Deliberately quiet: at most one dialog per app session, never when the
// check fails or times out, never in dev builds, and "Later" snoozes that
// version for 24h (a strictly newer version shows again immediately).

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { Alert, AppState, Platform } from 'react-native';

import { API_URL } from '@/lib/api';

const DISMISSED_KEY = 'appUpdate.dismissed';
const SNOOZE_MS = 24 * 60 * 60 * 1000;
const CHECK_TIMEOUT_MS = 5000;

let checkedThisSession = false;

type PlatformVersionInfo = { latest?: string; storeUrl?: string };
type AppVersionResponse = { ios?: PlatformVersionInfo; android?: PlatformVersionInfo };

/** Numeric segment-wise version compare: "1.0.10" beats "1.0.9" and
 * "1.1.0" beats "1.0.9" — never plain string comparison. Returns false on
 * anything non-numeric so a malformed response can never trigger the
 * dialog. */
export function isNewerVersion(latest: string, installed: string): boolean {
  const latestParts = latest.trim().split('.').map((part) => Number.parseInt(part, 10));
  const installedParts = installed.trim().split('.').map((part) => Number.parseInt(part, 10));
  if (latestParts.some(Number.isNaN) || installedParts.some(Number.isNaN)) return false;
  const length = Math.max(latestParts.length, installedParts.length);
  for (let i = 0; i < length; i++) {
    const l = latestParts[i] ?? 0;
    const r = installedParts[i] ?? 0;
    if (l !== r) return l > r;
  }
  return false;
}

export async function maybeShowAppUpdateDialog(t: (key: string) => string): Promise<void> {
  if (checkedThisSession) return;
  checkedThisSession = true;

  if (__DEV__) return;
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;

  // Installed native version — iOS CFBundleShortVersionString / Android
  // versionName, straight from the binary. Falls back to the build-time
  // app.json version only if the native read is null; with no valid
  // version at all the dialog can never show. Not the build number.
  const installed = (Application.nativeApplicationVersion ?? Constants.expoConfig?.version)?.trim();
  if (!installed) return;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
    let data: AppVersionResponse;
    try {
      const response = await fetch(`${API_URL}/api/app/version`, { signal: controller.signal });
      if (!response.ok) return;
      data = (await response.json()) as AppVersionResponse;
    } finally {
      clearTimeout(timeout);
    }

    const info = Platform.OS === 'ios' ? data.ios : data.android;
    if (!info?.latest) return;
    // Only ever hand Linking a non-empty http(s) URL.
    const storeUrl = typeof info.storeUrl === 'string' ? info.storeUrl.trim() : '';
    if (!/^https?:\/\//i.test(storeUrl)) return;
    if (!isNewerVersion(info.latest, installed)) return;

    // "Later" snoozed this exact version within the last 24h? Stay quiet.
    // A strictly newer version than the dismissed one falls through and
    // shows immediately.
    try {
      const rawDismissed = await AsyncStorage.getItem(DISMISSED_KEY);
      if (rawDismissed) {
        const dismissed = JSON.parse(rawDismissed) as { version?: string; at?: number };
        if (
          dismissed.version === info.latest &&
          Number.isFinite(dismissed.at) &&
          Date.now() - (dismissed.at as number) < SNOOZE_MS
        ) {
          return;
        }
      }
    } catch {
      // Unreadable snooze state — treat as not snoozed.
    }

    if (AppState.currentState !== 'active') return;

    const latestVersion = info.latest;
    const snooze = () => {
      void AsyncStorage.setItem(
        DISMISSED_KEY,
        JSON.stringify({ version: latestVersion, at: Date.now() }),
      ).catch(() => {});
    };
    Alert.alert(
      t('appUpdate.title'),
      t('appUpdate.body'),
      [
        {
          text: t('appUpdate.later'),
          style: 'cancel',
          onPress: snooze,
        },
        {
          text: t('appUpdate.downloadNow'),
          onPress: () => {
            void Linking.openURL(storeUrl).catch(() => {});
          },
        },
      ],
      // Android back button / tap outside counts as "Later" — snooze, not
      // just the session flag. (onDismiss never fires for button presses.)
      { cancelable: true, onDismiss: snooze },
    );
  } catch {
    // Silent by design — a failed or timed-out check must never surface,
    // and the session flag means we simply try again next launch.
  }
}
