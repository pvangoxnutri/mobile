import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { apiFetch, API_URL } from '@/lib/api';
import { normalizeLanguage, useI18n, type AppLanguage } from '@/components/i18n-provider';
import { getEmailAuthRedirectUrl } from '@/lib/auth-redirect';
import { addDebugLog } from '@/lib/debug-log-store';
import { supabase } from '@/lib/supabase';
import type { UserInfo } from '@/lib/types';

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
    const { data: userData } = await supabase.auth.getUser();
    const fallbackProfile = buildFallbackUser(userData.user);

    const auth: 'yes' | 'no' = accessToken ? 'yes' : 'no';
    console.log(`[AUTH] sync POST /api/auth/sync starting (token: ${auth})`);
    addDebugLog({ level: 'info', source: 'AUTH', method: 'POST', path: '/api/auth/sync', auth, message: 'starting' });

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
        }),
      });

      console.log(`[AUTH] sync POST /api/auth/sync → ${response.status}`);
      const level = response.ok ? 'info' : 'warn';
      addDebugLog({ level, source: 'AUTH', method: 'POST', path: '/api/auth/sync', status: response.status, auth });

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
        addDebugLog({ level: 'warn', source: 'AUTH', method: 'POST', path: '/api/auth/sync', status: response.status, auth, body: bodySnippet, message: 'using fallback profile' });
        return fallbackProfile;
      }

      return (await response.json()) as UserInfo;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('[AUTH] syncProfileWithBackend failed, using fallback profile:', message);
      addDebugLog({ level: 'error', source: 'AUTH', method: 'POST', path: '/api/auth/sync', auth, message: `sync failed: ${message} (using fallback)` });
      return fallbackProfile;
    }
  }

  const refreshProfile = useCallback(async () => {
    const { data, error } = await supabase.auth.getSession();

    const sessionState = data.session ? 'yes' : 'no';
    console.log(`[AUTH] session: ${sessionState}${error ? ` (error: ${error.message})` : ''}`);
    addDebugLog({
      level: error ? 'warn' : 'info',
      source: 'AUTH',
      message: `session: ${sessionState}${error ? ` (error: ${error.message})` : ''}`,
    });

    if (error || !data.session) {
      setUser(null);
      return null;
    }

    const profile = await syncProfileWithBackend(data.session.access_token);
    const { data: userData } = await supabase.auth.getUser();
    await setLanguage(normalizeLanguage(userData.user?.user_metadata?.language as string | undefined));
    setUser(profile);
    return profile;
  }, [setLanguage]);

  useEffect(() => {
    console.log('[AUTH] mount: restoring session...');
    addDebugLog({ level: 'info', source: 'AUTH', message: 'mount: restoring session' });
    void (async () => {
      try {
        await refreshProfile();
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      console.log('[AUTH] state change:', event);
      addDebugLog({ level: 'info', source: 'AUTH', message: `state change: ${event}` });
      queueMicrotask(async () => {
        try {
          await refreshProfile();
        } catch (refreshError) {
          console.warn('[AUTH] refreshProfile failed:', refreshError instanceof Error ? refreshError.message : refreshError);
          setUser(null);
        } finally {
          setLoading(false);
        }
      });
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [refreshProfile]);

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
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
    setUser(null);
  }

  async function deleteAccount() {
    const response = await apiFetch('/api/auth/me', {
      method: 'DELETE',
    });

    if (response.status === 401) {
      throw new Error('Session expired. Please sign in again and retry.');
    }

    if (!response.ok && response.status !== 404) {
      throw new Error('Could not delete account. Please try again.');
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
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color="#ff4f74" />{/* default brand color — theme not yet loaded */}
      </View>
    );
  }

  return <>{children}</>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider.');
  }

  return context;
}
