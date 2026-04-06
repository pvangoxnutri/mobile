import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import RangeDatePicker, { formatRangeDisplay } from '@/components/range-date-picker';
import { apiFetch, apiJson } from '@/lib/api';
import type { Quest } from '@/lib/types';

type MessageState = { type: 'success' | 'error'; text: string } | null;

export default function CreateTripScreen() {
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState('');
  const [destination, setDestination] = useState('');
  const [startDate, setStartDate] = useState(getDefaultStartDate());
  const [endDate, setEndDate] = useState(getDefaultEndDate());
  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [inviteCode] = useState(() => createInviteCode());
  const [rangePickerOpen, setRangePickerOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [pendingInvites, setPendingInvites] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<MessageState>(null);

  const contentBottomPadding = useMemo(() => Math.max(insets.bottom, 18) + 184, [insets.bottom]);

  async function handlePickCover() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [16, 10],
      quality: 0.9,
    });

    if (!result.canceled && result.assets[0]) {
      setCoverImage(result.assets[0].uri);
    }
  }

  function handleAddInvite() {
    const normalizedEmail = inviteEmail.trim().toLowerCase();

    if (!normalizedEmail) {
      setMessage({ type: 'error', text: 'Enter an email address first.' });
      return;
    }

    if (!looksLikeEmail(normalizedEmail)) {
      setMessage({ type: 'error', text: 'That email address does not look valid.' });
      return;
    }

    if (pendingInvites.includes(normalizedEmail)) {
      setMessage({ type: 'error', text: 'That person is already on the invite list.' });
      return;
    }

    setPendingInvites((current) => [...current, normalizedEmail]);
    setInviteEmail('');
    setMessage(null);
  }

  function handleRemoveInvite(email: string) {
    setPendingInvites((current) => current.filter((entry) => entry !== email));
  }

  async function handleCopyInviteCode() {
    await Clipboard.setStringAsync(inviteCode);
    setMessage({ type: 'success', text: `Invite code ${inviteCode} copied.` });
  }

  async function handleShareInviteCode() {
    await Share.share({
      message: `Join my SideQuest with code ${inviteCode}.`,
      title: 'Join my SideQuest',
      url: coverImage ?? undefined,
    });
  }

  async function handleCreateTrip() {
    const normalizedTitle = title.trim();
    const normalizedDestination = destination.trim();

    if (!normalizedTitle) {
      setMessage({ type: 'error', text: 'Give your adventure a name first.' });
      return;
    }

    if (!normalizedDestination) {
      setMessage({ type: 'error', text: 'Add a destination so your adventure has a home.' });
      return;
    }

    if (!isDateInputValid(startDate) || !isDateInputValid(endDate)) {
      setMessage({ type: 'error', text: 'Use date format YYYY-MM-DD for both start and end.' });
      return;
    }

    if (new Date(`${endDate}T12:00:00`).getTime() < new Date(`${startDate}T12:00:00`).getTime()) {
      setMessage({ type: 'error', text: 'End date needs to be the same day or later than start date.' });
      return;
    }

    setSubmitting(true);
    setMessage(null);

    try {
      let uploadedImageUrl: string | null = null;

      if (coverImage) {
        uploadedImageUrl = await uploadImageIfNeeded(coverImage);
      }

      const trip = await apiJson<Quest>('/api/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: normalizedTitle,
          destination: normalizedDestination,
          description: null,
          imageUrl: uploadedImageUrl,
          startDate,
          endDate,
          inviteCode,
        }),
      });

      if (pendingInvites.length > 0) {
        await Promise.allSettled(
          pendingInvites.map((email) =>
            apiJson(`/api/trips/${trip.id}/invites`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email }),
            }),
          ),
        );
      }

      router.replace(`/trip/${trip.id}`);
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Unable to create adventure right now.' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingTop: Math.max(insets.top, 14) + 6, paddingBottom: contentBottomPadding }]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} activeOpacity={0.8} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={28} color="#ff4f74" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>New Adventure</Text>
        </View>

        <Pressable style={styles.coverCard} onPress={() => void handlePickCover()}>
          {coverImage ? <Image source={{ uri: coverImage }} style={styles.coverImage} /> : null}
          {!coverImage ? <View style={styles.coverGlow} /> : null}
          {!coverImage ? <View style={styles.coverAccent} /> : null}
          {!coverImage ? <View style={styles.coverShadow} /> : null}
          {!coverImage ? (
            <View style={styles.coverOverlay}>
              <View style={styles.coverIconCircle}>
                <Ionicons name="camera-outline" size={34} color="#fff" />
                <View style={styles.coverPlusBadge}>
                  <Ionicons name="add" size={14} color="#fff" />
                </View>
              </View>
              <Text style={styles.coverLabel}>+ Add cover photo</Text>
            </View>
          ) : (
            <View style={styles.coverEditBadge}>
              <Ionicons name="camera-outline" size={14} color="#fff" />
              <Text style={styles.coverEditBadgeText}>Change photo</Text>
            </View>
          )}
        </Pressable>

        <Text style={styles.prompt}>What should we call this adventure?</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. Kyoto Nights"
          placeholderTextColor="#d8dbe2"
          style={styles.titleInput}
        />

        <Text style={styles.secondaryPrompt}>Where are you going?</Text>
        <TextInput
          value={destination}
          onChangeText={setDestination}
          placeholder="e.g. Kyoto, Japan"
          placeholderTextColor="#cfd3db"
          style={styles.destinationInput}
        />

        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="calendar-outline" size={23} color="#ff4f74" />
            <Text style={styles.sectionTitle}>When are you going?</Text>
          </View>

          <Pressable style={styles.dateRangeCard} onPress={() => setRangePickerOpen(true)}>
            <View style={styles.dateRangeCopy}>
              <Text style={styles.dateRangeEyebrow}>SELECT DATES</Text>
              <Text style={styles.dateRangeValue}>{formatRangeDisplay(startDate, endDate)}</Text>
              <Text style={styles.dateRangeHint}>Tap once, pick start and end in one calendar.</Text>
            </View>
            <View style={styles.dateRangeIcon}>
              <Ionicons name="calendar-outline" size={22} color="#ff4f74" />
            </View>
          </Pressable>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="key-outline" size={23} color="#10b7d6" />
            <Text style={styles.sectionTitle}>Invite code</Text>
          </View>

          <View style={styles.codeCard}>
            <View>
              <Text style={styles.codeLabel}>SHARE THIS CODE</Text>
              <Text style={styles.codeValue}>{inviteCode}</Text>
            </View>

            <View style={styles.codeActions}>
              <TouchableOpacity activeOpacity={0.86} style={styles.codeActionButton} onPress={() => void handleCopyInviteCode()}>
                <Ionicons name="copy-outline" size={16} color="#ff4f74" />
                <Text style={styles.codeActionText}>Copy</Text>
              </TouchableOpacity>
              <TouchableOpacity activeOpacity={0.86} style={styles.codeActionButton} onPress={() => void handleShareInviteCode()}>
                <Ionicons name="share-social-outline" size={16} color="#ff4f74" />
                <Text style={styles.codeActionText}>Share</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="mail-open-outline" size={23} color="#10b7d6" />
            <Text style={styles.sectionTitle}>Invited and waiting</Text>
          </View>

          <Text style={styles.inviteHelper}>Invite by email now. They will show up here until they respond.</Text>

          <View style={styles.inviteComposer}>
            <TextInput
              value={inviteEmail}
              onChangeText={setInviteEmail}
              placeholder="friend@example.com"
              placeholderTextColor="#b5b9c1"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.inviteInput}
            />
            <TouchableOpacity activeOpacity={0.88} style={styles.inviteAddButton} onPress={handleAddInvite}>
              <Text style={styles.inviteAddButtonText}>Add</Text>
            </TouchableOpacity>
          </View>

          {pendingInvites.length > 0 ? (
            <View style={styles.pendingWrap}>
              {pendingInvites.map((email) => (
                <View key={email} style={styles.pendingChip}>
                  <Text style={styles.pendingChipText}>{email}</Text>
                  <TouchableOpacity activeOpacity={0.8} onPress={() => handleRemoveInvite(email)}>
                    <Ionicons name="close" size={16} color="#6d7280" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.pendingEmpty}>
              <Ionicons name="time-outline" size={18} color="#98a0ad" />
              <Text style={styles.pendingEmptyText}>No pending invites yet</Text>
            </View>
          )}
        </View>

        {message ? (
          <View style={[styles.messageBanner, message.type === 'success' ? styles.messageBannerSuccess : styles.messageBannerError]}>
            <Ionicons name={message.type === 'success' ? 'checkmark-circle' : 'alert-circle'} size={18} color={message.type === 'success' ? '#16734d' : '#a52617'} />
            <Text style={[styles.messageText, message.type === 'success' ? styles.messageTextSuccess : styles.messageTextError]}>
              {message.text}
            </Text>
          </View>
        ) : null}

        <TouchableOpacity activeOpacity={0.9} style={[styles.primaryButton, submitting ? styles.primaryButtonDisabled : null]} disabled={submitting} onPress={() => void handleCreateTrip()}>
          <Text style={styles.primaryButtonText}>{submitting ? 'Starting...' : 'Start Adventure'}</Text>
        </TouchableOpacity>
      </ScrollView>

      <View pointerEvents="box-none" style={[styles.bottomChrome, { paddingBottom: Math.max(insets.bottom, 10) + 4 }]}>
        <View style={styles.bottomBar}>
          <BottomTab icon="compass" label="Home" onPress={() => router.replace('/(tabs)')} />
          <BottomTab icon="calendar-clear" label="Calendar" active />
          <BottomTab icon="notifications" label="Alerts" onPress={() => router.push('/TMP_Navbar')} />
          <BottomTab icon="person" label="Profile" onPress={() => router.replace('/(tabs)/profile')} />
        </View>
      </View>

      <RangeDatePicker
        visible={rangePickerOpen}
        title="Choose adventure dates"
        subtitle="Tap a start date, then tap an end date. The whole trip range will highlight."
        startDate={startDate}
        endDate={endDate}
        minDate={getDefaultStartDate()}
        confirmLabel="Use these dates"
        onChange={(nextStartDate, nextEndDate) => {
          setStartDate(nextStartDate);
          setEndDate(nextEndDate);
        }}
        onClose={() => setRangePickerOpen(false)}
      />
    </View>
  );
}

function BottomTab({
  icon,
  label,
  active,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  active?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable style={styles.bottomTab} onPress={onPress}>
      <View style={active ? styles.bottomTabActiveIcon : styles.bottomTabIcon}>
        <Ionicons name={icon} size={22} color={active ? '#fff' : '#7a7e87'} />
      </View>
      <Text style={[styles.bottomTabLabel, active ? styles.bottomTabLabelActive : null]}>{label}</Text>
    </Pressable>
  );
}

async function uploadImageIfNeeded(uri: string) {
  if (!uri || uri.startsWith('http://') || uri.startsWith('https://')) {
    return uri;
  }

  const formData = new FormData();
  formData.append('file', {
    uri,
    name: `cover-${Date.now()}.jpg`,
    type: 'image/jpeg',
  } as never);

  const response = await apiFetch('/api/images/upload', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error((await response.text()) || 'Could not upload the cover image.');
  }

  const data = (await response.json()) as { url?: string };
  return data.url ?? null;
}

function looksLikeEmail(value: string) {
  return /\S+@\S+\.\S+/.test(value);
}

function isDateInputValid(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function createInviteCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function getDefaultStartDate() {
  return new Date().toISOString().slice(0, 10);
}

function getDefaultEndDate() {
  const date = new Date();
  date.setDate(date.getDate() + 3);
  return date.toISOString().slice(0, 10);
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingBottom: 14,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f1f4',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#151722',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.9,
  },
  coverCard: {
    height: 300,
    borderRadius: 36,
    overflow: 'hidden',
    backgroundColor: '#dbeaed',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  coverImage: {
    ...StyleSheet.absoluteFillObject,
  },
  coverGlow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(225,240,242,0.78)',
  },
  coverAccent: {
    position: 'absolute',
    left: -8,
    top: -10,
    bottom: 58,
    width: 78,
    borderRadius: 40,
    borderWidth: 4,
    borderColor: 'rgba(22,167,198,0.5)',
  },
  coverShadow: {
    position: 'absolute',
    bottom: 18,
    width: 132,
    height: 18,
    borderRadius: 999,
    backgroundColor: 'rgba(43,49,53,0.18)',
    opacity: 0.35,
  },
  coverOverlay: {
    alignItems: 'center',
  },
  coverIconCircle: {
    width: 92,
    height: 92,
    borderRadius: 46,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.65)',
  },
  coverPlusBadge: {
    position: 'absolute',
    right: 22,
    top: 21,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.32)',
  },
  coverLabel: {
    marginTop: 16,
    color: '#fff',
    fontSize: 18,
    fontWeight: '500',
    letterSpacing: -0.4,
  },
  coverEditBadge: {
    position: 'absolute',
    right: 18,
    top: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(18,22,29,0.38)',
  },
  coverEditBadgeText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  prompt: {
    marginTop: 30,
    textAlign: 'center',
    color: '#4d4f56',
    fontSize: 18,
    letterSpacing: -0.3,
  },
  titleInput: {
    marginTop: 12,
    textAlign: 'center',
    color: '#121317',
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -1.2,
    paddingVertical: 10,
  },
  secondaryPrompt: {
    marginTop: 4,
    textAlign: 'center',
    color: '#747984',
    fontSize: 16,
  },
  destinationInput: {
    marginTop: 10,
    textAlign: 'center',
    color: '#121317',
    fontSize: 20,
    fontWeight: '600',
    letterSpacing: -0.6,
    paddingVertical: 8,
  },
  section: {
    marginTop: 32,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sectionTitle: {
    color: '#171821',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  dateRangeCard: {
    marginTop: 16,
    minHeight: 118,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: '#eceef2',
    backgroundColor: '#fff',
    paddingHorizontal: 22,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.04,
    shadowRadius: 18,
    elevation: 4,
  },
  dateRangeCopy: {
    flex: 1,
  },
  dateRangeEyebrow: {
    color: '#7f848f',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  dateRangeValue: {
    marginTop: 8,
    color: '#14161d',
    fontSize: 21,
    fontWeight: '800',
    letterSpacing: -0.7,
  },
  dateRangeHint: {
    marginTop: 8,
    color: '#7a818d',
    fontSize: 14,
    lineHeight: 21,
  },
  dateRangeIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff1f5',
    borderWidth: 1,
    borderColor: '#ffd8e2',
    marginLeft: 14,
  },
  codeCard: {
    marginTop: 16,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: '#eceef2',
    backgroundColor: '#fff',
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.04,
    shadowRadius: 18,
    elevation: 4,
  },
  codeLabel: {
    color: '#7f848f',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.1,
  },
  codeValue: {
    marginTop: 6,
    color: '#14161d',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 3,
  },
  codeActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  codeActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#ffd0db',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  codeActionText: {
    color: '#ff4f74',
    fontSize: 14,
    fontWeight: '700',
  },
  inviteHelper: {
    marginTop: 12,
    color: '#717783',
    fontSize: 15,
    lineHeight: 22,
  },
  inviteComposer: {
    marginTop: 16,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  inviteInput: {
    flex: 1,
    minHeight: 56,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e7e9ee',
    paddingHorizontal: 16,
    color: '#171821',
    fontSize: 16,
    backgroundColor: '#fff',
  },
  inviteAddButton: {
    minHeight: 56,
    borderRadius: 18,
    backgroundColor: '#ff4f74',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  inviteAddButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
  pendingWrap: {
    marginTop: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  pendingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    backgroundColor: '#f5f7fa',
    borderWidth: 1,
    borderColor: '#e6e9ef',
    paddingLeft: 14,
    paddingRight: 10,
    paddingVertical: 10,
  },
  pendingChipText: {
    color: '#2b2d35',
    fontSize: 14,
    fontWeight: '600',
  },
  pendingEmpty: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pendingEmptyText: {
    color: '#98a0ad',
    fontSize: 14,
    fontWeight: '600',
  },
  messageBanner: {
    marginTop: 22,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  messageBannerSuccess: {
    backgroundColor: '#e9f8f1',
    borderWidth: 1,
    borderColor: '#bfe9d2',
  },
  messageBannerError: {
    backgroundColor: '#ffefeb',
    borderWidth: 1,
    borderColor: '#ffd0c3',
  },
  messageText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  messageTextSuccess: {
    color: '#16734d',
  },
  messageTextError: {
    color: '#a52617',
  },
  primaryButton: {
    marginTop: 30,
    height: 82,
    borderRadius: 999,
    backgroundColor: '#ff4f74',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#ff4f74',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.28,
    shadowRadius: 28,
    elevation: 10,
  },
  primaryButtonDisabled: {
    opacity: 0.72,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.9,
  },
  bottomChrome: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    backgroundColor: 'transparent',
  },
  bottomBar: {
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.98)',
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingTop: 12,
    paddingBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 10,
  },
  bottomTab: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 68,
  },
  bottomTabIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomTabActiveIcon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ff4f74',
    shadowColor: '#ff4f74',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28,
    shadowRadius: 20,
    elevation: 8,
  },
  bottomTabLabel: {
    marginTop: 6,
    color: '#70757f',
    fontSize: 12,
    fontWeight: '500',
  },
  bottomTabLabelActive: {
    color: '#ff4f74',
    fontWeight: '700',
  },
});
