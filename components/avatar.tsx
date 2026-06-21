import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { COLORS } from '@/constants/design-tokens';

// Shared person-avatar primitive. Built on expo-image (not React Native's
// <Image>) specifically for its memory+disk cache: once a given avatar URL
// has been loaded once, re-mounting this component anywhere else in the app
// shows it instantly from cache instead of flashing a blank/placeholder
// frame while it re-downloads. Avatar/cover URLs in this app are immutable
// once uploaded (a new photo always gets a new URL — see
// SupabaseStorageService), so caching aggressively here is safe: there's no
// "stale image" risk, only a (harmless) cache-eviction risk.

export function getInitials(name?: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase()).join('') || '?';
}

type AvatarProps = {
  uri?: string | null;
  name?: string | null;
  // Overrides the computed initials entirely — for call sites that already
  // have their own fallback-text convention (e.g. a brand-flavored "SQ"
  // instead of "?") and need to keep it pixel-identical.
  fallbackText?: string;
  // Set by a caller that already has its own external failed/seen tracking
  // (e.g. a Set<userId> shared across a carousel of cards) — forces the
  // fallback regardless of this instance's own load state.
  forceFallback?: boolean;
  // Notifies the caller on load failure, for callers that keep their own
  // external failure tracking (e.g. across remounts in a card carousel).
  // Avatar still falls back to initials internally either way.
  onError?: () => void;
  size?: number;
  style?: StyleProp<ViewStyle>;
  // Fallback-circle colors — call sites with their own existing dark/light
  // convention can override these instead of taking the default pink theme.
  fallbackBackgroundColor?: string;
  fallbackTextColor?: string;
};

export default function Avatar({
  uri,
  name,
  fallbackText,
  forceFallback,
  onError,
  size = 36,
  style,
  fallbackBackgroundColor,
  fallbackTextColor,
}: AvatarProps) {
  const [failed, setFailed] = useState(false);

  // A new uri (e.g. the user picked a new photo) deserves a fresh attempt —
  // don't let a previous failure stick around forever.
  useEffect(() => {
    setFailed(false);
  }, [uri]);

  const dimension = { width: size, height: size, borderRadius: size / 2 };
  const showImage = Boolean(uri && uri.trim()) && !failed && !forceFallback;

  return (
    <View style={[styles.container, dimension, style]}>
      {showImage ? (
        <Image
          source={{ uri: uri! }}
          style={[styles.image, dimension]}
          cachePolicy="memory-disk"
          // Short enough to not feel sluggish, long enough to avoid a hard
          // pop when the cached bitmap is already available.
          transition={150}
          onError={() => {
            setFailed(true);
            onError?.();
          }}
        />
      ) : (
        <View style={[styles.fallback, dimension, fallbackBackgroundColor ? { backgroundColor: fallbackBackgroundColor } : null]}>
          <Text
            style={[
              styles.initials,
              { fontSize: Math.max(10, size * 0.38) },
              fallbackTextColor ? { color: fallbackTextColor } : null,
            ]}
            numberOfLines={1}>
            {fallbackText ?? getInitials(name)}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  image: {
    backgroundColor: COLORS.avatarLight,
  },
  fallback: {
    backgroundColor: COLORS.avatarLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    color: COLORS.primary,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
});
