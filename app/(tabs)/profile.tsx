import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/components/auth-provider';
import { apiFetch, apiJson } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import type { Quest } from '@/lib/types';

export default function ProfileScreen() {
  const { user, signOut, refreshProfile } = useAuth();
  const insets = useSafeAreaInsets();
  const [joinedTrips, setJoinedTrips] = useState(0);
  const [createdQuests, setCreatedQuests] = useState(0);
  const [name, setName] = useState(user?.name ?? '');
  const [newPassword, setNewPassword] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [editingPassword, setEditingPassword] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState<'name' | 'password' | 'avatar' | null>(null);

  useEffect(() => {
    setName(user?.name ?? '');
  }, [user?.name]);

  useEffect(() => {
    let active = true;

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

  const initials = useMemo(() => getInitials(user?.name), [user?.name]);

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
        <View style={styles.topSpacer} />
      </View>

      <View style={styles.avatarSection}>
        <View style={styles.avatarRing}>
          {user?.avatarUrl ? (
            <Image source={{ uri: user.avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={styles.avatar}>
              <Text style={styles.avatarInitials}>{initials}</Text>
            </View>
          )}
        </View>

        <TouchableOpacity style={styles.editAvatarButton} activeOpacity={0.85} onPress={() => void handleAvatarPick()}>
          {busy === 'avatar' ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="create-outline" size={18} color="#fff" />}
        </TouchableOpacity>

        <Text style={styles.name}>{user?.name ?? 'SideQuest User'}</Text>
        <Text style={styles.email}>{user?.email ?? 'user@sidequest.app'}</Text>
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
        <StatCard value={String(joinedTrips)} label="TRIPS JOINED" accent="#0b9db8" />
        <StatCard value={String(createdQuests)} label="QUESTS CREATED" accent="#e72d69" />
      </View>

      <SectionCard
        title="Edit Profile"
        items={[
          { icon: 'badge-outline', label: editingName ? 'Close name editor' : 'Change name', accent: '#ef2d63', onPress: () => setEditingName((current) => !current) },
          { icon: 'camera-outline', label: busy === 'avatar' ? 'Uploading image...' : 'Change profile image', accent: '#ef2d63', onPress: () => void handleAvatarPick() },
        ]}
      />
      {editingName ? (
        <View style={styles.editorCard}>
          <TextInput value={name} onChangeText={setName} placeholder="Display name" style={styles.input} />
          <Pressable style={styles.saveButton} onPress={() => void handleNameSave()} disabled={busy === 'name'}>
            {busy === 'name' ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Save name</Text>}
          </Pressable>
        </View>
      ) : null}

      <SectionCard
        title="Account Settings"
        items={[
          { icon: 'lock-closed-outline', label: editingPassword ? 'Close password editor' : 'Change password', accent: '#0b9db8', onPress: () => setEditingPassword((current) => !current) },
          {
            icon: 'log-out-outline',
            label: 'Logout',
            accent: '#ef2d63',
            onPress: () => {
              void signOut().then(() => router.replace('/(auth)/login'));
            },
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
          <Pressable style={styles.saveButton} onPress={() => void handlePasswordSave()} disabled={busy === 'password'}>
            {busy === 'password' ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Update password</Text>}
          </Pressable>
        </View>
      ) : null}

      <View style={styles.brandBlock}>
        <Text style={styles.brandWord}>BEYOND</Text>
        <Text style={styles.brandTagline}>THE MAP IS ONLY THE BEGINNING</Text>
      </View>
    </ScrollView>
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
  topSpacer: {
    width: 42,
    height: 42,
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
});
