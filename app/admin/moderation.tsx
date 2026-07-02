import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Avatar from '@/components/avatar';
import { API_URL } from '@/lib/api';
import { supabase } from '@/lib/supabase';

const ADMIN_KEY = process.env.EXPO_PUBLIC_ADMIN_KEY ?? '';

type AdminUser = {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  isBanned: boolean;
  role: string;
  createdAt: string;
};

async function adminFetch(path: string, init?: RequestInit) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? '';
  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Admin-Key': ADMIN_KEY,
      ...(init?.headers ?? {}),
    },
  });
}

export default function ModerationScreen() {
  const insets = useSafeAreaInsets();

  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  // Warn modal
  const [warnTarget, setWarnTarget] = useState<AdminUser | null>(null);
  const [warnTitle, setWarnTitle] = useState('');
  const [warnBody, setWarnBody] = useState('');
  const [sending, setSending] = useState(false);

  async function handleSearch() {
    if (!search.trim()) return;
    setLoading(true);
    try {
      const res = await adminFetch(`/api/admin/users?search=${encodeURIComponent(search.trim())}`);
      const data = await res.json() as AdminUser[];
      setUsers(data);
      setSearched(true);
    } catch {
      Alert.alert('Fel', 'Kunde inte ladda användare.');
    } finally {
      setLoading(false);
    }
  }

  async function handleBanToggle(u: AdminUser) {
    const action = u.isBanned ? 'unban' : 'ban';
    const label = u.isBanned ? 'Avbanna' : 'Banna';
    Alert.alert(
      `${label} ${u.name}?`,
      u.isBanned
        ? `${u.name} får återigen tillgång till appen.`
        : `${u.name} kommer inte kunna logga in igen.`,
      [
        { text: 'Avbryt', style: 'cancel' },
        {
          text: label,
          style: u.isBanned ? 'default' : 'destructive',
          onPress: async () => {
            try {
              const method = u.isBanned ? 'DELETE' : 'POST';
              const res = await adminFetch(`/api/admin/users/${u.id}/ban`, { method });
              if (!res.ok) throw new Error();
              setUsers((prev) =>
                prev.map((x) => x.id === u.id ? { ...x, isBanned: !u.isBanned } : x),
              );
            } catch {
              Alert.alert('Fel', `Kunde inte ${action.toLowerCase()}a användaren.`);
            }
          },
        },
      ],
    );
  }

  async function handleSendWarn() {
    if (!warnTarget || !warnTitle.trim() || !warnBody.trim()) return;
    setSending(true);
    try {
      const res = await adminFetch(`/api/admin/users/${warnTarget.id}/warn`, {
        method: 'POST',
        body: JSON.stringify({ title: warnTitle.trim(), body: warnBody.trim() }),
      });
      if (!res.ok) throw new Error();
      setWarnTarget(null);
      setWarnTitle('');
      setWarnBody('');
      Alert.alert('Skickat', `Varning skickad till ${warnTarget.name}.`);
    } catch {
      Alert.alert('Fel', 'Kunde inte skicka varningen.');
    } finally {
      setSending(false);
    }
  }

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 18) + 4 }]}>
        <TouchableOpacity style={styles.backButton} activeOpacity={0.88} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#11131a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Moderation</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Search */}
      <View style={styles.searchRow}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Sök namn eller e-post…"
          placeholderTextColor="#a3a9b4"
          style={styles.searchInput}
          returnKeyType="search"
          onSubmitEditing={() => void handleSearch()}
          autoCapitalize="none"
        />
        <TouchableOpacity
          style={[styles.searchButton, !search.trim() && styles.searchButtonDisabled]}
          disabled={!search.trim() || loading}
          activeOpacity={0.85}
          onPress={() => void handleSearch()}>
          {loading
            ? <ActivityIndicator size="small" color="#fff" />
            : <Ionicons name="search" size={18} color="#fff" />
          }
        </TouchableOpacity>
      </View>

      <FlatList
        data={users}
        keyExtractor={(u) => u.id}
        contentContainerStyle={[styles.list, { paddingBottom: Math.max(insets.bottom, 20) + 24 }]}
        ListEmptyComponent={
          searched && !loading ? (
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={40} color="#c8cdd6" />
              <Text style={styles.emptyText}>Inga användare hittades</Text>
            </View>
          ) : null
        }
        renderItem={({ item: u }) => (
          <View style={[styles.userRow, u.isBanned && styles.userRowBanned]}>
            <Avatar name={u.name} uri={u.avatarUrl} size={44} />
            <View style={styles.userInfo}>
              <View style={styles.userNameRow}>
                <Text style={styles.userName}>{u.name}</Text>
                {u.isBanned ? (
                  <View style={styles.bannedBadge}>
                    <Text style={styles.bannedBadgeText}>BANNAD</Text>
                  </View>
                ) : null}
                {u.role === 'admin' ? (
                  <View style={styles.adminBadge}>
                    <Text style={styles.adminBadgeText}>ADMIN</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.userEmail} numberOfLines={1}>{u.email}</Text>
            </View>
            <View style={styles.userActions}>
              <TouchableOpacity
                style={styles.warnButton}
                activeOpacity={0.8}
                onPress={() => { setWarnTarget(u); setWarnTitle(''); setWarnBody(''); }}>
                <Ionicons name="warning-outline" size={18} color="#d79a19" />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.banButton, u.isBanned && styles.unbanButton]}
                activeOpacity={0.8}
                onPress={() => void handleBanToggle(u)}>
                <Ionicons
                  name={u.isBanned ? 'checkmark-circle-outline' : 'ban-outline'}
                  size={18}
                  color={u.isBanned ? '#2f9e6f' : '#d53d18'}
                />
              </TouchableOpacity>
            </View>
          </View>
        )}
      />

      {/* Warn modal */}
      <Modal
        visible={warnTarget !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setWarnTarget(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setWarnTarget(null)} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.modalSheet, { paddingBottom: Math.max(insets.bottom, 16) + 12 }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.modalTitle}>Skicka varning till {warnTarget?.name}</Text>
            <Text style={styles.modalHint}>
              Meddelandet dyker upp i deras notiser och öppnar en systempopup.
            </Text>
            <TextInput
              value={warnTitle}
              onChangeText={setWarnTitle}
              placeholder="Rubrik"
              placeholderTextColor="#a3a9b4"
              style={styles.modalInput}
              maxLength={80}
            />
            <TextInput
              value={warnBody}
              onChangeText={setWarnBody}
              placeholder="Meddelande…"
              placeholderTextColor="#a3a9b4"
              style={[styles.modalInput, styles.modalInputMulti]}
              multiline
              numberOfLines={4}
              maxLength={600}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setWarnTarget(null)}>
                <Text style={styles.modalCancelText}>Avbryt</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalSend,
                  (!warnTitle.trim() || !warnBody.trim() || sending) && styles.modalSendDisabled,
                ]}
                disabled={!warnTitle.trim() || !warnBody.trim() || sending}
                onPress={() => void handleSendWarn()}>
                {sending
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.modalSendText}>Skicka varning</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f7f8fa' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12,
    backgroundColor: '#f7f8fa',
    borderBottomWidth: 1, borderBottomColor: '#eceef2',
  },
  backButton: {
    width: 40, height: 40, alignItems: 'center', justifyContent: 'center',
    borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: '#eceef2',
  },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#11131a', letterSpacing: -0.4 },

  searchRow: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#eceef2',
  },
  searchInput: {
    flex: 1, height: 44, borderRadius: 12,
    borderWidth: 1, borderColor: '#eceef2',
    backgroundColor: '#f7f8fa',
    paddingHorizontal: 14, fontSize: 15, color: '#14161d',
  },
  searchButton: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: '#d53d18',
    alignItems: 'center', justifyContent: 'center',
  },
  searchButtonDisabled: { opacity: 0.5 },

  list: { padding: 16, gap: 10 },

  emptyState: { alignItems: 'center', paddingVertical: 48, gap: 10 },
  emptyText: { fontSize: 15, color: '#8a909d', fontWeight: '600' },

  userRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 18,
    borderWidth: 1, borderColor: '#eceef2',
    padding: 14,
  },
  userRowBanned: { borderColor: '#fecaca', backgroundColor: '#fff5f5' },

  userInfo: { flex: 1, minWidth: 0 },
  userNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  userName: { fontSize: 15, fontWeight: '700', color: '#14161d' },
  userEmail: { fontSize: 12, color: '#8a909d', marginTop: 2 },

  bannedBadge: {
    paddingHorizontal: 6, paddingVertical: 2,
    backgroundColor: '#fee2e2', borderRadius: 6,
  },
  bannedBadgeText: { fontSize: 10, fontWeight: '800', color: '#d53d18', letterSpacing: 0.3 },
  adminBadge: {
    paddingHorizontal: 6, paddingVertical: 2,
    backgroundColor: '#ede9fe', borderRadius: 6,
  },
  adminBadgeText: { fontSize: 10, fontWeight: '800', color: '#7c3aed', letterSpacing: 0.3 },

  userActions: { flexDirection: 'row', gap: 8 },
  warnButton: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: '#fef3c7',
    alignItems: 'center', justifyContent: 'center',
  },
  banButton: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: '#fee2e2',
    alignItems: 'center', justifyContent: 'center',
  },
  unbanButton: { backgroundColor: '#dcfce7' },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 12, gap: 12,
  },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: '#dde1e8', alignSelf: 'center', marginBottom: 8,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#14161d', letterSpacing: -0.4 },
  modalHint: { fontSize: 13, color: '#8a909d', lineHeight: 18 },
  modalInput: {
    borderWidth: 1, borderColor: '#eceef2',
    borderRadius: 12, backgroundColor: '#f7f8fa',
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: '#14161d',
  },
  modalInputMulti: { minHeight: 100, textAlignVertical: 'top' },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  modalCancel: {
    flex: 1, height: 48, borderRadius: 14,
    borderWidth: 1.5, borderColor: '#eceef2',
    alignItems: 'center', justifyContent: 'center',
  },
  modalCancelText: { fontSize: 14, fontWeight: '700', color: '#7b828e' },
  modalSend: {
    flex: 2, height: 48, borderRadius: 14,
    backgroundColor: '#d53d18',
    alignItems: 'center', justifyContent: 'center',
  },
  modalSendDisabled: { opacity: 0.5 },
  modalSendText: { fontSize: 14, fontWeight: '800', color: '#fff' },
});
