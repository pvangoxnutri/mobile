import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/components/auth-provider';
import { CurrencyPicker } from '@/components/currency-picker';
import { apiFetch, apiJson } from '@/lib/api';
import type { BalancesResponse, Debt, Expense, Settlement } from '@/lib/types';

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
  currency: string;
  date: string;
  splitMode: SplitMode;
  payerAmounts: Record<string, string>; // userId -> amount string
  selectedPayers: Set<string>;
  selectedParticipants: Set<string>;
  participantValues: Record<string, string>; // userId -> value string (pct/exact)
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

  const [form, setForm] = useState<AddExpenseForm>({
    description: '',
    amount: '',
    currency: 'SEK',
    date: todayIso(),
    splitMode: 'equal',
    payerAmounts: {},
    selectedPayers: new Set<string>(),
    selectedParticipants: new Set<string>(),
    participantValues: {},
  });

  const [expandedBalanceUser, setExpandedBalanceUser] = useState<string | null>(null);

  const [settlingDebt, setSettlingDebt] = useState<Debt | null>(null);
  const [settleSubmitting, setSettleSubmitting] = useState(false);
  const [settleError, setSettleError] = useState('');

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
      currency: 'SEK',
      date: todayIso(),
      splitMode: 'equal',
      payerAmounts: { [user.id]: '' },
      selectedPayers: new Set([user.id]),
      selectedParticipants: new Set(members.map((m) => m.id)),
      participantValues: {},
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
      await apiFetch(`/api/trips/${id}/expenses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: form.description.trim(),
          totalAmount,
          currency: form.currency.trim().toUpperCase(),
          date: form.date,
          splitMode: form.splitMode,
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

  async function handleDeleteExpense(expenseId: string) {
    try {
      await apiFetch(`/api/trips/${id}/expenses/${expenseId}`, { method: 'DELETE' });
      await loadAll();
    } catch {
      // silent
    }
  }

  async function handleSettleDebt(debt: Debt) {
    setSettlingDebt(debt);
    setSettleError('');
  }

  async function handleConfirmSettle() {
    if (!settlingDebt) return;
    setSettleSubmitting(true);
    setSettleError('');
    try {
      await apiFetch(`/api/trips/${id}/expenses/settlements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromUserId: settlingDebt.fromUserId,
          toUserId: settlingDebt.toUserId,
          amount: settlingDebt.amount,
          note: 'Settled via Cost Split',
        }),
      });
      setSettlingDebt(null);
      await loadAll();
    } catch (err) {
      setSettleError(err instanceof Error ? err.message : 'Unable to record settlement.');
    } finally {
      setSettleSubmitting(false);
    }
  }

  async function handleDeleteSettlement(settlementId: string) {
    try {
      await apiFetch(`/api/trips/${id}/expenses/settlements/${settlementId}`, { method: 'DELETE' });
      await loadAll();
    } catch {
      // silent
    }
  }

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
            style={[styles.tabPill, activeTab === tab && styles.tabPillActive]}
            onPress={() => setActiveTab(tab)}>
            <Text style={[styles.tabPillText, activeTab === tab && styles.tabPillTextActive]}>
              {tab === 'expenses' ? 'Expenses' : tab === 'balances' ? 'Balances' : 'Settle Up'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#ff4f74" />
        </View>
      ) : error ? (
        <View style={styles.errorWrap}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => void loadAll()}>
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
                        Paid by {expense.payers.map((p) => p.userName).join(', ')}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.deleteButton}
                      activeOpacity={0.8}
                      onPress={() => void handleDeleteExpense(expense.id)}>
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
                  {balancesData.balances.map((bal) => {
                    const isExpanded = expandedBalanceUser === bal.userId;
                    const userExpenses = expenses.filter((e) =>
                      e.participants.some((p) => p.userId === bal.userId)
                    );
                    return (
                      <View key={bal.userId}>
                        <TouchableOpacity
                          activeOpacity={0.8}
                          style={styles.balanceCard}
                          onPress={() => setExpandedBalanceUser(isExpanded ? null : bal.userId)}>
                          <View style={styles.balanceAvatar}>
                            <Text style={styles.balanceAvatarText}>{getInitials(bal.userName)}</Text>
                          </View>
                          <Text style={styles.balanceName}>{bal.userName}</Text>
                          <Text style={[styles.balanceNet, bal.net >= 0 ? styles.balancePositive : styles.balanceNegative]}>
                            {bal.net >= 0 ? '+' : ''}{formatAmount(bal.net)}
                          </Text>
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
                              <Text style={styles.debtAmount}>{formatAmount(debt.amount)}</Text>
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
              {balancesData?.simplifiedDebts && balancesData.simplifiedDebts.length > 0 ? (
                <>
                  <Text style={styles.sectionLabel}>OUTSTANDING</Text>
                  {balancesData.simplifiedDebts.map((debt, i) => (
                    <View key={i} style={styles.settleCard}>
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
                            {' → '}
                            <Text style={styles.debtName}>{debt.toUserName}</Text>
                          </Text>
                          <Text style={styles.debtAmount}>{formatAmount(debt.amount)}</Text>
                        </View>
                      </View>
                      <TouchableOpacity
                        style={styles.markSettledButton}
                        activeOpacity={0.88}
                        onPress={() => handleSettleDebt(debt)}>
                        <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
                        <Text style={styles.markSettledButtonText}>Mark as Settled</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </>
              ) : (
                <View style={styles.allSettledWrap}>
                  <Ionicons name="checkmark-circle-outline" size={40} color="#27b371" />
                  <Text style={styles.allSettledTitle}>All settled up!</Text>
                  <Text style={styles.emptyCopy}>No outstanding debts to settle.</Text>
                </View>
              )}

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
                            {formatDate(s.createdAt.slice(0, 10))} · {formatAmount(s.amount)}
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={styles.deleteSmallButton}
                          activeOpacity={0.8}
                          onPress={() => void handleDeleteSettlement(s.id)}>
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
          <TouchableOpacity activeOpacity={0.92} style={styles.fabButton} onPress={openAddModal}>
            <Ionicons name="add" size={22} color="#fff" />
            <Text style={styles.fabText}>Add Expense</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Add Expense Modal */}
      <Modal visible={addModalOpen} transparent animationType="slide" onRequestClose={() => setAddModalOpen(false)}>
        <View style={styles.modalBackdrop}>
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

              {/* Amount + Currency */}
              <Text style={styles.fieldLabel}>Total Amount</Text>
              <View style={styles.amountCurrencyRow}>
                <TextInput
                  style={[styles.textInput, { flex: 1, marginRight: 8 }]}
                  placeholder="0.00"
                  placeholderTextColor="#afb5bf"
                  keyboardType="decimal-pad"
                  value={form.amount}
                  onChangeText={(v) => setField('amount', v)}
                />
                <CurrencyPicker value={form.currency} onChange={(v) => setField('currency', v)} />
              </View>

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
                      style={[styles.memberCheckbox, selected && styles.memberCheckboxActive]}
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
                    style={[styles.modeChip, form.splitMode === mode && styles.modeChipActive]}
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
                      style={[styles.memberCheckbox, selected && styles.memberCheckboxActive]}
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
                style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
                activeOpacity={0.9}
                disabled={submitting}
                onPress={() => void handleSubmitExpense()}>
                <Text style={styles.submitButtonText}>{submitting ? 'Saving...' : 'Add Expense'}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Confirm Settle Modal */}
      <Modal
        visible={settlingDebt !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSettlingDebt(null)}>
        <View style={styles.confirmBackdrop}>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={() => setSettlingDebt(null)} />
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>Mark as Settled</Text>
            {settlingDebt ? (
              <Text style={styles.confirmBody}>
                Record that{' '}
                <Text style={styles.confirmBold}>{settlingDebt.fromUserName}</Text> has paid{' '}
                <Text style={styles.confirmBold}>{settlingDebt.toUserName}</Text>{' '}
                <Text style={styles.confirmBold}>{formatAmount(settlingDebt.amount)}</Text>?
              </Text>
            ) : null}
            {settleError ? <Text style={styles.submitError}>{settleError}</Text> : null}
            <View style={styles.confirmButtons}>
              <TouchableOpacity
                style={styles.confirmCancelButton}
                activeOpacity={0.88}
                onPress={() => setSettlingDebt(null)}>
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmOkButton, settleSubmitting && styles.submitButtonDisabled]}
                activeOpacity={0.9}
                disabled={settleSubmitting}
                onPress={() => void handleConfirmSettle()}>
                <Text style={styles.confirmOkText}>{settleSubmitting ? 'Saving...' : 'Confirm'}</Text>
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
  expenseCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#eaedf2',
    backgroundColor: '#fff',
    padding: 16,
    marginBottom: 12,
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
  balanceName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#161821',
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
  amountCurrencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
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
});
