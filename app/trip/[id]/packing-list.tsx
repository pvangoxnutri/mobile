import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  Alert,
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
import { apiFetch, apiJson } from '@/lib/api';
import { COLORS } from '@/constants/design-tokens';

type PackingItem = {
  id: string;
  text: string;
  isChecked: boolean;
  sortOrder: number;
  createdByUserId: string;
};

type PackingCategory = {
  id: string;
  name: string;
  sortOrder: number;
  createdByUserId: string;
  items: PackingItem[];
};

export default function PackingListScreen() {
  const { id: tripId } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();

  const [categories, setCategories] = useState<PackingCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const [addCategoryDraft, setAddCategoryDraft] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);
  const [addCategoryOpen, setAddCategoryOpen] = useState(false);

  const [addItemDrafts, setAddItemDrafts] = useState<Record<string, string>>({});
  const [addingItemFor, setAddingItemFor] = useState<string | null>(null);

  const categoryInputRef = useRef<TextInput>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError('');
    try {
      const data = await apiJson<PackingCategory[]>(`/api/trips/${tripId}/packing-list`);
      setCategories(data);
    } catch {
      setError(t('trip.packingList.loadError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tripId, t]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function handleAddCategory() {
    const name = addCategoryDraft.trim();
    if (!name) return;
    setAddingCategory(true);
    try {
      const created = await apiJson<PackingCategory>(`/api/trips/${tripId}/packing-list/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      setCategories((prev) => [...prev, { ...created, items: [] }]);
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
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await apiFetch(`/api/trips/${tripId}/packing-list/categories/${categoryId}`, { method: 'DELETE' });
              setCategories((prev) => prev.filter((c) => c.id !== categoryId));
            } catch {
              Alert.alert(t('trip.packingList.deleteCategoryError'));
            }
          },
        },
      ],
    );
  }

  async function handleAddItem(categoryId: string) {
    const text = (addItemDrafts[categoryId] ?? '').trim();
    if (!text) return;
    setAddingItemFor(categoryId);
    try {
      const created = await apiJson<PackingItem>(
        `/api/trips/${tripId}/packing-list/categories/${categoryId}/items`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        },
      );
      setCategories((prev) =>
        prev.map((c) =>
          c.id === categoryId ? { ...c, items: [...c.items, created] } : c,
        ),
      );
      setAddItemDrafts((prev) => ({ ...prev, [categoryId]: '' }));
    } catch {
      Alert.alert(t('trip.packingList.addItemError'));
    } finally {
      setAddingItemFor(null);
    }
  }

  async function handleToggleItem(categoryId: string, item: PackingItem) {
    const newChecked = !item.isChecked;
    setCategories((prev) =>
      prev.map((c) =>
        c.id === categoryId
          ? { ...c, items: c.items.map((i) => (i.id === item.id ? { ...i, isChecked: newChecked } : i)) }
          : c,
      ),
    );
    try {
      await apiFetch(`/api/trips/${tripId}/packing-list/items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isChecked: newChecked }),
      });
    } catch {
      // Revert on failure
      setCategories((prev) =>
        prev.map((c) =>
          c.id === categoryId
            ? { ...c, items: c.items.map((i) => (i.id === item.id ? { ...i, isChecked: item.isChecked } : i)) }
            : c,
        ),
      );
    }
  }

  async function handleDeleteItem(categoryId: string, itemId: string) {
    try {
      await apiFetch(`/api/trips/${tripId}/packing-list/items/${itemId}`, { method: 'DELETE' });
      setCategories((prev) =>
        prev.map((c) =>
          c.id === categoryId ? { ...c, items: c.items.filter((i) => i.id !== itemId) } : c,
        ),
      );
    } catch {
      Alert.alert(t('trip.packingList.deleteItemError'));
    }
  }

  const totalItems = categories.reduce((n, c) => n + c.items.length, 0);
  const checkedItems = categories.reduce((n, c) => n + c.items.filter((i) => i.isChecked).length, 0);

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 18) + 4 }]}>
        <TouchableOpacity style={styles.backButton} activeOpacity={0.88} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#11131a" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{t('trip.packingList.title')}</Text>
          {totalItems > 0 ? (
            <Text style={styles.headerSub}>{checkedItems}/{totalItems}</Text>
          ) : null}
        </View>
        <TouchableOpacity
          style={styles.headerAddButton}
          activeOpacity={0.88}
          onPress={() => {
            setAddCategoryOpen(true);
            setTimeout(() => categoryInputRef.current?.focus(), 120);
          }}>
          <Ionicons name="add" size={22} color={COLORS.primary} />
        </TouchableOpacity>
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
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom, 20) + 24 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={COLORS.primary} />}>

          {/* Add category input */}
          {addCategoryOpen ? (
            <View style={styles.addCategoryCard}>
              <TextInput
                ref={categoryInputRef}
                value={addCategoryDraft}
                onChangeText={setAddCategoryDraft}
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
                  style={[styles.addCategoryConfirm, (!addCategoryDraft.trim() || addingCategory) && styles.addCategoryConfirmDisabled]}
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
              <Ionicons name="bag-outline" size={48} color="#c8cdd6" />
              <Text style={styles.emptyTitle}>{t('trip.packingList.emptyTitle')}</Text>
              <Text style={styles.emptySubtitle}>{t('trip.packingList.emptySubtitle')}</Text>
              <TouchableOpacity
                style={styles.emptyAddButton}
                activeOpacity={0.88}
                onPress={() => {
                  setAddCategoryOpen(true);
                  setTimeout(() => categoryInputRef.current?.focus(), 120);
                }}>
                <Ionicons name="add" size={16} color="#fff" />
                <Text style={styles.emptyAddButtonText}>{t('trip.packingList.addFirstCategory')}</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Categories */}
          {categories.map((category) => (
            <View key={category.id} style={styles.categoryCard}>
              {/* Category header */}
              <View style={styles.categoryHeader}>
                <Text style={styles.categoryName}>{category.name}</Text>
                <Text style={styles.categoryCount}>
                  {category.items.filter((i) => i.isChecked).length}/{category.items.length}
                </Text>
                {(category.createdByUserId === user?.id) ? (
                  <TouchableOpacity
                    hitSlop={8}
                    onPress={() => void handleDeleteCategory(category.id)}>
                    <Ionicons name="trash-outline" size={16} color="#c2c8d2" />
                  </TouchableOpacity>
                ) : null}
              </View>

              {/* Items */}
              {category.items.map((item) => (
                <View key={item.id} style={styles.itemRow}>
                  <TouchableOpacity
                    style={[styles.checkbox, item.isChecked && styles.checkboxChecked]}
                    activeOpacity={0.75}
                    onPress={() => void handleToggleItem(category.id, item)}>
                    {item.isChecked ? <Ionicons name="checkmark" size={13} color="#fff" /> : null}
                  </TouchableOpacity>
                  <Text
                    style={[styles.itemText, item.isChecked && styles.itemTextChecked]}
                    numberOfLines={2}>
                    {item.text}
                  </Text>
                  {(item.createdByUserId === user?.id) ? (
                    <TouchableOpacity
                      hitSlop={8}
                      onPress={() => void handleDeleteItem(category.id, item.id)}>
                      <Ionicons name="close" size={16} color="#c2c8d2" />
                    </TouchableOpacity>
                  ) : null}
                </View>
              ))}

              {/* Add item */}
              <View style={styles.addItemRow}>
                <TextInput
                  value={addItemDrafts[category.id] ?? ''}
                  onChangeText={(v) => setAddItemDrafts((prev) => ({ ...prev, [category.id]: v }))}
                  placeholder={t('trip.packingList.addItemPlaceholder')}
                  placeholderTextColor="#b8bec8"
                  style={styles.addItemInput}
                  returnKeyType="done"
                  onSubmitEditing={() => void handleAddItem(category.id)}
                />
                <TouchableOpacity
                  style={[
                    styles.addItemButton,
                    (!(addItemDrafts[category.id] ?? '').trim() || addingItemFor === category.id) && styles.addItemButtonDisabled,
                  ]}
                  disabled={!(addItemDrafts[category.id] ?? '').trim() || addingItemFor === category.id}
                  onPress={() => void handleAddItem(category.id)}>
                  {addingItemFor === category.id
                    ? <ActivityIndicator size="small" color={COLORS.primary} />
                    : <Ionicons name="add" size={18} color={COLORS.primary} />
                  }
                </TouchableOpacity>
              </View>
            </View>
          ))}

          {/* Add category button (when list not empty) */}
          {categories.length > 0 && !addCategoryOpen ? (
            <TouchableOpacity
              style={styles.addMoreCategoryButton}
              activeOpacity={0.85}
              onPress={() => {
                setAddCategoryOpen(true);
                setTimeout(() => categoryInputRef.current?.focus(), 120);
              }}>
              <Ionicons name="add-circle-outline" size={18} color={COLORS.primary} />
              <Text style={styles.addMoreCategoryText}>{t('trip.packingList.addCategory')}</Text>
            </TouchableOpacity>
          ) : null}

        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f7f8fa' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#f7f8fa',
    borderBottomWidth: 1,
    borderBottomColor: '#eceef2',
  },
  backButton: {
    width: 40, height: 40, alignItems: 'center', justifyContent: 'center',
    borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: '#eceef2',
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: {
    fontSize: 17, fontWeight: '800', color: '#11131a', letterSpacing: -0.4,
  },
  headerSub: { fontSize: 11, color: '#8a909d', fontWeight: '600', marginTop: 1 },
  headerAddButton: {
    width: 40, height: 40, alignItems: 'center', justifyContent: 'center',
    borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: '#eceef2',
  },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  errorText: { fontSize: 14, color: '#5c6370', textAlign: 'center' },
  retryButton: {
    paddingHorizontal: 20, paddingVertical: 10,
    borderRadius: 14, backgroundColor: COLORS.primary,
  },
  retryButtonText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  scrollContent: { padding: 16, gap: 12 },
  addCategoryCard: {
    backgroundColor: '#fff', borderRadius: 22, borderWidth: 1,
    borderColor: COLORS.primary, padding: 16, gap: 12,
  },
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
  addCategoryConfirmDisabled: { opacity: 0.5 },
  addCategoryConfirmText: { fontSize: 14, fontWeight: '800', color: '#fff' },
  emptyState: {
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 60, gap: 10,
  },
  emptyTitle: {
    fontSize: 17, fontWeight: '800', color: '#14161d',
    letterSpacing: -0.4, marginTop: 8,
  },
  emptySubtitle: { fontSize: 14, color: '#8a909d', textAlign: 'center', lineHeight: 20 },
  emptyAddButton: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 8, paddingHorizontal: 20, paddingVertical: 12,
    borderRadius: 16, backgroundColor: COLORS.primary,
  },
  emptyAddButtonText: { fontSize: 14, fontWeight: '800', color: '#fff' },
  categoryCard: {
    backgroundColor: '#fff', borderRadius: 22,
    borderWidth: 1, borderColor: '#eceef2', overflow: 'hidden',
  },
  categoryHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#f1f3f6',
  },
  categoryName: {
    flex: 1, fontSize: 14, fontWeight: '800',
    color: '#14161d', letterSpacing: -0.2,
    textTransform: 'uppercase',
  },
  categoryCount: { fontSize: 12, color: '#a3a9b4', fontWeight: '600' },
  itemRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 11,
    borderBottomWidth: 1, borderBottomColor: '#f5f6f8',
  },
  checkbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 2,
    borderColor: '#d0d4dd', backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  checkboxChecked: { borderColor: COLORS.primary, backgroundColor: COLORS.primary },
  itemText: { flex: 1, fontSize: 14, color: '#14161d', fontWeight: '500' },
  itemTextChecked: { color: '#a3a9b4', textDecorationLine: 'line-through' },
  addItemRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  addItemInput: {
    flex: 1, height: 40, borderRadius: 12, borderWidth: 1,
    borderColor: '#eceef2', backgroundColor: '#f7f8fa',
    paddingHorizontal: 12, fontSize: 14, color: '#14161d',
  },
  addItemButton: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: '#eef4ff', alignItems: 'center', justifyContent: 'center',
  },
  addItemButtonDisabled: { opacity: 0.4 },
  addMoreCategoryButton: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 14, justifyContent: 'center',
  },
  addMoreCategoryText: { fontSize: 14, fontWeight: '700', color: COLORS.primary },
});
