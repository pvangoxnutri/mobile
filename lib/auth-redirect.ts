import Constants from 'expo-constants';
import * as Linking from 'expo-linking';

function normalizeBaseUrl(value: string) {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function getConfiguredWebUrl() {
  const configuredWebUrl = process.env.EXPO_PUBLIC_WEB_URL;
  return configuredWebUrl ? normalizeBaseUrl(configuredWebUrl) : undefined;
}

export function isExpoGo() {
  return Constants.appOwnership === 'expo';
}

export function getPasswordResetRedirectUrl() {
  const configuredWebUrl = getConfiguredWebUrl();

  if (isExpoGo() && configuredWebUrl) {
    return `${configuredWebUrl}/reset-password`;
  }

  if (isExpoGo()) {
    return undefined;
  }

  return Linking.createURL('/reset-password');
}

export function getEmailAuthRedirectUrl() {
  const configuredWebUrl = getConfiguredWebUrl();

  // Route email confirmation through the website's /auth-callback page so
  // the link in the email is a real https URL — works in any email client
  // on any device. That page attempts to open `sidequest://auth-callback`
  // with the same params, and falls back to the App Store if the app is
  // not installed.
  if (configuredWebUrl) {
    return `${configuredWebUrl}/auth-callback`;
  }

  // No EXPO_PUBLIC_WEB_URL configured (local dev without a public URL).
  // Fall back to the direct deep link.
  return Linking.createURL('/auth-callback');
}
