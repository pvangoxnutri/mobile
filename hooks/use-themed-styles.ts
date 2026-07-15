import { useMemo } from 'react';
import { useTheme } from '@/components/theme-provider';
import type { AppTheme } from '@/constants/themes';

// The migration pattern for every themed file:
//
//   const createStyles = (theme: AppTheme) => StyleSheet.create({ ... });
//   ...
//   const styles = useThemedStyles(createStyles);
//
// `factory` must be a module-level constant (stable identity) — the styles
// are memoized per theme, so switching appearance builds each stylesheet
// exactly once and everything else is referentially cached.
export function useThemedStyles<T>(factory: (theme: AppTheme) => T): T {
  const { theme } = useTheme();
  return useMemo(() => factory(theme), [factory, theme]);
}
