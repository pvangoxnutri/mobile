import Constants from 'expo-constants';
import { router } from 'expo-router';
import { AppState, Platform } from 'react-native';
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

export type ApiFetchDiagnostics = {
  /**
   * Replaces the request path in diagnostics and suppresses response bodies.
   * Use for endpoints whose path or error payload can contain private data.
   */
  privateEndpointName?: string;
};

export async function apiFetch(
  path: string,
  options: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
  diagnostics: ApiFetchDiagnostics = {},
) {
  const method = (options.method ?? 'GET').toUpperCase();
  const headers = new Headers(options.headers);
  const diagnosticTarget = diagnostics.privateEndpointName ?? path;
  const isPrivateEndpoint = Boolean(diagnostics.privateEndpointName);

  // TEMPORARY — isolates "waiting on Supabase's local/refresh session read"
  // from "waiting on our own backend". No timeout wraps this call today,
  // which is exactly the suspected gap: if Supabase's internal token
  // refresh stalls, this can hang far longer than our 15s fetch timeout
  // ever gets a chance to matter.
  const sessionStart = Date.now();
  const { data } = await supabase.auth.getSession();
  const sessionMs = Date.now() - sessionStart;
  markStartup(`[API] getSession() for ${method} ${diagnosticTarget} (${sessionMs}ms)`);

  const token = data.session?.access_token;
  const auth = token ? 'yes' : 'no';

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  // Presence hygiene: requests fired while the app is NOT visible (late
  // background timers, in-flight work completing after an app switch) must
  // not refresh the server's LastSeenAt stamp — a backgrounded app is not
  // "online", and a stale stamp both fakes the green dot and can suppress
  // push notifications. The backend's presence middleware skips its stamp
  // when this header is present; everything else is unaffected.
  if (AppState.currentState !== 'active') {
    headers.set('X-App-Background', '1');
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
    markStartup(`[API] fetch ${method} ${diagnosticTarget} → ${response.status} (${Date.now() - fetchStart}ms, getSession was ${sessionMs}ms)`);

    if (response.status === 403) {
      try {
        const body = await response.clone().json() as { error?: string };
        if (body.error === 'banned') {
          console.warn(
            isPrivateEndpoint
              ? `[API] ${method} ${diagnosticTarget} → 403 (AUTHORIZATION_ERROR)`
              : `[API] ${method} ${diagnosticTarget} → 403 banned — signing out`,
          );
          await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
          router.replace('/(auth)/login');
          return response;
        }
      } catch { /* not a banned JSON response */ }
    }

    if (response.status === 401) {
      console.warn(
        isPrivateEndpoint
          ? `[API] ${method} ${diagnosticTarget} → 401 (AUTHENTICATION_ERROR)`
          : `[API] ${method} ${diagnosticTarget} → 401 (auth: ${auth}) — signing out`,
      );
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
      router.replace('/(auth)/login');
    } else if (!response.ok) {
      if (isPrivateEndpoint) {
        console.warn(`[API] ${method} ${diagnosticTarget} → ${response.status} (HTTP_ERROR)`);
      } else {
        let bodySnippet = '';
        try {
          bodySnippet = (await response.clone().text()).slice(0, 200);
        } catch {
          bodySnippet = '<unreadable>';
        }
        console.warn(`[API] ${method} ${diagnosticTarget} → ${response.status} (auth: ${auth}) body: ${bodySnippet}`);
      }
    } else {
      console.log(
        isPrivateEndpoint
          ? `[API] ${method} ${diagnosticTarget} → ${response.status}`
          : `[API] ${method} ${diagnosticTarget} → ${response.status} (auth: ${auth})`,
      );
    }

    return response;
  } catch (error) {
    if (controller.signal.aborted) {
      const timeoutMessage = `TIMEOUT after ${timeoutMs}ms`;
      markStartup(`[API] fetch ${method} ${diagnosticTarget} → TIMEOUT (${Date.now() - fetchStart}ms, getSession was ${sessionMs}ms)`);
      // console.log, not console.error/warn: timeouts and network drops are
      // expected transient states (cold start contention, dead radio) — the
      // thrown Error below is the callers' signal, and a dev LogBox toast
      // for every hiccup reads as an app bug to whoever is testing.
      console.log(
        isPrivateEndpoint
          ? `[API] ${method} ${diagnosticTarget} → TIMEOUT`
          : `[API] ${method} ${diagnosticTarget} → ${timeoutMessage} (auth: ${auth})`,
      );
      throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s. Check your connection and try again.`);
    }
    const message = error instanceof Error ? error.message : String(error);
    markStartup(
      `[API] fetch ${method} ${diagnosticTarget} → NETWORK_ERROR (${Date.now() - fetchStart}ms, getSession was ${sessionMs}ms)`,
      isPrivateEndpoint ? undefined : { message },
    );
    console.log(
      isPrivateEndpoint
        ? `[API] ${method} ${diagnosticTarget} → NETWORK_ERROR`
        : `[API] ${method} ${diagnosticTarget} → NETWORK_ERROR (auth: ${auth}): ${message}`,
    );
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function apiJson<T>(
  path: string,
  options: RequestInit = {},
  diagnostics: ApiFetchDiagnostics = {},
) {
  const response = await apiFetch(path, options, undefined, diagnostics);

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
