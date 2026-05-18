import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { apiFetch, API_URL } from '@/lib/api';
import { normalizeLanguage, useI18n, type AppLanguage } from '@/components/i18n-provider';
import { getEmailAuthRedirectUrl } from '@/lib/auth-redirect';
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

      if (response.status === 401) {
        throw new Error((await response.text()) || 'Could not sync auth session.');
      }

      if (!response.ok) {
        return fallbackProfile;
      }

      return (await response.json()) as UserInfo;
    } catch (err) {
      console.warn('[AUTH] syncProfileWithBackend failed, using fallback profile:', err instanceof Error ? err.message : err);
      return fallbackProfile;
    }
  }

  const refreshProfile = useCallback(async () => {
    const { data, error } = await supabase.auth.getSession();

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
