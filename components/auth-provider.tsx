import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { API_URL } from '@/lib/api';
import { getEmailAuthRedirectUrl } from '@/lib/auth-redirect';
import { supabase } from '@/lib/supabase';
import type { UserInfo } from '@/lib/types';

type AuthContextValue = {
  loading: boolean;
  user: UserInfo | null;
  refreshProfile: () => Promise<UserInfo | null>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<UserInfo | null>(null);

  async function syncProfileWithBackend(accessToken: string): Promise<UserInfo> {
    const { data: userData } = await supabase.auth.getUser();
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

    if (!response.ok) {
      throw new Error((await response.text()) || 'Could not sync auth session.');
    }

    return (await response.json()) as UserInfo;
  }

  const refreshProfile = useCallback(async () => {
    const { data, error } = await supabase.auth.getSession();

    if (error || !data.session) {
      setUser(null);
      return null;
    }

    const profile = await syncProfileWithBackend(data.session.access_token);
    setUser(profile);
    return profile;
  }, []);

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
    } = supabase.auth.onAuthStateChange(() => {
      queueMicrotask(async () => {
        try {
          await refreshProfile();
        } catch {
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

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      throw error;
    }
    await refreshProfile();
  }

  async function signUp(name: string, email: string, password: string) {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name },
        emailRedirectTo: getEmailAuthRedirectUrl(),
      },
    });

    if (error) {
      throw error;
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ loading, user, refreshProfile, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color="#ff4f74" />
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
