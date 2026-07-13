import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Easing, Image, Keyboard, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ActivityImageFallback from '@/components/activity-image-fallback';
import Avatar from '@/components/avatar';
import { useAuth } from '@/components/auth-provider';
import { useI18n, type AppLanguage } from '@/components/i18n-provider';
import LanguagePicker from '@/components/language-picker';
import TabHeader from '@/components/tab-header';
import { apiFetch, apiJson } from '@/lib/api';
import { getDefaultNotificationPreferences, loadNotificationPreferences, saveNotificationPreferences, type NotificationPreferences } from '@/lib/social';
import { disablePushNotifications, getCurrentPermissionStatus, maybeRequestPushPermission } from '@/lib/push-notifications';
import { supabase } from '@/lib/supabase';
import type { Quest } from '@/lib/types';
import { COLORS, SHADOWS, SPACING, RADIUS, TYPOGRAPHY } from '@/constants/design-tokens';

export default function ProfileScreen() {
  const { user, signOut, refreshProfile, deleteAccount } = useAuth();
  const { language, setLanguage, t } = useI18n();
  const insets = useSafeAreaInsets();
  // See Home's app/(tabs)/index.tsx for why this is measured — the header
  // floats on top of the ScrollView, so its rendered height (not a guess)
  // is what tells the ScrollView how much paddingTop clears it at rest.
  const [headerHeight, setHeaderHeight] = useState(0);
  const headerTop = Math.max(insets.top, 16) + 8;
  const headerClearance = headerTop + (headerHeight || 76) + 14;
  const [joinedTrips, setJoinedTrips] = useState(0);
  const [createdQuests, setCreatedQuests] = useState(0);
  const [tripDerivedVisited, setTripDerivedVisited] = useState<Record<string, string>>({});
  const [trips, setTrips] = useState<Quest[]>([]);
  const [manualStatusMap, setManualStatusMap] = useState<Record<string, string>>({});
  const [name, setName] = useState(user?.name ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [selectedLanguage, setSelectedLanguage] = useState<AppLanguage>(language);
  const [newPassword, setNewPassword] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [editingBio, setEditingBio] = useState(false);
  const [editingPassword, setEditingPassword] = useState(false);
  const [editingLanguage, setEditingLanguage] = useState(false);
  const [editingNotifications, setEditingNotifications] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences>(getDefaultNotificationPreferences());
  const [osPermissionDenied, setOsPermissionDenied] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState<'name' | 'bio' | 'password' | 'avatar' | 'language' | 'delete' | 'pushTest' | null>(null);
  const [pushTestResult, setPushTestResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [blockedUsersOpen, setBlockedUsersOpen] = useState(false);
  const [blockedUsers, setBlockedUsers] = useState<{ id: string; name: string; avatarUrl: string | null }[]>([]);
  const [blockedUsersLoading, setBlockedUsersLoading] = useState(false);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);

  useEffect(() => {
    setName(user?.name ?? '');
  }, [user?.name]);

  useEffect(() => {
    setBio(user?.bio ?? '');
  }, [user?.bio]);

  useEffect(() => {
    setSelectedLanguage(language);
  }, [language]);

  useEffect(() => {
    let active = true;

    if (!user?.id) {
      setJoinedTrips(0);
      setCreatedQuests(0);
      return () => {
        active = false;
      };
    }

    void apiJson<Quest[]>('/api/trips')
      .then((quests) => {
        if (!active) return;

        const safeQuests = Array.isArray(quests) ? quests : [];
        setTrips(safeQuests);
        setJoinedTrips(safeQuests.length);
        setCreatedQuests(safeQuests.filter((quest) => quest.ownerId === user?.id).length);

        const today = new Date().toISOString().slice(0, 10);
        const derived: Record<string, string> = {};
        for (const quest of safeQuests) {
          if (!quest.countries?.length) continue;
          const status = quest.endDate < today ? 'visited' : 'planned';
          for (const code of quest.countries) {
            if (!derived[code] || (derived[code] === 'planned' && status === 'visited')) {
              derived[code] = status;
            }
          }
        }
        setTripDerivedVisited(derived);
      })
      .catch((err: unknown) => {
        if (!active) return;
        console.warn('[PROFILE] Failed to load trips for stats:', err instanceof Error ? err.message : err);
        setJoinedTrips(0);
        setCreatedQuests(0);
      });

    return () => {
      active = false;
    };
  }, [user?.id]);

  useEffect(() => {
    void AsyncStorage.getItem('travel_tracker_status_map')
      .then((raw) => { if (raw) setManualStatusMap(JSON.parse(raw) as Record<string, string>); })
      .catch((err: unknown) => {
        console.warn('[PROFILE] Failed to load travel status from storage:', err instanceof Error ? err.message : err);
      });
  }, []);

  const visitedCountries = useMemo(() => {
    const merged = { ...tripDerivedVisited, ...manualStatusMap };
    // 'living' counts as visited — same rule as the travel tracker's hero
    // stat, so the two screens always show the same number.
    return Object.values(merged).filter((s) => s === 'visited' || s === 'living').length;
  }, [tripDerivedVisited, manualStatusMap]);

  const previousTrips = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return trips
      .filter((trip) => trip.endDate < today)
      .sort((a, b) => b.endDate.localeCompare(a.endDate));
  }, [trips]);

  useEffect(() => {
    let active = true;

    void loadNotificationPreferences().then((prefs) => {
      if (!active) return;
      setNotificationPreferences(prefs);
    });

    void getCurrentPermissionStatus().then((status) => {
      if (!active) return;
      setOsPermissionDenied(status === 'denied');
    });

    return () => {
      active = false;
    };
  }, []);

  const initials = useMemo(() => getInitials(user?.name), [user?.name]);

  // ──────────────────────────────────────────────────────────────────────────
  // Fake shared-element transition for the small header avatar → hero avatar.
  //
  // Timeline (replays each time Profile gets focus):
  //   t=0 ms      header avatar starts shrinking + fading      (200 ms)
  //   t=0 ms      bell starts sliding right into avatar slot   (250 ms, ease-out)
  //   t=100 ms    hero avatar starts popping in                (290 ms, ease-out)
  //
  // The bell's translateX equals the avatar's flex slot width: gap(10) + 56 =
  // 66 px. At end the bell visually sits at the right padding edge — exactly
  // where the small avatar used to be.
  // ──────────────────────────────────────────────────────────────────────────
  const headerAvatarScale = useRef(new Animated.Value(1)).current;
  const headerAvatarOpacity = useRef(new Animated.Value(1)).current;
  const bellTranslateX = useRef(new Animated.Value(0)).current;
  const heroOpacity = useRef(new Animated.Value(0)).current;
  const heroScale = useRef(new Animated.Value(0.75)).current;
  const heroTranslateY = useRef(new Animated.Value(12)).current;

  useFocusEffect(
    useCallback(() => {
      // Reset to start state so navigating away and back replays the animation.
      headerAvatarScale.setValue(1);
      headerAvatarOpacity.setValue(1);
      bellTranslateX.setValue(0);
      heroOpacity.setValue(0);
      heroScale.setValue(0.75);
      heroTranslateY.setValue(12);

      Animated.parallel([
        // Header avatar shrinks + fades (the "sinks into a hole" moment).
        Animated.timing(headerAvatarScale, {
          toValue: 0.15,
          duration: 200,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(headerAvatarOpacity, {
          toValue: 0,
          duration: 200,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),

        // Bell slides 66 px right into the avatar slot.
        Animated.timing(bellTranslateX, {
          toValue: 66,
          duration: 250,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),

        // Hero avatar pops in, slightly delayed so the small avatar has time
        // to start shrinking first.
        Animated.timing(heroOpacity, {
          toValue: 1,
          delay: 100,
          duration: 290,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(heroScale, {
          toValue: 1,
          delay: 100,
          duration: 290,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(heroTranslateY, {
          toValue: 0,
          delay: 100,
          duration: 290,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    }, [headerAvatarScale, headerAvatarOpacity, bellTranslateX, heroOpacity, heroScale, heroTranslateY]),
  );

  const bellAnimatedStyle = useMemo(
    () => ({ transform: [{ translateX: bellTranslateX }] }),
    [bellTranslateX],
  );
  const headerAvatarAnimatedStyle = useMemo(
    () => ({
      opacity: headerAvatarOpacity,
      transform: [{ scale: headerAvatarScale }],
    }),
    [headerAvatarOpacity, headerAvatarScale],
  );

  async function handleTogglePush(value: boolean) {
    const next = { ...notificationPreferences, pushEnabled: value };
    setNotificationPreferences(next);
    await saveNotificationPreferences(next);

    // This is the only real lever here: ON registers (or requests
    // permission for) this device's push token; OFF deactivates it
    // server-side. There's no per-category filtering on the backend yet, so
    // we don't expose toggles that wouldn't actually change anything.
    if (value) {
      // force: an explicit toggle should re-show the OS dialog whenever the
      // system still allows it — the contextual one-shot flag must not
      // block a deliberate user action.
      const outcome = await maybeRequestPushPermission({ force: true });
      if (outcome === 'blocked') {
        // Locked at the OS level — only the system settings can enable it.
        Alert.alert(
          t('profile.notifications.osBlockedTitle'),
          t('profile.notifications.osBlockedBody'),
          [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('profile.notifications.openSettings'), onPress: () => void Linking.openSettings() },
          ],
        );
      }
    } else {
      await disablePushNotifications();
    }
    setOsPermissionDenied((await getCurrentPermissionStatus()) === 'denied');
  }

  // Sends a push straight to this account's own registered token(s),
  // bypassing Push:Enabled and the recipient/dedupe machinery entirely —
  // the one true "does delivery work end-to-end" check. See backend
  // POST /api/push-tokens/test-send.
  async function handleSendTestPush() {
    try {
      setBusy('pushTest');
      setPushTestResult(null);
      await apiJson('/api/push-tokens/test-send', { method: 'POST' });
      setPushTestResult({ type: 'success', text: t('profile.notifications.testSendSuccess') });
    } catch (error) {
      setPushTestResult({
        type: 'error',
        text: error instanceof Error && error.message ? error.message : t('profile.notifications.testSendFailed'),
      });
    } finally {
      setBusy(null);
    }
  }

  async function handleNameSave() {
    try {
      setBusy('name');
      setMessage(null);

      const trimmedName = name.trim();
      if (!trimmedName) {
        throw new Error(t('profile.errors.nameCannotBeEmpty'));
      }

      const { error: authError } = await supabase.auth.updateUser({
        data: { name: trimmedName },
      });

      if (authError) {
        throw authError;
      }

      const response = await apiFetch('/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmedName }),
      });

      if (!response.ok) {
        throw new Error((await response.text()) || t('profile.errors.couldNotSaveName'));
      }

      await refreshProfile();
      setEditingName(false);
      setMessage({ type: 'success', text: t('profile.success.nameUpdated') });
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : t('profile.errors.couldNotUpdateName') });
    } finally {
      setBusy(null);
    }
  }

  async function handleBioSave() {
    try {
      setBusy('bio');
      setMessage(null);

      const response = await apiFetch('/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bio: bio.trim() }),
      });

      if (!response.ok) {
        throw new Error((await response.text()) || t('profile.errors.couldNotSaveBio'));
      }

      await refreshProfile();
      setEditingBio(false);
      setMessage({ type: 'success', text: t('profile.success.bioUpdated') });
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : t('profile.errors.couldNotUpdateBio') });
    } finally {
      setBusy(null);
    }
  }

  async function handlePasswordSave() {
    try {
      setBusy('password');
      setMessage(null);

      if (newPassword.trim().length < 6) {
        throw new Error(t('profile.password.tooShort'));
      }

      const { error } = await supabase.auth.updateUser({
        password: newPassword.trim(),
      });

      if (error) {
        throw error;
      }

      setNewPassword('');
      setEditingPassword(false);
      setMessage({ type: 'success', text: t('profile.success.passwordUpdated') });
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : t('profile.errors.couldNotUpdatePassword') });
    } finally {
      setBusy(null);
    }
  }

  async function handleAvatarPick() {
    try {
      setBusy('avatar');
      setMessage(null);

      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        throw new Error(t('profile.errors.photoAccessDenied'));
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });

      if (result.canceled || !result.assets[0]) {
        return;
      }

      const asset = result.assets[0];
      const formData = new FormData();
      formData.append(
        'file',
        {
          uri: asset.uri,
          name: asset.fileName ?? `avatar-${Date.now()}.jpg`,
          type: asset.mimeType ?? 'image/jpeg',
        } as any,
      );

      const uploadResponse = await apiFetch('/api/images/upload', {
        method: 'POST',
        signal: createTimeoutSignal(20000),
        body: formData,
      });

      if (!uploadResponse.ok) {
        throw new Error((await uploadResponse.text()) || t('profile.errors.couldNotUploadImage'));
      }

      const uploadData = (await uploadResponse.json()) as { url: string };

      const profileResponse = await apiFetch('/api/auth/profile', {
        method: 'PATCH',
        signal: createTimeoutSignal(12000),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatarUrl: uploadData.url }),
      });

      if (!profileResponse.ok) {
        throw new Error((await profileResponse.text()) || t('profile.errors.couldNotSaveAvatar'));
      }

      void supabase.auth.updateUser({
        data: {
          avatar_url: uploadData.url,
        },
      });

      await refreshProfile();
      setMessage({ type: 'success', text: t('profile.success.imageUpdated') });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        setMessage({ type: 'error', text: t('profile.errors.uploadTimeout') });
      } else {
        setMessage({ type: 'error', text: error instanceof Error ? error.message : t('profile.errors.couldNotUpdateImage') });
      }
    } finally {
      setBusy(null);
    }
  }

  async function handleLanguageSave() {
    try {
      setBusy('language');
      setMessage(null);

      await setLanguage(selectedLanguage);
      const { error } = await supabase.auth.updateUser({
        data: { language: selectedLanguage },
      });
      if (error) throw error;

      await refreshProfile();
      setEditingLanguage(false);
      setMessage({ type: 'success', text: t('profile.success.languageUpdated') });
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : t('profile.errors.couldNotUpdateLanguage') });
    } finally {
      setBusy(null);
    }
  }


  function handleDeleteAccount() {
    setDeleteConfirmOpen(true);
  }

  async function loadBlockedUsers() {
    setBlockedUsersLoading(true);
    try {
      const data = await apiJson<{ id: string; name: string; avatarUrl: string | null }[]>('/api/users/blocked');
      setBlockedUsers(data);
    } catch {
      setBlockedUsers([]);
    } finally {
      setBlockedUsersLoading(false);
    }
  }

  async function handleUnblock(targetId: string) {
    setUnblockingId(targetId);
    try {
      await apiFetch(`/api/users/${targetId}/block`, { method: 'DELETE' });
      setBlockedUsers((prev) => prev.filter((u) => u.id !== targetId));
    } catch {
      // silent — list stays unchanged
    } finally {
      setUnblockingId(null);
    }
  }

  async function handleDeleteAccountConfirmed() {
    try {
      setBusy('delete');
      setMessage(null);
      await deleteAccount();
      router.replace('/(auth)/login');
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : t('profile.errors.couldNotDeleteAccount') });
    } finally {
      setBusy(null);
      setDeleteConfirmOpen(false);
    }
  }


  return (
    <View style={{ flex: 1, backgroundColor: COLORS.white }}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[
          styles.content,
          { paddingTop: headerClearance, paddingBottom: Math.max(insets.bottom, 20) + 112 },
        ]}
        showsVerticalScrollIndicator={false}>

      <View style={styles.avatarSection}>
        <Animated.View
          style={[
            styles.avatarRing,
            { borderColor: COLORS.primary },
            {
              opacity: heroOpacity,
              transform: [
                { scale: heroScale },
                { translateY: heroTranslateY },
              ],
            },
          ]}>
          {user?.avatarUrl ? (
            <Image source={{ uri: user.avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={styles.avatar}>
              <Text style={styles.avatarInitials}>{initials}</Text>
            </View>
          )}
        </Animated.View>

        <TouchableOpacity style={[styles.editAvatarButton, { backgroundColor: COLORS.secondary, shadowColor: COLORS.secondary }]} activeOpacity={0.85} onPress={() => void handleAvatarPick()}>
          {busy === 'avatar' ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="create-outline" size={18} color="#fff" />}
        </TouchableOpacity>

        <Text style={styles.name}>{user?.name ?? t('profile.defaultName')}</Text>
        <Text style={styles.email}>{user?.email ?? 'user@sidequest.app'}</Text>
        {user?.bio ? <Text style={styles.bioText}>{user.bio}</Text> : null}
        <View style={styles.statsBadgeRow}>
          <View style={styles.statsBadge}>
            <View style={[styles.statsBadgeIcon, { backgroundColor: COLORS.secondary }]}>
              <Ionicons name="airplane" size={11} color={COLORS.white} />
            </View>
            <Text style={styles.statsBadgeValue}>{joinedTrips}</Text>
            <Text style={styles.statsBadgeLabel}>{t('profile.statsBadge.trips')}</Text>
          </View>
          <View style={styles.statsBadge}>
            <View style={[styles.statsBadgeIcon, { backgroundColor: COLORS.primary }]}>
              <Ionicons name="sparkles" size={11} color={COLORS.white} />
            </View>
            <Text style={styles.statsBadgeValue}>{createdQuests}</Text>
            <Text style={styles.statsBadgeLabel}>{t('profile.statsBadge.sidequests')}</Text>
          </View>
          <View style={styles.statsBadge}>
            <View style={[styles.statsBadgeIcon, { backgroundColor: COLORS.secondary }]}>
              <Ionicons name="earth" size={11} color={COLORS.white} />
            </View>
            <Text style={styles.statsBadgeValue}>{visitedCountries}</Text>
            <Text style={styles.statsBadgeLabel}>{t('profile.statsBadge.countries')}</Text>
          </View>
        </View>
        {message ? (
          <View style={[styles.messageBanner, message.type === 'success' ? styles.messageBannerSuccess : styles.messageBannerError]}>
            <Ionicons
              name={message.type === 'success' ? 'checkmark-circle' : 'alert-circle'}
              size={18}
              color={message.type === 'success' ? '#0b9b72' : COLORS.error}
            />
            <Text style={[styles.messageText, message.type === 'success' ? styles.messageTextSuccess : styles.messageTextError]}>
              {message.text}
            </Text>
          </View>
        ) : null}
      </View>

      {/* PREVIOUS ADVENTURES — Home Up Next-style content carousel */}
      <View style={styles.adventureHeader}>
        <Text style={styles.adventureEyebrow}>{t('profile.previousAdventures.heading')}</Text>
        <View style={styles.adventureLine} />
        {previousTrips.length > 0 ? (
          <TouchableOpacity activeOpacity={0.7} onPress={() => router.push('/previous-adventures')}>
            <Text style={styles.adventureSeeAll}>{t('home.see_all')}</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {previousTrips.length === 0 ? (
        <View style={styles.adventureEmpty}>
          <Ionicons name="compass-outline" size={20} color={COLORS.textMuted} />
          <Text style={styles.adventureEmptyText}>{t('profile.previousAdventures.empty')}</Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.adventureScroll}
          contentContainerStyle={styles.adventureScrollContent}>
          {previousTrips.slice(0, 8).map((trip) => (
            <TouchableOpacity
              key={trip.id}
              activeOpacity={0.88}
              onPress={() => router.push(`/trip/${trip.id}`)}
              style={styles.adventureCard}>
              <View style={styles.adventureImageBox}>
                {trip.imageUrl ? (
                  <Image source={{ uri: trip.imageUrl }} style={styles.adventureImage} resizeMode="cover" />
                ) : (
                  <ActivityImageFallback category={null} size="medium" style={styles.adventureFallback} />
                )}
              </View>
              <View style={styles.adventureBody}>
                <Text style={styles.adventureCardDate} numberOfLines={1}>
                  {formatAdventureDate(trip.endDate)}
                </Text>
                <Text style={styles.adventureCardTitle} numberOfLines={1}>{trip.title ?? 'Trip'}</Text>
                {trip.destination ? (
                  <Text style={styles.adventureCardMeta} numberOfLines={1}>{trip.destination}</Text>
                ) : null}
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <SectionCard
        title={t('profile.sections.explore')}
        items={[
          { icon: 'earth-outline', label: t('profile.explore.travelTracker'), accent: COLORS.secondary, onPress: () => router.push('/travel-tracker') },
        ]}
      />

      <SectionCard
        title={t('profile.sections.preferences')}
        items={[
          { icon: 'person-circle-outline', label: t('profile.editProfile.changeName'), accent: COLORS.primary, onPress: () => setEditingName(true) },
          { icon: 'text-outline', label: t('profile.editProfile.editBio'), accent: COLORS.primary, onPress: () => setEditingBio(true) },
          { icon: 'camera-outline', label: busy === 'avatar' ? t('profile.editProfile.uploading') : t('profile.editProfile.changeImage'), accent: COLORS.primary, onPress: () => void handleAvatarPick() },
          { icon: 'notifications-outline', label: t('profile.notifications.title'), accent: COLORS.primary, onPress: () => { setPushTestResult(null); setEditingNotifications(true); } },
          { icon: 'lock-closed-outline', label: t('profile.accountSettings.changePassword'), accent: COLORS.secondary, onPress: () => setEditingPassword(true) },
          { icon: 'language-outline', label: t('profile.accountSettings.changeLanguage'), accent: COLORS.secondary, onPress: () => setEditingLanguage(true) },
          { icon: 'ban-outline', label: t('profile.blockedUsers.title'), accent: COLORS.secondary, onPress: () => { void loadBlockedUsers(); setBlockedUsersOpen(true); } },
        ]}
      />

      <Modal visible={editingName} transparent animationType="fade" onRequestClose={() => setEditingName(false)}>
        <KeyboardAvoidingView style={styles.confirmBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={() => setEditingName(false)} />
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>{t('profile.modals.changeName')}</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder={t('profile.editProfile.displayNamePlaceholder')}
              style={[styles.input, { marginTop: 16 }]}
              returnKeyType="done"
              onSubmitEditing={() => Keyboard.dismiss()}
            />
            <View style={styles.confirmActions}>
              <TouchableOpacity style={styles.confirmCancel} activeOpacity={0.88} onPress={() => setEditingName(false)}>
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </TouchableOpacity>
              <Pressable style={[styles.confirmDelete, { backgroundColor: COLORS.primary }]} onPress={() => void handleNameSave()} disabled={busy === 'name'}>
                {busy === 'name' ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmDeleteText}>{t('profile.modals.saveNameButton')}</Text>}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={editingBio} transparent animationType="fade" onRequestClose={() => setEditingBio(false)}>
        <KeyboardAvoidingView style={styles.confirmBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={() => setEditingBio(false)} />
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>{t('profile.modals.editBio')}</Text>
            <TextInput
              value={bio}
              onChangeText={setBio}
              placeholder={t('profile.editProfile.bioPlaceholder')}
              style={[styles.bioInput, { marginTop: 16 }]}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
            <View style={styles.confirmActions}>
              <TouchableOpacity style={styles.confirmCancel} activeOpacity={0.88} onPress={() => setEditingBio(false)}>
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </TouchableOpacity>
              <Pressable style={[styles.confirmDelete, { backgroundColor: COLORS.primary }]} onPress={() => void handleBioSave()} disabled={busy === 'bio'}>
                {busy === 'bio' ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmDeleteText}>{t('profile.modals.saveBioButton')}</Text>}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>


      <Modal visible={blockedUsersOpen} transparent animationType="slide" onRequestClose={() => setBlockedUsersOpen(false)}>
        <View style={styles.blockedUsersBackdrop}>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={() => setBlockedUsersOpen(false)} />
          <View style={styles.blockedUsersSheet}>
            <View style={styles.blockedUsersHandle} />
            <View style={styles.blockedUsersHeader}>
              <Text style={styles.blockedUsersTitle}>{t('profile.blockedUsers.title')}</Text>
              <TouchableOpacity onPress={() => setBlockedUsersOpen(false)} hitSlop={10}>
                <Ionicons name="close" size={22} color="#14161d" />
              </TouchableOpacity>
            </View>
            {blockedUsersLoading ? (
              <ActivityIndicator style={{ marginTop: 40 }} color={COLORS.primary} />
            ) : blockedUsers.length === 0 ? (
              <Text style={styles.blockedUsersEmpty}>{t('profile.blockedUsers.empty')}</Text>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 20) + 12 }}>
                {blockedUsers.map((u) => (
                  <View key={u.id} style={styles.blockedUserRow}>
                    <Avatar
                      uri={u.avatarUrl}
                      name={u.name}
                      fallbackText={u.name.slice(0, 2).toUpperCase()}
                      size={42}
                      fallbackBackgroundColor="#1d212a"
                      fallbackTextColor="#fff"
                    />
                    <Text style={styles.blockedUserName} numberOfLines={1}>{u.name}</Text>
                    <TouchableOpacity
                      style={styles.unblockButton}
                      activeOpacity={0.8}
                      disabled={unblockingId === u.id}
                      onPress={() => void handleUnblock(u.id)}>
                      {unblockingId === u.id
                        ? <ActivityIndicator size="small" color={COLORS.primary} />
                        : <Text style={styles.unblockButtonText}>{t('profile.blockedUsers.unblock')}</Text>
                      }
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <SectionCard
        title={t('profile.sections.supportLegal')}
        items={[
          {
            icon: 'people-outline',
            label: t('profile.support.communityGuidelines'),
            accent: COLORS.secondary,
            onPress: () => void WebBrowser.openBrowserAsync(`https://sidequesttravel.app/community-guidelines?lang=${language}`),
          },
          {
            icon: 'mail-outline',
            label: t('profile.support.contactSupport'),
            accent: COLORS.secondary,
            onPress: () => router.push('/support' as never),
          },
          {
            icon: 'shield-checkmark-outline',
            label: t('profile.support.privacyPolicy'),
            accent: COLORS.secondary,
            onPress: () => void WebBrowser.openBrowserAsync(`https://sidequesttravel.app/privacy?lang=${language}`),
          },
          {
            icon: 'document-text-outline',
            label: t('profile.support.termsOfService'),
            accent: COLORS.secondary,
            onPress: () => void WebBrowser.openBrowserAsync(`https://sidequesttravel.app/terms?lang=${language}`),
          },
        ]}
      />
      <Text style={styles.moderationNotice}>{t('profile.support.moderation')}</Text>

      {user?.role === 'admin' ? (
        <SectionCard
          title="Admin"
          items={[
            {
              icon: 'shield-checkmark-outline',
              label: 'Moderation',
              accent: '#d53d18',
              onPress: () => router.push('/admin/moderation' as never),
            },
          ]}
        />
      ) : null}

      <SectionCard
        title={t('profile.sections.account')}
        items={[
          {
            icon: 'log-out-outline',
            label: t('profile.accountSettings.logout'),
            accent: COLORS.primary,
            onPress: () => {
              void signOut().then(() => router.replace('/(auth)/login'));
            },
          },
          {
            icon: 'trash-outline',
            label: busy === 'delete' ? t('profile.accountSettings.deleting') : t('profile.accountSettings.deleteAccount'),
            accent: COLORS.error,
            onPress: handleDeleteAccount,
          },
        ]}
      />

      <Modal visible={editingPassword} transparent animationType="fade" onRequestClose={() => setEditingPassword(false)}>
        <KeyboardAvoidingView style={styles.confirmBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={() => setEditingPassword(false)} />
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>{t('profile.modals.changePassword')}</Text>
            <TextInput
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder={t('profile.password.newPasswordPlaceholder')}
              secureTextEntry
              style={[styles.input, { marginTop: 16 }]}
              returnKeyType="done"
              onSubmitEditing={() => Keyboard.dismiss()}
            />
            <Text style={[styles.helperText, { marginTop: 12 }]}>{t('profile.password.hint')}</Text>
            <View style={styles.confirmActions}>
              <TouchableOpacity style={styles.confirmCancel} activeOpacity={0.88} onPress={() => setEditingPassword(false)}>
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </TouchableOpacity>
              <Pressable style={[styles.confirmDelete, { backgroundColor: COLORS.primary }]} onPress={() => void handlePasswordSave()} disabled={busy === 'password'}>
                {busy === 'password' ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmDeleteText}>{t('profile.modals.updatePasswordButton')}</Text>}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={editingLanguage} transparent animationType="fade" onRequestClose={() => setEditingLanguage(false)}>
        <KeyboardAvoidingView style={styles.confirmBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={() => setEditingLanguage(false)} />
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>{t('profile.modals.changeLanguage')}</Text>
            <View style={{ marginTop: 16, marginBottom: 16 }}>
              <LanguagePicker
                label={t('auth.language')}
                value={selectedLanguage}
                onChange={setSelectedLanguage}
                searchPlaceholder={t('common.search_language')}
              />
            </View>
            <View style={styles.confirmActions}>
              <TouchableOpacity style={styles.confirmCancel} activeOpacity={0.88} onPress={() => setEditingLanguage(false)}>
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </TouchableOpacity>
              <Pressable style={[styles.confirmDelete, { backgroundColor: COLORS.primary }]} onPress={() => void handleLanguageSave()} disabled={busy === 'language'}>
                {busy === 'language' ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmDeleteText}>{t('profile.modals.saveLanguageButton')}</Text>}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={editingNotifications} transparent animationType="fade" onRequestClose={() => setEditingNotifications(false)}>
        <KeyboardAvoidingView style={styles.confirmBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={() => setEditingNotifications(false)} />
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>{t('profile.notifications.title')}</Text>
            <View style={{ marginTop: 16 }}>
              <NotificationSettingRow
                icon="phone-portrait-outline"
                title={t('profile.notifications.pushNotifications')}
                subtitle={osPermissionDenied ? t('profile.notifications.pushDeniedHint') : t('profile.notifications.pushHint')}
                value={!osPermissionDenied && notificationPreferences.pushEnabled}
                disabled={osPermissionDenied}
                onValueChange={(value) => void handleTogglePush(value)}
              />
            </View>
            {!osPermissionDenied && notificationPreferences.pushEnabled ? (
              <>
                <TouchableOpacity
                  style={[styles.confirmCancel, { marginTop: 14 }]}
                  activeOpacity={0.88}
                  disabled={busy === 'pushTest'}
                  onPress={() => void handleSendTestPush()}>
                  {busy === 'pushTest' ? (
                    <ActivityIndicator color={COLORS.textPrimary} />
                  ) : (
                    <Text style={styles.confirmCancelText}>{t('profile.notifications.sendTestPush')}</Text>
                  )}
                </TouchableOpacity>
                {pushTestResult ? (
                  <Text
                    style={[
                      styles.helperText,
                      { marginTop: 8, color: pushTestResult.type === 'success' ? '#0b9b72' : COLORS.error },
                    ]}>
                    {pushTestResult.text}
                  </Text>
                ) : null}
              </>
            ) : null}
            <View style={styles.confirmActions}>
              <TouchableOpacity style={[styles.confirmCancel, { flex: 1 }]} activeOpacity={0.88} onPress={() => setEditingNotifications(false)}>
                <Text style={styles.confirmCancelText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <View style={styles.brandBlock}>
        <Text style={styles.brandTagline}>{t('profile.brandTagline.tagline')}</Text>
      </View>

      <Modal visible={deleteConfirmOpen} transparent animationType="fade" onRequestClose={() => setDeleteConfirmOpen(false)}>
        <KeyboardAvoidingView style={styles.confirmBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={() => setDeleteConfirmOpen(false)} />
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>{t('profile.delete.confirmTitle')}</Text>
            <Text style={styles.confirmBody}>{t('profile.delete.confirmMessage')}</Text>
            <View style={styles.confirmActions}>
              <TouchableOpacity style={styles.confirmCancel} activeOpacity={0.88} onPress={() => setDeleteConfirmOpen(false)}>
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmDelete}
                activeOpacity={0.88}
                onPress={() => void handleDeleteAccountConfirmed()}
                disabled={busy === 'delete'}>
                {busy === 'delete' ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmDeleteText}>{t('profile.modals.deleteAccountButton')}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </ScrollView>

    <View
      style={[styles.fixedHeader, { top: headerTop }]}
      onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}>
      <TabHeader
        bellAnimatedStyle={bellAnimatedStyle}
        avatarAnimatedStyle={headerAvatarAnimatedStyle}
      />
    </View>
    </View>
  );
}

function NotificationSettingRow({
  icon,
  title,
  subtitle,
  value,
  disabled,
  onValueChange,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  value: boolean;
  disabled?: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.notificationRow}>
      <View style={[styles.notificationIcon, { backgroundColor: COLORS.avatarLight }]}>
        <Ionicons name={icon} size={18} color="#ff4f74" />
      </View>
      <View style={styles.notificationCopy}>
        <Text style={styles.notificationTitle}>{title}</Text>
        <Text style={styles.notificationSubtitle}>{subtitle}</Text>
      </View>
      <Switch
        value={value}
        disabled={disabled}
        onValueChange={onValueChange}
        trackColor={{ false: '#d8dde6', true: '#ffe5ec' }}
        thumbColor={value ? COLORS.primary : COLORS.white}
      />
    </View>
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

function SectionCard({
  title,
  items,
}: {
  title: string;
  items: { icon: keyof typeof Ionicons.glyphMap; label: string; accent: string; onPress: () => void }[];
}) {
  return (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {items.map((item, index) => (
        <View key={item.label}>
          {index > 0 ? <View style={styles.rowDivider} /> : null}
          <TouchableOpacity style={styles.rowButton} activeOpacity={0.8} onPress={item.onPress}>
            <View style={styles.rowLeft}>
              <Ionicons name={item.icon} size={23} color={item.accent} />
              <Text style={styles.rowLabel}>{item.label}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
}

function formatAdventureDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric' }).format(new Date(`${value}T12:00:00`));
}

function getInitials(name?: string | null) {
  if (!name) return 'SQ';
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase()).join('') || 'SQ';
}

function createTimeoutSignal(timeoutMs: number) {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
  return controller.signal;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  // Floats ON TOP of the ScrollView (see Home's app/(tabs)/index.tsx for the
  // full explanation) — same look as the bottom tab bar too.
  fixedHeader: {
    position: 'absolute',
    left: 16,
    right: 16,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.97)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.07,
    shadowRadius: 20,
    elevation: 10,
  },
  content: {
    paddingHorizontal: SPACING.xl,
    paddingTop: 20,
    paddingBottom: 132,
  },
  avatarSection: {
    marginTop: SPACING.xl,
    alignItems: 'center',
  },
  avatarRing: {
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 5,
    borderColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.18,
    shadowRadius: 26,
    elevation: 9,
  },
  avatar: {
    width: 142,
    height: 142,
    borderRadius: 71,
    backgroundColor: '#d8c1a3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    color: COLORS.white,
    fontSize: 42,
    fontWeight: '900',
    letterSpacing: -1.2,
  },
  editAvatarButton: {
    position: 'absolute',
    right: 80,
    top: 108,
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: COLORS.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: COLORS.white,
    shadowColor: COLORS.secondary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 8,
  },
  name: {
    marginTop: SPACING.xxl + 10,
    color: COLORS.textPrimary,
    fontSize: 40,
    lineHeight: 44,
    fontWeight: '900',
    letterSpacing: -1.8,
    textAlign: 'center',
    paddingHorizontal: SPACING.lg,
  },
  email: {
    marginTop: SPACING.sm,
    color: COLORS.textMeta,
    fontSize: 17,
    letterSpacing: -0.3,
  },
  bioText: {
    marginTop: SPACING.md,
    color: COLORS.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    paddingHorizontal: SPACING.xl,
  },
  // Stats badges — pill row near avatar hero (matches Home infoBadge pattern)
  statsBadgeRow: {
    marginTop: SPACING.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
  },
  statsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.circle,
    backgroundColor: COLORS.bgLight,
    borderWidth: 1,
    borderColor: COLORS.borderPrimary,
  },
  statsBadgeIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsBadgeValue: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.textPrimary,
    letterSpacing: -0.2,
  },
  statsBadgeLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
    letterSpacing: 0.2,
  },
  // Previous Adventures carousel (Home Up Next-style cards)
  adventureHeader: {
    marginTop: SPACING.xxl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginBottom: SPACING.md,
  },
  adventureEyebrow: {
    ...TYPOGRAPHY.eyebrow,
    fontWeight: '800',
    color: COLORS.textMeta,
  },
  adventureLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.borderPrimary,
  },
  adventureSeeAll: {
    color: COLORS.textMeta,
    fontSize: 12,
    fontWeight: '600',
  },
  adventureScroll: {
    marginRight: -SPACING.xl,
  },
  adventureScrollContent: {
    paddingRight: SPACING.xl,
    gap: SPACING.md,
  },
  adventureCard: {
    width: 180,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.sm,
    overflow: 'hidden',
    ...SHADOWS.subtle,
  },
  adventureImageBox: {
    height: 110,
    backgroundColor: '#e6e2d8',
    position: 'relative',
  },
  adventureImage: {
    width: '100%',
    height: '100%',
  },
  adventureFallback: {
    width: '100%',
    height: '100%',
    borderRadius: 0,
  },
  adventureBody: {
    padding: SPACING.md,
  },
  adventureCardDate: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textMeta,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  adventureCardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.textPrimary,
    letterSpacing: -0.2,
  },
  adventureCardMeta: {
    marginTop: 4,
    fontSize: 11,
    color: COLORS.textMeta,
    fontWeight: '500',
  },
  adventureEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.borderPrimary,
    borderStyle: 'dashed',
    justifyContent: 'center',
    marginBottom: SPACING.xl,
  },
  adventureEmptyText: {
    color: COLORS.textMeta,
    fontSize: 13,
    fontWeight: '500',
  },
  messageBanner: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  messageBannerSuccess: {
    backgroundColor: COLORS.successLight,
    borderWidth: 1,
    borderColor: COLORS.successBorder,
  },
  messageBannerError: {
    backgroundColor: COLORS.errorLight,
    borderWidth: 1,
    borderColor: COLORS.errorBorder,
  },
  messageText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  messageTextSuccess: {
    color: '#0b9b72',
  },
  messageTextError: {
    color: COLORS.error,
  },
  statsRow: {
    marginTop: 28,
    flexDirection: 'row',
    gap: 14,
  },
  statCard: {
    flex: 1,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.borderPrimary,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    paddingVertical: SPACING.xxl,
    ...SHADOWS.medium,
  },
  statValue: {
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: -1.4,
  },
  statLabel: {
    marginTop: 10,
    color: COLORS.textMeta,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.8,
    textAlign: 'center',
  },
  sectionCard: {
    marginTop: SPACING.lg,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.borderPrimary,
    backgroundColor: COLORS.white,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.lg,
    ...SHADOWS.medium,
  },
  editorCard: {
    marginTop: SPACING.md,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.borderPrimary,
    backgroundColor: COLORS.white,
    padding: SPACING.lg,
    ...SHADOWS.medium,
  },
  input: {
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.borderInput,
    backgroundColor: COLORS.bgLightest,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  bioInput: {
    minHeight: 100,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.borderInput,
    backgroundColor: COLORS.bgLightest,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    lineHeight: 22,
  },
  helperText: {
    marginTop: 10,
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  moderationNotice: {
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 12,
    fontSize: 12,
    lineHeight: 17,
    color: COLORS.textMeta,
    textAlign: 'center',
  },
  saveButton: {
    marginTop: 12,
    height: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
  },
  saveButtonText: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: '800',
  },
  sectionTitle: {
    color: COLORS.textPrimary,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.6,
    marginBottom: 8,
  },
  rowDivider: {
    height: 1,
    backgroundColor: COLORS.borderPrimary,
  },
  rowButton: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  rowLabel: {
    color: COLORS.textPrimary,
    fontSize: 17,
    letterSpacing: -0.4,
  },
  notificationRow: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  notificationIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.avatarLight,
    marginRight: 12,
  },
  notificationCopy: {
    flex: 1,
    paddingRight: 12,
  },
  notificationTitle: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  notificationSubtitle: {
    marginTop: 2,
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  themeList: {
    gap: 12,
  },
  themeCard: {
    borderRadius: 18,
    borderWidth: 2,
    borderColor: COLORS.borderInput,
    backgroundColor: COLORS.bgLight,
    overflow: 'hidden',
  },
  themeColorStrip: {
    flexDirection: 'row',
    height: 56,
  },
  themeColorBlock: {
    flex: 1,
  },
  themeCardInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  themeSwatchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  themeSwatch: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  themeName: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  themeColorCodes: {
    color: COLORS.textMeta,
    fontSize: 10,
    marginTop: 1,
    letterSpacing: 0.2,
  },
  themeCheck: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  themeCheckEmpty: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: COLORS.borderInput,
  },
  brandBlock: {
    marginTop: 22,
    alignItems: 'center',
  },
  brandWord: {
    color: '#e6e8ee',
    fontSize: 46,
    fontWeight: '900',
    letterSpacing: -1.6,
  },
  brandTagline: {
    marginTop: 4,
    color: COLORS.textMeta,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2.6,
  },
  confirmBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(12,16,26,0.45)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  confirmCard: {
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.borderPrimary,
    padding: SPACING.lg,
  },
  confirmTitle: {
    color: COLORS.textPrimary,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  confirmBody: {
    marginTop: 10,
    color: COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 21,
  },
  confirmActions: {
    marginTop: 16,
    flexDirection: 'row',
    gap: 10,
  },
  confirmCancel: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.borderInput,
    backgroundColor: COLORS.bgLightest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmCancelText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },
  confirmDelete: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    backgroundColor: COLORS.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmDeleteText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '800',
  },
  thanksCard: {
    borderRadius: RADIUS.xl,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.borderPrimary,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.xxl,
    alignItems: 'center',
    ...SHADOWS.floating,
  },
  thanksIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  thanksTitle: {
    color: COLORS.textPrimary,
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.6,
    textAlign: 'center',
  },
  thanksBody: {
    marginTop: 10,
    color: COLORS.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    paddingHorizontal: 4,
  },
  thanksButton: {
    marginTop: 22,
    alignSelf: 'stretch',
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thanksButtonText: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  blockedUsersBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(12,16,26,0.45)',
  },
  blockedUsersSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 12,
    maxHeight: '75%',
  },
  blockedUsersHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#dde1e8',
    alignSelf: 'center',
    marginBottom: 18,
  },
  blockedUsersHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  blockedUsersTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#14161d',
    letterSpacing: -0.5,
  },
  blockedUsersEmpty: {
    textAlign: 'center',
    color: '#8e95a2',
    fontSize: 14,
    marginTop: 32,
    marginBottom: 40,
  },
  blockedUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f3f6',
    gap: 12,
  },
  blockedUserName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#161821',
  },
  unblockButton: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    minWidth: 80,
    alignItems: 'center',
  },
  unblockButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primary,
  },
});
