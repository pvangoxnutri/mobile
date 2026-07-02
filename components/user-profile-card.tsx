import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { useI18n } from '@/components/i18n-provider';
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
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [avatarFailed, setAvatarFailed] = useState(false);

  useEffect(() => {
    if (!userId) {
      return;
    }

    let active = true;
    setAvatarFailed(false);
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
              <Ionicons name="flag-outline" size={20} color="#8e95a2" />
            </Pressable>
          ) : null}
          <Pressable style={styles.closeButton} onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={22} color="#14161d" />
          </Pressable>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#ff4f74" />
            </View>
          ) : error ? (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle-outline" size={40} color="#d53d18" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : profile ? (
            <>
              <View style={styles.avatarRing}>
                {profile.avatarUrl && profile.avatarUrl.trim() && !avatarFailed ? (
                  <Image
                    source={{ uri: profile.avatarUrl }}
                    style={styles.avatar}
                    onError={() => setAvatarFailed(true)}
                  />
                ) : (
                  <View style={[styles.avatar, styles.avatarFallback]}>
                    <Text style={styles.avatarInitials}>{getInitials(profile.name)}</Text>
                  </View>
                )}
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
    </Modal>
  );
}

function StatCard({ value, label, accent }: { value: string; label: string; accent: string }) {
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

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(12,16,26,0.5)',
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  card: {
    borderRadius: 28,
    backgroundColor: '#fff',
    paddingHorizontal: 22,
    paddingTop: 36,
    paddingBottom: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.16,
    shadowRadius: 32,
    elevation: 12,
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
    backgroundColor: '#f4f6fa',
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
    backgroundColor: '#f4f6fa',
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
    color: '#14161d',
  },
  avatarRing: {
    width: 132,
    height: 132,
    borderRadius: 66,
    borderWidth: 4,
    borderColor: '#ff4f74',
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
    backgroundColor: '#1d212a',
  },
  avatarInitials: {
    color: '#fff',
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -1,
  },
  name: {
    marginTop: 22,
    color: '#151722',
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -1.2,
    textAlign: 'center',
  },
  bio: {
    marginTop: 10,
    color: '#4e5566',
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
    borderColor: '#eceef2',
    backgroundColor: '#fff',
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
    color: '#a6abb5',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    textAlign: 'center',
  },
});
