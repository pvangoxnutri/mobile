import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Pressable, StyleSheet, Text, TouchableOpacity, View, Share as RNShare } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { getCompletedTrips, revokeTripShare, shareTrip } from '@/lib/api';
import { useAuth } from '@/components/auth-provider';
import type { Quest } from '@/lib/types';

export default function PreviousAdventuresScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [trips, setTrips] = useState<Quest[]>([]);
  const [loading, setLoading] = useState(true);
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  useEffect(() => {
    loadCompletedTrips();
  }, [user?.id]);

  async function loadCompletedTrips() {
    try {
      const data = await getCompletedTrips();
      setTrips(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load completed trips:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleShare(trip: Quest) {
    try {
      setSharingId(trip.id);
      const result = await shareTrip(trip.id);
      // Reflect the new share state locally so the Stop-sharing button appears.
      setTrips((prev) =>
        prev.map((t) => (t.id === trip.id ? { ...t, shareCode: result.shareCode } : t)),
      );
      await RNShare.share({
        message: `Check out my adventure: ${trip.title} in ${trip.destination}!`,
        url: result.shareUrl || undefined,
        title: trip.title,
      });
    } catch (error) {
      console.error('Failed to share:', error);
    } finally {
      setSharingId(null);
    }
  }

  function confirmRevoke(trip: Quest) {
    Alert.alert(
      'Stop sharing this adventure?',
      'The public link will stop working. People who already saved a copy keep theirs.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Stop sharing',
          style: 'destructive',
          onPress: () => void handleRevoke(trip),
        },
      ],
    );
  }

  async function handleRevoke(trip: Quest) {
    try {
      setRevokingId(trip.id);
      const res = await revokeTripShare(trip.id);
      if (!res.ok && res.status !== 204) {
        throw new Error(`Revoke failed (${res.status})`);
      }
      setTrips((prev) =>
        prev.map((t) => (t.id === trip.id ? { ...t, shareCode: null } : t)),
      );
    } catch (error) {
      console.error('Failed to revoke share:', error);
      Alert.alert('Could not stop sharing', 'Please try again in a moment.');
    } finally {
      setRevokingId(null);
    }
  }

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: '#F7F8FA', paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#ff4f74" />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: '#F7F8FA' }]}>
      <View
        style={[
          styles.content,
          { paddingTop: Math.max(insets.top, 16) + 8, paddingBottom: Math.max(insets.bottom, 20) + 112 },
        ]}>
        {/* ── Header ───────────────────────────────────────────────── */}
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backButton} activeOpacity={0.8} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={26} color="#6D7380" />
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={styles.title}>Previous Adventures</Text>
            <Text style={styles.subtitle}>Trips you've completed</Text>
          </View>
        </View>

        {/* ── List ───────────────────────────────────────────────── */}
        {trips.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="checkmark-circle-outline" size={64} color="#ddd" />
            <Text style={styles.emptyText}>No completed adventures yet</Text>
          </View>
        ) : (
          <FlatList
            data={trips}
            renderItem={({ item }) => (
              <View style={styles.card}>
                {item.imageUrl && (
                  <Image
                    source={{ uri: item.imageUrl }}
                    style={styles.cardImage}
                    blurRadius={3}
                  />
                )}
                <View style={styles.cardOverlay} />
                <View style={styles.cardContent}>
                  <Text style={styles.tripTitle}>{item.title}</Text>
                  <Text style={styles.destination}>{item.destination}</Text>
                  <Text style={styles.dates}>
                    {item.startDate} – {item.endDate}
                  </Text>
                </View>
                <View style={styles.actionRow}>
                  {item.shareCode ? (
                    <Pressable
                      style={[styles.revokeButton, revokingId === item.id && styles.shareButtonDisabled]}
                      onPress={() => confirmRevoke(item)}
                      disabled={revokingId === item.id}
                      accessibilityLabel="Stop sharing">
                      {revokingId === item.id ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Ionicons name="link" size={16} color="#fff" />
                      )}
                    </Pressable>
                  ) : null}

                  <Pressable
                    style={[styles.shareButton, sharingId === item.id && styles.shareButtonDisabled]}
                    onPress={() => handleShare(item)}
                    disabled={sharingId === item.id}
                    accessibilityLabel="Share">
                    {sharingId === item.id ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Ionicons name="share-social" size={18} color="#fff" />
                    )}
                  </Pressable>
                </View>
              </View>
            )}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            scrollEnabled={trips.length > 3}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#161821',
  },
  subtitle: {
    fontSize: 13,
    color: '#8a909b',
    marginTop: 2,
  },
  listContent: {
    gap: 12,
  },
  card: {
    borderRadius: 12,
    overflow: 'hidden',
    height: 180,
    justifyContent: 'flex-end',
  },
  cardImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  cardOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  cardContent: {
    padding: 16,
    zIndex: 2,
  },
  tripTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 4,
  },
  destination: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    marginBottom: 4,
  },
  dates: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
  },
  actionRow: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    zIndex: 3,
  },
  shareButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ff4f74',
    justifyContent: 'center',
    alignItems: 'center',
  },
  revokeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(20,22,29,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  shareButtonDisabled: {
    opacity: 0.6,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#999999',
    marginTop: 12,
  },
});
