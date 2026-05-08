import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/contexts/app-theme-context';
import { getUserProfile } from '@/lib/api';
import type { UserProfile } from '@/lib/types';

export default function UserProfileCard({ userId, onClose }: { userId: string | null; onClose: () => void }) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      setError('');
      return;
    }

    let active = true;
    setLoading(true);
    setError('');

    getUserProfile(userId)
      .then((data) => {
        if (!active) return;
        setProfile(data);
      })
      .catch((err) => {
        if (!active) return;
        setError('Could not load profile');
        console.error('Failed to load user profile:', err);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [userId]);

  const visible = userId !== null;

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={[styles.card, { backgroundColor: theme.surface }]}>
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={theme.primary} />
            </View>
          ) : error ? (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle-outline" size={48} color={theme.textSecondary} />
              <Text style={[styles.errorText, { color: theme.textSecondary }]}>{error}</Text>
            </View>
          ) : profile ? (
            <>
              <Pressable style={styles.closeButton} onPress={onClose}>
                <Ionicons name="close" size={24} color={theme.text} />
              </Pressable>

              <View style={styles.avatarSection}>
                {profile.avatarUrl ? (
                  <Image source={{ uri: profile.avatarUrl }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, { backgroundColor: theme.primary }]}>
                    <Text style={styles.avatarInitials}>{getInitials(profile.name)}</Text>
                  </View>
                )}
              </View>

              <Text style={[styles.name, { color: theme.text }]}>{profile.name}</Text>
              {profile.bio ? <Text style={[styles.bio, { color: theme.textSecondary }]}>{profile.bio}</Text> : null}

              <View style={styles.statsGrid}>
                <StatCard
                  value={String(profile.tripsJoined)}
                  label="TRIPS JOINED"
                  accent={theme.primary}
                />
                <StatCard
                  value={String(profile.sidequestsCreated)}
                  label="SIDEQUESTS CREATED"
                  accent={theme.primary}
                />
                <StatCard value={String(profile.countriesVisited)} label="COUNTRIES VISITED" accent={theme.primary} />
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
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  container: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    justifyContent: 'flex-end',
  },
  card: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 32,
  },
  closeButton: {
    alignSelf: 'flex-end',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  loadingContainer: {
    height: 300,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    marginTop: 12,
    fontSize: 14,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 20,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    color: '#fff',
    fontSize: 36,
    fontWeight: '700',
  },
  name: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 6,
  },
  bio: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#eceef2',
    backgroundColor: '#f9fafc',
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#a6abb5',
    letterSpacing: 0.5,
  },
});
