import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

import type { WeatherCondition } from '@/lib/weather-api';

// SideQuest-owned weather glyphs (no provider icon images). Ionicons covers
// most conditions; fog and heavy rain only exist in MaterialCommunityIcons —
// both families ship in @expo/vector-icons already. Colors are deliberate
// weather accents kept identical in both themes (same policy as the
// packing-list blue in trip tools); pass `color` to override.
const ICONS: Record<WeatherCondition, { family: 'ion' | 'mci'; name: string; color: string }> = {
  clear: { family: 'ion', name: 'sunny', color: '#f59e0b' },
  partly_cloudy: { family: 'ion', name: 'partly-sunny', color: '#f59e0b' },
  cloudy: { family: 'ion', name: 'cloudy', color: '#94a3b8' },
  fog: { family: 'mci', name: 'weather-fog', color: '#94a3b8' },
  rain: { family: 'ion', name: 'rainy', color: '#3b82f6' },
  heavy_rain: { family: 'mci', name: 'weather-pouring', color: '#2563eb' },
  thunderstorm: { family: 'ion', name: 'thunderstorm', color: '#7c3aed' },
  snow: { family: 'ion', name: 'snow', color: '#60a5fa' },
};

export default function WeatherIcon({
  condition,
  size = 18,
  color,
}: {
  condition: WeatherCondition;
  size?: number;
  color?: string;
}) {
  const icon = ICONS[condition] ?? ICONS.cloudy;
  if (icon.family === 'mci') {
    return <MaterialCommunityIcons name={icon.name as never} size={size} color={color ?? icon.color} />;
  }
  return <Ionicons name={icon.name as never} size={size} color={color ?? icon.color} />;
}
