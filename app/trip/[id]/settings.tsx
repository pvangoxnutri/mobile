import { Ionicons } from '@expo/vector-icons';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/components/auth-provider';
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
  const { user } = useAuth();
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
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteMessage, setInviteMessage] = useState('');
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [confirmingLeave, setConfirmingLeave] = useState(false);

  const canManageTrip = Boolean(user?.id && trip?.ownerIds?.includes(user.id));

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

  async function handleAddInvite() {
    const normalizedEmail = inviteEmail.trim().toLowerCase();

    if (!normalizedEmail) {
      setInviteMessage('Enter an email address first.');
      return;
    }

    if (!/\S+@\S+\.\S+/.test(normalizedEmail)) {
      setInviteMessage('That email address does not look valid.');
      return;
    }

    if (invites.some((invite) => invite.email.toLowerCase() === normalizedEmail)) {
      setInviteMessage('That person is already invited.');
      return;
    }

    setInviteSubmitting(true);
    setInviteMessage('');

    try {
      const invite = await apiJson<TripInvite>(`/api/trips/${id}/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail }),
      });

      setInvites((current) => [...current, invite]);
      setInviteEmail('');
      setInviteMessage('Invite sent.');
    } catch (error) {
      setInviteMessage(error instanceof Error ? error.message : 'Unable to invite right now.');
    } finally {
      setInviteSubmitting(false);
    }
  }

  async function handleLeave() {
    setLeaving(true);
    try {
      const response = await apiFetch(`/api/trips/${id}/members/me`, { method: 'DELETE' });
      if (!response.ok) {
        const text = await response.text();
        setMessage({ type: 'error', text: text || 'Unable to leave this adventure.' });
        return;
      }
      router.replace('/(tabs)');
    } catch {
      setMessage({ type: 'error', text: 'Unable to leave this adventure.' });
    } finally {
      setLeaving(false);
    }
  }

  async function handleCopyInviteCode() {
    if (!trip?.inviteCode) return;
    await Clipboard.setStringAsync(trip.inviteCode);
    setInviteMessage(`Invite code ${trip.inviteCode} copied.`);
  }

  async function handleShareInvite() {
    if (!trip?.inviteCode) return;
    await Share.share({
      title: `Join ${trip.title ?? 'my adventure'}`,
      message: `Join ${trip.title ?? 'my SideQuest adventure'} with code ${trip.inviteCode}.`,
      url: trip.imageUrl ?? undefined,
    });
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
          ) : canManageTrip ? (

            // ── OWNER VIEW ────────────────────────────────────────────────────
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
                <View style={styles.inviteSection}>
                  <View style={styles.inviteHeaderRow}>
                    <View>
                      <Text style={styles.inviteTitle}>Invite traveler</Text>
                      <Text style={styles.inviteSubtitle}>Add by email or share the trip code directly from settings.</Text>
                    </View>
                    <View style={styles.inviteCodePill}>
                      <Text style={styles.inviteCodePillText}>{trip?.inviteCode ?? '------'}</Text>
                    </View>
                  </View>
                  <View style={styles.inviteComposer}>
                    <TextInput
                      value={inviteEmail}
                      onChangeText={setInviteEmail}
                      placeholder="friend@example.com"
                      placeholderTextColor="#afb5bf"
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      style={styles.inviteInput}
                    />
                    <TouchableOpacity
                      activeOpacity={0.9}
                      style={[styles.inviteAddButton, inviteSubmitting ? styles.inviteAddButtonDisabled : null]}
                      disabled={inviteSubmitting}
                      onPress={() => void handleAddInvite()}>
                      <Text style={styles.inviteAddButtonText}>{inviteSubmitting ? 'Adding...' : 'Invite'}</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.inviteActions}>
                    <TouchableOpacity activeOpacity={0.9} style={styles.secondaryInviteButton} onPress={() => void handleCopyInviteCode()}>
                      <Ionicons name="copy-outline" size={16} color="#ff4f74" />
                      <Text style={styles.secondaryInviteButtonText}>Copy code</Text>
                    </TouchableOpacity>
                    <TouchableOpacity activeOpacity={0.9} style={styles.secondaryInviteButton} onPress={() => void handleShareInvite()}>
                      <Ionicons name="share-social-outline" size={16} color="#ff4f74" />
                      <Text style={styles.secondaryInviteButtonText}>Share</Text>
                    </TouchableOpacity>
                  </View>
                  {inviteMessage ? <Text style={styles.inviteMessage}>{inviteMessage}</Text> : null}
                </View>
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

          ) : (

            // ── MEMBER VIEW (read-only + leave) ───────────────────────────────
            <>
              {imageUrl ? (
                <View style={styles.coverCard}>
                  <Image source={{ uri: imageUrl }} style={styles.coverImage} />
                  <View style={styles.coverOverlay} />
                </View>
              ) : null}

              <View style={styles.card}>
                <Text style={styles.readOnlyLabel}>Trip title</Text>
                <Text style={styles.readOnlyValue}>{trip?.title ?? '—'}</Text>
                <View style={styles.readOnlyDivider} />
                <Text style={styles.readOnlyLabel}>Destination</Text>
                <Text style={styles.readOnlyValue}>{trip?.destination ?? '—'}</Text>
                <View style={styles.readOnlyDivider} />
                <Text style={styles.readOnlyLabel}>Dates</Text>
                <Text style={styles.readOnlyValue}>{formatRangeDisplay(startDate, endDate)}</Text>
              </View>

              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Members</Text>
                {members.map((member) => (
                  <View key={member.id} style={styles.listRow}>
                    <View style={styles.listCopy}>
                      <Text style={styles.listTitle}>{member.name}</Text>
                      <Text style={styles.listMeta}>{member.isOwner ? 'Owner' : 'Member'}</Text>
                    </View>
                  </View>
                ))}
              </View>

              {message ? (
                <View style={[styles.messageBanner, message.type === 'success' ? styles.messageBannerSuccess : styles.messageBannerError]}>
                  <Text style={[styles.messageText, message.type === 'success' ? styles.messageTextSuccess : styles.messageTextError]}>{message.text}</Text>
                </View>
              ) : null}

              <View style={styles.dangerCard}>
                <Text style={styles.dangerTitle}>Leave adventure</Text>
                <Text style={styles.dangerCopy}>
                  You'll be removed from the group and won't see its SideQuests. You'll need a new invite to rejoin.
                </Text>
                {confirmingLeave ? (
                  <View style={styles.dangerConfirmRow}>
                    <TouchableOpacity activeOpacity={0.88} style={styles.dangerCancelButton} onPress={() => setConfirmingLeave(false)}>
                      <Text style={styles.dangerCancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      activeOpacity={0.88}
                      style={[styles.dangerConfirmButton, leaving ? styles.dangerButtonDisabled : null]}
                      disabled={leaving}
                      onPress={() => void handleLeave()}>
                      <Ionicons name="exit-outline" size={16} color="#fff" />
                      <Text style={styles.dangerConfirmText}>{leaving ? 'Leaving...' : 'Yes, leave'}</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity activeOpacity={0.88} style={styles.dangerButton} onPress={() => setConfirmingLeave(true)}>
                    <Ionicons name="exit-outline" size={18} color="#d53d18" />
                    <Text style={styles.dangerButtonText}>Leave adventure</Text>
                  </TouchableOpacity>
                )}
              </View>
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
  inviteSection: {
    marginTop: 14,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#f0f2f5',
  },
  inviteHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  inviteTitle: {
    color: '#161821',
    fontSize: 16,
    fontWeight: '900',
  },
  inviteSubtitle: {
    marginTop: 4,
    maxWidth: 220,
    color: '#7d8491',
    fontSize: 13,
    lineHeight: 19,
  },
  inviteCodePill: {
    borderRadius: 999,
    backgroundColor: '#fff3f6',
    borderWidth: 1,
    borderColor: '#ffd4de',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  inviteCodePillText: {
    color: '#ff4f74',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
  },
  inviteComposer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 16,
  },
  inviteInput: {
    flex: 1,
    minHeight: 54,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e6e9ef',
    backgroundColor: '#f9fafc',
    paddingHorizontal: 16,
    color: '#161821',
    fontSize: 15,
  },
  inviteAddButton: {
    minHeight: 54,
    borderRadius: 18,
    backgroundColor: '#ff4f74',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  inviteAddButtonDisabled: {
    opacity: 0.72,
  },
  inviteAddButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  inviteActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
    flexWrap: 'wrap',
  },
  secondaryInviteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#ffd4de',
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  secondaryInviteButtonText: {
    color: '#ff4f74',
    fontSize: 14,
    fontWeight: '700',
  },
  inviteMessage: {
    marginTop: 12,
    color: '#6f7683',
    fontSize: 14,
    fontWeight: '600',
  },
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
  readOnlyLabel: { color: '#868d99', fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 4 },
  readOnlyValue: { color: '#161821', fontSize: 16, fontWeight: '700', marginTop: 4, marginBottom: 4 },
  readOnlyDivider: { height: 1, backgroundColor: '#f0f2f5', marginVertical: 10 },
  dangerCard: {
    marginTop: 16,
    marginBottom: 20,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#ffd0c3',
    backgroundColor: '#fff9f8',
    padding: 18,
  },
  dangerTitle: { color: '#a52617', fontSize: 16, fontWeight: '900', marginBottom: 6 },
  dangerCopy: { color: '#7d4238', fontSize: 14, lineHeight: 20, marginBottom: 16 },
  dangerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 52,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: '#f0b0a0',
    backgroundColor: '#fff',
  },
  dangerButtonDisabled: { opacity: 0.6 },
  dangerButtonText: { color: '#d53d18', fontSize: 15, fontWeight: '800' },
  dangerConfirmRow: { flexDirection: 'row', gap: 10 },
  dangerCancelButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#dde0e6',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerCancelText: { color: '#4a5160', fontSize: 15, fontWeight: '700' },
  dangerConfirmButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 52,
    borderRadius: 999,
    backgroundColor: '#d53d18',
  },
  dangerConfirmText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
