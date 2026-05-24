import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/components/auth-provider';
import { useI18n, type AppLanguage } from '@/components/i18n-provider';
import LanguagePicker from '@/components/language-picker';
import TopAlertsButton from '@/components/top-alerts-button';
import { apiFetch, apiJson } from '@/lib/api';
import { getDefaultNotificationPreferences, loadNotificationPreferences, saveNotificationPreferences, type NotificationPreferences } from '@/lib/social';
import { supabase } from '@/lib/supabase';
import type { Quest } from '@/lib/types';
import { COLORS, SHADOWS, SPACING, RADIUS, TYPOGRAPHY } from '@/constants/design-tokens';

export default function ProfileScreen() {
  const { user, signOut, refreshProfile, deleteAccount } = useAuth();
  const { language, setLanguage, t } = useI18n();
  const insets = useSafeAreaInsets();
  const [joinedTrips, setJoinedTrips] = useState(0);
  const [createdQuests, setCreatedQuests] = useState(0);
  const [tripDerivedVisited, setTripDerivedVisited] = useState<Record<string, string>>({});
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
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState<'name' | 'bio' | 'password' | 'avatar' | 'language' | 'delete' | 'support' | null>(null);
  const [supportModal, setSupportModal] = useState<'bug' | 'feedback' | null>(null);
  const [supportText, setSupportText] = useState('');
  const [supportError, setSupportError] = useState<string | null>(null);
  const [thanksModal, setThanksModal] = useState<'bug' | 'feedback' | null>(null);

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
    return Object.values(merged).filter((s) => s === 'visited').length;
  }, [tripDerivedVisited, manualStatusMap]);

  useEffect(() => {
    let active = true;

    void loadNotificationPreferences().then((prefs) => {
      if (!active) return;
      setNotificationPreferences(prefs);
    });

    return () => {
      active = false;
    };
  }, []);

  const initials = useMemo(() => getInitials(user?.name), [user?.name]);

  async function updateNotificationPreference<K extends keyof NotificationPreferences>(key: K, value: NotificationPreferences[K]) {
    const next = { ...notificationPreferences, [key]: value };
    setNotificationPreferences(next);
    await saveNotificationPreferences(next);
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

  function openSupportModal(type: 'bug' | 'feedback') {
    setSupportText('');
    setSupportError(null);
    setMessage(null);
    setSupportModal(type);
  }

  function closeSupportModal() {
    setSupportModal(null);
    setSupportText('');
    setSupportError(null);
  }

  async function handleSupportSubmit() {
    if (!supportModal) return;
    const trimmed = supportText.trim();
    if (!trimmed) {
      setSupportError(t('profile.support.emptyError'));
      return;
    }
    try {
      setBusy('support');
      setSupportError(null);
      const submittedType = supportModal;
      const res = await apiFetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: submittedType, message: trimmed }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(errText || t('profile.support.failed'));
      }
      closeSupportModal();
      setThanksModal(submittedType);
    } catch (err) {
      setSupportError(err instanceof Error && err.message ? err.message : t('profile.support.failed'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[
          styles.content,
          { paddingTop: Math.max(insets.top, 16) + 8, paddingBottom: Math.max(insets.bottom, 20) + 112 },
        ]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.topButton} activeOpacity={0.8} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={28} color="#6d7380" />
          </TouchableOpacity>
          <Text style={styles.title}>{t('profile.title')}</Text>
          <View style={styles.topButton} />
        </View>
        <View style={[styles.alertsAnchor, { top: Math.max(insets.top, 16) + 8 }]}>
          <TopAlertsButton />
        </View>

      <View style={styles.avatarSection}>
        <View style={[styles.avatarRing, { borderColor: '#ff4f74' }]}>
          {user?.avatarUrl ? (
            <Image source={{ uri: user.avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={styles.avatar}>
              <Text style={styles.avatarInitials}>{initials}</Text>
            </View>
          )}
        </View>

        <TouchableOpacity style={[styles.editAvatarButton, { backgroundColor: COLORS.secondary, shadowColor: COLORS.secondary }]} activeOpacity={0.85} onPress={() => void handleAvatarPick()}>
          {busy === 'avatar' ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="create-outline" size={18} color="#fff" />}
        </TouchableOpacity>

        <Text style={styles.name}>{user?.name ?? t('profile.defaultName')}</Text>
        <Text style={styles.email}>{user?.email ?? 'user@sidequest.app'}</Text>
        {user?.bio ? <Text style={styles.bioText}>{user.bio}</Text> : null}
        {message ? (
          <View style={[styles.messageBanner, message.type === 'success' ? styles.messageBannerSuccess : styles.messageBannerError]}>
            <Ionicons
              name={message.type === 'success' ? 'checkmark-circle' : 'alert-circle'}
              size={18}
              color={message.type === 'success' ? '#0b9b72' : '#d53d18'}
            />
            <Text style={[styles.messageText, message.type === 'success' ? styles.messageTextSuccess : styles.messageTextError]}>
              {message.text}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.statsRow}>
        <StatCard value={String(joinedTrips)} label={t('profile.stats.tripsJoined')} accent={COLORS.secondary} />
        <StatCard value={String(createdQuests)} label={t('profile.stats.sidequestsCreated')} accent={COLORS.primary} />
        <StatCard value={String(visitedCountries)} label={t('profile.stats.countriesVisited')} accent={COLORS.primary} />
      </View>

      <SectionCard
        title={t('profile.sections.explore')}
        items={[
          { icon: 'earth-outline', label: t('profile.explore.travelTracker'), accent: '#10a6c0', onPress: () => router.push('/travel-tracker') },
          { icon: 'checkmark-done-outline', label: t('profile.explore.previousAdventures'), accent: '#ff4f74', onPress: () => router.push('/previous-adventures') },
          // TEMPORARY: diagnostic viewer — remove once API/auth issue is resolved
          { icon: 'bug-outline', label: 'Debug Logs (temp)', accent: '#c47b00', onPress: () => router.push('/debug-logs' as never) },
        ]}
      />

      <SectionCard
        title={t('profile.sections.editProfile')}
        items={[
          { icon: 'person-circle-outline', label: t('profile.editProfile.changeName'), accent: '#ff4f74', onPress: () => setEditingName(true) },
          { icon: 'text-outline', label: t('profile.editProfile.editBio'), accent: '#ff4f74', onPress: () => setEditingBio(true) },
          { icon: 'camera-outline', label: busy === 'avatar' ? t('profile.editProfile.uploading') : t('profile.editProfile.changeImage'), accent: '#ff4f74', onPress: () => void handleAvatarPick() },
        ]}
      />

      <Modal visible={editingName} transparent animationType="fade" onRequestClose={() => setEditingName(false)}>
        <KeyboardAvoidingView style={styles.confirmBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={() => setEditingName(false)} />
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>{t('profile.modals.changeName')}</Text>
            <TextInput value={name} onChangeText={setName} placeholder={t('profile.editProfile.displayNamePlaceholder')} style={[styles.input, { marginTop: 16 }]} />
            <View style={styles.confirmActions}>
              <TouchableOpacity style={styles.confirmCancel} activeOpacity={0.88} onPress={() => setEditingName(false)}>
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </TouchableOpacity>
              <Pressable style={[styles.confirmDelete, { backgroundColor: '#ff4f74' }]} onPress={() => void handleNameSave()} disabled={busy === 'name'}>
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
              <Pressable style={[styles.confirmDelete, { backgroundColor: '#ff4f74' }]} onPress={() => void handleBioSave()} disabled={busy === 'bio'}>
                {busy === 'bio' ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmDeleteText}>{t('profile.modals.saveBioButton')}</Text>}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>


      <SectionCard
        title={t('profile.sections.accountSettings')}
        items={[
          { icon: 'lock-closed-outline', label: t('profile.accountSettings.changePassword'), accent: '#10a6c0', onPress: () => setEditingPassword(true) },
          { icon: 'language-outline', label: t('profile.accountSettings.changeLanguage'), accent: '#10a6c0', onPress: () => setEditingLanguage(true) },
        ]}
      />

      <SectionCard
        title={t('profile.support.title')}
        items={[
          { icon: 'alert-circle-outline', label: t('profile.support.reportIssue'), accent: '#10a6c0', onPress: () => openSupportModal('bug') },
          { icon: 'chatbox-outline', label: t('profile.support.feedback'), accent: '#10a6c0', onPress: () => openSupportModal('feedback') },
        ]}
      />

      <SectionCard
        title="Legal"
        items={[
          {
            icon: 'shield-checkmark-outline',
            label: 'Privacy Policy',
            accent: '#10a6c0',
            onPress: () => void WebBrowser.openBrowserAsync('https://sidequesttravel.app/privacy'),
          },
          {
            icon: 'document-text-outline',
            label: 'Terms of Service',
            accent: '#10a6c0',
            onPress: () => void WebBrowser.openBrowserAsync('https://sidequesttravel.app/terms'),
          },
        ]}
      />

      <Modal visible={supportModal !== null} transparent animationType="fade" onRequestClose={closeSupportModal}>
        <KeyboardAvoidingView style={styles.confirmBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={closeSupportModal} />
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>
              {supportModal === 'bug' ? t('profile.support.reportTitle') : t('profile.support.feedbackTitle')}
            </Text>
            <TextInput
              value={supportText}
              onChangeText={(text) => { setSupportText(text); if (supportError) setSupportError(null); }}
              placeholder={supportModal === 'bug' ? t('profile.support.reportPlaceholder') : t('profile.support.feedbackPlaceholder')}
              placeholderTextColor="#9aa0ac"
              style={[styles.bioInput, { marginTop: 16 }]}
              multiline
              numberOfLines={5}
              textAlignVertical="top"
              autoFocus
            />
            {supportError ? (
              <Text style={[styles.helperText, { color: '#d53d18', marginTop: 8 }]}>{supportError}</Text>
            ) : null}
            <View style={styles.confirmActions}>
              <TouchableOpacity style={styles.confirmCancel} activeOpacity={0.88} onPress={closeSupportModal}>
                <Text style={styles.confirmCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <Pressable
                style={[styles.confirmDelete, { backgroundColor: '#10a6c0' }]}
                onPress={() => void handleSupportSubmit()}
                disabled={busy === 'support'}>
                {busy === 'support' ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmDeleteText}>{t('profile.support.submit')}</Text>}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <SectionCard
        title={t('profile.sections.accountSettings')}
        items={[
          {
            icon: 'log-out-outline',
            label: t('profile.accountSettings.logout'),
            accent: '#ff4f74',
            onPress: () => {
              void signOut().then(() => router.replace('/(auth)/login'));
            },
          },
          {
            icon: 'trash-outline',
            label: busy === 'delete' ? t('profile.accountSettings.deleting') : t('profile.accountSettings.deleteAccount'),
            accent: '#d53d18',
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
            />
            <Text style={[styles.helperText, { marginTop: 12 }]}>{t('profile.password.hint')}</Text>
            <View style={styles.confirmActions}>
              <TouchableOpacity style={styles.confirmCancel} activeOpacity={0.88} onPress={() => setEditingPassword(false)}>
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </TouchableOpacity>
              <Pressable style={[styles.confirmDelete, { backgroundColor: '#ff4f74' }]} onPress={() => void handlePasswordSave()} disabled={busy === 'password'}>
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
              <Pressable style={[styles.confirmDelete, { backgroundColor: '#ff4f74' }]} onPress={() => void handleLanguageSave()} disabled={busy === 'language'}>
                {busy === 'language' ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmDeleteText}>{t('profile.modals.saveLanguageButton')}</Text>}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <SectionCard
        title={t('profile.sections.notifications')}
        items={[
          {
            icon: 'notifications-outline',
            label: t('profile.notifications.title'),
            accent: '#ff4f74',
            onPress: () => setEditingNotifications(true),
          },
        ]}
      />

      <Modal visible={editingNotifications} transparent animationType="fade" onRequestClose={() => setEditingNotifications(false)}>
        <KeyboardAvoidingView style={styles.confirmBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={() => setEditingNotifications(false)} />
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>{t('profile.notifications.title')}</Text>
            <View style={{ marginTop: 16 }}>
              <NotificationSettingRow
                icon="phone-portrait-outline"
                title={t('profile.notifications.pushNotifications')}
                subtitle={t('profile.notifications.pushHint')}
                value={notificationPreferences.pushEnabled}
                onValueChange={(value) => void updateNotificationPreference('pushEnabled', value)}
              />
              <View style={styles.rowDivider} />
              <NotificationSettingRow
                icon="chatbubble-ellipses-outline"
                title={t('profile.notifications.chatMessages')}
                subtitle={t('profile.notifications.chatHint')}
                value={notificationPreferences.chatMessages}
                onValueChange={(value) => void updateNotificationPreference('chatMessages', value)}
              />
              <View style={styles.rowDivider} />
              <NotificationSettingRow
                icon="people-outline"
                title={t('profile.notifications.chatJoins')}
                subtitle={t('profile.notifications.joinsHint')}
                value={notificationPreferences.chatJoins}
                onValueChange={(value) => void updateNotificationPreference('chatJoins', value)}
              />
            </View>
            <View style={styles.confirmActions}>
              <TouchableOpacity style={[styles.confirmCancel, { flex: 1 }]} activeOpacity={0.88} onPress={() => setEditingNotifications(false)}>
                <Text style={styles.confirmCancelText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <View style={styles.brandBlock}>
        <Text style={styles.brandWord}>{t('profile.brandTagline.beyond')}</Text>
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

      <Modal visible={thanksModal !== null} transparent animationType="fade" onRequestClose={() => setThanksModal(null)}>
        <KeyboardAvoidingView style={styles.confirmBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={() => setThanksModal(null)} />
          <View style={styles.thanksCard}>
            <View style={[styles.thanksIconCircle, { backgroundColor: thanksModal === 'bug' ? '#fff1f5' : '#e6f7fa' }]}>
              <Ionicons
                name={thanksModal === 'bug' ? 'bug-outline' : 'heart'}
                size={32}
                color={thanksModal === 'bug' ? '#ff4f74' : '#10a6c0'}
              />
            </View>
            <Text style={styles.thanksTitle}>
              {thanksModal === 'bug' ? t('profile.support.thanksBugTitle') : t('profile.support.thanksFeedbackTitle')}
            </Text>
            <Text style={styles.thanksBody}>
              {thanksModal === 'bug' ? t('profile.support.thanksBugBody') : t('profile.support.thanksFeedbackBody')}
            </Text>
            <Pressable
              style={[styles.thanksButton, { backgroundColor: thanksModal === 'bug' ? '#ff4f74' : '#10a6c0' }]}
              onPress={() => setThanksModal(null)}>
              <Text style={styles.thanksButtonText}>{t('profile.support.thanksClose')}</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
    </View>
  );
}

function NotificationSettingRow({
  icon,
  title,
  subtitle,
  value,
  onValueChange,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.notificationRow}>
      <View style={[styles.notificationIcon, { backgroundColor: '#fff1f5' }]}>
        <Ionicons name={icon} size={18} color="#ff4f74" />
      </View>
      <View style={styles.notificationCopy}>
        <Text style={styles.notificationTitle}>{title}</Text>
        <Text style={styles.notificationSubtitle}>{subtitle}</Text>
      </View>
      <Switch value={value} onValueChange={onValueChange} trackColor={{ false: '#d8dde6', true: '#ffe5ec' }} thumbColor={value ? '#ff4f74' : '#fff'} />
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
            <Ionicons name="chevron-forward" size={20} color="#b2b7c0" />
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
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
    backgroundColor: '#fff',
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 132,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 50,
  },
  // Absolute-positioned so the alerts icon sits at the exact same X/Y on
  // every tab that uses it, independent of per-page header layout.
  alertsAnchor: {
    position: 'absolute',
    right: 20,
    zIndex: 10,
  },
  topButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#121317',
    letterSpacing: -0.9,
  },
  avatarSection: {
    marginTop: 28,
    alignItems: 'center',
  },
  avatarRing: {
    width: 132,
    height: 132,
    borderRadius: 66,
    borderWidth: 4,
    borderColor: '#ef2d63',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 118,
    height: 118,
    borderRadius: 59,
    backgroundColor: '#d8c1a3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    color: '#fff',
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -1,
  },
  editAvatarButton: {
    position: 'absolute',
    right: 94,
    top: 86,
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#10a6c0',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: '#10a6c0',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 6,
  },
  name: {
    marginTop: 26,
    color: '#151722',
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -1.4,
  },
  email: {
    marginTop: 6,
    color: '#8a909d',
    fontSize: 18,
    letterSpacing: -0.4,
  },
  bioText: {
    marginTop: 12,
    color: '#4e5566',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    paddingHorizontal: 24,
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
    backgroundColor: '#eefaf5',
    borderWidth: 1,
    borderColor: '#d1f1e4',
  },
  messageBannerError: {
    backgroundColor: '#fff4f1',
    borderWidth: 1,
    borderColor: '#ffd9cf',
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
    color: '#d53d18',
  },
  statsRow: {
    marginTop: 28,
    flexDirection: 'row',
    gap: 14,
  },
  statCard: {
    flex: 1,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#eceef2',
    backgroundColor: '#fff',
    alignItems: 'center',
    paddingVertical: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.04,
    shadowRadius: 18,
    elevation: 4,
  },
  statValue: {
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: -1.4,
  },
  statLabel: {
    marginTop: 10,
    color: '#a6abb5',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.8,
    textAlign: 'center',
  },
  sectionCard: {
    marginTop: 20,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: '#eceef2',
    backgroundColor: '#fff',
    paddingHorizontal: 18,
    paddingVertical: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.04,
    shadowRadius: 18,
    elevation: 4,
  },
  editorCard: {
    marginTop: 12,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#eceef2',
    backgroundColor: '#fff',
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.04,
    shadowRadius: 18,
    elevation: 4,
  },
  input: {
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e4e7ee',
    backgroundColor: '#f9fafc',
    paddingHorizontal: 16,
    fontSize: 16,
  },
  bioInput: {
    minHeight: 100,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e4e7ee',
    backgroundColor: '#f9fafc',
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    lineHeight: 22,
  },
  helperText: {
    marginTop: 10,
    color: '#7b8190',
    fontSize: 13,
    lineHeight: 18,
  },
  saveButton: {
    marginTop: 12,
    height: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ff4f74',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
  sectionTitle: {
    color: '#151722',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.6,
    marginBottom: 8,
  },
  rowDivider: {
    height: 1,
    backgroundColor: '#edf0f4',
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
    color: '#1b1e28',
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
    backgroundColor: '#fff1f5',
    marginRight: 12,
  },
  notificationCopy: {
    flex: 1,
    paddingRight: 12,
  },
  notificationTitle: {
    color: '#171821',
    fontSize: 15,
    fontWeight: '700',
  },
  notificationSubtitle: {
    marginTop: 2,
    color: '#7c8290',
    fontSize: 13,
    lineHeight: 18,
  },
  themeList: {
    gap: 12,
  },
  themeCard: {
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#e2e5ee',
    backgroundColor: '#fafbfc',
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
    color: '#111317',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  themeColorCodes: {
    color: '#9499a6',
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
    borderColor: '#d8dbe6',
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
    color: '#aeb3bd',
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
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e7eaf0',
    padding: 18,
  },
  confirmTitle: {
    color: '#14161d',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  confirmBody: {
    marginTop: 10,
    color: '#656d7b',
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
    borderColor: '#e4e7ee',
    backgroundColor: '#f8f9fb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmCancelText: {
    color: '#2f3440',
    fontSize: 14,
    fontWeight: '700',
  },
  confirmDelete: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#d53d18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmDeleteText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  thanksCard: {
    borderRadius: 24,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e7eaf0',
    paddingHorizontal: 24,
    paddingVertical: 28,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.16,
    shadowRadius: 32,
    elevation: 12,
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
    color: '#14161d',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.6,
    textAlign: 'center',
  },
  thanksBody: {
    marginTop: 10,
    color: '#5b626f',
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
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
});
