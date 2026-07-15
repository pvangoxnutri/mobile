import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { useI18n } from '@/components/i18n-provider';
import { useTheme } from '@/components/theme-provider';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { AppTheme } from '@/constants/themes';
import { getCachedUserProfile, loadUserProfile } from '@/lib/user-cache';
import type { UserProfile } from '@/lib/types';

export default function UserProfileCard({
  userId,
  onClose,
  onReport,
}: {
  userId: string | null;
  onClose: () => void;
  onReport?: (name: string) => void;
}) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [avatarExpanded, setAvatarExpanded] = useState(false);

  useEffect(() => {
    if (!userId) {
      return;
    }

    let active = true;
    setAvatarFailed(false);
    setAvatarExpanded(false);
    setError('');

    // Show whatever's cached immediately (no spinner) — this is what makes
    // reopening the same person's card feel instant instead of refetching
    // every single tap. loadUserProfile() itself skips the network call
    // entirely if the cache is still fresh.
    const cached = getCachedUserProfile(userId);
    if (cached) {
      setProfile(cached);
      setLoading(false);
    } else {
      setProfile(null);
      setLoading(true);
    }

    loadUserProfile(userId)
      .then((data) => {
        if (!active) return;
        setProfile(data);
      })
      .catch(() => {
        if (!active) return;
        if (!cached) setError('Could not load profile');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [userId]);

  const visible = userId !== null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
        <View style={styles.card}>
          {onReport && profile ? (
            <Pressable style={styles.reportButton} onPress={() => onReport(profile.name)} hitSlop={10}>
              <Ionicons name="flag" size={20} color="#ff4f74" />
            </Pressable>
          ) : null}
          <Pressable style={styles.closeButton} onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={22} color={theme.colors.textPrimary} />
          </Pressable>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
            </View>
          ) : error ? (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle-outline" size={40} color={theme.colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : profile ? (
            <>
              <View style={styles.avatarRing}>
                {profile.avatarUrl && profile.avatarUrl.trim() && !avatarFailed ? (
                  // Tap to view full-size — initials fallback stays inert
                  // (nothing meaningful to enlarge).
                  <Pressable
                    onPress={() => setAvatarExpanded(true)}
                    accessibilityRole="imagebutton"
                    accessibilityLabel={profile.name}>
                    <Image
                      source={{ uri: profile.avatarUrl }}
                      style={styles.avatar}
                      onError={() => setAvatarFailed(true)}
                    />
                  </Pressable>
                ) : (
                  <View style={[styles.avatar, styles.avatarFallback]}>
                    <Text style={styles.avatarInitials}>{getInitials(profile.name)}</Text>
                  </View>
                )}
                {profile.isOnline ? <View style={styles.onlineDot} /> : null}
              </View>

              <Text style={styles.name}>{profile.name}</Text>
              {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}

              <View style={styles.statsRow}>
                <StatCard value={String(profile.tripsJoined)} label={t('profile.stats.tripsJoined')} accent="#10a6c0" />
                <StatCard value={String(profile.sidequestsCreated)} label={t('profile.stats.sidequestsCreated')} accent="#ff4f74" />
                <StatCard value={String(profile.countriesVisited)} label={t('profile.stats.countriesVisited')} accent="#ff4f74" />
              </View>
            </>
          ) : null}
        </View>
      </View>

      {/* Full-size avatar viewer — nested Modal like the chat's fullscreen
          image, so Android back closes the viewer first, then the card. */}
      <Modal
        visible={avatarExpanded}
        transparent
        animationType="fade"
        onRequestClose={() => setAvatarExpanded(false)}>
        <Pressable style={styles.avatarViewerBackdrop} onPress={() => setAvatarExpanded(false)}>
          {profile?.avatarUrl ? (
            <Image
              source={{ uri: profile.avatarUrl }}
              style={styles.avatarViewerImage}
              resizeMode="contain"
            />
          ) : null}
          <Pressable
            style={[styles.avatarViewerClose, { top: 54 }]}
            onPress={() => setAvatarExpanded(false)}
            hitSlop={10}
            accessibilityRole="button">
            <Ionicons name="close" size={24} color="#fff" />
          </Pressable>
        </Pressable>
      </Modal>
    </Modal>
  );
}

function StatCard({ value, label, accent }: { value: string; label: string; accent: string }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.statCard}>
      <Text style={[styles.statValue, { color: accent }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function getInitials(name?: string | null) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase()).join('') || '?';
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: theme.isDark ? theme.colors.backdropModal : 'rgba(12,16,26,0.5)',
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  card: {
    borderRadius: 28,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: theme.isDark ? StyleSheet.hairlineWidth : 0,
    borderColor: theme.colors.borderPrimary,
    paddingHorizontal: 22,
    paddingTop: 36,
    paddingBottom: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: theme.isDark ? 0.5 : 0.16,
    shadowRadius: 32,
    elevation: theme.isDark ? 0 : 12,
  },
  reportButton: {
    position: 'absolute',
    top: 14,
    left: 14,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bgLight,
    zIndex: 2,
  },
  closeButton: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bgLight,
    zIndex: 2,
  },
  loadingContainer: {
    minHeight: 240,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    minHeight: 200,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    marginTop: 10,
    fontSize: 14,
    color: theme.colors.textPrimary,
  },
  avatarRing: {
    width: 132,
    height: 132,
    borderRadius: 66,
    borderWidth: 4,
    borderColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 118,
    height: 118,
    borderRadius: 59,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallback: {
    backgroundColor: theme.colors.avatarDark,
  },
  onlineDot: {
    position: 'absolute',
    // Sits on the ring's lower-right diagonal (45°) rather than the corner
    // of the bounding box, so it visually touches the circle.
    right: 8,
    bottom: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#22c55e',
    borderWidth: 3,
    borderColor: theme.colors.surfaceElevated,
  },
  avatarInitials: {
    color: '#fff',
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -1,
  },
  name: {
    marginTop: 22,
    color: theme.colors.textPrimary,
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -1.2,
    textAlign: 'center',
  },
  bio: {
    marginTop: 10,
    color: theme.colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  statsRow: {
    marginTop: 22,
    flexDirection: 'row',
    gap: 12,
    alignSelf: 'stretch',
  },
  statCard: {
    flex: 1,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: theme.colors.borderPrimary,
    backgroundColor: theme.colors.surfaceElevated,
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 4,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -1,
  },
  statLabel: {
    marginTop: 6,
    color: theme.colors.textMeta,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    textAlign: 'center',
  },
  avatarViewerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarViewerImage: {
    width: '100%',
    height: '80%',
  },
  avatarViewerClose: {
    position: 'absolute',
    right: 18,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
