import { Ionicons } from '@expo/vector-icons';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import RangeDatePicker, { formatRangeDisplay } from '@/components/range-date-picker';
import { apiFetch, apiJson } from '@/lib/api';
import type { Quest, TripInvite } from '@/lib/types';
import { uploadImageIfNeeded } from '@/lib/uploads';

type TripMember = {
  id: string;
  name: string;
  avatarUrl?: string | null;
  isOwner: boolean;
};

type MessageState = { type: 'success' | 'error'; text: string } | null;

export default function TripSettingsScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [trip, setTrip] = useState<Quest | null>(null);
  const [members, setMembers] = useState<TripMember[]>([]);
  const [invites, setInvites] = useState<TripInvite[]>([]);
  const [title, setTitle] = useState('');
  const [destination, setDestination] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [rangePickerOpen, setRangePickerOpen] = useState(false);
  const [message, setMessage] = useState<MessageState>(null);

  const loadTrip = useCallback(() => {
    let active = true;
    setLoading(true);

    void Promise.all([
      apiJson<Quest>(`/api/trips/${id}`),
      apiJson<TripMember[]>(`/api/trips/${id}/members`),
      apiJson<TripInvite[]>(`/api/trips/${id}/invites`),
    ])
      .then(([tripData, memberData, inviteData]) => {
        if (!active) return;
        setTrip(tripData);
        setMembers(memberData);
        setInvites(inviteData);
        setTitle(tripData.title ?? '');
        setDestination(tripData.destination ?? '');
        setStartDate(tripData.startDate);
        setEndDate(tripData.endDate);
        setImageUrl(tripData.imageUrl ?? null);
        setMessage(null);
      })
      .catch((err: Error) => {
        if (!active) return;
        setMessage({ type: 'error', text: err.message || 'Unable to load trip settings.' });
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id]);

  useFocusEffect(loadTrip);

  async function handlePickImage() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [16, 10],
      quality: 0.92,
    });

    if (!result.canceled && result.assets[0]) {
      setImageUrl(result.assets[0].uri);
    }
  }

  async function handleSave() {
    if (!trip) return;

    setSaving(true);
    setMessage(null);

    try {
      const uploadedImageUrl = await uploadImageIfNeeded(imageUrl, 'trip');
      const response = await apiFetch(`/api/trips/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          destination: destination.trim(),
          startDate,
          endDate,
          imageUrl: uploadedImageUrl,
          clearImage: !uploadedImageUrl,
        }),
      });

      if (!response.ok) {
        throw new Error((await response.text()) || 'Unable to save trip settings.');
      }

      setMessage({ type: 'success', text: 'Trip settings updated.' });
      loadTrip();
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Unable to save trip settings.' });
    } finally {
      setSaving(false);
    }
  }

  function confirmRemoveMember(member: TripMember) {
    Alert.alert('Remove member', `Remove ${member.name} from this trip?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          void removeMember(member.id);
        },
      },
    ]);
  }

  async function removeMember(memberId: string) {
    try {
      const response = await apiFetch(`/api/trips/${id}/members/${memberId}`, { method: 'DELETE' });
      if (!response.ok) {
        throw new Error((await response.text()) || 'Unable to remove member.');
      }
      setMembers((current) => current.filter((member) => member.id !== memberId));
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Unable to remove member.' });
    }
  }

  async function removeInvite(inviteId: string) {
    try {
      const response = await apiFetch(`/api/trips/${id}/invites/${inviteId}`, { method: 'DELETE' });
      if (!response.ok) {
        throw new Error((await response.text()) || 'Unable to remove invite.');
      }
      setInvites((current) => current.filter((invite) => invite.id !== inviteId));
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Unable to remove invite.' });
    }
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.screen}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingTop: Math.max(insets.top, 18) + 4, paddingBottom: Math.max(insets.bottom, 24) + 40 }]}
          showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.backButton} activeOpacity={0.88} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={24} color="#11131a" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Trip settings</Text>
          </View>

          {loading ? (
            <View style={styles.centerState}>
              <ActivityIndicator color="#ff4f74" />
            </View>
          ) : (
            <>
              <TouchableOpacity activeOpacity={0.92} style={styles.coverCard} onPress={() => void handlePickImage()}>
                {imageUrl ? <Image source={{ uri: imageUrl }} style={styles.coverImage} /> : null}
                <View style={styles.coverOverlay} />
                <View style={styles.coverBadge}>
                  <Ionicons name="camera-outline" size={16} color="#fff" />
                  <Text style={styles.coverBadgeText}>{imageUrl ? 'Change cover' : 'Add cover'}</Text>
                </View>
              </TouchableOpacity>

              <View style={styles.card}>
                <Text style={styles.label}>Trip title</Text>
                <TextInput value={title} onChangeText={setTitle} placeholder="Trip title" style={styles.input} />

                <Text style={styles.label}>Destination</Text>
                <TextInput value={destination} onChangeText={setDestination} placeholder="Destination" style={styles.input} />

                <Text style={styles.label}>Dates</Text>
                <TouchableOpacity style={styles.dateRangeCard} activeOpacity={0.9} onPress={() => setRangePickerOpen(true)}>
                  <View style={styles.dateRangeCopy}>
                    <Text style={styles.dateRangeEyebrow}>TRIP DATES</Text>
                    <Text style={styles.dateRangeValue}>{formatRangeDisplay(startDate, endDate)}</Text>
                    <Text style={styles.dateRangeHint}>Tap once and adjust the whole range in one calendar.</Text>
                  </View>
                  <View style={styles.dateRangeIcon}>
                    <Ionicons name="calendar-outline" size={20} color="#ff4f74" />
                  </View>
                </TouchableOpacity>
              </View>

              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Members</Text>
                {members.map((member) => (
                  <View key={member.id} style={styles.listRow}>
                    <View style={styles.listCopy}>
                      <Text style={styles.listTitle}>{member.name}</Text>
                      <Text style={styles.listMeta}>{member.isOwner ? 'Owner' : 'Member'}</Text>
                    </View>
                    {!member.isOwner ? (
                      <TouchableOpacity activeOpacity={0.88} onPress={() => confirmRemoveMember(member)}>
                        <Ionicons name="close-circle-outline" size={22} color="#d53d18" />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                ))}
              </View>

              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Pending invites</Text>
                {invites.length > 0 ? (
                  invites.map((invite) => (
                    <View key={invite.id} style={styles.listRow}>
                      <View style={styles.listCopy}>
                        <Text style={styles.listTitle}>{invite.email}</Text>
                        <Text style={styles.listMeta}>Pending</Text>
                      </View>
                      <TouchableOpacity activeOpacity={0.88} onPress={() => void removeInvite(invite.id)}>
                        <Ionicons name="close-circle-outline" size={22} color="#d53d18" />
                      </TouchableOpacity>
                    </View>
                  ))
                ) : (
                  <Text style={styles.emptyText}>No pending invites.</Text>
                )}
              </View>

              {message ? (
                <View style={[styles.messageBanner, message.type === 'success' ? styles.messageBannerSuccess : styles.messageBannerError]}>
                  <Text style={[styles.messageText, message.type === 'success' ? styles.messageTextSuccess : styles.messageTextError]}>{message.text}</Text>
                </View>
              ) : null}

              <TouchableOpacity activeOpacity={0.92} style={[styles.primaryButton, saving ? styles.primaryButtonDisabled : null]} disabled={saving} onPress={() => void handleSave()}>
                <Text style={styles.primaryButtonText}>{saving ? 'Saving...' : 'Save trip settings'}</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>

        <RangeDatePicker
          visible={rangePickerOpen}
          title="Adjust trip dates"
          subtitle="Move the whole adventure range in one place. Existing SideQuests still need to stay inside it."
          startDate={startDate}
          endDate={endDate}
          confirmLabel="Save date range"
          onChange={(nextStartDate, nextEndDate) => {
            setStartDate(nextStartDate);
            setEndDate(nextEndDate);
          }}
          onClose={() => setRangePickerOpen(false)}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  content: { paddingHorizontal: 22 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f6f8',
  },
  headerTitle: { color: '#121317', fontSize: 24, fontWeight: '900', letterSpacing: -0.8 },
  centerState: { minHeight: 260, alignItems: 'center', justifyContent: 'center' },
  coverCard: { height: 210, borderRadius: 30, overflow: 'hidden', backgroundColor: '#eef1f4', marginBottom: 18 },
  coverImage: { ...StyleSheet.absoluteFillObject },
  coverOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(18,22,29,0.16)' },
  coverBadge: {
    position: 'absolute',
    right: 16,
    top: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(18,22,29,0.48)',
  },
  coverBadgeText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  card: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#eaedf2',
    backgroundColor: '#fff',
    padding: 18,
    marginBottom: 16,
  },
  label: { color: '#161821', fontSize: 15, fontWeight: '800', marginBottom: 8, marginTop: 4 },
  input: {
    minHeight: 54,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e6e9ef',
    backgroundColor: '#f9fafc',
    paddingHorizontal: 16,
    marginBottom: 10,
    color: '#161821',
    fontSize: 16,
  },
  dateRangeCard: {
    marginTop: 4,
    minHeight: 96,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#e6e9ef',
    backgroundColor: '#f9fafc',
    paddingHorizontal: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateRangeCopy: {
    flex: 1,
  },
  dateRangeEyebrow: {
    color: '#868d99',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  dateRangeValue: {
    marginTop: 8,
    color: '#161821',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  dateRangeHint: {
    marginTop: 6,
    color: '#7d8491',
    fontSize: 13,
    lineHeight: 19,
  },
  dateRangeIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff1f5',
    borderWidth: 1,
    borderColor: '#ffd8e2',
    marginLeft: 12,
  },
  sectionTitle: { color: '#161821', fontSize: 18, fontWeight: '900', marginBottom: 6 },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f2f5',
  },
  listCopy: { flex: 1, paddingRight: 12 },
  listTitle: { color: '#161821', fontSize: 15, fontWeight: '700' },
  listMeta: { marginTop: 2, color: '#7d8491', fontSize: 13 },
  emptyText: { color: '#7d8491', fontSize: 14, marginTop: 6 },
  messageBanner: {
    marginTop: 4,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  messageBannerSuccess: { backgroundColor: '#e9f8f1', borderWidth: 1, borderColor: '#bfe9d2' },
  messageBannerError: { backgroundColor: '#ffefeb', borderWidth: 1, borderColor: '#ffd0c3' },
  messageText: { fontSize: 14, fontWeight: '600' },
  messageTextSuccess: { color: '#16734d' },
  messageTextError: { color: '#a52617' },
  primaryButton: {
    marginTop: 16,
    minHeight: 64,
    borderRadius: 999,
    backgroundColor: '#ff4f74',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  primaryButtonDisabled: { opacity: 0.7 },
  primaryButtonText: { color: '#fff', fontSize: 18, fontWeight: '900' },
});
