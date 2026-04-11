import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/components/auth-provider';
import { useAppTheme } from '@/contexts/app-theme-context';
import { useI18n, type AppLanguage } from '@/components/i18n-provider';
import LanguagePicker from '@/components/language-picker';
import TopAlertsButton from '@/components/top-alerts-button';
import { apiFetch, apiJson } from '@/lib/api';
import { getDefaultNotificationPreferences, loadNotificationPreferences, saveNotificationPreferences, type NotificationPreferences } from '@/lib/social';
import { supabase } from '@/lib/supabase';
import type { AppTheme, Quest } from '@/lib/types';

export default function ProfileScreen() {
  const { user, signOut, refreshProfile, deleteAccount } = useAuth();
  const theme = useAppTheme();
  const { language, setLanguage } = useI18n();
  const insets = useSafeAreaInsets();
  const [joinedTrips, setJoinedTrips] = useState(0);
  const [createdQuests, setCreatedQuests] = useState(0);
  const [name, setName] = useState(user?.name ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [selectedLanguage, setSelectedLanguage] = useState<AppLanguage>(language);
  const [newPassword, setNewPassword] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [editingBio, setEditingBio] = useState(false);
  const [editingPassword, setEditingPassword] = useState(false);
  const [editingLanguage, setEditingLanguage] = useState(false);
  const [editingNotifications, setEditingNotifications] = useState(false);
  const [editingTheme, setEditingTheme] = useState(false);
  const [themes, setThemes] = useState<AppTheme[]>([]);
  const [selectedThemeId, setSelectedThemeId] = useState<string | null>(user?.themeId ?? null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences>(getDefaultNotificationPreferences());
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState<'name' | 'bio' | 'password' | 'avatar' | 'language' | 'theme' | 'delete' | null>(null);

  useEffect(() => {
    setName(user?.name ?? '');
  }, [user?.name]);

  useEffect(() => {
    setBio(user?.bio ?? '');
  }, [user?.bio]);

  useEffect(() => {
    setSelectedThemeId(user?.themeId ?? null);
  }, [user?.themeId]);

  useEffect(() => {
    void apiJson<AppTheme[]>('/api/themes')
      .then(setThemes)
      .catch(() => {});
  }, []);

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
      })
      .catch(() => {
        if (!active) return;
        setJoinedTrips(0);
        setCreatedQuests(0);
      });

    return () => {
      active = false;
    };
  }, [user?.id]);

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
        throw new Error('Name cannot be empty.');
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
        throw new Error((await response.text()) || 'Could not save profile.');
      }

      await refreshProfile();
      setEditingName(false);
      setMessage({ type: 'success', text: 'Name updated.' });
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Could not update name.' });
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
        throw new Error((await response.text()) || 'Could not save bio.');
      }

      await refreshProfile();
      setEditingBio(false);
      setMessage({ type: 'success', text: 'Bio updated.' });
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Could not update bio.' });
    } finally {
      setBusy(null);
    }
  }

  async function handlePasswordSave() {
    try {
      setBusy('password');
      setMessage(null);

      if (newPassword.trim().length < 6) {
        throw new Error('Password must be at least 6 characters.');
      }

      const { error } = await supabase.auth.updateUser({
        password: newPassword.trim(),
      });

      if (error) {
        throw error;
      }

      setNewPassword('');
      setEditingPassword(false);
      setMessage({ type: 'success', text: 'Password updated successfully.' });
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Could not update password.' });
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
        throw new Error('Please allow photo access to update your avatar.');
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
        throw new Error((await uploadResponse.text()) || 'Could not upload image.');
      }

      const uploadData = (await uploadResponse.json()) as { url: string };

      const profileResponse = await apiFetch('/api/auth/profile', {
        method: 'PATCH',
        signal: createTimeoutSignal(12000),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatarUrl: uploadData.url }),
      });

      if (!profileResponse.ok) {
        throw new Error((await profileResponse.text()) || 'Could not save avatar.');
      }

      void supabase.auth.updateUser({
        data: {
          avatar_url: uploadData.url,
        },
      });

      await refreshProfile();
      setMessage({ type: 'success', text: 'Profile image updated.' });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        setMessage({ type: 'error', text: 'Image upload timed out. Check that backend is running and reachable from your phone.' });
      } else {
        setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Could not update profile image.' });
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
      setMessage({ type: 'success', text: 'Language updated.' });
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Could not update language.' });
    } finally {
      setBusy(null);
    }
  }

  async function handleThemeSave() {
    try {
      setBusy('theme');
      setMessage(null);
      const response = await apiFetch('/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ themeId: selectedThemeId }),
      });
      if (!response.ok) throw new Error((await response.text()) || 'Could not save theme.');
      await refreshProfile();
      setEditingTheme(false);
      setMessage({ type: 'success', text: 'Theme updated.' });
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Could not update theme.' });
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
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Could not delete account.' });
    } finally {
      setBusy(null);
      setDeleteConfirmOpen(false);
    }
  }

  return (
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
        <Text style={styles.title}>Profile</Text>
        <TopAlertsButton />
      </View>

      <View style={styles.avatarSection}>
        <View style={[styles.avatarRing, { borderColor: theme.primary }]}>
          {user?.avatarUrl ? (
            <Image source={{ uri: user.avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={styles.avatar}>
              <Text style={styles.avatarInitials}>{initials}</Text>
            </View>
          )}
        </View>

        <TouchableOpacity style={[styles.editAvatarButton, { backgroundColor: theme.secondary, shadowColor: theme.secondary }]} activeOpacity={0.85} onPress={() => void handleAvatarPick()}>
          {busy === 'avatar' ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="create-outline" size={18} color="#fff" />}
        </TouchableOpacity>

        <Text style={styles.name}>{user?.name ?? 'SideQuest User'}</Text>
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
        <StatCard value={String(joinedTrips)} label="TRIPS JOINED" accent={theme.secondary} />
        <StatCard value={String(createdQuests)} label="QUESTS CREATED" accent={theme.primary} />
      </View>

      <SectionCard
        title="Edit Profile"
        items={[
          { icon: 'person-circle-outline', label: editingName ? 'Close name editor' : 'Change name', accent: theme.primary, onPress: () => setEditingName((current) => !current) },
          { icon: 'text-outline', label: editingBio ? 'Close bio editor' : 'Edit bio', accent: theme.primary, onPress: () => setEditingBio((current) => !current) },
          { icon: 'camera-outline', label: busy === 'avatar' ? 'Uploading image...' : 'Change profile image', accent: theme.primary, onPress: () => void handleAvatarPick() },
        ]}
      />
      {editingName ? (
        <View style={styles.editorCard}>
          <TextInput value={name} onChangeText={setName} placeholder="Display name" style={styles.input} />
          <Pressable style={[styles.saveButton, { backgroundColor: theme.primary }]} onPress={() => void handleNameSave()} disabled={busy === 'name'}>
            {busy === 'name' ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Save name</Text>}
          </Pressable>
        </View>
      ) : null}
      {editingBio ? (
        <View style={styles.editorCard}>
          <TextInput
            value={bio}
            onChangeText={setBio}
            placeholder="Tell others a little about yourself..."
            style={styles.bioInput}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
          <Pressable style={[styles.saveButton, { backgroundColor: theme.primary }]} onPress={() => void handleBioSave()} disabled={busy === 'bio'}>
            {busy === 'bio' ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Save bio</Text>}
          </Pressable>
        </View>
      ) : null}

      <SectionCard
        title="Appearance"
        items={[
          { icon: 'color-palette-outline', label: editingTheme ? 'Close theme picker' : 'Change theme', accent: theme.primary, onPress: () => setEditingTheme((c) => !c) },
        ]}
      />
      {editingTheme ? (
        <View style={styles.editorCard}>
          {themes.length === 0 ? (
            <ActivityIndicator color={theme.primary} style={{ marginVertical: 16 }} />
          ) : (
            <View style={styles.themeList}>
              {themes.map((t) => {
                const selected = selectedThemeId === t.id;
                return (
                  <TouchableOpacity
                    key={t.id}
                    style={[styles.themeCard, selected && { borderColor: theme.primary }]}
                    activeOpacity={0.88}
                    onPress={() => setSelectedThemeId(t.id)}>
                    <View style={styles.themeColorStrip}>
                      <View style={[styles.themeColorBlock, { backgroundColor: t.primaryColor }]} />
                      <View style={[styles.themeColorBlock, { backgroundColor: t.secondaryColor, borderLeftWidth: 1, borderLeftColor: '#e0e3ea' }]} />
                    </View>
                    <View style={styles.themeCardInfo}>
                      <View style={styles.themeSwatchRow}>
                        <View style={[styles.themeSwatch, { backgroundColor: t.primaryColor }]} />
                        <View style={[styles.themeSwatch, { backgroundColor: t.secondaryColor, borderWidth: 1, borderColor: '#dde0e8' }]} />
                        <View style={{ flex: 1, paddingLeft: 6 }}>
                          <Text style={styles.themeName}>{t.name}</Text>
                          <Text style={styles.themeColorCodes}>{t.primaryColor} · {t.secondaryColor}</Text>
                        </View>
                      </View>
                      {selected ? (
                        <View style={[styles.themeCheck, { backgroundColor: theme.primary }]}>
                          <Ionicons name="checkmark" size={14} color="#fff" />
                        </View>
                      ) : (
                        <View style={styles.themeCheckEmpty} />
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
          <Pressable style={[styles.saveButton, { backgroundColor: theme.primary }]} onPress={() => void handleThemeSave()} disabled={busy === 'theme'}>
            {busy === 'theme' ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Apply theme</Text>}
          </Pressable>
        </View>
      ) : null}

      <SectionCard
        title="Account Settings"
        items={[
          { icon: 'lock-closed-outline', label: editingPassword ? 'Close password editor' : 'Change password', accent: theme.secondary, onPress: () => setEditingPassword((current) => !current) },
          { icon: 'language-outline', label: editingLanguage ? 'Close language settings' : 'Change language', accent: theme.secondary, onPress: () => setEditingLanguage((current) => !current) },
          {
            icon: 'log-out-outline',
            label: 'Logout',
            accent: theme.primary,
            onPress: () => {
              void signOut().then(() => router.replace('/(auth)/login'));
            },
          },
          {
            icon: 'trash-outline',
            label: busy === 'delete' ? 'Deleting account...' : 'Delete account',
            accent: '#d53d18',
            onPress: handleDeleteAccount,
          },
        ]}
      />
      {editingPassword ? (
        <View style={styles.editorCard}>
          <TextInput
            value={newPassword}
            onChangeText={setNewPassword}
            placeholder="New password"
            secureTextEntry
            style={styles.input}
          />
          <Text style={styles.helperText}>Use at least 6 characters. You will stay signed in after the update.</Text>
          <Pressable style={[styles.saveButton, { backgroundColor: theme.primary }]} onPress={() => void handlePasswordSave()} disabled={busy === 'password'}>
            {busy === 'password' ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Update password</Text>}
          </Pressable>
        </View>
      ) : null}
      {editingLanguage ? (
        <View style={styles.editorCard}>
          <LanguagePicker
            label="Language"
            value={selectedLanguage}
            onChange={setSelectedLanguage}
            searchPlaceholder={language === 'sv' ? 'Sök språk' : 'Search language'}
          />
          <Pressable style={[styles.saveButton, { backgroundColor: theme.primary }]} onPress={() => void handleLanguageSave()} disabled={busy === 'language'}>
            {busy === 'language' ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Save language</Text>}
          </Pressable>
        </View>
      ) : null}

      <SectionCard
        title="Notifications"
        items={[
          {
            icon: 'notifications-outline',
            label: editingNotifications ? 'Close notification settings' : 'Notification settings',
            accent: theme.primary,
            onPress: () => setEditingNotifications((current) => !current),
          },
        ]}
      />
      {editingNotifications ? (
        <View style={styles.editorCard}>
          <NotificationSettingRow
            icon="phone-portrait-outline"
            title="Push notifications"
            subtitle="Prepare alerts when someone sends a message."
            value={notificationPreferences.pushEnabled}
            onValueChange={(value) => void updateNotificationPreference('pushEnabled', value)}
          />
          <View style={styles.rowDivider} />
          <NotificationSettingRow
            icon="chatbubble-ellipses-outline"
            title="Chat messages"
            subtitle="Create in-app alerts for new group chat messages."
            value={notificationPreferences.chatMessages}
            onValueChange={(value) => void updateNotificationPreference('chatMessages', value)}
          />
          <View style={styles.rowDivider} />
          <NotificationSettingRow
            icon="people-outline"
            title="Chat joins"
            subtitle="Alert when someone joins a group chat."
            value={notificationPreferences.chatJoins}
            onValueChange={(value) => void updateNotificationPreference('chatJoins', value)}
          />
        </View>
      ) : null}

      <View style={styles.brandBlock}>
        <Text style={styles.brandWord}>BEYOND</Text>
        <Text style={styles.brandTagline}>THE MAP IS ONLY THE BEGINNING</Text>
      </View>

      <Modal visible={deleteConfirmOpen} transparent animationType="fade" onRequestClose={() => setDeleteConfirmOpen(false)}>
        <View style={styles.confirmBackdrop}>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={() => setDeleteConfirmOpen(false)} />
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>Are you sure?</Text>
            <Text style={styles.confirmBody}>Deleting your account removes your profile and trips. This cannot be undone.</Text>
            <View style={styles.confirmActions}>
              <TouchableOpacity style={styles.confirmCancel} activeOpacity={0.88} onPress={() => setDeleteConfirmOpen(false)}>
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmDelete}
                activeOpacity={0.88}
                onPress={() => void handleDeleteAccountConfirmed()}
                disabled={busy === 'delete'}>
                {busy === 'delete' ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmDeleteText}>Delete account</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
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
  const theme = useAppTheme();
  return (
    <View style={styles.notificationRow}>
      <View style={[styles.notificationIcon, { backgroundColor: theme.primary08 }]}>
        <Ionicons name={icon} size={18} color={theme.primary} />
      </View>
      <View style={styles.notificationCopy}>
        <Text style={styles.notificationTitle}>{title}</Text>
        <Text style={styles.notificationSubtitle}>{subtitle}</Text>
      </View>
      <Switch value={value} onValueChange={onValueChange} trackColor={{ false: '#d8dde6', true: theme.primary20 }} thumbColor={value ? theme.primary : '#fff'} />
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
});
