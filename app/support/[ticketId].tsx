import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
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
import { uploadImageIfNeeded } from '@/lib/uploads';
import type { SupportTicketDetail, SupportMessage } from '@/lib/types';
import { COLORS, RADIUS, SPACING } from '@/constants/design-tokens';

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

export default function SupportConversationScreen() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { ticketId } = useLocalSearchParams<{ ticketId: string }>();
  const [ticket, setTicket] = useState<SupportTicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [replyAttachments, setReplyAttachments] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const flatListRef = useRef<FlatList<SupportMessage>>(null);

  useFocusEffect(
    useCallback(() => {
      void loadTicket();
    }, [ticketId]),
  );

  async function loadTicket() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiJson<SupportTicketDetail>(`/api/support/tickets/${ticketId}`);
      setTicket(data);
    } catch {
      setError(t('support.loadFailed'));
    } finally {
      setLoading(false);
    }
  }

  async function handlePickImage() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsMultipleSelection: true,
      selectionLimit: 5 - replyAttachments.length,
    });
    if (!result.canceled) {
      setReplyAttachments((prev) => [...prev, ...result.assets.map((a) => a.uri)].slice(0, 5));
    }
  }

  async function handleSend() {
    if (!reply.trim() && replyAttachments.length === 0) return;
    setSendError(null);
    setSending(true);
    try {
      const uploadedUrls = await Promise.all(
        replyAttachments.map((uri) => uploadImageIfNeeded(uri, 'support')),
      );
      const res = await apiFetch(`/api/support/tickets/${ticketId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: reply.trim(),
          attachmentUrls: uploadedUrls.filter(Boolean),
        }),
      });
      if (!res.ok) throw new Error();
      setReply('');
      setReplyAttachments([]);
      await loadTicket();
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 150);
    } catch {
      setSendError(t('support.sendFailed'));
    } finally {
      setSending(false);
    }
  }

  const isClosed = ticket?.status === 'closed';

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}>

      {/* Header */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) + 4 }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>{t('support.conversationTitle')}</Text>
          {ticket && <StatusBadge status={ticket.status} t={t} />}
        </View>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => void loadTicket()} activeOpacity={0.8} style={styles.retryBtn}>
            <Text style={styles.retryBtnText}>{t('common.retry' as never) ?? 'Try again'}</Text>
          </TouchableOpacity>
        </View>
      ) : ticket ? (
        <>
          {/* Subject bar */}
          <View style={styles.subjectBar}>
            <Text style={styles.subjectBarCategory}>{t(`support.category.${ticket.category}`)}</Text>
            <Text style={styles.subjectBarSubject} numberOfLines={2}>{ticket.subject}</Text>
          </View>

          {/* Messages */}
          <FlatList
            ref={flatListRef}
            data={ticket.messages}
            keyExtractor={(m) => m.id}
            contentContainerStyle={styles.messageList}
            showsVerticalScrollIndicator={false}
            onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
            renderItem={({ item }) => <MessageBubble message={item} t={t} />}
            ListEmptyComponent={<Text style={styles.emptyText}>{t('support.noTickets')}</Text>}
          />

          {/* Reply area */}
          {isClosed ? (
            <View style={[styles.closedBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
              <Text style={styles.closedBarText}>{t('support.ticketClosed')}</Text>
            </View>
          ) : (
            <View style={[styles.replyArea, { paddingBottom: Math.max(insets.bottom, 12) }]}>
              {replyAttachments.length > 0 && (
                <View style={styles.replyAttachments}>
                  {replyAttachments.map((uri, i) => (
                    <View key={i} style={styles.replyThumb}>
                      <Image source={{ uri }} style={styles.replyThumbImg} />
                      <TouchableOpacity
                        style={styles.replyThumbRemove}
                        onPress={() => setReplyAttachments((prev) => prev.filter((_, idx) => idx !== i))}>
                        <Ionicons name="close" size={10} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
              {sendError ? <Text style={styles.sendError}>{sendError}</Text> : null}
              <View style={styles.replyRow}>
                <TouchableOpacity style={styles.imageBtn} onPress={handlePickImage} activeOpacity={0.7}>
                  <Ionicons name="image-outline" size={20} color={COLORS.textSecondary} />
                </TouchableOpacity>
                <TextInput
                  style={styles.replyInput}
                  value={reply}
                  onChangeText={setReply}
                  placeholder={t('support.replyPlaceholder')}
                  placeholderTextColor={COLORS.placeholderText}
                  multiline
                  maxLength={4000}
                />
                <TouchableOpacity
                  style={[styles.sendBtn, (sending || (!reply.trim() && replyAttachments.length === 0)) && styles.sendBtnDisabled]}
                  onPress={() => void handleSend()}
                  disabled={sending || (!reply.trim() && replyAttachments.length === 0)}
                  activeOpacity={0.8}>
                  {sending
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Ionicons name="send" size={16} color="#fff" />}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </>
      ) : null}
    </KeyboardAvoidingView>
  );
}

function MessageBubble({ message, t }: { message: SupportMessage; t: (k: string) => string }) {
  const isUser = message.senderType === 'user';
  return (
    <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleSupport]}>
      {!isUser && (
        <View style={styles.bubbleSenderRow}>
          <View style={styles.supportAvatar}>
            <Ionicons name="headset" size={12} color={COLORS.secondary} />
          </View>
          <Text style={styles.bubbleSenderName}>{t('support.supportTeam')}</Text>
        </View>
      )}
      {message.body ? (
        <View style={[styles.bubbleBg, isUser ? styles.bubbleBgUser : styles.bubbleBgSupport]}>
          <Text style={[styles.bubbleText, isUser && styles.bubbleTextUser]}>{message.body}</Text>
        </View>
      ) : null}
      {message.attachments.map((att) => (
        <TouchableOpacity
          key={att.id}
          onPress={() => att.fileType.startsWith('image/') ? void Linking.openURL(att.fileUrl) : undefined}
          activeOpacity={0.85}
          style={[styles.attachmentContainer, isUser && styles.attachmentContainerUser]}>
          <Image source={{ uri: att.fileUrl }} style={styles.attachmentImage} resizeMode="cover" />
        </TouchableOpacity>
      ))}
      <Text style={[styles.bubbleTime, isUser && styles.bubbleTimeUser]}>
        {formatTime(message.createdAt)}
      </Text>
    </View>
  );
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
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
    gap: 10,
  },
  backButton: {
    width: 38,
    height: 38,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: RADIUS.circle,
    backgroundColor: COLORS.bgLight,
    flexShrink: 0,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    letterSpacing: -0.3,
  },
  headerSpacer: {
    width: 38,
    flexShrink: 0,
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
  subjectBar: {
    paddingHorizontal: SPACING.xl,
    paddingVertical: 12,
    backgroundColor: COLORS.bgLightest,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderPrimary,
  },
  subjectBarCategory: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.textMeta,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  subjectBarSubject: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
    lineHeight: 20,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    padding: SPACING.xl,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 14,
    textAlign: 'center',
  },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.bgLight,
  },
  retryBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  messageList: {
    padding: SPACING.lg,
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.textMeta,
    textAlign: 'center',
    marginTop: 40,
  },
  bubble: {
    maxWidth: '82%',
  },
  bubbleUser: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  bubbleSupport: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  bubbleSenderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  supportAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#e0f4f8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bubbleSenderName: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.secondary,
  },
  bubbleBg: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleBgUser: {
    backgroundColor: COLORS.primary,
    borderBottomRightRadius: 4,
  },
  bubbleBgSupport: {
    backgroundColor: COLORS.bgLight,
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    fontSize: 14,
    color: COLORS.textPrimary,
    lineHeight: 20,
  },
  bubbleTextUser: {
    color: '#fff',
  },
  bubbleTime: {
    fontSize: 10,
    color: COLORS.textMeta,
    marginTop: 4,
    fontWeight: '500',
  },
  bubbleTimeUser: {
    textAlign: 'right',
  },
  attachmentContainer: {
    borderRadius: 14,
    overflow: 'hidden',
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  attachmentContainerUser: {
    alignSelf: 'flex-end',
  },
  attachmentImage: {
    width: 180,
    height: 140,
  },
  closedBar: {
    backgroundColor: COLORS.bgLight,
    paddingHorizontal: SPACING.xl,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderPrimary,
    alignItems: 'center',
  },
  closedBarText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '600',
    paddingBottom: 8,
  },
  replyArea: {
    backgroundColor: COLORS.bgPrimary,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderPrimary,
    paddingHorizontal: SPACING.lg,
    paddingTop: 10,
  },
  replyAttachments: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  replyThumb: {
    width: 54,
    height: 54,
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
  },
  replyThumbImg: {
    width: '100%',
    height: '100%',
  },
  replyThumbRemove: {
    position: 'absolute',
    top: 3,
    right: 3,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendError: {
    fontSize: 12,
    color: COLORS.error,
    marginBottom: 6,
  },
  replyRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  imageBtn: {
    width: 38,
    height: 38,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: RADIUS.circle,
    backgroundColor: COLORS.bgLight,
    flexShrink: 0,
    marginBottom: 2,
  },
  replyInput: {
    flex: 1,
    backgroundColor: COLORS.bgLightest,
    borderWidth: 1,
    borderColor: COLORS.borderInput,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 14,
    color: COLORS.textPrimary,
    maxHeight: 120,
    lineHeight: 20,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
    marginBottom: 2,
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
});
