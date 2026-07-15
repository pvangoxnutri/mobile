import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';
import { apiFetch, API_URL } from '@/lib/api';
import { normalizeLanguage, useI18n, type AppLanguage } from '@/components/i18n-provider';
import { getEmailAuthRedirectUrl } from '@/lib/auth-redirect';
import { disablePushNotifications } from '@/lib/push-notifications';
import { supabase } from '@/lib/supabase';
import type { UserInfo } from '@/lib/types';
import { markStartup, timeStartup } from '@/lib/startup-timing'; // TEMPORARY — see lib/startup-timing.ts

type AuthContextValue = {
  loading: boolean;
  user: UserInfo | null;
  refreshProfile: () => Promise<UserInfo | null>;
  signIn: (email: string, password: string) => Promise<UserInfo | null>;
  signUp: (name: string, email: string, password: string, language: AppLanguage) => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setLanguage } = useI18n();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<UserInfo | null>(null);
  // Dedupe concurrent refreshProfile calls. The mount IIFE and the
  // INITIAL_SESSION onAuthStateChange event both fire at startup, causing
  // two parallel POSTs to /api/auth/sync that iOS/Railway sometimes drops
  // with "Network request failed".
  const inFlightRefresh = useRef<Promise<UserInfo | null> | null>(null);

  function buildFallbackUser(rawUser: Awaited<ReturnType<typeof supabase.auth.getUser>>['data']['user']): UserInfo {
    return {
      id: rawUser?.id ?? '',
      name: (rawUser?.user_metadata?.name as string | undefined) ?? rawUser?.email ?? 'User',
      email: rawUser?.email ?? '',
      avatarUrl: (rawUser?.user_metadata?.avatar_url as string | null | undefined) ?? null,
      hasCompletedOnboarding: true, // fallback: don't show onboarding if backend is unreachable
      role: null,
      language: normalizeLanguage(rawUser?.user_metadata?.language as string | undefined),
    };
  }

  async function syncProfileWithBackend(accessToken: string): Promise<UserInfo> {
    const getUserStart = Date.now();
    const { data: userData } = await supabase.auth.getUser();
    markStartup(`[AUTH] supabase.auth.getUser() (${Date.now() - getUserStart}ms)`);
    const fallbackProfile = buildFallbackUser(userData.user);

    const auth: 'yes' | 'no' = accessToken ? 'yes' : 'no';
    console.log(`[AUTH] sync POST /api/auth/sync starting (token: ${auth})`);

    // Hard cap so a hung request cannot keep AuthGate stuck on the spinner.
    const timeoutMs = 15000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${API_URL}/api/auth/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          name: userData.user?.user_metadata?.name ?? userData.user?.email ?? '',
          avatarUrl: userData.user?.user_metadata?.avatar_url ?? null,
          language: normalizeLanguage(userData.user?.user_metadata?.language as string | undefined),
        }),
        signal: controller.signal,
      });

      console.log(`[AUTH] sync POST /api/auth/sync → ${response.status}`);

      if (response.status === 401) {
        throw new Error((await response.text()) || 'Could not sync auth session.');
      }

      if (!response.ok) {
        let bodySnippet = '';
        try {
          bodySnippet = (await response.clone().text()).slice(0, 200);
        } catch {
          bodySnippet = '<unreadable>';
        }
        console.warn(`[AUTH] sync non-OK body: ${bodySnippet}`);
        return fallbackProfile;
      }

      const profile = (await response.json()) as UserInfo;
      if (profile.isBanned) {
        await supabase.auth.signOut();
        throw new Error('banned');
      }
      return profile;
    } catch (err) {
      if (controller.signal.aborted) {
        console.warn(`[AUTH] sync timed out after ${timeoutMs}ms, using fallback profile`);
        return fallbackProfile;
      }
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'banned') {
        throw err;
      }
      const errType = err instanceof Error ? err.constructor.name : typeof err;
      console.warn(`[AUTH] syncProfileWithBackend failed (${errType}), using fallback profile:`, message);
      return fallbackProfile;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  const refreshProfile = useCallback(async (callerLabel = 'unknown'): Promise<UserInfo | null> => {
    if (inFlightRefresh.current) {
      markStartup(`[AUTH] refreshProfile(${callerLabel}): deduped, awaiting in-flight call`);
      console.log('[AUTH] refreshProfile: awaiting in-flight call');
      return inFlightRefresh.current;
    }

    markStartup(`[AUTH] refreshProfile(${callerLabel}) → start (NOT deduped — see if this fires twice)`);
    const runner = (async (): Promise<UserInfo | null> => {
      const sessionStart = Date.now();
      const { data, error } = await supabase.auth.getSession();
      markStartup(`[AUTH] supabase.auth.getSession() in refreshProfile (${Date.now() - sessionStart}ms)`);

      const sessionState = data.session ? 'yes' : 'no';
      console.log(`[AUTH] session: ${sessionState}${error ? ` (error: ${error.message})` : ''}`);

      if (error || !data.session) {
        setUser(null);
        return null;
      }

      const profile = await timeStartup('[AUTH] syncProfileWithBackend', () => syncProfileWithBackend(data.session.access_token));
      const { data: userData } = await supabase.auth.getUser();
      await setLanguage(normalizeLanguage(userData.user?.user_metadata?.language as string | undefined));
      setUser(profile);
      return profile;
    })();

    inFlightRefresh.current = runner;
    try {
      return await runner;
    } finally {
      inFlightRefresh.current = null;
      markStartup(`[AUTH] refreshProfile(${callerLabel}) → end`);
    }
  }, [setLanguage]);

  useEffect(() => {
    markStartup('[AUTH] AuthProvider mount effect → start');
    console.log('[AUTH] mount: restoring session...');
    void (async () => {
      try {
        await refreshProfile('mount-iife');
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
        markStartup('[AUTH] loading=false (from mount-iife path)');
      }
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      markStartup(`[AUTH] onAuthStateChange fired: ${event}`);
      console.log('[AUTH] state change:', event);
      queueMicrotask(async () => {
        try {
          await refreshProfile(`onAuthStateChange:${event}`);
        } catch (refreshError) {
          console.warn('[AUTH] refreshProfile failed:', refreshError instanceof Error ? refreshError.message : refreshError);
          setUser(null);
        } finally {
          setLoading(false);
          markStartup(`[AUTH] loading=false (from onAuthStateChange:${event} path)`);
        }
      });
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [refreshProfile]);

  // Presence heartbeat: the backend stamps LastSeenAt on every authenticated
  // request, but a user idling on one screen makes none — so ping a no-op
  // endpoint every 60s while the app is foregrounded. Paired with the
  // server's 2-minute online window, one missed beat never flickers the dot.
  useEffect(() => {
    if (!user) return;

    let interval: ReturnType<typeof setInterval> | null = null;

    const beat = () => {
      void apiFetch('/api/users/me/heartbeat', { method: 'PUT' }).catch(() => {
        // Presence is best-effort — never surface heartbeat failures.
      });
    };

    const start = () => {
      if (interval) return;
      beat();
      interval = setInterval(beat, 60_000);
    };
    const stop = () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };

    if (AppState.currentState === 'active') start();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') start();
      else stop();
    });

    return () => {
      stop();
      sub.remove();
    };
  }, [user]);

  async function signIn(email: string, password: string): Promise<UserInfo | null> {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      console.warn('[AUTH] signIn error:', error.message);
      throw error;
    }
    return refreshProfile();
  }

  async function signUp(name: string, email: string, password: string, language: AppLanguage) {
    const emailRedirectTo = getEmailAuthRedirectUrl();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name, language },
        ...(emailRedirectTo ? { emailRedirectTo } : {}),
      },
    });

    if (error) {
      throw error;
    }
  }

  async function signOut() {
    // Deactivate this device's push token before signing out — otherwise a
    // shared/reused device keeps receiving the previous account's pushes
    // until something else happens to overwrite the registration.
    await disablePushNotifications().catch(() => {});
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
    setUser(null);
  }

  async function deleteAccount() {
    // Account deletion is heavy (cascade across many tables + Supabase admin
    // call + image storage cleanup) and can exceed the default 15s on a cold
    // backend. Give it a full minute before timing out.
    const DELETE_TIMEOUT_MS = 60_000;

    try {
      const response = await apiFetch('/api/auth/me', { method: 'DELETE' }, DELETE_TIMEOUT_MS);

      if (response.status === 401) {
        throw new Error('Session expired. Please sign in again and retry.');
      }

      if (!response.ok && response.status !== 404) {
        throw new Error('Could not delete account. Please try again.');
      }

    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // A timeout here is non-fatal: the backend almost always finishes the
      // cascade even when the response packet is dropped. Sign out locally
      // anyway so the caller can route to login; the user will discover the
      // account is gone the next time they try to sign in.
      if (!/timed out/i.test(message)) {
        throw err;
      }
    }

    await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ loading, user, refreshProfile, signIn, signUp, signOut, deleteAccount }}>
      {children}
    </AuthContext.Provider>
  );
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { loading } = useAuth();

  if (loading) {
    markStartup('[AUTH] AuthGate rendering spinner (children NOT mounted yet)');
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color="#ff4f74" />{/* default brand color — theme not yet loaded */}
      </View>
    );
  }

  markStartup('[AUTH] AuthGate rendering children (home tab + PushNotificationBootstrap now mounting)');
  return <>{children}</>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider.');
  }

  return context;
}
