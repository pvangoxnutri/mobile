import { createContext, useContext, useMemo } from 'react';
import { useAuth } from '@/components/auth-provider';
import { buildThemePalette, DEFAULT_PALETTE, type ThemePalette } from '@/lib/color-utils';

const AppThemeContext = createContext<ThemePalette>(DEFAULT_PALETTE);

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  const palette = useMemo(() => {
    if (user?.themePrimaryColor && user?.themeSecondaryColor) {
      return buildThemePalette(user.themePrimaryColor, user.themeSecondaryColor);
    }
    return DEFAULT_PALETTE;
  }, [user?.themePrimaryColor, user?.themeSecondaryColor]);

  return (
    <AppThemeContext.Provider value={palette}>
      {children}
    </AppThemeContext.Provider>
  );
}

export function useAppTheme(): ThemePalette {
  return useContext(AppThemeContext);
}
