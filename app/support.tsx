import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useI18n } from '@/components/i18n-provider';
import { useKeyboardFocusScroll } from '@/hooks/useKeyboardFocusScroll';
import { apiFetch, apiJson } from '@/lib/api';
import { uploadImageIfNeeded } from '@/lib/uploads';
import type { SupportTicketSummary } from '@/lib/types';
import { COLORS, RADIUS, SHADOWS, SPACING, TYPOGRAPHY } from '@/constants/design-tokens';

const CATEGORIES = ['bug', 'feature', 'account', 'billing', 'report_user', 'other'] as const;
type Category = typeof CATEGORIES[number];

function StatusBadge({ status, t }: { status: string; t: (k: string) => string }) {
  const color = status === 'closed'
    ? { bg: COLORS.bgLight, text: COLORS.textSecondary }
    : status === 'waiting_for_reply'
      ? { bg: '#fff7ed', text: '#d97706' }
      : { bg: '#f0fdf4', text: '#16a34a' };

  return (
    <View style={[styles.badge, { backgroundColor: color.bg }]}>
      <Text style={[styles.badgeText, { color: color.text }]}>
        {t(`support.ticketStatus.${status}`)}
      </Text>
    </View>
  );
}

export default function SupportScreen() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { scrollRef, onFocusField, scrollViewProps } = useKeyboardFocusScroll();
  const subjectRef = useRef<TextInput>(null);
  const descriptionRef = useRef<TextInput>(null);

  const [category, setCategory] = useState<Category>('bug');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [attachments, setAttachments] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [tickets, setTickets] = useState<SupportTicketSummary[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(true);

  const successScale = useRef(new Animated.Value(0)).current;
  const successOpacity = useRef(new Animated.Value(0)).current;

  useFocusEffect(
    useCallback(() => {
      void loadTickets();
    }, []),
  );

  async function loadTickets() {
    setTicketsLoading(true);
    try {
      const data = await apiJson<SupportTicketSummary[]>('/api/support/tickets');
      setTickets(data);
    } catch {
      // non-fatal
    } finally {
      setTicketsLoading(false);
    }
  }

  function playSuccess() {
    setShowSuccess(true);
    Animated.parallel([
      Animated.spring(successScale, { toValue: 1, useNativeDriver: true, damping: 12, stiffness: 160 }),
      Animated.timing(successOpacity, { toValue: 1, duration: 200, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
    ]).start(() => {
      setTimeout(() => {
        router.back();
      }, 2000);
    });
  }

  async function handlePickImage() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError(t('support.photoPermission'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsMultipleSelection: true,
      selectionLimit: 5 - attachments.length,
    });
    if (!result.canceled) {
      setAttachments((prev) => [...prev, ...result.assets.map((a) => a.uri)].slice(0, 5));
    }
  }

  async function handleSubmit() {
    if (!subject.trim() || !description.trim()) {
      setError(t('support.errorEmpty'));
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const uploadedUrls = await Promise.all(
        attachments.map((uri) => uploadImageIfNeeded(uri, 'support')),
      );
      const response = await apiFetch('/api/support/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          subject: subject.trim(),
          body: description.trim(),
          attachmentUrls: uploadedUrls.filter(Boolean),
        }),
      });
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`${response.status}: ${body}`);
      }
      await loadTickets();
      setSubject('');
      setDescription('');
      setAttachments([]);
      setCategory('bug');
      playSuccess();
    } catch (err) {
      if (__DEV__) console.error('[Support] submit failed:', err);
      setError(t('support.errorFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior="padding">
      {/* Header */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) + 4 }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('support.title')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.scroll, { paddingBottom: Math.max(insets.bottom, 24) + 32 }]}
        showsVerticalScrollIndicator={false}
        {...scrollViewProps}>

        <Text style={styles.subtitle}>{t('support.subtitle')}</Text>

        {/* Category */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>{t('support.categoryLabel')}</Text>
          <TouchableOpacity style={styles.categoryPicker} onPress={() => setCategoryOpen(true)} activeOpacity={0.8}>
            <Text style={styles.categoryValue}>{t(`support.category.${category}`)}</Text>
            <Ionicons name="chevron-down" size={16} color={COLORS.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Subject */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>{t('support.subjectLabel')}</Text>
          <TextInput
            ref={subjectRef}
            style={styles.input}
            value={subject}
            onChangeText={setSubject}
            onFocus={onFocusField(subjectRef)}
            placeholder={t('support.subjectPlaceholder')}
            placeholderTextColor={COLORS.placeholderText}
            returnKeyType="next"
            onSubmitEditing={() => descriptionRef.current?.focus()}
            maxLength={200}
          />
        </View>

        {/* Description */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>{t('support.descriptionLabel')}</Text>
          <TextInput
            ref={descriptionRef}
            style={[styles.input, styles.inputMultiline]}
            value={description}
            onChangeText={setDescription}
            onFocus={onFocusField(descriptionRef)}
            placeholder={t('support.descriptionPlaceholder')}
            placeholderTextColor={COLORS.placeholderText}
            multiline
            textAlignVertical="top"
            maxLength={4000}
          />
        </View>

        {/* Attachments */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>{t('support.attachmentsLabel')}</Text>
          <View style={styles.attachmentsRow}>
            {attachments.map((uri, i) => (
              <View key={i} style={styles.attachmentThumb}>
                <Image source={{ uri }} style={styles.thumbImage} />
                <TouchableOpacity
                  style={styles.thumbRemove}
                  onPress={() => setAttachments((prev) => prev.filter((_, idx) => idx !== i))}>
                  <Ionicons name="close" size={12} color="#fff" />
                </TouchableOpacity>
              </View>
            ))}
            {attachments.length < 5 && (
              <TouchableOpacity style={styles.addImageBtn} onPress={handlePickImage} activeOpacity={0.7}>
                <Ionicons name="image-outline" size={20} color={COLORS.textSecondary} />
                <Text style={styles.addImageText}>{t('support.addImage')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
          onPress={() => void handleSubmit()}
          disabled={submitting}
          activeOpacity={0.85}>
          {submitting
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.submitBtnText}>{t('support.submitButton')}</Text>}
        </TouchableOpacity>

        {/* My Tickets */}
        <View style={styles.ticketSection}>
          <Text style={styles.ticketSectionTitle}>{t('support.myTickets')}</Text>

          {ticketsLoading ? (
            <ActivityIndicator color={COLORS.primary} style={{ marginTop: 20 }} />
          ) : tickets.length === 0 ? (
            <Text style={styles.noTickets}>{t('support.noTickets')}</Text>
          ) : (
            tickets.map((ticket) => (
              <TouchableOpacity
                key={ticket.id}
                style={styles.ticketRow}
                onPress={() => router.push(`/support/${ticket.id}` as never)}
                activeOpacity={0.8}>
                <View style={styles.ticketRowTop}>
                  <StatusBadge status={ticket.status} t={t} />
                  {ticket.hasUnreadAdminReply && (
                    <View style={styles.unreadDot} />
                  )}
                  <Text style={styles.ticketDate}>{formatDate(ticket.updatedAt)}</Text>
                </View>
                <Text style={styles.ticketCategory}>{t(`support.category.${ticket.category}`)}</Text>
                <Text style={styles.ticketSubject} numberOfLines={2}>{ticket.subject}</Text>
                {ticket.hasUnreadAdminReply && (
                  <Text style={styles.newReplyLabel}>{t('support.newReply')}</Text>
                )}
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>

      {/* Category picker modal */}
      {categoryOpen && (
        <Pressable style={styles.overlay} onPress={() => setCategoryOpen(false)}>
          <Pressable style={[styles.categorySheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]} onPress={() => {}}>
            {CATEGORIES.map((c) => (
              <TouchableOpacity
                key={c}
                style={[styles.categoryOption, c === category && styles.categoryOptionActive]}
                onPress={() => { setCategory(c); setCategoryOpen(false); }}
                activeOpacity={0.75}>
                <Text style={[styles.categoryOptionText, c === category && styles.categoryOptionTextActive]}>
                  {t(`support.category.${c}`)}
                </Text>
                {c === category && <Ionicons name="checkmark" size={16} color={COLORS.primary} />}
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      )}

      {/* Success overlay */}
      {showSuccess && (
        <View style={styles.successOverlay}>
          <Animated.View style={[styles.successCard, { transform: [{ scale: successScale }], opacity: successOpacity }]}>
            <View style={styles.successIcon}>
              <Ionicons name="checkmark" size={32} color="#fff" />
            </View>
            <Text style={styles.successTitle}>{t('support.successTitle')}</Text>
            <Text style={styles.successBody}>{t('support.successBody')}</Text>
          </Animated.View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.bgPrimary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingBottom: 12,
    backgroundColor: COLORS.bgPrimary,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderPrimary,
  },
  backButton: {
    width: 38,
    height: 38,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: RADIUS.circle,
    backgroundColor: COLORS.bgLight,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.textPrimary,
    letterSpacing: -0.3,
  },
  headerSpacer: {
    width: 38,
  },
  scroll: {
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xl,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 20,
    marginBottom: SPACING.xl,
  },
  fieldGroup: {
    marginBottom: SPACING.lg,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 8,
    letterSpacing: -0.1,
  },
  input: {
    backgroundColor: COLORS.bgLightest,
    borderWidth: 1,
    borderColor: COLORS.borderInput,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: COLORS.textPrimary,
    lineHeight: 20,
  },
  inputMultiline: {
    minHeight: 110,
    paddingTop: 12,
  },
  categoryPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.bgLightest,
    borderWidth: 1,
    borderColor: COLORS.borderInput,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  categoryValue: {
    fontSize: 14,
    color: COLORS.textPrimary,
    fontWeight: '500',
  },
  attachmentsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  attachmentThumb: {
    width: 72,
    height: 72,
    borderRadius: RADIUS.xs,
    overflow: 'hidden',
    position: 'relative',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  thumbRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addImageBtn: {
    width: 72,
    height: 72,
    borderRadius: RADIUS.xs,
    borderWidth: 1.5,
    borderColor: COLORS.borderInput,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.bgLightest,
  },
  addImageText: {
    fontSize: 10,
    color: COLORS.textSecondary,
    fontWeight: '600',
    textAlign: 'center',
  },
  errorText: {
    color: COLORS.error,
    fontSize: 13,
    marginBottom: 12,
    lineHeight: 18,
  },
  submitBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.sm,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.xxl,
    marginTop: 4,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  ticketSection: {
    marginTop: 4,
  },
  ticketSectionTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.textPrimary,
    letterSpacing: -0.5,
    marginBottom: 14,
  },
  ticketRow: {
    backgroundColor: COLORS.bgLightest,
    borderRadius: RADIUS.md,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.borderPrimary,
  },
  ticketRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },
  badge: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: RADIUS.circle,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
  ticketDate: {
    marginLeft: 'auto',
    fontSize: 11,
    color: COLORS.textMeta,
    fontWeight: '500',
  },
  ticketCategory: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMeta,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 3,
  },
  ticketSubject: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
    lineHeight: 20,
  },
  newReplyLabel: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary,
  },
  noTickets: {
    fontSize: 14,
    color: COLORS.textMeta,
    textAlign: 'center',
    paddingVertical: 24,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  categorySheet: {
    backgroundColor: COLORS.bgPrimary,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    paddingTop: 16,
    paddingHorizontal: SPACING.xl,
  },
  categoryOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderPrimary,
  },
  categoryOptionActive: {},
  categoryOptionText: {
    fontSize: 15,
    color: COLORS.textPrimary,
    fontWeight: '500',
  },
  categoryOptionTextActive: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  successOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
  },
  successCard: {
    backgroundColor: COLORS.bgPrimary,
    borderRadius: RADIUS.xl,
    padding: 32,
    alignItems: 'center',
    width: '100%',
    maxWidth: 340,
  },
  successIcon: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: COLORS.success,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: COLORS.textPrimary,
    letterSpacing: -0.6,
    marginBottom: 10,
    textAlign: 'center',
  },
  successBody: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 21,
    textAlign: 'center',
  },
});
