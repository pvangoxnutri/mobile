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

  if (isExpoGo() && configuredWebUrl) {
    return `${configuredWebUrl}/verify-email`;
  }

  if (isExpoGo()) {
    return undefined;
  }

  return Linking.createURL('/auth-callback');
}
