import { Ionicons } from '@expo/vector-icons';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/components/auth-provider';
import { useI18n } from '@/components/i18n-provider';
import RangeDatePicker, { formatRangeDisplay } from '@/components/range-date-picker';
import CountryPicker from '@/components/travel-tracker/country-picker';
import { UnsavedChangesModal, useUnsavedChanges } from '@/components/unsaved-changes';
import { useKeyboardFocusScroll } from '@/hooks/useKeyboardFocusScroll';
import { apiFetch, apiJson } from '@/lib/api';
import { getCached, setCached, invalidateTripCache } from '@/lib/cache';
import type { Quest, TripInvite } from '@/lib/types';
import { uploadImageIfNeeded } from '@/lib/uploads';
import { useTheme } from '@/components/theme-provider';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { AppTheme } from '@/constants/themes';

type TripMember = {
  id: string;
  name: string;
  avatarUrl?: string | null;
  isOwner: boolean;
};

type MessageState = { type: 'success' | 'error'; text: string } | null;

export default function TripSettingsScreen() {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [trip, setTrip] = useState<Quest | null>(null);
  const [members, setMembers] = useState<TripMember[]>([]);
  const [invites, setInvites] = useState<TripInvite[]>([]);
  const [title, setTitle] = useState('');
  const [destination, setDestination] = useState('');
  const [tripCountries, setTripCountries] = useState<string[]>([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [membersCanEdit, setMembersCanEdit] = useState(true);
  const [rangePickerOpen, setRangePickerOpen] = useState(false);
  const [message, setMessage] = useState<MessageState>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteMessage, setInviteMessage] = useState('');
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const { scrollRef, onFocusField, scrollViewProps } = useKeyboardFocusScroll();
  const titleRef = useRef<TextInput>(null);
  const destinationRef = useRef<TextInput>(null);
  const inviteEmailRef = useRef<TextInput>(null);
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deletingTrip, setDeletingTrip] = useState(false);

  // Guards re-seeding the editable form fields from a background refetch —
  // without this, a refresh arriving while the user is mid-edit (e.g. right
  // after they've started typing a new title) would silently overwrite
  // their in-progress changes. Reset whenever the trip id changes so a
  // genuinely different trip still seeds fresh.
  const formSeededForIdRef = useRef<string | null>(null);

  const canManageTrip = Boolean(user?.id && trip?.ownerIds?.includes(user.id));

  const isDirty = Boolean(
    trip && (
      title.trim() !== (trip.title ?? '').trim() ||
      destination.trim() !== (trip.destination ?? '').trim() ||
      startDate !== trip.startDate ||
      endDate !== trip.endDate ||
      JSON.stringify(tripCountries) !== JSON.stringify(trip.countries ?? []) ||
      (imageUrl ?? null) !== (trip.imageUrl ?? null) ||
      membersCanEdit !== (trip.membersCanEdit ?? true)
    )
  );

  function seedFormFromTrip(tripData: Quest) {
    // Only ever seed once per trip id — a background refetch updating
    // `trip`/`members`/`invites` must not also reset fields the user may
    // already be editing.
    if (formSeededForIdRef.current === id) return;
    formSeededForIdRef.current = id;
    setTitle(tripData.title ?? '');
    setDestination(tripData.destination ?? '');
    setTripCountries(tripData.countries ?? []);
    setStartDate(tripData.startDate);
    setEndDate(tripData.endDate);
    setImageUrl(tripData.imageUrl ?? null);
    setMembersCanEdit(tripData.membersCanEdit ?? true);
  }

  const loadTrip = useCallback(() => {
    let active = true;

    const tripUrl = `/api/trips/${id}`;
    const membersUrl = `/api/trips/${id}/members`;
    const invitesUrl = `/api/trips/${id}/invites`;

    // Show cached trip/members/invites instantly so reopening settings for
    // an already-visited trip doesn't flash a loading spinner. Falls back
    // to the spinner only when there's truly nothing cached yet.
    const cachedTrip = getCached<Quest>(tripUrl);
    const cachedMembers = getCached<TripMember[]>(membersUrl);
    const cachedInvites = getCached<TripInvite[]>(invitesUrl);

    if (cachedTrip) {
      setTrip(cachedTrip);
      seedFormFromTrip(cachedTrip);
      setLoading(false);
    } else {
      setLoading(true);
    }
    if (cachedMembers) setMembers(cachedMembers);
    if (cachedInvites) setInvites(cachedInvites);

    void Promise.all([
      apiJson<Quest>(tripUrl),
      apiJson<TripMember[]>(membersUrl),
      apiJson<TripInvite[]>(invitesUrl),
    ])
      .then(([tripData, memberData, inviteData]) => {
        if (!active) return;
        setTrip(tripData);
        setMembers(memberData);
        setInvites(inviteData);
        setCached(tripUrl, tripData);
        setCached(membersUrl, memberData);
        setCached(invitesUrl, inviteData);
        seedFormFromTrip(tripData);
        setMessage(null);
      })
      .catch((err: Error) => {
        if (!active) return;
        if (!cachedTrip) setMessage({ type: 'error', text: err.message || 'Unable to load trip settings.' });
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
      quality: 0.92,
    });

    if (!result.canceled && result.assets[0]) {
      setImageUrl(result.assets[0].uri);
    }
  }

  async function handleSave(): Promise<boolean> {
    if (!trip) return false;

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
          countries: tripCountries,
          startDate,
          endDate,
          imageUrl: uploadedImageUrl,
          clearImage: !uploadedImageUrl,
          membersCanEdit,
        }),
      });

      if (!response.ok) {
        throw new Error((await response.text()) || 'Unable to save trip settings.');
      }

      invalidateTripCache(id);
      setMessage({ type: 'success', text: 'Trip settings updated.' });
      loadTrip();
      return true;
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Unable to save trip settings.' });
      return false;
    } finally {
      setSaving(false);
    }
  }

  const unsaved = useUnsavedChanges({
    isDirty,
    onSave: async () => await handleSave(),
  });

  // Save button: persist, then leave the edit screen straight to the adventure.
  async function handleSaveAndExit() {
    const ok = await handleSave();
    if (!ok) return;
    unsaved.markSaved(); // tell the guard this nav is intentional
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(`/trip/${id}`);
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
      const response = await apiFetch(`/api/trips/${encodeURIComponent(id)}/members/${encodeURIComponent(memberId)}`, { method: 'DELETE' });
      if (!response.ok) {
        throw new Error((await response.text()) || 'Unable to remove member.');
      }
      invalidateTripCache(id);
      setMembers((current) => current.filter((member) => member.id !== memberId));
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Unable to remove member.' });
    }
  }

  async function removeInvite(inviteId: string) {
    try {
      const response = await apiFetch(`/api/trips/${encodeURIComponent(id)}/invites/${encodeURIComponent(inviteId)}`, { method: 'DELETE' });
      if (!response.ok) {
        throw new Error((await response.text()) || 'Unable to remove invite.');
      }
      invalidateTripCache(id);
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

      invalidateTripCache(id);
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
      invalidateTripCache(id);
      router.replace('/(tabs)');
    } catch {
      setMessage({ type: 'error', text: 'Unable to leave this adventure.' });
    } finally {
      setLeaving(false);
    }
  }

  async function handleDeleteTrip() {
    setDeletingTrip(true);
    try {
      const response = await apiFetch(`/api/trips/${id}`, { method: 'DELETE' });
      if (!response.ok) {
        const text = await response.text();
        setMessage({ type: 'error', text: text || 'Unable to delete this adventure.' });
        return;
      }
      invalidateTripCache(id);
      router.replace('/(tabs)');
    } catch {
      setMessage({ type: 'error', text: 'Unable to delete this adventure.' });
    } finally {
      setDeletingTrip(false);
    }
  }

  async function handleCopyInviteCode() {
    if (!trip?.inviteCode) return;
    await Clipboard.setStringAsync(trip.inviteCode);
    setInviteMessage(t('trip.success.codeCopied', { code: trip.inviteCode }));
    setTimeout(() => setInviteMessage(''), 2500);
  }

  async function handleShareInvite() {
    if (!trip?.inviteCode) return;
    const shareTitle = trip.title ?? t('home.defaultTripName');
    // Same shape as the trip screen's share: localized message with the
    // HTTPS invite link inside it (Android ignores the separate `url` field,
    // and the old cover-image `url` opened as a bare JPEG for recipients).
    // The invite code lives in the link, not the text.
    const inviteUrl = `https://sidequesttravel.app/invite/${trip.inviteCode}`;
    await Share.share({
      title: t('trip.share.title', { title: shareTitle }),
      message: t('trip.share.message', { title: shareTitle, url: inviteUrl }),
    });
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView style={styles.screen} behavior="padding">
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[styles.content, { paddingTop: Math.max(insets.top, 18) + 4, paddingBottom: Math.max(insets.bottom, 24) + 40 }]}
          showsVerticalScrollIndicator={false}
          {...scrollViewProps}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.backButton} activeOpacity={0.88} onPress={unsaved.requestBack}>
              <Ionicons name="arrow-back" size={24} color="#11131a" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Trip settings</Text>
          </View>

          {loading ? (
            <View style={styles.centerState}>
              <ActivityIndicator color={theme.colors.primary} />
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
                <TextInput
                  ref={titleRef}
                  value={title}
                  onChangeText={setTitle}
                  keyboardAppearance={theme.keyboardAppearance}
                  placeholder="Trip title"
                  style={styles.input}
                  onFocus={onFocusField(titleRef)}
                  returnKeyType="next"
                  onSubmitEditing={() => destinationRef.current?.focus()}
                />
                <Text style={styles.label}>Destination</Text>
                <TextInput
                  ref={destinationRef}
                  value={destination}
                  onChangeText={setDestination}
                  keyboardAppearance={theme.keyboardAppearance}
                  placeholder="Destination"
                  style={styles.input}
                  onFocus={onFocusField(destinationRef)}
                  returnKeyType="done"
                  onSubmitEditing={() => Keyboard.dismiss()}
                />
                <Text style={styles.label}>Countries</Text>
                <CountryPicker value={tripCountries} onChange={setTripCountries} label="Select countries" />
                <Text style={styles.label}>Dates</Text>
                <TouchableOpacity style={styles.dateRangeCard} activeOpacity={0.9} onPress={() => setRangePickerOpen(true)}>
                  <View style={styles.dateRangeCopy}>
                    <Text style={styles.dateRangeEyebrow}>TRIP DATES</Text>
                    <Text style={styles.dateRangeValue}>{formatRangeDisplay(startDate, endDate)}</Text>
                    <Text style={styles.dateRangeHint}>Tap once and adjust the whole range in one calendar.</Text>
                  </View>
                  <View style={[styles.dateRangeIcon, { backgroundColor: theme.colors.primaryLight08 }]}>
                    <Ionicons name="calendar-outline" size={20} color={theme.colors.primary} />
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
                        <Ionicons name="close-circle-outline" size={22} color={theme.colors.error} />
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
                      <Text style={[styles.inviteCodePillText, { color: theme.colors.primary }]}>{trip?.inviteCode ?? '------'}</Text>
                    </View>
                  </View>
                  <View style={styles.inviteComposer}>
                    <TextInput
                      ref={inviteEmailRef}
                      value={inviteEmail}
                      onChangeText={setInviteEmail}
                      placeholder="friend@example.com"
                      placeholderTextColor={theme.isDark ? theme.colors.placeholderText : '#afb5bf'}
                      keyboardAppearance={theme.keyboardAppearance}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      style={styles.inviteInput}
                      onFocus={onFocusField(inviteEmailRef)}
                      returnKeyType="done"
                      onSubmitEditing={() => Keyboard.dismiss()}
                    />
                    <TouchableOpacity
                      activeOpacity={0.9}
                      style={[styles.inviteAddButton, { backgroundColor: theme.colors.primary }, inviteSubmitting ? styles.inviteAddButtonDisabled : null]}
                      disabled={inviteSubmitting}
                      onPress={() => void handleAddInvite()}>
                      <Text style={styles.inviteAddButtonText}>{inviteSubmitting ? 'Adding...' : 'Invite'}</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.inviteActions}>
                    <TouchableOpacity activeOpacity={0.9} style={styles.secondaryInviteButton} onPress={() => void handleCopyInviteCode()}>
                      <Ionicons name="copy-outline" size={16} color={theme.colors.primary} />
                      <Text style={[styles.secondaryInviteButtonText, { color: theme.colors.primary }]}>Copy code</Text>
                    </TouchableOpacity>
                    <TouchableOpacity activeOpacity={0.9} style={styles.secondaryInviteButton} onPress={() => void handleShareInvite()}>
                      <Ionicons name="share-social-outline" size={16} color={theme.colors.primary} />
                      <Text style={[styles.secondaryInviteButtonText, { color: theme.colors.primary }]}>Share</Text>
                    </TouchableOpacity>
                  </View>
                  {inviteMessage ? <Text style={styles.inviteMessage}>{inviteMessage}</Text> : null}
                </View>
              </View>

              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Permissions</Text>
                <View style={styles.permissionRow}>
                  <View style={styles.permissionCopy}>
                    <Text style={styles.permissionTitle}>Let members edit the plan</Text>
                    <Text style={styles.permissionSubtitle}>
                      {membersCanEdit
                        ? 'Members can add, edit and remove activities.'
                        : 'Only you can edit. Members can view but not change activities.'}
                    </Text>
                  </View>
                  <Switch
                    value={membersCanEdit}
                    onValueChange={setMembersCanEdit}
                    trackColor={{ false: theme.isDark ? theme.colors.textMuted : '#dfe3e8', true: theme.isDark ? theme.colors.primaryLight20 : theme.colors.primary }}
                    thumbColor="#fff"
                    ios_backgroundColor={theme.isDark ? theme.colors.textMuted : '#dfe3e8'}
                  />
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
                        <Ionicons name="close-circle-outline" size={22} color={theme.colors.error} />
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

              <TouchableOpacity activeOpacity={0.92} style={[styles.primaryButton, { backgroundColor: theme.colors.primary }, saving ? styles.primaryButtonDisabled : null]} disabled={saving} onPress={() => void handleSaveAndExit()}>
                <Text style={styles.primaryButtonText}>{saving ? 'Saving...' : 'Save trip settings'}</Text>
              </TouchableOpacity>

              <View style={styles.dangerCard}>
                <Text style={styles.dangerTitle}>Delete adventure</Text>
                <Text style={styles.dangerCopy}>
                  This permanently deletes the trip, its SideQuests and chat for everyone. This cannot be undone.
                </Text>
                {confirmingDelete ? (
                  <View style={styles.dangerConfirmRow}>
                    <TouchableOpacity activeOpacity={0.88} style={styles.dangerCancelButton} onPress={() => setConfirmingDelete(false)}>
                      <Text style={styles.dangerCancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      activeOpacity={0.88}
                      style={[styles.dangerConfirmButton, deletingTrip ? styles.dangerButtonDisabled : null]}
                      disabled={deletingTrip}
                      onPress={() => void handleDeleteTrip()}>
                      <Ionicons name="trash-outline" size={16} color="#fff" />
                      <Text style={styles.dangerConfirmText}>{deletingTrip ? 'Deleting...' : 'Yes, delete'}</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity activeOpacity={0.88} style={styles.dangerButton} onPress={() => setConfirmingDelete(true)}>
                    <Ionicons name="trash-outline" size={18} color={theme.colors.error} />
                    <Text style={styles.dangerButtonText}>Delete adventure</Text>
                  </TouchableOpacity>
                )}
              </View>
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
                    <Ionicons name="exit-outline" size={18} color={theme.colors.error} />
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
      </KeyboardAvoidingView>

      <UnsavedChangesModal
        visible={unsaved.modalOpen}
        busy={unsaved.busy || saving}
        hasSave={canManageTrip}
        onSave={unsaved.handleSave}
        onDiscard={unsaved.handleDiscard}
        onCancel={unsaved.handleCancel}
      />
    </>
  );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.bgPrimary },
  content: { paddingHorizontal: 22 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.isDark ? theme.colors.bgLight : '#f5f6f8',
  },
  headerTitle: { color: '#121317', fontSize: 24, fontWeight: '900', letterSpacing: -0.8 },
  centerState: { minHeight: 260, alignItems: 'center', justifyContent: 'center' },
  coverCard: { height: 210, borderRadius: 30, overflow: 'hidden', backgroundColor: theme.isDark ? theme.colors.bgLight : '#eef1f4', marginBottom: 18 },
  coverImage: { ...StyleSheet.absoluteFillObject },
  // On-photo scrim — intentional, identical in both themes.
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
    backgroundColor: theme.isDark ? theme.colors.backdropModal : 'rgba(18,22,29,0.48)',
  },
  coverBadgeText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  card: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: theme.isDark ? theme.colors.borderPrimary : '#eaedf2',
    backgroundColor: theme.colors.surface,
    padding: 18,
    marginBottom: 16,
  },
  label: { color: theme.isDark ? theme.colors.textPrimary : '#161821', fontSize: 15, fontWeight: '800', marginBottom: 8, marginTop: 4 },
  input: {
    minHeight: 54,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.isDark ? theme.colors.borderInput : '#e6e9ef',
    backgroundColor: theme.isDark ? theme.colors.bgLightest : '#f9fafc',
    paddingHorizontal: 16,
    marginBottom: 10,
    color: theme.isDark ? theme.colors.textPrimary : '#161821',
    fontSize: 16,
  },
  dateRangeCard: {
    marginTop: 4,
    minHeight: 96,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: theme.isDark ? theme.colors.borderInput : '#e6e9ef',
    backgroundColor: theme.isDark ? theme.colors.bgLightest : '#f9fafc',
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
    color: theme.isDark ? theme.colors.textMeta : '#868d99',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  dateRangeValue: {
    marginTop: 8,
    color: theme.isDark ? theme.colors.textPrimary : '#161821',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  dateRangeHint: {
    marginTop: 6,
    color: theme.isDark ? theme.colors.textMeta : '#7d8491',
    fontSize: 13,
    lineHeight: 19,
  },
  dateRangeIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.isDark ? theme.colors.primaryLight08 : '#fff1f5',
    borderWidth: 1,
    borderColor: theme.isDark ? theme.colors.primaryLight20 : '#ffd8e2',
    marginLeft: 12,
  },
  sectionTitle: { color: theme.isDark ? theme.colors.textPrimary : '#161821', fontSize: 18, fontWeight: '900', marginBottom: 6 },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f2f5',
  },
  listCopy: { flex: 1, paddingRight: 12 },
  listTitle: { color: theme.isDark ? theme.colors.textPrimary : '#161821', fontSize: 15, fontWeight: '700' },
  listMeta: { marginTop: 2, color: theme.isDark ? theme.colors.textMeta : '#7d8491', fontSize: 13 },
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
    color: theme.isDark ? theme.colors.textPrimary : '#161821',
    fontSize: 16,
    fontWeight: '900',
  },
  inviteSubtitle: {
    marginTop: 4,
    maxWidth: 220,
    color: theme.isDark ? theme.colors.textMeta : '#7d8491',
    fontSize: 13,
    lineHeight: 19,
  },
  inviteCodePill: {
    borderRadius: 999,
    backgroundColor: theme.isDark ? theme.colors.primaryLight08 : '#fff3f6',
    borderWidth: 1,
    borderColor: theme.isDark ? theme.colors.errorBorder : '#ffd4de',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  inviteCodePillText: {
    color: theme.colors.primary,
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
    borderColor: theme.isDark ? theme.colors.borderInput : '#e6e9ef',
    backgroundColor: theme.isDark ? theme.colors.bgLightest : '#f9fafc',
    paddingHorizontal: 16,
    color: theme.isDark ? theme.colors.textPrimary : '#161821',
    fontSize: 15,
  },
  inviteAddButton: {
    minHeight: 54,
    borderRadius: 18,
    backgroundColor: theme.colors.primary,
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
    borderColor: theme.isDark ? theme.colors.errorBorder : '#ffd4de',
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  secondaryInviteButtonText: {
    color: theme.colors.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  inviteMessage: {
    marginTop: 12,
    color: theme.colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  emptyText: { color: theme.isDark ? theme.colors.textMeta : '#7d8491', fontSize: 14, marginTop: 6 },
  permissionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
    marginTop: 6,
  },
  permissionCopy: { flex: 1 },
  permissionTitle: { color: theme.isDark ? theme.colors.textPrimary : '#161821', fontSize: 15, fontWeight: '700' },
  permissionSubtitle: { marginTop: 4, color: theme.isDark ? theme.colors.textMeta : '#7d8491', fontSize: 13, lineHeight: 19 },
  messageBanner: {
    marginTop: 4,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  messageBannerSuccess: { backgroundColor: theme.isDark ? theme.colors.successLight : '#e9f8f1', borderWidth: 1, borderColor: theme.isDark ? theme.colors.successBorder : '#bfe9d2' },
  messageBannerError: { backgroundColor: theme.isDark ? theme.colors.errorLight : '#ffefeb', borderWidth: 1, borderColor: theme.isDark ? theme.colors.errorBorder : '#ffd0c3' },
  messageText: { fontSize: 14, fontWeight: '600' },
  messageTextSuccess: { color: '#16734d' },
  messageTextError: { color: theme.isDark ? theme.colors.error : '#a52617' },
  primaryButton: {
    marginTop: 16,
    minHeight: 64,
    borderRadius: 999,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  primaryButtonDisabled: { opacity: 0.7 },
  primaryButtonText: { color: '#fff', fontSize: 18, fontWeight: '900' },
  readOnlyLabel: { color: theme.isDark ? theme.colors.textMeta : '#868d99', fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 4 },
  readOnlyValue: { color: theme.isDark ? theme.colors.textPrimary : '#161821', fontSize: 16, fontWeight: '700', marginTop: 4, marginBottom: 4 },
  readOnlyDivider: { height: 1, backgroundColor: theme.isDark ? theme.colors.bgLight : '#f0f2f5', marginVertical: 10 },
  dangerCard: {
    marginTop: 16,
    marginBottom: 20,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: theme.isDark ? theme.colors.errorBorder : '#ffd0c3',
    backgroundColor: theme.isDark ? theme.colors.errorLight : '#fff9f8',
    padding: 18,
  },
  dangerTitle: { color: theme.isDark ? theme.colors.error : '#a52617', fontSize: 16, fontWeight: '900', marginBottom: 6 },
  dangerCopy: { color: theme.isDark ? theme.colors.error : '#7d4238', fontSize: 14, lineHeight: 20, marginBottom: 16 },
  dangerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 52,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: theme.isDark ? theme.colors.errorBorder : '#f0b0a0',
    backgroundColor: theme.colors.surface,
  },
  dangerButtonDisabled: { opacity: 0.6 },
  dangerButtonText: { color: theme.colors.error, fontSize: 15, fontWeight: '800' },
  dangerConfirmRow: { flexDirection: 'row', gap: 10 },
  dangerCancelButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.isDark ? theme.colors.borderInput : '#dde0e6',
    backgroundColor: theme.colors.surface,
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
    backgroundColor: theme.colors.error,
  },
  dangerConfirmText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
