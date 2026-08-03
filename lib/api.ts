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
  const configuredUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (configuredUrl) {
    // Every caller passes a path starting with "/", so a configured base with
    // a trailing slash would build "http://host//api/..." — which some proxies
    // and dev servers answer with a redirect or a 404 rather than the route.
    // Stripping it here keeps a stray slash in .env.local from looking like a
    // backend outage.
    return configuredUrl.replace(/\/+$/, '');
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

/** The Metro host serving this bundle, when there is one. */
function metroHost(): string | null {
  const hostUri =
    Constants.expoConfig?.hostUri ??
    Constants.expoGoConfig?.debuggerHost ??
    Constants.manifest2?.extra?.expoGo?.debuggerHost;
  return hostUri?.split(':')[0] ?? null;
}

const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '::1'];
/** The Android emulator's alias for the host machine — useless on a phone. */
const EMULATOR_HOST = '10.0.2.2';

/**
 * Development-only startup diagnostic.
 *
 * Prints where the app will actually send requests, broken into the pieces
 * that go wrong in practice, plus a targeted hint for each classic
 * misconfiguration. This exists because a wrong base URL and an unreachable
 * backend produce the SAME symptom — every request timing out — and nothing in
 * the UI can tell them apart.
 *
 * Diagnostics only: never a token, a header, a response body or user data, and
 * none of it is surfaced in the UI.
 */
function logApiConfiguration() {
  if (!__DEV__) return;

  let scheme = '';
  let hostname = '';
  let port = '';
  try {
    const parsed = new URL(API_URL);
    scheme = parsed.protocol.replace(':', '');
    hostname = parsed.hostname;
    // An omitted port is the scheme default, which is worth spelling out —
    // "no port" against a backend on 5079 is a common .env.local slip.
    port = parsed.port || (scheme === 'https' ? '443' : '80');
  } catch {
    console.warn(
      `[API] EXPO_PUBLIC_API_URL is not a valid absolute URL: "${API_URL}". ` +
      'It must include the scheme, e.g. https://api.sidequesttravel.app',
    );
    return;
  }

  const servedOverLan = Boolean(metroHost() && !LOOPBACK_HOSTS.includes(metroHost()!));
  // Which runtime this is decides whether cleartext http:// is permitted at
  // all — Expo Go and a debug dev-client allow it, a release build does not.
  // Reported rather than assumed.
  const runtime = Constants.executionEnvironment ?? 'unknown';
  const supabaseRef = process.env.EXPO_PUBLIC_SUPABASE_URL?.match(/https:\/\/([a-z0-9]+)\./)?.[1] ?? '(unset)';
  console.log(`[API] base=${API_URL} scheme=${scheme} host=${hostname} port=${port}`);
  console.log(`[API] runtime=${runtime} metroHost=${metroHost() ?? '-'} supabaseProjectRef=${supabaseRef}`);

  if (LOOPBACK_HOSTS.includes(hostname) && servedOverLan) {
    console.warn(
      `[API] EXPO_PUBLIC_API_URL points at ${hostname}, but this bundle is being served over the ` +
      `network from ${metroHost()}. On a physical phone, ${hostname} is the PHONE itself — set ` +
      "EXPO_PUBLIC_API_URL to this computer's LAN IP instead (see .env.local.example).",
    );
  }

  if (hostname === EMULATOR_HOST) {
    console.warn(
      `[API] ${EMULATOR_HOST} only resolves inside the Android emulator. A physical phone cannot ` +
      "reach it — use this computer's LAN IP.",
    );
  }

  if (scheme === 'http' && !LOOPBACK_HOSTS.includes(hostname)) {
    console.log(
      '[API] Using cleartext http:// to a LAN address. This works in Expo Go and in a debug ' +
      'dev-client build (both permit cleartext); a release build would block it. Also confirm the ' +
      `backend is listening on 0.0.0.0:${port} (not just localhost) and that the OS firewall ` +
      `allows inbound TCP ${port}.`,
    );
  }
}

logApiConfiguration();

export type ApiFetchDiagnostics = {
  /**
   * Replaces the request path in diagnostics and suppresses response bodies.
   * Use for endpoints whose path or error payload can contain private data.
   */
  privateEndpointName?: string;
};

/**
 * What actually went wrong, as one word.
 *
 * The UI intentionally collapses every failure into one calm sentence, which
 * means the log is the only place the difference survives. Without these
 * categories, "could not refresh" covers a dead socket, a rejected token and a
 * server crash alike — three completely different things to go and fix.
 */
export type ApiOutcome =
  | 'OK'
  | 'TIMEOUT'          // no response within the request budget
  | 'NETWORK_ERROR'    // never reached the server: DNS, refused, no route
  | 'AUTH_ERROR'       // 401 — token missing, expired, or for another project
  | 'FORBIDDEN'        // 403 — authenticated but not allowed
  | 'NOT_FOUND'        // 404 — wrong path or wrong host answering
  | 'SERVER_ERROR'     // 5xx — reached the API, the API failed
  | 'HTTP_ERROR'       // any other non-2xx
  | 'PARSE_ERROR';     // 2xx whose body was not the JSON we expected

function outcomeForStatus(status: number): ApiOutcome {
  if (status >= 200 && status < 300) return 'OK';
  if (status === 401) return 'AUTH_ERROR';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status >= 500) return 'SERVER_ERROR';
  return 'HTTP_ERROR';
}

/**
 * The single development-only line that says what happened.
 *
 * Method, final URL, status, category, duration — and nothing else. No token,
 * no headers, no response body, no user data. The URL is the resolved absolute
 * one on purpose: a wrong base address and an unreachable backend look
 * identical from the app, and this is what tells them apart.
 */
function logOutcome(
  method: string,
  path: string,
  outcome: ApiOutcome,
  elapsedMs: number,
  status?: number,
) {
  if (!__DEV__) return;
  const statusPart = status === undefined ? 'status=-' : `status=${status}`;
  const line = `[API] ${method} ${API_URL}${path} ${statusPart} outcome=${outcome} ${elapsedMs}ms`;
  if (outcome === 'OK') console.log(line);
  else console.warn(line);
}

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

  // ── The caller's own signal is honoured ─────────────────────────────────
  //
  // THE BUG THIS CLOSES. The spread below REPLACES options.signal with the
  // timeout controller's, so a caller's abort — the Gluno Stop button, a
  // scope switch leaving the screen — never reached the network layer. The
  // fetch ran to completion for an answer nobody wanted, and a timeout and a
  // user cancellation were indistinguishable at the callers.
  const callerSignal = options.signal as AbortSignal | undefined;
  if (callerSignal?.aborted) {
    controller.abort();
  } else {
    callerSignal?.addEventListener('abort', () => controller.abort(), { once: true });
  }

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

    // One categorised line per request, for every outcome. Uses the real path
    // (not the private alias) because a URL is what makes a routing or host
    // mistake visible — the private-endpoint rule is about response BODIES,
    // which this never touches.
    logOutcome(method, path, outcomeForStatus(response.status), Date.now() - fetchStart, response.status);

    return response;
  } catch (error) {
    // The CALLER cancelled — a Stop button, a scope switch. Not a timeout
    // and not a network failure, and it must never be reported as either.
    // The original AbortError travels on so callers can recognise it.
    if (callerSignal?.aborted) {
      console.log(`[API] ${method} ${diagnosticTarget} → ABORTED by caller`);
      throw error;
    }

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
      logOutcome(method, path, 'TIMEOUT', Date.now() - fetchStart);
      // Marked so callers can tell "our own deadline fired" apart from a
      // dead socket — the two deserve different words and different codes.
      const timeoutError = new Error(
        `Request timed out after ${Math.round(timeoutMs / 1000)}s. Check your connection and try again.`,
      ) as Error & { timedOut?: boolean };
      timeoutError.timedOut = true;
      throw timeoutError;
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
    logOutcome(method, path, 'NETWORK_ERROR', Date.now() - fetchStart);
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
    const apiError = new Error((await response.text()) || 'Request failed.') as Error & { status?: number; outcome?: ApiOutcome };
    apiError.status = response.status;
    apiError.outcome = outcomeForStatus(response.status);
    throw apiError;
  }

  try {
    return (await response.json()) as T;
  } catch (parseError) {
    // A 2xx whose body is not JSON usually means something other than our API
    // answered — a captive portal, a proxy error page, a dev server on the
    // wrong port. Categorising it separately stops that from being filed as a
    // generic failure. The body is never logged.
    logOutcome((options.method ?? 'GET').toUpperCase(), path, 'PARSE_ERROR', 0, response.status);
    const apiError = new Error('Unexpected response from the server.') as Error & { status?: number; outcome?: ApiOutcome };
    apiError.status = response.status;
    apiError.outcome = 'PARSE_ERROR';
    throw apiError;
  }
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
