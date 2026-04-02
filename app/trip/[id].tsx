import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { Image, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiJson } from '@/lib/api';
import type { Quest, TripInvite } from '@/lib/types';

type TripMember = {
  id: string;
  name: string;
  avatarUrl?: string | null;
  isOwner: boolean;
};

export default function TripDetailsScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [trip, setTrip] = useState<Quest | null>(null);
  const [members, setMembers] = useState<TripMember[]>([]);
  const [invites, setInvites] = useState<TripInvite[]>([]);
  const [error, setError] = useState('');

  const loadTrip = useCallback(() => {
    let active = true;

    async function run() {
      try {
        const [tripData, memberData, inviteData] = await Promise.all([
          apiJson<Quest>(`/api/trips/${id}`),
          apiJson<TripMember[]>(`/api/trips/${id}/members`),
          apiJson<TripInvite[]>(`/api/trips/${id}/invites`),
        ]);

        if (!active) return;
        setTrip(tripData);
        setMembers(memberData);
        setInvites(inviteData);
        setError('');
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Unable to load this adventure.');
      }
    }

    void run();

    return () => {
      active = false;
    };
  }, [id]);

  useFocusEffect(loadTrip);

  async function handleCopyCode() {
    if (!trip?.inviteCode) return;
    await Clipboard.setStringAsync(trip.inviteCode);
  }

  async function handleShareCode() {
    if (!trip?.inviteCode) return;
    await Share.share({
      title: trip.title ?? 'Join my SideQuest',
      message: `Join ${trip.title ?? 'my SideQuest'} with code ${trip.inviteCode}.`,
      url: trip.imageUrl ?? undefined,
    });
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        contentContainerStyle={[styles.screen, { paddingTop: Math.max(insets.top, 18) + 6, paddingBottom: Math.max(insets.bottom, 20) + 40 }]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} activeOpacity={0.85} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#11131a" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Adventure</Text>
        </View>

        <View style={styles.heroCard}>
          {trip?.imageUrl ? <Image source={{ uri: trip.imageUrl }} style={styles.heroImage} /> : null}
          <View style={styles.heroOverlay} />
          <View style={styles.heroContent}>
            <Text style={styles.destinationText}>{trip?.destination ?? 'Destination coming soon'}</Text>
            <Text style={styles.title}>{trip?.title ?? 'Loading adventure…'}</Text>
            <Text style={styles.dateText}>{formatDateRange(trip?.startDate, trip?.endDate)}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>INVITE CODE</Text>
          <Text style={styles.codeText}>{trip?.inviteCode ?? '------'}</Text>
          <View style={styles.actionRow}>
            <TouchableOpacity activeOpacity={0.86} style={styles.actionButton} onPress={() => void handleCopyCode()}>
              <Ionicons name="copy-outline" size={16} color="#ff4f74" />
              <Text style={styles.actionText}>Copy code</Text>
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.86} style={styles.actionButton} onPress={() => void handleShareCode()}>
              <Ionicons name="share-social-outline" size={16} color="#ff4f74" />
              <Text style={styles.actionText}>Share</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Members</Text>
          <View style={styles.memberList}>
            {members.map((member) => (
              <View key={member.id} style={styles.memberRow}>
                {member.avatarUrl ? (
                  <Image source={{ uri: member.avatarUrl }} style={styles.memberAvatar} />
                ) : (
                  <View style={styles.memberFallback}>
                    <Text style={styles.memberInitials}>{getInitials(member.name)}</Text>
                  </View>
                )}
                <View style={styles.memberCopy}>
                  <Text style={styles.memberName}>{member.name}</Text>
                  <Text style={styles.memberRole}>{member.isOwner ? 'Owner' : 'Member'}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Invited and waiting</Text>
          {invites.length > 0 ? (
            invites.map((invite) => (
              <View key={invite.id} style={styles.inviteRow}>
                <Ionicons name="mail-outline" size={18} color="#6f7682" />
                <Text style={styles.inviteEmail}>{invite.email}</Text>
                <Text style={styles.inviteStatus}>Pending</Text>
              </View>
            ))
          ) : (
            <Text style={styles.emptyCopy}>No pending invites yet.</Text>
          )}
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </ScrollView>
    </>
  );
}

function formatDateRange(startDate?: string, endDate?: string) {
  if (!startDate || !endDate) return 'Dates coming soon';
  const formatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
  return `${formatter.format(new Date(`${startDate}T12:00:00`))} - ${formatter.format(new Date(`${endDate}T12:00:00`))}`;
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 18,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f6f8',
  },
  headerTitle: {
    color: '#151722',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.9,
  },
  heroCard: {
    minHeight: 250,
    borderRadius: 30,
    overflow: 'hidden',
    backgroundColor: '#d9e6ea',
    justifyContent: 'flex-end',
  },
  heroImage: {
    ...StyleSheet.absoluteFillObject,
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(20,24,31,0.16)',
  },
  heroContent: {
    padding: 22,
  },
  destinationText: {
    color: '#f9fbff',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  title: {
    marginTop: 6,
    color: '#fff',
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -1.2,
  },
  dateText: {
    marginTop: 8,
    color: '#eef2f5',
    fontSize: 16,
  },
  card: {
    marginTop: 18,
    borderRadius: 26,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#eceff4',
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.04,
    shadowRadius: 18,
    elevation: 3,
  },
  cardLabel: {
    color: '#7f848f',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  codeText: {
    marginTop: 8,
    color: '#13151c',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 3,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#ffd0db',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  actionText: {
    color: '#ff4f74',
    fontSize: 14,
    fontWeight: '700',
  },
  sectionTitle: {
    color: '#171821',
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  memberList: {
    marginTop: 14,
    gap: 12,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  memberAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  memberFallback: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1c1f27',
  },
  memberInitials: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  memberCopy: {
    marginLeft: 12,
  },
  memberName: {
    color: '#171821',
    fontSize: 16,
    fontWeight: '700',
  },
  memberRole: {
    marginTop: 2,
    color: '#6e7581',
    fontSize: 13,
  },
  inviteRow: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  inviteEmail: {
    flex: 1,
    color: '#22252c',
    fontSize: 15,
    fontWeight: '600',
  },
  inviteStatus: {
    color: '#ff4f74',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  emptyCopy: {
    marginTop: 14,
    color: '#7f8691',
    fontSize: 15,
  },
  errorText: {
    marginTop: 18,
    color: '#d53d18',
    textAlign: 'center',
  },
});
