import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View, Pressable, Share as RNShare, Alert } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getSharedTrip, copySharedTrip } from '@/lib/api';
import { useAuth } from '@/components/auth-provider';
import { PRIMARY_COLOR, SECONDARY_COLOR, PRIMARY_08, PRIMARY_20 } from '@/constants/colors';

export default function SharedAdventureScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { shareCode } = useLocalSearchParams<{ shareCode: string }>();
  const [trip, setTrip] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);

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

  async function handleCopy() {
    if (!user) {
      Alert.alert('Sign in required', 'You need to sign in to save this adventure to your account.', [
        { text: 'OK' }
      ]);
      return;
    }

    setCopying(true);
    try {
      const newTrip = await copySharedTrip(shareCode!);
      Alert.alert('Adventure saved!', `"${newTrip.title}" has been added to your adventures.`, [
        {
          text: 'View',
          onPress: () => router.push(`/trip/${newTrip.id}`),
        },
        {
          text: 'Back',
          onPress: () => router.back(),
        },
      ]);
    } catch (error) {
      Alert.alert('Failed to save', 'Could not save this adventure. Please try again.');
      console.error('Failed to copy trip:', error);
    } finally {
      setCopying(false);
    }
  }

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: '#fff', paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={PRIMARY_COLOR} />
      </View>
    );
  }

  if (error || !trip) {
    return (
      <View style={[styles.container, { backgroundColor: '#fff', paddingTop: insets.top }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={'#14161d'} />
        </Pressable>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={64} color={'#14161d'} />
          <Text style={[styles.errorText, { color: '#14161d' }]}>
            {error || 'Adventure not found'}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: '#fff', paddingTop: insets.top }]}
      contentContainerStyle={styles.contentContainer}
    >
      <Pressable onPress={() => router.back()} style={styles.backButton}>
        <Ionicons name="chevron-back" size={24} color={'#14161d'} />
      </Pressable>

      {trip.imageUrl && (
        <Image
          source={{ uri: trip.imageUrl }}
          style={styles.image}
          contentFit="cover"
        />
      )}

      <View style={styles.content}>
        <Text style={[styles.title, { color: '#14161d' }]}>{trip.title}</Text>
        <Text style={[styles.owner, { color: '#14161d' }]}>
          by {trip.ownerName}
        </Text>

        <View style={styles.infoRow}>
          <Ionicons name="location-outline" size={16} color={PRIMARY_COLOR} />
          <Text style={[styles.destination, { color: '#14161d' }]}>{trip.destination}</Text>
        </View>

        <View style={styles.infoRow}>
          <Ionicons name="calendar-outline" size={16} color={PRIMARY_COLOR} />
          <Text style={[styles.dates, { color: '#14161d' }]}>
            {trip.startDate} – {trip.endDate}
          </Text>
        </View>

        {trip.description && (
          <Text style={[styles.description, { color: '#14161d' }]}>
            {trip.description}
          </Text>
        )}

        {trip.spotifyUrl && (
          <Pressable
            style={[styles.spotifyButton, { backgroundColor: PRIMARY_COLOR }]}
            onPress={() => { /* Open Spotify URL */ }}
          >
            <Ionicons name="musical-notes" size={18} color={'#fff'} />
            <Text style={[styles.spotifyText, { color: '#fff' }]}>
              Listen to playlist
            </Text>
          </Pressable>
        )}

        <Pressable
          style={[styles.copyButton, { backgroundColor: PRIMARY_COLOR }]}
          onPress={handleCopy}
          disabled={copying}
        >
          {copying ? (
            <ActivityIndicator color={'#fff'} size="small" />
          ) : (
            <>
              <Ionicons name="copy" size={18} color={'#fff'} />
              <Text style={[styles.copyText, { color: '#fff' }]}>Save adventure</Text>
            </>
          )}
        </Pressable>

        <Pressable
          style={[styles.shareButton, { backgroundColor: SECONDARY_COLOR }]}
          onPress={handleShare}
        >
          <Ionicons name="share-social" size={18} color={'#fff'} />
          <Text style={[styles.shareText, { color: '#fff' }]}>Share</Text>
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
  copyButton: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  copyText: {
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
