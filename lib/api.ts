import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';

const PRODUCTION_API_URL = 'https://api.sidequesttravel.app';

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
  if (host && !host.includes('exp.direct')) {
    return `http://${host}:5079`;
  }

  return PRODUCTION_API_URL;
}

export const API_URL = inferApiBaseUrl();

if (__DEV__) {
  console.log('[API] Base URL:', API_URL);
}

export async function apiFetch(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const method = (options.method ?? 'GET').toUpperCase();

  try {
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      console.warn(`[API] 401 ${method} ${path} - signing out locally`);
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
    } else if (!response.ok) {
      console.warn(`[API] ${response.status} ${method} ${path}`);
    }

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[API] Network error ${method} ${path}: ${message}`);
    throw error;
  }
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

export async function copySharedTrip(shareCode: string) {
  return apiJson<any>(`/api/trips/share/${shareCode}/copy`, { method: 'POST' });
}

// ── User endpoints ──

export async function getUserProfile(userId: string) {
  return apiJson<any>(`/api/users/${userId}/profile`);
}
