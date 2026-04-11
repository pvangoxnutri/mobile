export interface ThemePalette {
  primary: string;
  secondary: string;
  /** rgba(primary, 0.08) — mycket lätt bakgrundston */
  primary08: string;
  /** rgba(primary, 0.12) */
  primary12: string;
  /** rgba(primary, 0.20) */
  primary20: string;
  /** rgba(secondary, 0.08) */
  secondary08: string;
  /** rgba(secondary, 0.12) */
  secondary12: string;
  /** rgba(secondary, 0.20) */
  secondary20: string;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  if (h.length === 3) {
    return {
      r: parseInt(h[0] + h[0], 16),
      g: parseInt(h[1] + h[1], 16),
      b: parseInt(h[2] + h[2], 16),
    };
  }
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

export function hexToRgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export const DEFAULT_PRIMARY = '#ff4f74';
export const DEFAULT_SECONDARY = '#0d90a8';

export function buildThemePalette(
  primaryColor: string = DEFAULT_PRIMARY,
  secondaryColor: string = DEFAULT_SECONDARY,
): ThemePalette {
  return {
    primary: primaryColor,
    secondary: secondaryColor,
    primary08: hexToRgba(primaryColor, 0.08),
    primary12: hexToRgba(primaryColor, 0.12),
    primary20: hexToRgba(primaryColor, 0.20),
    secondary08: hexToRgba(secondaryColor, 0.08),
    secondary12: hexToRgba(secondaryColor, 0.12),
    secondary20: hexToRgba(secondaryColor, 0.20),
  };
}

export const DEFAULT_PALETTE: ThemePalette = buildThemePalette(
  DEFAULT_PRIMARY,
  DEFAULT_SECONDARY,
);
