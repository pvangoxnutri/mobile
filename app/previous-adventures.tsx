import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Pressable, StyleSheet, Text, TouchableOpacity, View, Share as RNShare } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { getCompletedTrips, revokeTripShare, shareTrip } from '@/lib/api';
import { useAuth } from '@/components/auth-provider';
import { useI18n } from '@/components/i18n-provider';
import { useTheme } from '@/components/theme-provider';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { AppTheme } from '@/constants/themes';
import type { Quest } from '@/lib/types';

export default function PreviousAdventuresScreen() {
  const { user } = useAuth();
  const { t } = useI18n();
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const [trips, setTrips] = useState<Quest[]>([]);
  const [loading, setLoading] = useState(true);
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const listRef = useRef<FlatList<Quest> | null>(null);

  useFocusEffect(useCallback(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, []));

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
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View
        style={[
          styles.content,
          { paddingTop: Math.max(insets.top, 16) + 8, paddingBottom: Math.max(insets.bottom, 20) + 112 },
        ]}>
        {/* ── Header ───────────────────────────────────────────────── */}
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backButton} activeOpacity={0.8} onPress={() => router.back()}>
            <Ionicons
              name="arrow-back"
              size={26}
              color={theme.isDark ? theme.colors.textSecondary : '#6D7380'}
            />
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={styles.title}>Previous Adventures</Text>
            <Text style={styles.subtitle}>Trips you've completed</Text>
          </View>
        </View>

        {/* ── List ───────────────────────────────────────────────── */}
        {trips.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons
              name="checkmark-circle-outline"
              size={64}
              color={theme.isDark ? theme.colors.textMuted : '#ddd'}
            />
            <Text style={styles.emptyText}>No completed adventures yet</Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
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
                    {/* Completed while still open-ended: no end date to show. */}
                    {item.endDate ? `${item.startDate} – ${item.endDate}` : `${item.startDate} · ${t('trip.ongoing')}`}
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
                        <ActivityIndicator size="small" color={theme.colors.white} />
                      ) : (
                        <Ionicons name="link" size={16} color={theme.colors.white} />
                      )}
                    </Pressable>
                  ) : null}

                  <Pressable
                    style={[styles.shareButton, sharingId === item.id && styles.shareButtonDisabled]}
                    onPress={() => handleShare(item)}
                    disabled={sharingId === item.id}
                    accessibilityLabel="Share">
                    {sharingId === item.id ? (
                      <ActivityIndicator size="small" color={theme.colors.white} />
                    ) : (
                      <Ionicons name="share-social" size={18} color={theme.colors.white} />
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

// Everything painted ON the trip photos — the 0.3 black scrim and the white
// title/destination/date text — is INTENTIONAL image-overlay styling, kept
// byte-identical in both themes so completed-trip photos stay vibrant and
// legible regardless of appearance (same policy as big-hero-card). Only the
// page background, header text, empty state and the brand/overlay pills go
// through the theme.
const createStyles = (theme: AppTheme) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.isDark ? theme.colors.bgPrimary : '#F7F8FA',
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.isDark ? theme.colors.bgPrimary : '#F7F8FA',
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
    color: theme.colors.textPrimary,
  },
  subtitle: {
    fontSize: 13,
    color: theme.isDark ? theme.colors.textMeta : '#8a909b',
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
    // INTENTIONAL image overlay — scrim on the trip photo, identical in both
    // themes (see comment above createStyles).
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  cardContent: {
    padding: 16,
    zIndex: 2,
  },
  tripTitle: {
    fontSize: 18,
    fontWeight: '700',
    // INTENTIONAL — white text on the photo scrim, identical in both themes.
    color: '#ffffff',
    marginBottom: 4,
  },
  destination: {
    fontSize: 14,
    // INTENTIONAL — white text on the photo scrim, identical in both themes.
    color: 'rgba(255,255,255,0.9)',
    marginBottom: 4,
  },
  dates: {
    fontSize: 12,
    // INTENTIONAL — white text on the photo scrim, identical in both themes.
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
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  revokeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    // Dark pill floating on the trip photo — pillDark70 is byte-identical to
    // the original rgba(20,22,29,0.7) in both themes.
    backgroundColor: theme.colors.pillDark70,
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
    color: theme.isDark ? theme.colors.textMuted : '#999999',
    marginTop: 12,
  },
});
