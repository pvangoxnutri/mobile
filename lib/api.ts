import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';

const remoteDevApiUrl = 'https://massachusetts-shine-broad-publicity.trycloudflare.com';

function inferApiBaseUrl() {
  const configuredUrl = process.env.EXPO_PUBLIC_API_URL;
  if (configuredUrl) {
    return configuredUrl;
  }

  if (Platform.OS === 'web') {
    return 'http://localhost:5079';
  }

  const hostUri =
    Constants.expoConfig?.hostUri ??
    Constants.expoGoConfig?.debuggerHost ??
    Constants.manifest2?.extra?.expoGo?.debuggerHost;

  const host = hostUri?.split(':')[0];
  if (host) {
    if (host.includes('exp.direct')) {
      return remoteDevApiUrl;
    }

    return `http://${host}:5079`;
  }

  return remoteDevApiUrl;
}

export const API_URL = inferApiBaseUrl();

export async function apiFetch(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
  }

  return response;
}

export async function apiJson<T>(path: string, options: RequestInit = {}) {
  const response = await apiFetch(path, options);

  if (!response.ok) {
    throw new Error((await response.text()) || 'Request failed.');
  }

  return (await response.json()) as T;
}

// ── Share endpoints ──

export async function getCompletedTrips() {
  return apiJson<any[]>('/api/trips/completed');
}

export async function completeTrip(tripId: string) {
  return apiFetch(`/api/trips/${tripId}/complete`, { method: 'PATCH' });
}

export async function shareTrip(tripId: string) {
  return apiJson<{ shareCode: string; shareUrl: string }>(
    `/api/trips/${tripId}/share`,
    { method: 'POST' }
  );
}

export async function getSharedTrip(shareCode: string) {
  return apiJson<any>(`/api/trips/share/${shareCode}`);
}

// ── User endpoints ──

export async function getUserProfile(userId: string) {
  return apiJson<any>(`/api/users/${userId}/profile`);
}
