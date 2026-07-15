import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ENABLE_THEME_SWITCHING } from '@/constants/feature-flags';
import { themes, type AppTheme } from '@/constants/themes';

// SideQuest has exactly two appearances. There is deliberately no 'system'
// value anywhere — the app must never follow the device appearance, and any
// stored value other than 'dark' (including a legacy 'system') resolves to
// light. See constants/themes.ts for the palettes.
export type ThemePreference = 'light' | 'dark';

const STORAGE_KEY = 'sidequest.themePreference';

type ThemeContextValue = {
  theme: AppTheme;
  preference: ThemePreference;
  setPreference: (next: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>('light');
  // Children are held back until the stored preference is known — a one-time
  // ~ms read that prevents a dark-preference user from seeing a light flash
  // on every cold start.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (!active) return;
        if (stored === 'dark') {
          setPreferenceState('dark');
        } else if (stored !== null && stored !== 'light') {
          // Invalid/legacy value (e.g. 'system') — migrate it to light so it
          // can never resurface.
          void AsyncStorage.setItem(STORAGE_KEY, 'light').catch(() => {});
        }
      })
      .catch(() => {
        // Unreadable storage — fall through to the light default.
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    void AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {
      // Persisting is best-effort; the in-memory theme already switched.
    });
  }, []);

  // While the rollout flag is off the app is forced to Light regardless of
  // any stored preference (which is kept, so a dark-preferring tester gets
  // dark back when the flag returns).
  const effectiveMode = ENABLE_THEME_SWITCHING ? preference : 'light';

  const value = useMemo<ThemeContextValue>(
    () => ({ theme: themes[effectiveMode], preference, setPreference }),
    [effectiveMode, preference, setPreference],
  );

  if (!ready) return null;

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}
