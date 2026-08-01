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
  /** True once the stored preference has been read. Until then `theme` is the
   * light default, which is why the native splash must stay up — see
   * app/_layout.tsx, the only place that should care about this. */
  hydrated: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>('light');
  // Children render IMMEDIATELY, before this read resolves, so that everything
  // below (most importantly AuthProvider's session restore, which reaches the
  // network) starts in parallel with it instead of queueing behind it. This
  // used to `return null` until the read finished, which serialised the whole
  // startup: storage read → mount → auth read → auth network.
  //
  // A dark-preference user still never sees a light flash, because the native
  // splash is held up until `hydrated` flips (app/_layout.tsx). Nothing
  // rendered during this window is ever visible.
  const [hydrated, setHydrated] = useState(false);

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
        if (active) setHydrated(true);
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
    () => ({ theme: themes[effectiveMode], preference, setPreference, hydrated }),
    [effectiveMode, preference, setPreference, hydrated],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}
