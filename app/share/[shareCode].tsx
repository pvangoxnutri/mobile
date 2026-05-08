import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View, Pressable, Share as RNShare } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/contexts/app-theme-context';
import { getSharedTrip } from '@/lib/api';

export default function SharedAdventureScreen() {
  const theme = useAppTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { shareCode } = useLocalSearchParams<{ shareCode: string }>();
  const [trip, setTrip] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!shareCode) {
      setError('Invalid share code');
      setLoading(false);
      return;
    }

    loadSharedTrip();
  }, [shareCode]);

  async function loadSharedTrip() {
    try {
      const data = await getSharedTrip(shareCode!);
      setTrip(data);
    } catch (err) {
      setError('Adventure not found or no longer available');
      console.error('Failed to load shared trip:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleShare() {
    if (!trip) return;
    try {
      await RNShare.share({
        message: `Check out this adventure: ${trip.title} in ${trip.destination}!`,
        url: `sidequest://share/${shareCode}`,
        title: trip.title,
      });
    } catch (error) {
      console.error('Failed to share:', error);
    }
  }

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.surface, paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  if (error || !trip) {
    return (
      <View style={[styles.container, { backgroundColor: theme.surface, paddingTop: insets.top }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </Pressable>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={64} color={theme.textSecondary} />
          <Text style={[styles.errorText, { color: theme.textSecondary }]}>
            {error || 'Adventure not found'}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.surface, paddingTop: insets.top }]}
      contentContainerStyle={styles.contentContainer}
    >
      <Pressable onPress={() => router.back()} style={styles.backButton}>
        <Ionicons name="chevron-back" size={24} color={theme.text} />
      </Pressable>

      {trip.imageUrl && (
        <Image
          source={{ uri: trip.imageUrl }}
          style={styles.image}
          contentFit="cover"
        />
      )}

      <View style={styles.content}>
        <Text style={[styles.title, { color: theme.text }]}>{trip.title}</Text>
        <Text style={[styles.owner, { color: theme.textSecondary }]}>
          by {trip.ownerName}
        </Text>

        <View style={styles.infoRow}>
          <Ionicons name="location-outline" size={16} color={theme.accent} />
          <Text style={[styles.destination, { color: theme.text }]}>{trip.destination}</Text>
        </View>

        <View style={styles.infoRow}>
          <Ionicons name="calendar-outline" size={16} color={theme.accent} />
          <Text style={[styles.dates, { color: theme.text }]}>
            {trip.startDate} – {trip.endDate}
          </Text>
        </View>

        {trip.description && (
          <Text style={[styles.description, { color: theme.textSecondary }]}>
            {trip.description}
          </Text>
        )}

        {trip.spotifyUrl && (
          <Pressable
            style={[styles.spotifyButton, { backgroundColor: theme.accent }]}
            onPress={() => { /* Open Spotify URL */ }}
          >
            <Ionicons name="musical-notes" size={18} color={theme.surface} />
            <Text style={[styles.spotifyText, { color: theme.surface }]}>
              Listen to playlist
            </Text>
          </Pressable>
        )}

        <Pressable
          style={[styles.shareButton, { backgroundColor: theme.primary }]}
          onPress={handleShare}
        >
          <Ionicons name="share-social" size={18} color={theme.surface} />
          <Text style={[styles.shareText, { color: theme.surface }]}>Share</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 32,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 16,
    marginTop: 8,
  },
  image: {
    width: '100%',
    height: 300,
    marginTop: 8,
  },
  content: {
    padding: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 4,
  },
  owner: {
    fontSize: 14,
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  destination: {
    fontSize: 16,
    fontWeight: '500',
  },
  dates: {
    fontSize: 14,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 16,
    marginBottom: 20,
  },
  spotifyButton: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  spotifyText: {
    fontSize: 14,
    fontWeight: '600',
  },
  shareButton: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  shareText: {
    fontSize: 14,
    fontWeight: '600',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    marginTop: 12,
  },
});
