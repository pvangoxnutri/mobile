import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';

function inferApiBaseUrl() {
  const configuredUrl = process.env.EXPO_PUBLIC_API_URL;
  if (configuredUrl) {
    return configuredUrl;
  }

  const hostUri =
    Constants.expoConfig?.hostUri ??
    Constants.expoGoConfig?.debuggerHost ??
    Constants.manifest2?.extra?.expoGo?.debuggerHost;

  const host = hostUri?.split(':')[0];
  if (host) {
    return `http://${host}:5079`;
  }

  return 'http://localhost:5079';
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
    await supabase.auth.signOut();
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
