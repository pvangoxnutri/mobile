import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/components/auth-provider';
import { apiFetch, apiJson } from '@/lib/api';
import { uploadImageIfNeeded } from '@/lib/uploads';
import type { BalancesResponse, Debt, Expense, Settlement } from '@/lib/types';
import { PRIMARY_COLOR, PRIMARY_08 } from '@/constants/colors';

type TripMember = {
  id: string;
  name: string;
  avatarUrl?: string | null;
  isOwner: boolean;
};

type SplitMode = 'equal' | 'exact' | 'percentage';

type AddExpenseForm = {
  description: string;
  amount: string;
  date: string;
  splitMode: SplitMode;
  payerAmounts: Record<string, string>; // userId -> amount string
  selectedPayers: Set<string>;
  selectedParticipants: Set<string>;
  participantValues: Record<string, string>; // userId -> value string (pct/exact)
  // Local file URI of a picked-but-not-yet-uploaded receipt photo. Uploaded
  // (and swapped for the resulting https URL) only on submit, so cancelling
  // the modal never leaves an orphaned upload.
  receiptImage: string | null;
};

function getInitials(name?: string | null) {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

function formatDate(dateStr: string) {
  try {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(
      new Date(`${dateStr}T12:00:00`),
    );
  } catch {
    return dateStr;
  }
}

function formatAmount(amount: number) {
  return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function CostSplitScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<'expenses' | 'balances' | 'settle'>('expenses');
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [balancesData, setBalancesData] = useState<BalancesResponse | null>(null);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [members, setMembers] = useState<TripMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [pickingReceipt, setPickingReceipt] = useState(false);

  const [form, setForm] = useState<AddExpenseForm>({
    description: '',
    amount: '',
    date: todayIso(),
    splitMode: 'equal',
    payerAmounts: {},
    selectedPayers: new Set<string>(),
    selectedParticipants: new Set<string>(),
    participantValues: {},
    receiptImage: null,
  });

  const [expandedBalanceUser, setExpandedBalanceUser] = useState<string | null>(null);
  const [expandedDebtKey, setExpandedDebtKey] = useState<string | null>(null);

  const [settlingDebt, setSettlingDebt] = useState<Debt | null>(null);
  const [settleSubmitting, setSettleSubmitting] = useState(false);
  const [settleError, setSettleError] = useState('');
  const [settledKeys, setSettledKeys] = useState<Set<string>>(new Set());

  const [viewingReceiptUrl, setViewingReceiptUrl] = useState<string | null>(null);

  const [deletingExpenseId, setDeletingExpenseId] = useState<string | null>(null);
  const [deletingSettlementId, setDeletingSettlementId] = useState<string | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [actionError, setActionError] = useState('');

  const loadAll = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const [exp, bal, sett, mem] = await Promise.all([
        apiJson<Expense[]>(`/api/trips/${id}/expenses`),
        apiJson<BalancesResponse>(`/api/trips/${id}/expenses/balances`),
        apiJson<Settlement[]>(`/api/trips/${id}/expenses/settlements`),
        apiJson<TripMember[]>(`/api/trips/${id}/members`),
      ]);
      setExpenses(exp);
      setBalancesData(bal);
      setSettlements(sett);
      setMembers(mem);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load cost split data.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void loadAll();
    }, [loadAll]),
  );

  function openAddModal() {
    if (!user) return;
    setForm({
      description: '',
      amount: '',
      date: todayIso(),
      splitMode: 'equal',
      payerAmounts: { [user.id]: '' },
      selectedPayers: new Set([user.id]),
      selectedParticipants: new Set(members.map((m) => m.id)),
      participantValues: {},
      receiptImage: null,
    });
    setSubmitError('');
    setAddModalOpen(true);
  }

  function setField<K extends keyof AddExpenseForm>(key: K, value: AddExpenseForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function togglePayer(memberId: string) {
    setForm((prev) => {
      const next = new Set(prev.selectedPayers);
      const nextAmounts = { ...prev.payerAmounts };
      if (next.has(memberId)) {
        next.delete(memberId);
        delete nextAmounts[memberId];
      } else {
        next.add(memberId);
        nextAmounts[memberId] = '';
      }
      return { ...prev, selectedPayers: next, payerAmounts: nextAmounts };
    });
  }

  // Friendly, non-blocking permission requests — if denied we just show an
  // inline error and let the user keep filling out the rest of the form
  // (the receipt is always optional).
  async function handleTakeReceiptPhoto() {
    if (pickingReceipt) return;
    setPickingReceipt(true);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setSubmitError('Camera access is needed to photograph a receipt. You can still add the expense without one.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) {
        setSubmitError('');
        setField('receiptImage', result.assets[0].uri);
      }
    } finally {
      setPickingReceipt(false);
    }
  }

  async function handlePickReceiptFromGallery() {
    if (pickingReceipt) return;
    setPickingReceipt(true);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setSubmitError('Photo library access is needed to attach a receipt. You can still add the expense without one.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) {
        setSubmitError('');
        setField('receiptImage', result.assets[0].uri);
      }
    } finally {
      setPickingReceipt(false);
    }
  }

  function handleRemoveReceipt() {
    setField('receiptImage', null);
  }

  function toggleParticipant(memberId: string) {
    setForm((prev) => {
      const next = new Set(prev.selectedParticipants);
      const nextValues = { ...prev.participantValues };
      if (next.has(memberId)) {
        next.delete(memberId);
        delete nextValues[memberId];
      } else {
        next.add(memberId);
      }
      return { ...prev, selectedParticipants: next, participantValues: nextValues };
    });
  }

  async function handleSubmitExpense() {
    setSubmitError('');
    const totalAmount = parseFloat(form.amount);
    if (!form.description.trim()) { setSubmitError('Enter a description.'); return; }
    if (isNaN(totalAmount) || totalAmount <= 0) { setSubmitError('Enter a valid amount.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) { setSubmitError('Date must be YYYY-MM-DD.'); return; }
    if (form.selectedPayers.size === 0) { setSubmitError('Select at least one payer.'); return; }
    if (form.selectedParticipants.size === 0) { setSubmitError('Select at least one participant.'); return; }

    const payersList = Array.from(form.selectedPayers).map((uid) => ({
      userId: uid,
      amount: parseFloat(form.payerAmounts[uid] ?? '0') || 0,
    }));

    // If only one payer, auto-fill their amount
    if (payersList.length === 1) {
      payersList[0].amount = totalAmount;
    }

    const payersSum = payersList.reduce((s, p) => s + p.amount, 0);
    if (Math.abs(payersSum - totalAmount) > 0.01) {
      setSubmitError(`Payer amounts must sum to ${formatAmount(totalAmount)} (currently ${formatAmount(payersSum)}).`);
      return;
    }

    let participantValues = Array.from(form.selectedParticipants).map((uid) => ({
      userId: uid,
      value: form.splitMode === 'equal' ? 1 : parseFloat(form.participantValues[uid] ?? '0') || 0,
    }));

    if (form.splitMode === 'percentage') {
      const pctSum = participantValues.reduce((s, p) => s + p.value, 0);
      if (pctSum <= 0) { setSubmitError('Enter percentages for all participants.'); return; }
      if (Math.abs(pctSum - 100) > 5) { setSubmitError(`Percentages sum to ${pctSum.toFixed(1)}% — must be close to 100%.`); return; }
      // Auto-normalize so they sum to exactly 100
      participantValues = participantValues.map((p) => ({ ...p, value: Math.round((p.value / pctSum) * 10000) / 100 }));
    }

    const participantsList = participantValues;

    setSubmitting(true);
    try {
      // Upload the receipt only now, on actual save — picking a photo
      // earlier and then cancelling the modal should never leave an
      // orphaned file in storage.
      let receiptUrl: string | null = null;
      if (form.receiptImage) {
        try {
          receiptUrl = await uploadImageIfNeeded(form.receiptImage, 'receipt');
        } catch (err) {
          setSubmitError(err instanceof Error ? err.message : 'Could not upload the receipt photo.');
          setSubmitting(false);
          return;
        }
      }

      await apiFetch(`/api/trips/${id}/expenses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: form.description.trim(),
          totalAmount,
          date: form.date,
          splitMode: form.splitMode,
          receiptUrl,
          payers: payersList,
          participants: participantsList,
        }),
      });
      setAddModalOpen(false);
      await loadAll();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Unable to save expense.');
    } finally {
      setSubmitting(false);
    }
  }

  function debtKey(d: Debt) {
    return `${d.fromUserId}|${d.toUserId}|${d.amount.toFixed(2)}`;
  }

  async function handleConfirmDeleteExpense() {
    if (!deletingExpenseId) return;
    setDeletingBusy(true);
    setActionError('');
    try {
      const res = await apiFetch(`/api/trips/${encodeURIComponent(id)}/expenses/${encodeURIComponent(deletingExpenseId)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.text()) || 'Unable to remove expense.');
      setDeletingExpenseId(null);
      await loadAll();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to remove expense.');
    } finally {
      setDeletingBusy(false);
    }
  }

  function handleSettleDebt(debt: Debt) {
    if (settledKeys.has(debtKey(debt))) return;
    setSettlingDebt(debt);
    setSettleError('');
  }

  async function handleConfirmSettle() {
    if (!settlingDebt) return;
    const key = debtKey(settlingDebt);
    setSettleSubmitting(true);
    setSettleError('');
    setSettledKeys((prev) => new Set([...prev, key]));
    try {
      const res = await apiFetch(`/api/trips/${id}/expenses/settlements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromUserId: settlingDebt.fromUserId,
          toUserId: settlingDebt.toUserId,
          amount: settlingDebt.amount,
          note: 'Settled via Cost Split',
        }),
      });
      if (!res.ok) throw new Error((await res.text()) || 'Unable to record settlement.');
      setSettlingDebt(null);
      await loadAll();
      setSettledKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    } catch (err) {
      setSettleError(err instanceof Error ? err.message : 'Unable to record settlement.');
      setSettledKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    } finally {
      setSettleSubmitting(false);
    }
  }

  async function handleConfirmDeleteSettlement() {
    if (!deletingSettlementId) return;
    setDeletingBusy(true);
    setActionError('');
    try {
      const res = await apiFetch(`/api/trips/${encodeURIComponent(id)}/expenses/settlements/${encodeURIComponent(deletingSettlementId)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.text()) || 'Unable to remove settlement.');
      setDeletingSettlementId(null);
      await loadAll();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to remove settlement.');
    } finally {
      setDeletingBusy(false);
    }
  }

  function expensesBetween(fromUserId: string, toUserId: string) {
    return expenses.filter((e) => {
      const fromIsParticipant = e.participants.some((p) => p.userId === fromUserId);
      const toIsPayer = e.payers.some((p) => p.userId === toUserId);
      const toIsParticipant = e.participants.some((p) => p.userId === toUserId);
      const fromIsPayer = e.payers.some((p) => p.userId === fromUserId);
      return (fromIsParticipant && toIsPayer) || (toIsParticipant && fromIsPayer);
    });
  }

  const tripCurrencies = Array.from(new Set(expenses.map((e) => e.currency).filter(Boolean)));
  const commonCurrency = tripCurrencies.length === 1 ? tripCurrencies[0] : '';
  const hasMixedCurrencies = tripCurrencies.length > 1;

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 18) + 4 }]}>
        <TouchableOpacity style={styles.backButton} activeOpacity={0.88} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#11131a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Cost Split</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        {(['expenses', 'balances', 'settle'] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            activeOpacity={0.85}
            style={[styles.tabPill, activeTab === tab && [styles.tabPillActive, { backgroundColor: PRIMARY_COLOR }]]}
            onPress={() => setActiveTab(tab)}>
            <Text style={[styles.tabPillText, activeTab === tab && styles.tabPillTextActive]}>
              {tab === 'expenses' ? 'Expenses' : tab === 'balances' ? 'Balances' : 'Settle Up'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={PRIMARY_COLOR} />
        </View>
      ) : error ? (
        <View style={styles.errorWrap}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={[styles.retryButton, { backgroundColor: PRIMARY_COLOR }]} onPress={() => void loadAll()}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {/* Expenses Tab */}
          {activeTab === 'expenses' && (
            <ScrollView
              style={styles.tabContent}
              contentContainerStyle={[styles.tabContentInner, { paddingBottom: Math.max(insets.bottom, 24) + 100 }]}
              showsVerticalScrollIndicator={false}>
              {expenses.length === 0 ? (
                <View style={styles.emptyState}>
                  <View style={styles.emptyIcon}>
                    <Ionicons name="wallet-outline" size={32} color="#b0b6c0" />
                  </View>
                  <Text style={styles.emptyTitle}>No expenses yet</Text>
                  <Text style={styles.emptyCopy}>Add your first shared expense and track who owes what.</Text>
                </View>
              ) : (
                expenses.map((expense) => (
                  <View key={expense.id} style={styles.expenseCard}>
                    <View style={styles.expenseTop}>
                      {expense.receiptUrl ? (
                        <TouchableOpacity
                          activeOpacity={0.85}
                          onPress={() => setViewingReceiptUrl(expense.receiptUrl ?? null)}>
                          <Image source={{ uri: expense.receiptUrl }} style={styles.expenseReceiptThumb} />
                        </TouchableOpacity>
                      ) : null}
                      <View style={styles.expenseMain}>
                        <Text style={styles.expenseDescription}>{expense.description}</Text>
                        <Text style={styles.expenseDate}>{formatDate(expense.date)}</Text>
                      </View>
                      <View style={styles.expenseRight}>
                        <Text style={styles.expenseAmount}>
                          {expense.currency ? `${expense.currency} ` : ''}{formatAmount(expense.totalAmount)}
                        </Text>
                        <View style={[styles.splitModeChip, { backgroundColor: splitModeColor(expense.splitMode) }]}>
                          <Text style={styles.splitModeChipText}>{expense.splitMode}</Text>
                        </View>
                      </View>
                    </View>
                    <View style={styles.expenseMeta}>
                      <Text style={styles.expenseMetaText}>
                        {expense.payers.length === 1
                          ? `Paid by ${expense.payers[0].userName}`
                          : `Paid by ${expense.payers.map((p) => `${p.userName} (${expense.currency} ${formatAmount(p.amount)})`).join(', ')}`}
                      </Text>
                      <Text style={styles.expenseMetaText}>
                        Split between {expense.participants.length} · {expense.splitMode}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.deleteButton}
                      activeOpacity={0.8}
                      onPress={() => { setActionError(''); setDeletingExpenseId(expense.id); }}>
                      <Ionicons name="trash-outline" size={16} color="#d95f6a" />
                      <Text style={styles.deleteButtonText}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </ScrollView>
          )}

          {/* Balances Tab */}
          {activeTab === 'balances' && (
            <ScrollView
              style={styles.tabContent}
              contentContainerStyle={[styles.tabContentInner, { paddingBottom: Math.max(insets.bottom, 24) + 40 }]}
              showsVerticalScrollIndicator={false}>
              {balancesData?.balances && balancesData.balances.length > 0 ? (
                <>
                  <Text style={styles.sectionLabel}>NET BALANCES</Text>
                  <Text style={styles.sectionHelperText}>
                    Tap a name to see which expenses make up their balance.
                  </Text>
                  {[...balancesData.balances]
                    .sort((a, b) => {
                      const aSettled = Math.abs(a.net) < 0.005;
                      const bSettled = Math.abs(b.net) < 0.005;
                      if (aSettled !== bSettled) return aSettled ? 1 : -1;
                      return Math.abs(b.net) - Math.abs(a.net);
                    })
                    .map((bal) => {
                    const isExpanded = expandedBalanceUser === bal.userId;
                    const userExpenses = expenses.filter((e) =>
                      e.participants.some((p) => p.userId === bal.userId) ||
                      e.payers.some((p) => p.userId === bal.userId)
                    );
                    const isSettled = Math.abs(bal.net) < 0.005;
                    const netLabel = isSettled ? 'Settled up' : bal.net > 0 ? 'is owed' : 'owes';
                    return (
                      <View key={bal.userId}>
                        <TouchableOpacity
                          activeOpacity={0.8}
                          style={[styles.balanceCard, isSettled ? styles.balanceCardSettled : null]}
                          onPress={() => setExpandedBalanceUser(isExpanded ? null : bal.userId)}>
                          <View style={[styles.balanceAvatar, isSettled ? styles.balanceAvatarSettled : null]}>
                            <Text style={styles.balanceAvatarText}>{getInitials(bal.userName)}</Text>
                          </View>
                          <View style={styles.balanceNameCol}>
                            <Text style={styles.balanceName}>{bal.userName}</Text>
                            <Text style={[styles.balanceStatusLabel, isSettled ? styles.balanceStatusLabelSettled : null]}>
                              {netLabel}
                            </Text>
                          </View>
                          {isSettled ? (
                            <Ionicons name="checkmark-circle" size={20} color="#27b371" />
                          ) : (
                            <Text style={[styles.balanceNet, bal.net > 0 ? styles.balancePositive : styles.balanceNegative]}>
                              {commonCurrency ? `${commonCurrency} ` : ''}{formatAmount(Math.abs(bal.net))}
                            </Text>
                          )}
                          <Ionicons
                            name={isExpanded ? 'chevron-up' : 'chevron-down'}
                            size={16}
                            color="#8a909b"
                            style={{ marginLeft: 6 }}
                          />
                        </TouchableOpacity>
                        {isExpanded && userExpenses.length > 0 && (
                          <View style={styles.balanceExpenseList}>
                            {userExpenses.map((e) => {
                              const share = e.participants.find((p) => p.userId === bal.userId);
                              const paid = e.payers.find((p) => p.userId === bal.userId);
                              return (
                                <View key={e.id} style={styles.balanceExpenseRow}>
                                  <Text style={styles.balanceExpenseDesc} numberOfLines={1}>{e.description}</Text>
                                  <View style={styles.balanceExpenseAmounts}>
                                    {paid && (
                                      <Text style={styles.balanceExpensePaid}>
                                        paid {e.currency ? `${e.currency} ` : ''}{formatAmount(paid.amount)}
                                      </Text>
                                    )}
                                    <Text style={styles.balanceExpenseShare}>
                                      share {e.currency ? `${e.currency} ` : ''}{formatAmount(share?.amount ?? 0)}
                                    </Text>
                                  </View>
                                </View>
                              );
                            })}
                          </View>
                        )}
                      </View>
                    );
                  })}

                  {balancesData.simplifiedDebts && balancesData.simplifiedDebts.length > 0 ? (
                    <>
                      <Text style={[styles.sectionLabel, { marginTop: 24 }]}>HOW TO SETTLE UP</Text>
                      {balancesData.simplifiedDebts.map((debt, i) => (
                        <View key={i} style={styles.debtCard}>
                          <View style={styles.debtRow}>
                            <View style={styles.debtAvatar}>
                              <Text style={styles.debtAvatarText}>{getInitials(debt.fromUserName)}</Text>
                            </View>
                            <View style={styles.debtArrow}>
                              <Ionicons name="arrow-forward" size={16} color="#8a909b" />
                            </View>
                            <View style={styles.debtAvatar}>
                              <Text style={styles.debtAvatarText}>{getInitials(debt.toUserName)}</Text>
                            </View>
                            <View style={styles.debtCopy}>
                              <Text style={styles.debtText}>
                                <Text style={styles.debtName}>{debt.fromUserName}</Text> pays{' '}
                                <Text style={styles.debtName}>{debt.toUserName}</Text>
                              </Text>
                              <Text style={[styles.debtAmount, { color: PRIMARY_COLOR }]}>
                                {commonCurrency ? `${commonCurrency} ` : ''}{formatAmount(debt.amount)}
                              </Text>
                            </View>
                          </View>
                        </View>
                      ))}
                    </>
                  ) : (
                    <View style={styles.allSettledWrap}>
                      <Ionicons name="checkmark-circle-outline" size={24} color="#27b371" />
                      <Text style={styles.allSettledText}>All settled up!</Text>
                    </View>
                  )}
                </>
              ) : (
                <View style={styles.emptyState}>
                  <View style={styles.emptyIcon}>
                    <Ionicons name="scale-outline" size={32} color="#b0b6c0" />
                  </View>
                  <Text style={styles.emptyTitle}>No balances yet</Text>
                  <Text style={styles.emptyCopy}>Add expenses to see who owes what.</Text>
                </View>
              )}
            </ScrollView>
          )}

          {/* Settle Up Tab */}
          {activeTab === 'settle' && (
            <ScrollView
              style={styles.tabContent}
              contentContainerStyle={[styles.tabContentInner, { paddingBottom: Math.max(insets.bottom, 24) + 40 }]}
              showsVerticalScrollIndicator={false}>
              {(() => {
                const outstanding = (balancesData?.simplifiedDebts ?? []).filter((d) => !settledKeys.has(debtKey(d)));
                if (outstanding.length === 0) {
                  return (
                    <View style={styles.allSettledWrap}>
                      <Ionicons name="checkmark-circle-outline" size={40} color="#27b371" />
                      <Text style={styles.allSettledTitle}>All settled up!</Text>
                      <Text style={styles.emptyCopy}>No outstanding debts to settle.</Text>
                    </View>
                  );
                }
                return (
                  <>
                    <Text style={styles.sectionLabel}>OUTSTANDING</Text>
                    {hasMixedCurrencies ? (
                      <View style={styles.warningCard}>
                        <Ionicons name="alert-circle-outline" size={16} color="#b46b00" />
                        <Text style={styles.warningCardText}>
                          Multiple currencies detected ({tripCurrencies.join(', ')}). Amounts shown are aggregated raw — convert manually before settling.
                        </Text>
                      </View>
                    ) : null}
                    {outstanding.map((debt) => {
                      const key = debtKey(debt);
                      const expanded = expandedDebtKey === key;
                      const isBusy = settleSubmitting && settlingDebt && debtKey(settlingDebt) === key;
                      const related = expensesBetween(debt.fromUserId, debt.toUserId);
                      return (
                        <View key={key} style={styles.settleCard}>
                          <View style={styles.settleCardRow}>
                            <View style={styles.debtAvatar}>
                              <Text style={styles.debtAvatarText}>{getInitials(debt.fromUserName)}</Text>
                            </View>
                            <View style={styles.debtArrow}>
                              <Ionicons name="arrow-forward" size={14} color="#8a909b" />
                            </View>
                            <View style={styles.debtAvatar}>
                              <Text style={styles.debtAvatarText}>{getInitials(debt.toUserName)}</Text>
                            </View>
                            <View style={styles.debtCopy}>
                              <Text style={styles.debtText}>
                                <Text style={styles.debtName}>{debt.fromUserName}</Text>
                                {' owes '}
                                <Text style={styles.debtName}>{debt.toUserName}</Text>
                              </Text>
                              <Text style={[styles.debtAmount, { color: PRIMARY_COLOR }]}>
                                {commonCurrency ? `${commonCurrency} ` : ''}{formatAmount(debt.amount)}
                              </Text>
                            </View>
                          </View>

                          <TouchableOpacity
                            activeOpacity={0.85}
                            style={styles.whyButton}
                            onPress={() => setExpandedDebtKey(expanded ? null : key)}>
                            <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={PRIMARY_COLOR} />
                            <Text style={[styles.whyButtonText, { color: PRIMARY_COLOR }]}>
                              {expanded ? 'Hide breakdown' : `Why? (${related.length} expense${related.length === 1 ? '' : 's'})`}
                            </Text>
                          </TouchableOpacity>

                          {expanded ? (
                            <View style={styles.breakdownWrap}>
                              {related.length === 0 ? (
                                <Text style={styles.breakdownEmpty}>
                                  This debt comes from earlier settlements between {debt.fromUserName} and {debt.toUserName}.
                                </Text>
                              ) : (
                                related.map((e) => {
                                  const fromShare = e.participants.find((p) => p.userId === debt.fromUserId)?.amount ?? 0;
                                  const toPaid = e.payers.find((p) => p.userId === debt.toUserId)?.amount ?? 0;
                                  const toShare = e.participants.find((p) => p.userId === debt.toUserId)?.amount ?? 0;
                                  const fromPaid = e.payers.find((p) => p.userId === debt.fromUserId)?.amount ?? 0;
                                  return (
                                    <View key={e.id} style={styles.breakdownRow}>
                                      <View style={styles.breakdownHeader}>
                                        <Text style={styles.breakdownDesc} numberOfLines={1}>{e.description}</Text>
                                        <Text style={styles.breakdownDate}>{formatDate(e.date)}</Text>
                                      </View>
                                      {toPaid > 0 && fromShare > 0 ? (
                                        <Text style={styles.breakdownLine}>
                                          <Text style={styles.breakdownName}>{debt.toUserName}</Text> paid{' '}
                                          <Text style={styles.breakdownBold}>{e.currency} {formatAmount(toPaid)}</Text>
                                          {' · '}
                                          <Text style={styles.breakdownName}>{debt.fromUserName}</Text>'s share{' '}
                                          <Text style={styles.breakdownBold}>{e.currency} {formatAmount(fromShare)}</Text>
                                        </Text>
                                      ) : null}
                                      {fromPaid > 0 && toShare > 0 ? (
                                        <Text style={styles.breakdownLine}>
                                          <Text style={styles.breakdownName}>{debt.fromUserName}</Text> paid{' '}
                                          <Text style={styles.breakdownBold}>{e.currency} {formatAmount(fromPaid)}</Text>
                                          {' · '}
                                          <Text style={styles.breakdownName}>{debt.toUserName}</Text>'s share{' '}
                                          <Text style={styles.breakdownBold}>{e.currency} {formatAmount(toShare)}</Text>
                                        </Text>
                                      ) : null}
                                    </View>
                                  );
                                })
                              )}
                            </View>
                          ) : null}

                          <TouchableOpacity
                            style={[
                              styles.markSettledButton,
                              { backgroundColor: PRIMARY_COLOR },
                              isBusy ? styles.submitButtonDisabled : null,
                            ]}
                            activeOpacity={0.88}
                            disabled={isBusy || settleSubmitting || settlingDebt !== null}
                            onPress={() => handleSettleDebt(debt)}>
                            {isBusy ? (
                              <ActivityIndicator size="small" color="#fff" />
                            ) : (
                              <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
                            )}
                            <Text style={styles.markSettledButtonText}>{isBusy ? 'Settling…' : 'Mark as Settled'}</Text>
                          </TouchableOpacity>
                        </View>
                      );
                    })}
                  </>
                );
              })()}

              {settlements.length > 0 ? (
                <>
                  <Text style={[styles.sectionLabel, { marginTop: 28 }]}>SETTLED</Text>
                  {settlements.map((s) => (
                    <View key={s.id} style={styles.settlementHistoryCard}>
                      <View style={styles.settlementPaidBadge}>
                        <Ionicons name="checkmark-circle" size={16} color="#27b371" />
                        <Text style={styles.settlementPaidText}>Paid</Text>
                      </View>
                      <View style={styles.settlementHistoryRow}>
                        <View style={styles.settlementHistoryCopy}>
                          <Text style={styles.settlementHistoryText}>
                            <Text style={styles.debtName}>{s.fromUserName}</Text>
                            {' paid '}
                            <Text style={styles.debtName}>{s.toUserName}</Text>
                          </Text>
                          <Text style={styles.settlementHistoryDate}>
                            {formatDate(s.createdAt.slice(0, 10))} · {commonCurrency ? `${commonCurrency} ` : ''}{formatAmount(s.amount)}
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={styles.deleteSmallButton}
                          activeOpacity={0.8}
                          onPress={() => { setActionError(''); setDeletingSettlementId(s.id); }}>
                          <Ionicons name="close-circle-outline" size={20} color="#d95f6a" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </>
              ) : null}
            </ScrollView>
          )}
        </>
      )}

      {/* FAB for adding expense */}
      {activeTab === 'expenses' && !loading && (
        <View style={[styles.fab, { bottom: Math.max(insets.bottom, 16) + 10 }]}>
          <TouchableOpacity activeOpacity={0.92} style={[styles.fabButton, { backgroundColor: PRIMARY_COLOR, shadowColor: PRIMARY_COLOR }]} onPress={openAddModal}>
            <Ionicons name="add" size={22} color="#fff" />
            <Text style={styles.fabText}>Add Expense</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Add Expense Modal */}
      <Modal visible={addModalOpen} transparent animationType="slide" onRequestClose={() => setAddModalOpen(false)}>
        <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={() => setAddModalOpen(false)} />
          <View style={[styles.modalCard, { paddingBottom: Math.max(insets.bottom, 18) + 12, zIndex: 1 }]}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Expense</Text>
              <TouchableOpacity
                style={styles.modalCloseButton}
                activeOpacity={0.88}
                onPress={() => setAddModalOpen(false)}>
                <Ionicons name="close" size={20} color="#161821" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Description */}
              <Text style={styles.fieldLabel}>Description</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Dinner at restaurant"
                placeholderTextColor="#afb5bf"
                value={form.description}
                onChangeText={(v) => setField('description', v)}
              />

              {/* Amount — just the number from the receipt/bank statement.
                  No currency selector: we don't do conversion, we just sum
                  whatever the user typed, so picking a currency would imply
                  a precision this app doesn't have. */}
              <Text style={styles.fieldLabel}>Amount</Text>
              <TextInput
                style={styles.textInput}
                placeholder="250"
                placeholderTextColor="#afb5bf"
                keyboardType="decimal-pad"
                value={form.amount}
                onChangeText={(v) => setField('amount', v)}
              />
              <Text style={[styles.fieldHint, { marginTop: 6 }]}>
                Enter the amount in your own currency, as shown on your bank statement.
              </Text>

              {/* Receipt — optional. Picking a photo only stores a local
                  URI; the actual upload happens on submit (see
                  handleSubmitExpense) so cancelling never orphans a file. */}
              <Text style={[styles.fieldLabel, { marginTop: 18 }]}>Receipt <Text style={styles.fieldLabelOptional}>(optional)</Text></Text>
              {form.receiptImage ? (
                <View style={styles.receiptPreviewWrap}>
                  <Image source={{ uri: form.receiptImage }} style={styles.receiptPreviewImage} />
                  <View style={styles.receiptPreviewActions}>
                    <TouchableOpacity
                      style={styles.receiptActionButton}
                      activeOpacity={0.85}
                      disabled={pickingReceipt}
                      onPress={() => void handlePickReceiptFromGallery()}>
                      <Ionicons name="image-outline" size={15} color="#4a5068" />
                      <Text style={styles.receiptActionText}>Replace</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.receiptActionButton, styles.receiptRemoveButton]}
                      activeOpacity={0.85}
                      onPress={handleRemoveReceipt}>
                      <Ionicons name="trash-outline" size={15} color="#d95f6a" />
                      <Text style={[styles.receiptActionText, { color: '#d95f6a' }]}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View style={styles.receiptPickRow}>
                  <TouchableOpacity
                    style={styles.receiptPickButton}
                    activeOpacity={0.85}
                    disabled={pickingReceipt}
                    onPress={() => void handleTakeReceiptPhoto()}>
                    <Ionicons name="camera-outline" size={18} color="#4a5068" />
                    <Text style={styles.receiptPickButtonText}>Take photo</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.receiptPickButton}
                    activeOpacity={0.85}
                    disabled={pickingReceipt}
                    onPress={() => void handlePickReceiptFromGallery()}>
                    <Ionicons name="images-outline" size={18} color="#4a5068" />
                    <Text style={styles.receiptPickButtonText}>Choose from gallery</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Date */}
              <Text style={styles.fieldLabel}>Date (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.textInput}
                placeholder={todayIso()}
                placeholderTextColor="#afb5bf"
                value={form.date}
                onChangeText={(v) => setField('date', v)}
              />

              {/* Paid By */}
              <Text style={styles.fieldLabel}>Paid By</Text>
              {members.map((member) => {
                const selected = form.selectedPayers.has(member.id);
                const isCurrentUser = member.id === user?.id;
                return (
                  <View key={member.id} style={styles.memberRow}>
                    <TouchableOpacity
                      style={[styles.memberCheckbox, selected && [styles.memberCheckboxActive, { backgroundColor: PRIMARY_COLOR, borderColor: PRIMARY_COLOR }]]}
                      activeOpacity={0.8}
                      onPress={() => togglePayer(member.id)}>
                      {selected && <Ionicons name="checkmark" size={14} color="#fff" />}
                    </TouchableOpacity>
                    <Text style={styles.memberName}>
                      {member.name}{isCurrentUser ? ' (You)' : ''}
                    </Text>
                    {selected && form.selectedPayers.size > 1 && (
                      <TextInput
                        style={styles.inlineAmountInput}
                        placeholder="Amount"
                        placeholderTextColor="#afb5bf"
                        keyboardType="decimal-pad"
                        value={form.payerAmounts[member.id] ?? ''}
                        onChangeText={(v) =>
                          setForm((prev) => ({
                            ...prev,
                            payerAmounts: { ...prev.payerAmounts, [member.id]: v },
                          }))
                        }
                      />
                    )}
                    {selected && form.selectedPayers.size === 1 && (
                      <Text style={styles.fullAmountLabel}>
                        {form.amount ? formatAmount(parseFloat(form.amount) || 0) : 'Full amount'}
                      </Text>
                    )}
                  </View>
                );
              })}

              {/* Split Mode */}
              <Text style={[styles.fieldLabel, { marginTop: 20 }]}>Split Mode</Text>
              <View style={styles.chipRow}>
                {(['equal', 'exact', 'percentage'] as SplitMode[]).map((mode) => (
                  <TouchableOpacity
                    key={mode}
                    activeOpacity={0.85}
                    style={[styles.modeChip, form.splitMode === mode && [styles.modeChipActive, { backgroundColor: PRIMARY_COLOR, borderColor: PRIMARY_COLOR }]]}
                    onPress={() => setField('splitMode', mode)}>
                    <Text style={[styles.modeChipText, form.splitMode === mode && styles.modeChipTextActive]}>
                      {mode.charAt(0).toUpperCase() + mode.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Participants */}
              <Text style={styles.fieldLabel}>Split Between</Text>
              {form.splitMode === 'equal' ? (
                <Text style={styles.fieldHint}>All selected members split equally.</Text>
              ) : (
                <Text style={styles.fieldHint}>
                  {form.splitMode === 'percentage'
                    ? 'Enter % for each (must sum to 100)'
                    : 'Enter exact amount for each'}
                </Text>
              )}
              {(form.splitMode === 'exact' || form.splitMode === 'percentage') && (() => {
                if (form.splitMode === 'exact') {
                  const total = parseFloat(form.amount) || 0;
                  const used = Array.from(form.selectedParticipants).reduce(
                    (sum, uid) => sum + (parseFloat(form.participantValues[uid] ?? '0') || 0), 0
                  );
                  const remaining = total - used;
                  const isOver = remaining < -0.005;
                  return total > 0 ? (
                    <Text style={[styles.fieldHint, { color: isOver ? '#d95f6a' : '#27b371', fontWeight: '600' }]}>
                      {isOver ? `Over by ${formatAmount(Math.abs(remaining))}` : `Remaining: ${formatAmount(remaining)}`}
                    </Text>
                  ) : null;
                } else {
                  const used = Array.from(form.selectedParticipants).reduce(
                    (sum, uid) => sum + (parseFloat(form.participantValues[uid] ?? '0') || 0), 0
                  );
                  const remaining = 100 - used;
                  const isOver = remaining < -0.05;
                  return (
                    <Text style={[styles.fieldHint, { color: isOver ? '#d95f6a' : Math.abs(remaining) < 2 ? '#27b371' : '#8a909b', fontWeight: '600' }]}>
                      {isOver ? `Over by ${Math.abs(remaining).toFixed(1)}%` : `Remaining: ${remaining.toFixed(1)}%`}
                    </Text>
                  );
                }
              })()}
              {members.map((member) => {
                const selected = form.selectedParticipants.has(member.id);
                const isCurrentUser = member.id === user?.id;
                return (
                  <View key={member.id} style={styles.memberRow}>
                    <TouchableOpacity
                      style={[styles.memberCheckbox, selected && [styles.memberCheckboxActive, { backgroundColor: PRIMARY_COLOR, borderColor: PRIMARY_COLOR }]]}
                      activeOpacity={0.8}
                      onPress={() => toggleParticipant(member.id)}>
                      {selected && <Ionicons name="checkmark" size={14} color="#fff" />}
                    </TouchableOpacity>
                    <Text style={styles.memberName}>
                      {member.name}{isCurrentUser ? ' (You)' : ''}
                    </Text>
                    {selected && form.splitMode !== 'equal' && (
                      <TextInput
                        style={styles.inlineAmountInput}
                        placeholder={form.splitMode === 'percentage' ? '%' : 'amount'}
                        placeholderTextColor="#afb5bf"
                        keyboardType="decimal-pad"
                        value={form.participantValues[member.id] ?? ''}
                        onChangeText={(v) => {
                          if (form.splitMode === 'exact') {
                            const total = parseFloat(form.amount) || 0;
                            const alreadyUsed = Array.from(form.selectedParticipants)
                              .filter((uid) => uid !== member.id)
                              .reduce((sum, uid) => sum + (parseFloat(form.participantValues[uid] ?? '0') || 0), 0);
                            const newVal = parseFloat(v) || 0;
                            if (newVal > total - alreadyUsed + 0.005) return;
                          }
                          setForm((prev) => ({
                            ...prev,
                            participantValues: { ...prev.participantValues, [member.id]: v },
                          }));
                        }}
                      />
                    )}
                  </View>
                );
              })}

              {submitError ? <Text style={styles.submitError}>{submitError}</Text> : null}

              <TouchableOpacity
                style={[styles.submitButton, { backgroundColor: PRIMARY_COLOR }, submitting && styles.submitButtonDisabled]}
                activeOpacity={0.9}
                disabled={submitting}
                onPress={() => void handleSubmitExpense()}>
                <Text style={styles.submitButtonText}>{submitting ? 'Saving...' : 'Add Expense'}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Confirm Settle Modal */}
      <Modal
        visible={settlingDebt !== null}
        transparent
        animationType="fade"
        onRequestClose={() => !settleSubmitting && setSettlingDebt(null)}>
        <View style={styles.confirmBackdrop}>
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => !settleSubmitting && setSettlingDebt(null)}
          />
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>Mark as Settled</Text>
            {settlingDebt ? (
              <Text style={styles.confirmBody}>
                Record that{' '}
                <Text style={styles.confirmBold}>{settlingDebt.fromUserName}</Text> has paid{' '}
                <Text style={styles.confirmBold}>{settlingDebt.toUserName}</Text>{' '}
                <Text style={styles.confirmBold}>
                  {commonCurrency ? `${commonCurrency} ` : ''}{formatAmount(settlingDebt.amount)}
                </Text>?
              </Text>
            ) : null}
            {settleError ? <Text style={styles.submitError}>{settleError}</Text> : null}
            <View style={styles.confirmButtons}>
              <TouchableOpacity
                style={styles.confirmCancelButton}
                activeOpacity={0.88}
                disabled={settleSubmitting}
                onPress={() => setSettlingDebt(null)}>
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmOkButton, { backgroundColor: PRIMARY_COLOR }, settleSubmitting && styles.submitButtonDisabled]}
                activeOpacity={0.9}
                disabled={settleSubmitting}
                onPress={() => void handleConfirmSettle()}>
                {settleSubmitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.confirmOkText}>Confirm</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Confirm Delete Expense */}
      <Modal
        visible={deletingExpenseId !== null}
        transparent
        animationType="fade"
        onRequestClose={() => !deletingBusy && setDeletingExpenseId(null)}>
        <View style={styles.confirmBackdrop}>
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => !deletingBusy && setDeletingExpenseId(null)}
          />
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>Remove this expense?</Text>
            <Text style={styles.confirmBody}>
              This will permanently delete the expense and recalculate everyone&apos;s balance.
            </Text>
            {actionError ? <Text style={styles.submitError}>{actionError}</Text> : null}
            <View style={styles.confirmButtons}>
              <TouchableOpacity
                style={styles.confirmCancelButton}
                activeOpacity={0.88}
                disabled={deletingBusy}
                onPress={() => setDeletingExpenseId(null)}>
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmOkButton, { backgroundColor: '#d95f6a' }, deletingBusy && styles.submitButtonDisabled]}
                activeOpacity={0.9}
                disabled={deletingBusy}
                onPress={() => void handleConfirmDeleteExpense()}>
                {deletingBusy ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.confirmOkText}>Remove</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Receipt viewer */}
      <Modal
        visible={viewingReceiptUrl !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setViewingReceiptUrl(null)}>
        <View style={styles.receiptViewerBackdrop}>
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => setViewingReceiptUrl(null)}
          />
          {viewingReceiptUrl ? (
            <Image source={{ uri: viewingReceiptUrl }} style={styles.receiptViewerImage} resizeMode="contain" />
          ) : null}
          <TouchableOpacity
            style={styles.receiptViewerClose}
            activeOpacity={0.85}
            onPress={() => setViewingReceiptUrl(null)}>
            <Ionicons name="close" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Confirm Delete Settlement */}
      <Modal
        visible={deletingSettlementId !== null}
        transparent
        animationType="fade"
        onRequestClose={() => !deletingBusy && setDeletingSettlementId(null)}>
        <View style={styles.confirmBackdrop}>
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => !deletingBusy && setDeletingSettlementId(null)}
          />
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>Undo this settlement?</Text>
            <Text style={styles.confirmBody}>
              The debt will reappear as outstanding.
            </Text>
            {actionError ? <Text style={styles.submitError}>{actionError}</Text> : null}
            <View style={styles.confirmButtons}>
              <TouchableOpacity
                style={styles.confirmCancelButton}
                activeOpacity={0.88}
                disabled={deletingBusy}
                onPress={() => setDeletingSettlementId(null)}>
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmOkButton, { backgroundColor: '#d95f6a' }, deletingBusy && styles.submitButtonDisabled]}
                activeOpacity={0.9}
                disabled={deletingBusy}
                onPress={() => void handleConfirmDeleteSettlement()}>
                {deletingBusy ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.confirmOkText}>Undo</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function splitModeColor(mode: string) {
  switch (mode) {
    case 'equal': return '#eef3ff';
    case 'exact': return '#fff4ee';
    case 'percentage': return '#eefff5';
    case 'shares': return '#fdf0ff';
    default: return '#f0f2f5';
  }
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingBottom: 14,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f6f8',
  },
  headerTitle: {
    flex: 1,
    marginLeft: 12,
    color: '#121317',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.8,
  },
  headerSpacer: {
    width: 42,
  },
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 22,
    marginBottom: 14,
    backgroundColor: '#f5f6f8',
    borderRadius: 16,
    padding: 4,
    gap: 4,
  },
  tabPill: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 12,
    alignItems: 'center',
  },
  tabPillActive: {
    backgroundColor: '#ff4f74',
  },
  tabPillText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#8a909b',
  },
  tabPillTextActive: {
    color: '#fff',
  },
  tabContent: {
    flex: 1,
  },
  tabContentInner: {
    paddingHorizontal: 22,
    paddingTop: 4,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
  },
  errorText: {
    color: '#d95f6a',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: '#ff4f74',
    borderRadius: 12,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 30,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#f5f6f8',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#161821',
    marginBottom: 8,
    letterSpacing: -0.4,
  },
  emptyCopy: {
    fontSize: 14,
    color: '#8a909b',
    textAlign: 'center',
    lineHeight: 20,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#8a909b',
    letterSpacing: 1.1,
    marginBottom: 10,
    marginTop: 4,
  },
  sectionHelperText: {
    fontSize: 12.5,
    color: '#8a909b',
    marginBottom: 12,
    marginTop: -4,
  },
  expenseCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#eaedf2',
    backgroundColor: '#fff',
    padding: 16,
    marginBottom: 12,
  },
  expenseReceiptThumb: {
    width: 44,
    height: 44,
    borderRadius: 10,
    marginRight: 12,
    backgroundColor: '#eef0f4',
  },
  expenseTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  expenseMain: {
    flex: 1,
  },
  expenseDescription: {
    fontSize: 16,
    fontWeight: '800',
    color: '#161821',
    letterSpacing: -0.3,
    marginBottom: 3,
  },
  expenseDate: {
    fontSize: 12,
    color: '#8a909b',
  },
  expenseRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  expenseAmount: {
    fontSize: 20,
    fontWeight: '900',
    color: '#161821',
    letterSpacing: -0.5,
  },
  splitModeChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  splitModeChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4a5068',
    textTransform: 'capitalize',
  },
  expenseMeta: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f0f2f5',
  },
  expenseMetaText: {
    fontSize: 12,
    color: '#8a909b',
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-end',
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#fff2f3',
  },
  deleteButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#d95f6a',
  },
  balanceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#eaedf2',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
    gap: 12,
  },
  balanceAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f0f2f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  balanceAvatarText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#4a5068',
  },
  balanceNameCol: {
    flex: 1,
  },
  balanceName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#161821',
  },
  balanceStatusLabel: {
    marginTop: 2,
    fontSize: 12,
    color: '#8a909b',
    fontWeight: '600',
  },
  balanceNet: {
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  balancePositive: {
    color: '#1a9e55',
  },
  balanceNegative: {
    color: '#d95f6a',
  },
  balanceNeutral: {
    color: '#8a909b',
  },
  balanceCardSettled: {
    backgroundColor: '#f7faf8',
  },
  balanceAvatarSettled: {
    backgroundColor: '#dff1e6',
  },
  balanceStatusLabelSettled: {
    color: '#27b371',
    fontWeight: '700',
  },
  balanceExpenseList: {
    backgroundColor: '#f7f8fa',
    borderRadius: 10,
    marginBottom: 8,
    marginTop: -4,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  balanceExpenseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#eaedf2',
  },
  balanceExpenseDesc: {
    flex: 1,
    fontSize: 13,
    color: '#3a3f4b',
    marginRight: 8,
  },
  balanceExpenseAmounts: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  balanceExpensePaid: {
    fontSize: 12,
    color: '#27b371',
    fontWeight: '500',
  },
  balanceExpenseShare: {
    fontSize: 12,
    color: '#8a909b',
  },
  debtCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#eaedf2',
    backgroundColor: '#fafbfc',
    padding: 14,
    marginBottom: 8,
  },
  debtRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  debtAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#f0f2f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  debtAvatarText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#4a5068',
  },
  debtArrow: {
    marginHorizontal: 2,
  },
  debtCopy: {
    flex: 1,
    marginLeft: 6,
  },
  debtText: {
    fontSize: 13,
    color: '#4a5068',
  },
  debtName: {
    fontWeight: '800',
    color: '#161821',
  },
  debtAmount: {
    fontSize: 16,
    fontWeight: '900',
    color: '#ff4f74',
    marginTop: 2,
  },
  allSettledWrap: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 8,
  },
  allSettledText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#27b371',
  },
  allSettledTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#27b371',
    marginTop: 8,
    letterSpacing: -0.4,
  },
  settleCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#eaedf2',
    backgroundColor: '#fff',
    padding: 14,
    marginBottom: 12,
    gap: 12,
  },
  settleCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  markSettledButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: '#ff4f74',
    borderRadius: 12,
    paddingVertical: 10,
  },
  warningCard: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    backgroundColor: '#fff7e6',
    borderWidth: 1,
    borderColor: '#ffd8a3',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  warningCardText: {
    flex: 1,
    color: '#7a4d00',
    fontSize: 12.5,
    fontWeight: '600',
    lineHeight: 18,
  },
  whyButton: {
    marginTop: 10,
    marginBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
  },
  whyButtonText: {
    fontSize: 12.5,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  breakdownWrap: {
    backgroundColor: '#f7f8fa',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    gap: 10,
  },
  breakdownEmpty: {
    color: '#7b828e',
    fontSize: 12.5,
    fontStyle: 'italic',
  },
  breakdownRow: {
    gap: 4,
  },
  breakdownHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  breakdownDesc: {
    flex: 1,
    color: '#161821',
    fontSize: 13.5,
    fontWeight: '700',
  },
  breakdownDate: {
    color: '#9aa2ae',
    fontSize: 11.5,
    fontWeight: '600',
  },
  breakdownLine: {
    color: '#5a606e',
    fontSize: 12.5,
    lineHeight: 18,
  },
  breakdownName: {
    color: '#161821',
    fontWeight: '700',
  },
  breakdownBold: {
    color: '#161821',
    fontWeight: '800',
  },
  markSettledButtonText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 14,
  },
  settlementHistoryCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#c3eed9',
    backgroundColor: '#f2fdf7',
    padding: 12,
    marginBottom: 8,
  },
  settlementPaidBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 6,
  },
  settlementPaidText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#27b371',
  },
  settlementHistoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  settlementHistoryCopy: {
    flex: 1,
  },
  settlementHistoryText: {
    fontSize: 14,
    color: '#4a5068',
  },
  settlementHistoryDate: {
    fontSize: 12,
    color: '#8a909b',
    marginTop: 2,
  },
  settlementHistoryNote: {
    fontSize: 12,
    color: '#a0a8b5',
    marginTop: 2,
    fontStyle: 'italic',
  },
  deleteSmallButton: {
    padding: 4,
  },
  fab: {
    position: 'absolute',
    right: 22,
    left: 22,
  },
  fabButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#ff4f74',
    borderRadius: 16,
    paddingVertical: 16,
    shadowColor: '#ff4f74',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  fabText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 12,
    paddingHorizontal: 22,
    maxHeight: '92%',
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#dde1e8',
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
  },
  modalTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '900',
    color: '#161821',
    letterSpacing: -0.5,
  },
  modalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f6f8',
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#8a909b',
    letterSpacing: 0.8,
    marginBottom: 7,
    marginTop: 14,
  },
  fieldHint: {
    fontSize: 12,
    color: '#a0a8b5',
    marginBottom: 8,
    marginTop: -4,
  },
  fieldLabelOptional: {
    fontSize: 12,
    fontWeight: '500',
    color: '#a0a8b5',
    letterSpacing: 0,
    textTransform: 'none',
  },
  receiptPickRow: {
    flexDirection: 'row',
    gap: 10,
  },
  receiptPickButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderWidth: 1,
    borderColor: '#eaedf2',
    borderRadius: 12,
    paddingVertical: 13,
    backgroundColor: '#fafbfc',
  },
  receiptPickButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4a5068',
  },
  receiptPreviewWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#eaedf2',
    borderRadius: 14,
    padding: 10,
    backgroundColor: '#fafbfc',
  },
  receiptPreviewImage: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: '#eef0f4',
  },
  receiptPreviewActions: {
    flex: 1,
    gap: 6,
  },
  receiptActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#eaedf2',
    alignSelf: 'flex-start',
  },
  receiptRemoveButton: {
    borderColor: '#ffd9dc',
  },
  receiptActionText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#4a5068',
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#eaedf2',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#161821',
    backgroundColor: '#fafbfc',
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  modeChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#eaedf2',
    backgroundColor: '#f5f6f8',
  },
  modeChipActive: {
    backgroundColor: '#ff4f74',
    borderColor: '#ff4f74',
  },
  modeChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#8a909b',
  },
  modeChipTextActive: {
    color: '#fff',
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 10,
  },
  memberCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#dde1e8',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  memberCheckboxActive: {
    backgroundColor: '#ff4f74',
    borderColor: '#ff4f74',
  },
  memberName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#161821',
  },
  inlineAmountInput: {
    width: 90,
    borderWidth: 1,
    borderColor: '#eaedf2',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 14,
    color: '#161821',
    backgroundColor: '#fafbfc',
    textAlign: 'right',
  },
  fullAmountLabel: {
    fontSize: 12,
    color: '#a0a8b5',
    fontStyle: 'italic',
  },
  submitError: {
    color: '#d95f6a',
    fontSize: 13,
    marginTop: 12,
    marginBottom: 4,
  },
  submitButton: {
    backgroundColor: '#ff4f74',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 18,
    marginBottom: 8,
  },
  submitButtonDisabled: {
    opacity: 0.55,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  confirmBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 30,
  },
  confirmCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 380,
  },
  confirmTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#161821',
    marginBottom: 10,
    letterSpacing: -0.4,
  },
  confirmBody: {
    fontSize: 15,
    color: '#4a5068',
    lineHeight: 22,
    marginBottom: 16,
  },
  confirmBold: {
    fontWeight: '800',
    color: '#161821',
  },
  confirmButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  confirmCancelButton: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#eaedf2',
    alignItems: 'center',
  },
  confirmCancelText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#8a909b',
  },
  confirmOkButton: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: '#ff4f74',
    alignItems: 'center',
  },
  confirmOkText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#fff',
  },
  receiptViewerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  receiptViewerImage: {
    width: '92%',
    height: '80%',
  },
  receiptViewerClose: {
    position: 'absolute',
    top: 50,
    right: 22,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
