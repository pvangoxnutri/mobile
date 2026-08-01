import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { apiFetch, API_URL } from '@/lib/api';
import { normalizeLanguage, useI18n, type AppLanguage } from '@/components/i18n-provider';
import { StartupScreen } from '@/components/startup-screen';
import { getEmailAuthRedirectUrl } from '@/lib/auth-redirect';
import { disablePushNotifications } from '@/lib/push-notifications';
import { clearChatImageAccessCache } from '@/lib/chat-image-access';
import { clearGlunoCache } from '@/lib/gluno-cache';
import { clearAllCaches, hydratePersistedCache } from '@/lib/cache';
import { clearCachedProfile, loadCachedProfile, saveCachedProfile } from '@/lib/profile-cache';
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

/** The user object Supabase hands back on a restored session. Identical shape
 * to what getUser() returns, which is why the network call is unnecessary. */
type SupabaseUser = NonNullable<
  Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session']
>['user'];

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

  async function syncProfileWithBackend(
    accessToken: string,
    sessionUser: SupabaseUser,
  ): Promise<UserInfo> {
    // The session we already hold carries the same user object that
    // supabase.auth.getUser() would fetch — but getUser() is a NETWORK call to
    // /auth/v1/user, and this used to make one here and a second one in
    // refreshProfile right after. Both were on the cold-start critical path
    // purely to read user_metadata (name, avatar, language).
    //
    // The token is still validated: /api/auth/sync below rejects it if it is
    // not genuine, which is the check that actually protects anything.
    const userData = { user: sessionUser };
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

    markStartup(`[AUTH] refreshProfile(${callerLabel}) → start`);
    const runner = (async (): Promise<UserInfo | null> => {
      const sessionStart = Date.now();
      const { data, error } = await supabase.auth.getSession();
      markStartup(`[AUTH] supabase.auth.getSession() in refreshProfile (${Date.now() - sessionStart}ms)`);

      const sessionState = data.session ? 'yes' : 'no';
      console.log(`[AUTH] session: ${sessionState}${error ? ` (error: ${error.message})` : ''}`);

      // No session is the ONLY thing that signs a user out here. A backend
      // that is slow or unreachable must never clear a valid local session —
      // getSession reads local storage and does not depend on our API.
      if (error || !data.session) {
        setUser(null);
        return null;
      }

      const sessionUser = data.session.user;
      const profile = await timeStartup('[AUTH] syncProfileWithBackend', () =>
        syncProfileWithBackend(data.session.access_token, sessionUser),
      );

      // Fire-and-forget: persisting the language is an AsyncStorage write that
      // nothing on the first frame depends on. Awaiting it used to hold the
      // splash open for a storage round-trip after all the real work was done.
      void setLanguage(normalizeLanguage(sessionUser.user_metadata?.language as string | undefined));
      setUser(profile);
      saveCachedProfile(profile);
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
        // Local read — Supabase restores the session from its own storage and
        // makes no request to our backend.
        const { data } = await supabase.auth.getSession();
        const sessionUser = data.session?.user ?? null;

        if (sessionUser) {
          // THE cold-start fix. A returning user is routed from the cached
          // profile on the very first frame; POST /api/auth/sync then runs
          // behind the live UI instead of in front of it. Before this, the
          // branded startup screen was held for the whole request — up to the
          // full 15s timeout whenever the backend was cold or unreachable.
          const cachedProfile = await loadCachedProfile(sessionUser.id);
          if (cachedProfile) {
            markStartup('[AUTH] cached profile HIT → releasing UI before sync');
            // Adventure data for this account, so Home has something real to
            // paint instead of its blocking spinner.
            await hydratePersistedCache(cachedProfile.id);
            setUser(cachedProfile);
            void setLanguage(normalizeLanguage(cachedProfile.language));
            setLoading(false);

            // Background reconciliation. If the server disagrees with the
            // cache — onboarding finished elsewhere, a changed name, a ban —
            // refreshProfile sets the corrected user and the routing in
            // app/index.tsx follows, with the UI already on screen throughout.
            void refreshProfile('mount-background-sync').catch((syncError: unknown) => {
              // Distinguish the failures rather than treating them alike:
              //   * banned → the sync already signed the session out; drop the
              //     cached user so routing sends them to login.
              //   * anything else (timeout, DNS failure, 5xx) → keep the
              //     cached profile. Being offline is not a reason to sign
              //     anyone out, and apiFetch still handles a genuine 401
              //     globally on the next request.
              const message = syncError instanceof Error ? syncError.message : String(syncError);
              if (message === 'banned') {
                setUser(null);
                return;
              }
              console.warn('[AUTH] background profile sync failed, keeping cached profile:', message);
            });
            return;
          }
        }

        // No session, or a first launch with nothing cached: this is the one
        // case that genuinely needs the round-trip before routing, since
        // guessing the onboarding state would flash the wrong screen.
        // syncProfileWithBackend always resolves — on timeout it falls back to
        // the session's own metadata — so the user is never left stuck.
        const profile = await refreshProfile('mount-iife');
        if (profile?.id) await hydratePersistedCache(profile.id);
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

      // INITIAL_SESSION is the event Supabase emits for the session this
      // provider is ALREADY restoring in the mount call above. Acting on it
      // ran a second full profile sync — a duplicate POST /api/auth/sync on
      // every cold start, since the dedupe ref only catches calls that are
      // still in flight and this one usually lands just after the first
      // resolves. Sign-in/sign-out/token-refresh still flow through below.
      if (event === 'INITIAL_SESSION') {
        markStartup('[AUTH] INITIAL_SESSION ignored — mount call already owns it');
        return;
      }

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

  // Binds the persisted adventure cache to whoever is signed in. Covers the
  // paths the mount effect does not: a fresh sign-in, and a switch to another
  // account. Idempotent for a user already hydrated.
  useEffect(() => {
    if (!user?.id) return;
    void hydratePersistedCache(user.id);
  }, [user?.id]);

  // Presence heartbeat: the backend stamps LastSeenAt on every authenticated
  // request, but a user idling on one screen makes none — so ping a no-op
  // endpoint every 60s while the app is foregrounded. Paired with the
  // server's 2-minute online window, one missed beat never flickers the dot.
  useEffect(() => {
    if (!user) return;

    let interval: ReturnType<typeof setInterval> | null = null;

    // Presence is best-effort — never surface heartbeat failures. The
    // body-less beat is the cheap idle tick; { online } marks the two
    // transitions the server's 60s write throttle can't see (see
    // UsersController.Heartbeat).
    const beat = (body?: { online: boolean }) => {
      void apiFetch('/api/users/me/heartbeat', {
        method: 'PUT',
        ...(body
          ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
          : {}),
      }).catch(() => {});
    };

    const start = () => {
      if (interval) return;
      beat({ online: true });
      interval = setInterval(() => beat(), 60_000);
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
      else {
        stop();
        // Real backgrounding flips us offline for others within seconds
        // instead of after the 2-minute window. Deliberately NOT sent on
        // 'inactive' (control center, app-switcher peek) — those bounce
        // back to 'active' too easily and would flicker the dot.
        if (state === 'background') beat({ online: false });
      }
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
    // Signed URLs to private chat photos are held in memory only, but the
    // process outlives a sign-out — on a shared device the next account must
    // not inherit working links to the previous one's conversations.
    clearChatImageAccessCache();
    // Same reasoning for Gluno: conversations are private, held in memory for
    // the session, and must not survive into the next account's.
    clearGlunoCache();
    // Drops every cached trip, member list and avatar URL — in memory AND on
    // disk. Without the disk half, the next account's first launch would
    // hydrate the previous user's adventures.
    await clearCachedProfile(user?.id);
    await clearAllCaches();
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

    clearChatImageAccessCache();
    clearGlunoCache();
    await clearCachedProfile(user?.id);
    await clearAllCaches();
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
    markStartup('[AUTH] AuthGate rendering StartupScreen (children NOT mounted yet)');
    // The SAME surface app/index.tsx paints, so the moment auth resolves and
    // the navigator mounts underneath, nothing visibly changes. Revealing the
    // app is no longer tied to this gate — the native splash already handed
    // off as soon as the theme was known (app/_layout.tsx), which is why this
    // screen is what the user actually looks at while auth resolves.
    return <StartupScreen />;
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
