import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { markStartup } from '@/lib/startup-timing'; // TEMPORARY — see lib/startup-timing.ts

const PRODUCTION_API_URL = 'https://api.sidequesttravel.app';

// Network requests must never hang the UI. If a request is still pending after
// this many ms (cold start, dead socket, slow DB), AbortController forces it
// to reject with a TIMEOUT error so callers can clear their loading state.
const DEFAULT_TIMEOUT_MS = 15000;

function inferApiBaseUrl() {
  const configuredUrl = process.env.EXPO_PUBLIC_API_URL;
  if (configuredUrl) {
    return configuredUrl;
  }

  if (__DEV__) {
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
  }

  return PRODUCTION_API_URL;
}

export const API_URL = inferApiBaseUrl();

console.log('[API] Base URL:', API_URL);

export async function apiFetch(path: string, options: RequestInit = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const method = (options.method ?? 'GET').toUpperCase();
  const headers = new Headers(options.headers);

  // TEMPORARY — isolates "waiting on Supabase's local/refresh session read"
  // from "waiting on our own backend". No timeout wraps this call today,
  // which is exactly the suspected gap: if Supabase's internal token
  // refresh stalls, this can hang far longer than our 15s fetch timeout
  // ever gets a chance to matter.
  const sessionStart = Date.now();
  const { data } = await supabase.auth.getSession();
  const sessionMs = Date.now() - sessionStart;
  markStartup(`[API] getSession() for ${method} ${path} (${sessionMs}ms)`);

  const token = data.session?.access_token;
  const auth = token ? 'yes' : 'no';

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const fetchStart = Date.now();

  try {
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
      signal: controller.signal,
    });
    markStartup(`[API] fetch ${method} ${path} → ${response.status} (${Date.now() - fetchStart}ms, getSession was ${sessionMs}ms)`);

    if (response.status === 401) {
      console.warn(`[API] ${method} ${path} → 401 (auth: ${auth}) — signing out`);
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
      router.replace('/(auth)/login');
    } else if (!response.ok) {
      let bodySnippet = '';
      try {
        bodySnippet = (await response.clone().text()).slice(0, 200);
      } catch {
        bodySnippet = '<unreadable>';
      }
      console.warn(`[API] ${method} ${path} → ${response.status} (auth: ${auth}) body: ${bodySnippet}`);
    } else {
      console.log(`[API] ${method} ${path} → ${response.status} (auth: ${auth})`);
    }

    return response;
  } catch (error) {
    if (controller.signal.aborted) {
      const timeoutMessage = `TIMEOUT after ${timeoutMs}ms`;
      markStartup(`[API] fetch ${method} ${path} → TIMEOUT (${Date.now() - fetchStart}ms, getSession was ${sessionMs}ms)`);
      console.error(`[API] ${method} ${path} → ${timeoutMessage} (auth: ${auth})`);
      throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s. Check your connection and try again.`);
    }
    const message = error instanceof Error ? error.message : String(error);
    markStartup(`[API] fetch ${method} ${path} → NETWORK_ERROR (${Date.now() - fetchStart}ms, getSession was ${sessionMs}ms)`, { message });
    console.error(`[API] ${method} ${path} → NETWORK_ERROR (auth: ${auth}): ${message}`);
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function apiJson<T>(path: string, options: RequestInit = {}) {
  const response = await apiFetch(path, options);

  if (!response.ok) {
    // Attach the HTTP status so callers can distinguish "not found" (e.g. a
    // notification pointing at since-deleted content) from other failures
    // without parsing the message text.
    const apiError = new Error((await response.text()) || 'Request failed.') as Error & { status?: number };
    apiError.status = response.status;
    throw apiError;
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

export async function revokeTripShare(tripId: string) {
  return apiFetch(`/api/trips/${tripId}/share`, { method: 'DELETE' });
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
