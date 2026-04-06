import Constants from 'expo-constants';
import * as Linking from 'expo-linking';

function normalizeBaseUrl(value: string) {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

export function isExpoGo() {
  return Constants.appOwnership === 'expo';
}

export function getPasswordResetRedirectUrl() {
  const configuredWebUrl = process.env.EXPO_PUBLIC_WEB_URL;

  if (isExpoGo() && configuredWebUrl) {
    return `${normalizeBaseUrl(configuredWebUrl)}/reset-password`;
  }

  return Linking.createURL('/reset-password');
}

export function getEmailAuthRedirectUrl() {
  const configuredWebUrl = process.env.EXPO_PUBLIC_WEB_URL;

  if (isExpoGo() && configuredWebUrl) {
    return `${normalizeBaseUrl(configuredWebUrl)}/auth-callback`;
  }

  return Linking.createURL('/auth-callback');
}
