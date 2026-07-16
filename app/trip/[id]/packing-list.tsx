import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/components/auth-provider';
import { useI18n } from '@/components/i18n-provider';
import { useKeyboardFocusScroll } from '@/hooks/useKeyboardFocusScroll';
import Avatar from '@/components/avatar';
import { apiFetch, apiJson } from '@/lib/api';
import { splitPastedChecklistItems, stripNotesChecklistMarkers } from '@/lib/text-paste';
import { COLORS } from '@/constants/design-tokens';

type Member = { id: string; name: string; avatarUrl?: string | null; isOwner: boolean; isOnline?: boolean };

type PackingItem = {
  id: string;
  text: string;
  isChecked: boolean;
  sortOrder: number;
  createdByUserId: string;
  assignedToUserId?: string | null;
  assignedToName?: string | null;
  assignedToAvatarUrl?: string | null;
};

type PackingCategory = {
  id: string;
  name: string;
  scope: 'shared' | 'private';
  sortOrder: number;
  createdByUserId: string;
  items: PackingItem[];
};

type PackingListData = {
  shared: PackingCategory[];
  private: PackingCategory[];
};

type Tab = 'shared' | 'private';

type DraftRow = { key: string; text: string };

const PRIVATE_COLOR = '#8b5cf6';

export default function PackingListScreen() {
  const { id: tripId } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();

  const [data, setData] = useState<PackingListData>({ shared: [], private: [] });
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('shared');

  // Draft rows per category: notepad UX
  const [drafts, setDrafts] = useState<Record<string, DraftRow[]>>({});
  const [savingDraft, setSavingDraft] = useState<string | null>(null);

  // Add category inline form
  const [addCategoryOpen, setAddCategoryOpen] = useState(false);
  const [addCategoryDraft, setAddCategoryDraft] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);
  const categoryInputRef = useRef<TextInput>(null);

  // Assign member picker
  const [assignPickerOpen, setAssignPickerOpen] = useState(false);
  const [assignTarget, setAssignTarget] = useState<{ categoryId: string; item: PackingItem } | null>(null);

  const draftRefs = useRef<Record<string, TextInput | null>>({});
  const { scrollRef, onFocusField, scrollViewProps } = useKeyboardFocusScroll();

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError('');
    try {
      const [listData, membersData] = await Promise.all([
        apiJson<PackingListData>(`/api/trips/${tripId}/packing-list`),
        apiJson<Member[]>(`/api/trips/${tripId}/members`),
      ]);
      setData(listData);
      setMembers(membersData);
    } catch {
      setError(t('trip.packingList.loadError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tripId, t]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const categories = activeTab === 'shared' ? data.shared : data.private;

  const totalItems = categories.reduce((n, c) => n + c.items.length, 0);
  const checkedItems = categories.reduce((n, c) => n + c.items.filter((i) => i.isChecked).length, 0);

  // --- Draft helpers ---

  function makeDraftKey() {
    return `d_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }

  function ensureDraft(categoryId: string) {
    setDrafts((prev) => {
      const existing = prev[categoryId] ?? [];
      if (existing.some((d) => d.text === '')) return prev;
      return { ...prev, [categoryId]: [...existing, { key: makeDraftKey(), text: '' }] };
    });
  }

  function updateDraft(categoryId: string, key: string, text: string) {
    setDrafts((prev) => ({
      ...prev,
      [categoryId]: (prev[categoryId] ?? []).map((d) => d.key === key ? { ...d, text } : d),
    }));
  }

  function removeDraft(categoryId: string, key: string) {
    setDrafts((prev) => ({
      ...prev,
      [categoryId]: (prev[categoryId] ?? []).filter((d) => d.key !== key),
    }));
  }

  // focusNext: Return-flow spawns a fresh empty draft and keeps the keyboard
  // up so several items can be added in a row. A blur-commit (tapping outside
  // the field) must NOT do that — the user just left the field, so re-focusing
  // would yank the keyboard right back up.
  async function commitDraft(categoryId: string, draftKey: string, text: string, focusNext = true) {
    const trimmed = text.trim();
    if (!trimmed || savingDraft === draftKey) return;
    setSavingDraft(draftKey);
    try {
      const created = await apiJson<PackingItem>(
        `/api/trips/${tripId}/packing-list/categories/${categoryId}/items`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: trimmed }) },
      );
      setData((prev) => ({
        ...prev,
        [activeTab]: prev[activeTab].map((c) =>
          c.id === categoryId ? { ...c, items: [...c.items, created] } : c,
        ),
      }));
      removeDraft(categoryId, draftKey);
      if (focusNext) {
        const newKey = makeDraftKey();
        setDrafts((prev) => ({
          ...prev,
          [categoryId]: [...(prev[categoryId] ?? []).filter((d) => d.key !== draftKey), { key: newKey, text: '' }],
        }));
        setTimeout(() => draftRefs.current[newKey]?.focus(), 60);
      }
    } catch {
      Alert.alert(t('trip.packingList.addItemError'));
    } finally {
      setSavingDraft(null);
    }
  }

  // A multi-row paste (e.g. a checklist from Apple Notes) becomes one item
  // per row — each with its own checkbox — instead of one long mashed-together
  // item. Items that were created before an error keep their place; the rows
  // that never made it stay in the draft so nothing from the paste is lost.
  async function addPastedItems(categoryId: string, draftKey: string, parts: string[]) {
    if (savingDraft) return;
    setSavingDraft(draftKey);
    const remaining = [...parts];
    try {
      while (remaining.length > 0) {
        const created = await apiJson<PackingItem>(
          `/api/trips/${tripId}/packing-list/categories/${categoryId}/items`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: remaining[0] }) },
        );
        remaining.shift();
        setData((prev) => ({
          ...prev,
          [activeTab]: prev[activeTab].map((c) =>
            c.id === categoryId ? { ...c, items: [...c.items, created] } : c,
          ),
        }));
      }
      updateDraft(categoryId, draftKey, '');
    } catch {
      Alert.alert(t('trip.packingList.addItemError'));
      updateDraft(categoryId, draftKey, remaining.join(' · '));
    } finally {
      setSavingDraft(null);
    }
  }

  // --- Category handlers ---

  async function handleAddCategory() {
    const name = addCategoryDraft.trim();
    if (!name) return;
    setAddingCategory(true);
    try {
      const created = await apiJson<PackingCategory>(`/api/trips/${tripId}/packing-list/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, scope: activeTab }),
      });
      setData((prev) => ({
        ...prev,
        [activeTab]: [...prev[activeTab], { ...created, items: [] }],
      }));
      setAddCategoryDraft('');
      setAddCategoryOpen(false);
    } catch {
      Alert.alert(t('trip.packingList.addCategoryError'));
    } finally {
      setAddingCategory(false);
    }
  }

  async function handleDeleteCategory(categoryId: string) {
    Alert.alert(
      t('trip.packingList.deleteCategoryTitle'),
      t('trip.packingList.deleteCategoryBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'), style: 'destructive',
          onPress: async () => {
            try {
              await apiFetch(`/api/trips/${tripId}/packing-list/categories/${categoryId}`, { method: 'DELETE' });
              setData((prev) => ({ ...prev, [activeTab]: prev[activeTab].filter((c) => c.id !== categoryId) }));
            } catch {
              Alert.alert(t('trip.packingList.deleteCategoryError'));
            }
          },
        },
      ],
    );
  }

  // --- Item handlers ---

  async function handleToggleItem(categoryId: string, item: PackingItem) {
    const newChecked = !item.isChecked;
    setData((prev) => ({
      ...prev,
      [activeTab]: prev[activeTab].map((c) =>
        c.id === categoryId
          ? { ...c, items: c.items.map((i) => i.id === item.id ? { ...i, isChecked: newChecked } : i) }
          : c,
      ),
    }));
    try {
      await apiFetch(`/api/trips/${tripId}/packing-list/items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isChecked: newChecked }),
      });
    } catch {
      // Revert
      setData((prev) => ({
        ...prev,
        [activeTab]: prev[activeTab].map((c) =>
          c.id === categoryId
            ? { ...c, items: c.items.map((i) => i.id === item.id ? { ...i, isChecked: item.isChecked } : i) }
            : c,
        ),
      }));
    }
  }

  async function handleDeleteItem(categoryId: string, itemId: string) {
    try {
      await apiFetch(`/api/trips/${tripId}/packing-list/items/${itemId}`, { method: 'DELETE' });
      setData((prev) => ({
        ...prev,
        [activeTab]: prev[activeTab].map((c) =>
          c.id === categoryId ? { ...c, items: c.items.filter((i) => i.id !== itemId) } : c,
        ),
      }));
    } catch {
      Alert.alert(t('trip.packingList.deleteItemError'));
    }
  }

  // --- Assignment ---

  async function handleAssign(memberId: string | null) {
    if (!assignTarget) return;
    const { categoryId, item } = assignTarget;
    setAssignPickerOpen(false);

    const assignedMember = memberId ? members.find((m) => m.id === memberId) : null;
    setData((prev) => ({
      ...prev,
      [activeTab]: prev[activeTab].map((c) =>
        c.id === categoryId
          ? {
              ...c,
              items: c.items.map((i) =>
                i.id === item.id
                  ? { ...i, assignedToUserId: memberId, assignedToName: assignedMember?.name ?? null, assignedToAvatarUrl: assignedMember?.avatarUrl ?? null }
                  : i,
              ),
            }
          : c,
      ),
    }));

    try {
      const body = memberId
        ? JSON.stringify({ assignedToUserId: memberId })
        : JSON.stringify({ clearAssignment: true });
      await apiFetch(`/api/trips/${tripId}/packing-list/items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
    } catch {
      Alert.alert(t('trip.packingList.assignError'));
      void load();
    }
    setAssignTarget(null);
  }

  const isPrivate = activeTab === 'private';

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 18) + 4 }]}>
        <TouchableOpacity style={styles.backButton} activeOpacity={0.88} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#11131a" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{t('trip.packingList.title')}</Text>
          {totalItems > 0
            ? <Text style={styles.headerSub}>{checkedItems}/{totalItems}</Text>
            : null}
        </View>
        <TouchableOpacity
          style={styles.headerAddButton}
          activeOpacity={0.88}
          onPress={() => { setAddCategoryOpen(true); setTimeout(() => categoryInputRef.current?.focus(), 120); }}>
          <Ionicons name="add" size={22} color={isPrivate ? PRIVATE_COLOR : COLORS.primary} />
        </TouchableOpacity>
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, !isPrivate && styles.tabActiveShared]}
          activeOpacity={0.85}
          onPress={() => setActiveTab('shared')}>
          <Ionicons name="people-outline" size={14} color={!isPrivate ? COLORS.primary : '#8a909d'} />
          <Text style={[styles.tabLabel, !isPrivate && styles.tabLabelActiveShared]}>
            {t('trip.packingList.sharedTab')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, isPrivate && styles.tabActivePrivate]}
          activeOpacity={0.85}
          onPress={() => setActiveTab('private')}>
          <Ionicons name="lock-closed-outline" size={14} color={isPrivate ? PRIVATE_COLOR : '#8a909d'} />
          <Text style={[styles.tabLabel, isPrivate && styles.tabLabelActivePrivate]}>
            {t('trip.packingList.privateTab')}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Scope hint */}
      <View style={[styles.scopeHint, isPrivate && styles.scopeHintPrivate]}>
        <Ionicons
          name={isPrivate ? 'lock-closed-outline' : 'people-outline'}
          size={13}
          color={isPrivate ? PRIVATE_COLOR : COLORS.primary}
        />
        <Text style={[styles.scopeHintText, isPrivate && styles.scopeHintTextPrivate]}>
          {isPrivate ? t('trip.packingList.privateHint') : t('trip.packingList.sharedHint')}
        </Text>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={40} color="#d53d18" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => void load()}>
            <Text style={styles.retryButtonText}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior="padding">
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom, 20) + 32 }]}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={COLORS.primary} />
            }
            {...scrollViewProps}>

            {/* Add category form */}
            {addCategoryOpen ? (
              <View style={[styles.addCategoryCard, isPrivate && styles.addCategoryCardPrivate]}>
                <TextInput
                  ref={categoryInputRef}
                  value={addCategoryDraft}
                  onChangeText={setAddCategoryDraft}
                  onFocus={onFocusField(categoryInputRef)}
                  placeholder={t('trip.packingList.categoryPlaceholder')}
                  placeholderTextColor="#a3a9b4"
                  style={styles.addCategoryInput}
                  returnKeyType="done"
                  onSubmitEditing={() => void handleAddCategory()}
                  autoFocus
                />
                <View style={styles.addCategoryRow}>
                  <TouchableOpacity
                    style={styles.addCategoryCancel}
                    onPress={() => { setAddCategoryOpen(false); setAddCategoryDraft(''); }}>
                    <Text style={styles.addCategoryCancelText}>{t('common.cancel')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.addCategoryConfirm,
                      isPrivate && styles.addCategoryConfirmPrivate,
                      (!addCategoryDraft.trim() || addingCategory) && styles.addCategoryConfirmDisabled,
                    ]}
                    disabled={!addCategoryDraft.trim() || addingCategory}
                    onPress={() => void handleAddCategory()}>
                    {addingCategory
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Text style={styles.addCategoryConfirmText}>{t('trip.packingList.addCategory')}</Text>
                    }
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}

            {/* Empty state */}
            {categories.length === 0 && !addCategoryOpen ? (
              <View style={styles.emptyState}>
                <Ionicons name={isPrivate ? 'lock-closed-outline' : 'bag-outline'} size={48} color="#c8cdd6" />
                <Text style={styles.emptyTitle}>
                  {isPrivate ? t('trip.packingList.privateEmptyTitle') : t('trip.packingList.sharedEmptyTitle')}
                </Text>
                <Text style={styles.emptySubtitle}>
                  {isPrivate ? t('trip.packingList.privateEmptySubtitle') : t('trip.packingList.sharedEmptySubtitle')}
                </Text>
                <TouchableOpacity
                  style={[styles.emptyAddButton, isPrivate && styles.emptyAddButtonPrivate]}
                  activeOpacity={0.88}
                  onPress={() => { setAddCategoryOpen(true); setTimeout(() => categoryInputRef.current?.focus(), 120); }}>
                  <Ionicons name="add" size={16} color="#fff" />
                  <Text style={styles.emptyAddButtonText}>{t('trip.packingList.addFirstCategory')}</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {/* Category list */}
            {categories.map((category) => {
              const categoryDrafts = drafts[category.id] ?? [];
              const checkedCount = category.items.filter((i) => i.isChecked).length;
              const canDelete = category.createdByUserId === user?.id;

              return (
                <View key={category.id} style={[styles.categoryCard, isPrivate && styles.categoryCardPrivate]}>
                  <View style={styles.categoryHeader}>
                    <Text style={styles.categoryName}>{category.name}</Text>
                    <Text style={styles.categoryCount}>{checkedCount}/{category.items.length}</Text>
                    {canDelete ? (
                      <TouchableOpacity hitSlop={8} onPress={() => void handleDeleteCategory(category.id)}>
                        <Ionicons name="trash-outline" size={15} color="#c2c8d2" />
                      </TouchableOpacity>
                    ) : null}
                  </View>

                  {/* Saved items */}
                  {category.items.map((item) => (
                    <View key={item.id} style={styles.itemRow}>
                      <TouchableOpacity
                        style={[
                          styles.checkbox,
                          item.isChecked && (isPrivate ? styles.checkboxCheckedPrivate : styles.checkboxChecked),
                        ]}
                        activeOpacity={0.75}
                        onPress={() => void handleToggleItem(category.id, item)}>
                        {item.isChecked ? <Ionicons name="checkmark" size={13} color="#fff" /> : null}
                      </TouchableOpacity>

                      <Text style={[styles.itemText, item.isChecked && styles.itemTextChecked]} numberOfLines={2}>
                        {item.text}
                      </Text>

                      {/* Assignment (shared only) */}
                      {!isPrivate ? (
                        <TouchableOpacity
                          style={styles.assignButton}
                          hitSlop={6}
                          onPress={() => { setAssignTarget({ categoryId: category.id, item }); setAssignPickerOpen(true); }}>
                          {item.assignedToUserId ? (
                            <View style={styles.assignedBadge}>
                              <Avatar name={item.assignedToName ?? '?'} uri={item.assignedToAvatarUrl} size={22} />
                            </View>
                          ) : (
                            <View style={styles.assignEmpty}>
                              <Ionicons name="person-add-outline" size={13} color="#b0b6c1" />
                            </View>
                          )}
                        </TouchableOpacity>
                      ) : null}

                      {item.createdByUserId === user?.id ? (
                        <TouchableOpacity hitSlop={8} onPress={() => void handleDeleteItem(category.id, item.id)}>
                          <Ionicons name="close" size={15} color="#c2c8d2" />
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  ))}

                  {/* Draft rows — notepad UX */}
                  {categoryDrafts.map((draft) => (
                    <View key={draft.key} style={styles.itemRow}>
                      <View style={[styles.checkbox, styles.checkboxDraft]}>
                        {savingDraft === draft.key
                          ? <ActivityIndicator size="small" color={COLORS.primary} />
                          : null}
                      </View>
                      <TextInput
                        ref={(r) => { draftRefs.current[draft.key] = r; }}
                        value={draft.text}
                        onChangeText={(v) => {
                          const parts = splitPastedChecklistItems(v);
                          if (parts.length > 1) {
                            // List paste → one item per row. Clear the field
                            // natively right away: the draft state never held
                            // the pasted text, so a state update alone would
                            // not re-render the leftovers away.
                            draftRefs.current[draft.key]?.clear();
                            updateDraft(category.id, draft.key, '');
                            void addPastedItems(category.id, draft.key, parts);
                          } else {
                            // Ordinary typing (or a single pasted row): keep
                            // the text as-is minus any leading bullet/check —
                            // no trim, or trailing spaces would vanish while
                            // typing multi-word items.
                            updateDraft(category.id, draft.key, stripNotesChecklistMarkers(v).replace(/^\s*[•✓]\s+/, ''));
                          }
                        }}
                        onFocus={() => onFocusField({ current: draftRefs.current[draft.key] })()}
                        placeholder={t('trip.packingList.addItemPlaceholder')}
                        placeholderTextColor="#b8bec8"
                        style={styles.draftInput}
                        returnKeyType="done"
                        blurOnSubmit={false}
                        onSubmitEditing={() => void commitDraft(category.id, draft.key, draft.text)}
                        // Tapping outside the field saves a non-empty item too
                        // (Return is no longer the only way); empty drafts are
                        // still discarded like before.
                        onBlur={() => {
                          if (draft.text.trim()) {
                            void commitDraft(category.id, draft.key, draft.text, false);
                          } else {
                            removeDraft(category.id, draft.key);
                          }
                        }}
                      />
                    </View>
                  ))}

                  {/* Tap to start a new draft row */}
                  <TouchableOpacity style={styles.addItemTap} activeOpacity={0.7} onPress={() => ensureDraft(category.id)}>
                    <Ionicons name="add" size={15} color={isPrivate ? PRIVATE_COLOR : COLORS.primary} />
                    <Text style={[styles.addItemTapText, isPrivate && styles.addItemTapTextPrivate]}>
                      {t('trip.packingList.addItemPlaceholder')}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })}

            {/* Add more category button */}
            {categories.length > 0 && !addCategoryOpen ? (
              <TouchableOpacity
                style={styles.addMoreCategoryButton}
                activeOpacity={0.85}
                onPress={() => { setAddCategoryOpen(true); setTimeout(() => categoryInputRef.current?.focus(), 120); }}>
                <Ionicons name="add-circle-outline" size={18} color={isPrivate ? PRIVATE_COLOR : COLORS.primary} />
                <Text style={[styles.addMoreCategoryText, isPrivate && styles.addMoreCategoryTextPrivate]}>
                  {t('trip.packingList.addCategory')}
                </Text>
              </TouchableOpacity>
            ) : null}

          </ScrollView>
        </KeyboardAvoidingView>
      )}

      {/* Assign member picker */}
      <Modal
        visible={assignPickerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => { setAssignPickerOpen(false); setAssignTarget(null); }}>
        <Pressable
          style={styles.assignBackdrop}
          onPress={() => { setAssignPickerOpen(false); setAssignTarget(null); }} />
        <View style={[styles.assignSheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
          <View style={styles.sheetHandle} />
          <Text style={styles.assignSheetTitle}>{t('trip.packingList.assignPickerTitle')}</Text>

          {assignTarget?.item.assignedToUserId ? (
            <TouchableOpacity style={styles.unassignButton} onPress={() => void handleAssign(null)}>
              <Ionicons name="close-circle-outline" size={18} color="#d53d18" />
              <Text style={styles.unassignButtonText}>{t('trip.packingList.unassign')}</Text>
            </TouchableOpacity>
          ) : null}

          <FlatList
            data={members}
            keyExtractor={(m) => m.id}
            scrollEnabled={false}
            renderItem={({ item: member }) => {
              const isAssigned = assignTarget?.item.assignedToUserId === member.id;
              return (
                <TouchableOpacity
                  style={[styles.memberPickerRow, isAssigned && styles.memberPickerRowActive]}
                  activeOpacity={0.8}
                  onPress={() => void handleAssign(member.id)}>
                  <Avatar name={member.name} uri={member.avatarUrl} size={36} online={member.isOnline} />
                  <Text style={styles.memberPickerName}>{member.name}</Text>
                  {isAssigned ? <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} /> : null}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f7f8fa' },
  flex: { flex: 1 },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 12,
    backgroundColor: '#f7f8fa',
    borderBottomWidth: 1, borderBottomColor: '#eceef2',
  },
  backButton: {
    width: 40, height: 40, alignItems: 'center', justifyContent: 'center',
    borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: '#eceef2',
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#11131a', letterSpacing: -0.4 },
  headerSub: { fontSize: 11, color: '#8a909d', fontWeight: '600', marginTop: 1 },
  headerAddButton: {
    width: 40, height: 40, alignItems: 'center', justifyContent: 'center',
    borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: '#eceef2',
  },

  tabBar: {
    flexDirection: 'row', backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#eceef2',
    paddingHorizontal: 16,
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12,
    borderBottomWidth: 2.5, borderBottomColor: 'transparent',
  },
  tabActiveShared: { borderBottomColor: COLORS.primary },
  tabActivePrivate: { borderBottomColor: PRIVATE_COLOR },
  tabLabel: { fontSize: 13, fontWeight: '700', color: '#8a909d' },
  tabLabelActiveShared: { color: COLORS.primary },
  tabLabelActivePrivate: { color: PRIVATE_COLOR },

  scopeHint: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: '#eef4ff',
  },
  scopeHintPrivate: { backgroundColor: '#f5f0ff' },
  scopeHintText: { fontSize: 12, color: COLORS.primary, fontWeight: '600', flex: 1 },
  scopeHintTextPrivate: { color: PRIVATE_COLOR },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  errorText: { fontSize: 14, color: '#5c6370', textAlign: 'center' },
  retryButton: {
    paddingHorizontal: 20, paddingVertical: 10,
    borderRadius: 14, backgroundColor: COLORS.primary,
  },
  retryButtonText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  scrollContent: { padding: 16, gap: 12 },

  addCategoryCard: {
    backgroundColor: '#fff', borderRadius: 22,
    borderWidth: 1.5, borderColor: COLORS.primary, padding: 16, gap: 12,
  },
  addCategoryCardPrivate: { borderColor: PRIVATE_COLOR },
  addCategoryInput: {
    height: 48, borderRadius: 14, borderWidth: 1, borderColor: '#eceef2',
    backgroundColor: '#f7f8fa', paddingHorizontal: 14, fontSize: 15, color: '#14161d',
  },
  addCategoryRow: { flexDirection: 'row', gap: 10 },
  addCategoryCancel: {
    flex: 1, height: 44, borderRadius: 14, borderWidth: 1.5, borderColor: '#eceef2',
    alignItems: 'center', justifyContent: 'center',
  },
  addCategoryCancelText: { fontSize: 14, fontWeight: '700', color: '#7b828e' },
  addCategoryConfirm: {
    flex: 2, height: 44, borderRadius: 14,
    backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center',
  },
  addCategoryConfirmPrivate: { backgroundColor: PRIVATE_COLOR },
  addCategoryConfirmDisabled: { opacity: 0.5 },
  addCategoryConfirmText: { fontSize: 14, fontWeight: '800', color: '#fff' },

  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 10 },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: '#14161d', letterSpacing: -0.4, marginTop: 8 },
  emptySubtitle: {
    fontSize: 14, color: '#8a909d', textAlign: 'center',
    lineHeight: 20, paddingHorizontal: 24,
  },
  emptyAddButton: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 8, paddingHorizontal: 20, paddingVertical: 12,
    borderRadius: 16, backgroundColor: COLORS.primary,
  },
  emptyAddButtonPrivate: { backgroundColor: PRIVATE_COLOR },
  emptyAddButtonText: { fontSize: 14, fontWeight: '800', color: '#fff' },

  categoryCard: {
    backgroundColor: '#fff', borderRadius: 22,
    borderWidth: 1, borderColor: '#eceef2', overflow: 'hidden',
  },
  categoryCardPrivate: { borderColor: '#e4d9ff' },
  categoryHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: '#f1f3f6',
  },
  categoryName: {
    flex: 1, fontSize: 12, fontWeight: '800', color: '#14161d',
    letterSpacing: 0.4, textTransform: 'uppercase',
  },
  categoryCount: { fontSize: 11, color: '#a3a9b4', fontWeight: '600' },

  itemRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#f5f6f8',
  },
  checkbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 2,
    borderColor: '#d0d4dd', backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  checkboxChecked: { borderColor: COLORS.primary, backgroundColor: COLORS.primary },
  checkboxCheckedPrivate: { borderColor: PRIVATE_COLOR, backgroundColor: PRIVATE_COLOR },
  checkboxDraft: { borderColor: '#e8eaf0', borderStyle: 'dashed' },
  itemText: { flex: 1, fontSize: 14, color: '#14161d', fontWeight: '500' },
  itemTextChecked: { color: '#a3a9b4', textDecorationLine: 'line-through' },

  draftInput: { flex: 1, fontSize: 14, color: '#14161d', paddingVertical: 0, minHeight: 22 },

  assignButton: { marginLeft: 2 },
  assignedBadge: {
    width: 26, height: 26, borderRadius: 13,
    overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
  },
  assignEmpty: {
    width: 26, height: 26, borderRadius: 13,
    borderWidth: 1.5, borderColor: '#dde1e8', borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center',
  },

  addItemTap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  addItemTapText: { fontSize: 13, color: COLORS.primary, fontWeight: '600' },
  addItemTapTextPrivate: { color: PRIVATE_COLOR },

  addMoreCategoryButton: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 14, justifyContent: 'center',
  },
  addMoreCategoryText: { fontSize: 14, fontWeight: '700', color: COLORS.primary },
  addMoreCategoryTextPrivate: { color: PRIVATE_COLOR },

  assignBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.38)' },
  assignSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 12,
    maxHeight: '70%',
  },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: '#dde1e8', alignSelf: 'center', marginBottom: 16,
  },
  assignSheetTitle: {
    fontSize: 17, fontWeight: '800', color: '#14161d',
    letterSpacing: -0.4, marginBottom: 12,
  },
  unassignButton: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 12, marginBottom: 4,
    borderBottomWidth: 1, borderBottomColor: '#f1f3f6',
  },
  unassignButtonText: { fontSize: 14, fontWeight: '700', color: '#d53d18' },
  memberPickerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f5f6f8',
  },
  memberPickerRowActive: { backgroundColor: '#f8f9ff' },
  memberPickerName: { flex: 1, fontSize: 15, fontWeight: '600', color: '#14161d' },
});
