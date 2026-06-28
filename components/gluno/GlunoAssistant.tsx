import { useRef, useState } from 'react';
import {
  Animated,
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
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import GlunoMessageBubble, { type GlunoMessage } from '@/components/gluno/GlunoMessageBubble';
import { GLUNO_QUICK_ACTIONS, getMockGlunoReply } from '@/components/gluno/gluno.constants';
import { COLORS, SPACING } from '@/constants/design-tokens';

// ──────────────────────────────────────────────────────────────────────────
// EXPERIMENTAL — Gluno AI assistant panel.
//
// Gated entirely by ENABLE_GLUNO_ASSISTANT (constants/feature-flags.ts) —
// see GlunoButton.tsx, the only place this gets mounted. Everything here is
// a UI shell: sendMessage below appends the user's message and replies with
// a hardcoded mock (getMockGlunoReply) after a short delay to feel like a
// real response. No backend AI call exists yet.
//
// Future backend AI connection: sendMessage is the one function that should
// change (swap the setTimeout+getMockGlunoReply for a real API call) — the
// rest of this component (message list, composer, quick actions) is meant
// to keep working as-is once that happens.
//
// Uses RN's own Modal (not the app's ModalSheet) so this always renders in
// its own top-level layer — GlunoButton lives inside the floating, elevated
// header pill, and an in-tree absolute-position sheet there would risk
// Android elevation stacking the header above it.
// ──────────────────────────────────────────────────────────────────────────

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

type Props = {
  visible: boolean;
  onClose: () => void;
};

export default function GlunoAssistant({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<GlunoMessage[]>([]);
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<ScrollView>(null);

  function sendMessage(rawText: string) {
    const text = rawText.trim();
    if (!text) return;

    const userMessage: GlunoMessage = { id: createId(), role: 'user', text };
    setMessages((current) => [...current, userMessage]);
    setDraft('');
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));

    // TODO: replace this mocked delay + canned reply with a real backend AI
    // call once Gluno has one (see gluno.constants.ts).
    setTimeout(() => {
      const reply: GlunoMessage = { id: createId(), role: 'gluno', text: getMockGlunoReply(text) };
      setMessages((current) => [...current, reply]);
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    }, 450);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={onClose} />
        <KeyboardAvoidingView style={styles.keyboardAvoider} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={[styles.panel, { paddingBottom: Math.max(insets.bottom, 16) + 12 }]}>
            <View style={styles.handle} />

            <View style={styles.header}>
              <View style={styles.headerLeft}>
                {/* TODO: replace placeholder circle/icon with the final
                    Gluno mascot asset once it exists. */}
                <View style={styles.avatar}>
                  <Ionicons name="sparkles" size={20} color={COLORS.white} />
                </View>
                <View>
                  <Text style={styles.title}>Gluno</Text>
                  <Text style={styles.subtitle}>Your SideQuest assistant</Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.closeButton}
                activeOpacity={0.85}
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close Gluno assistant">
                <Ionicons name="close" size={20} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>

            <View style={styles.introCard}>
              <Text style={styles.introTitle}>Hi, I’m Gluno.</Text>
              <Text style={styles.introBody}>
                I can help you plan trips, suggest SideQuests, and explain features.
              </Text>
            </View>

            <ScrollView
              ref={scrollRef}
              style={styles.messageList}
              contentContainerStyle={styles.messageListContent}
              showsVerticalScrollIndicator={false}>
              {messages.map((message) => (
                <GlunoMessageBubble key={message.id} message={message} />
              ))}
            </ScrollView>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.quickActionsRow}>
              {GLUNO_QUICK_ACTIONS.map((action) => (
                <TouchableOpacity
                  key={action}
                  style={styles.quickActionChip}
                  activeOpacity={0.85}
                  onPress={() => sendMessage(action)}>
                  <Text style={styles.quickActionText}>{action}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.composer}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="Ask Gluno anything..."
                placeholderTextColor={COLORS.placeholderText}
                style={styles.input}
                returnKeyType="send"
                onSubmitEditing={() => sendMessage(draft)}
                multiline
              />
              <TouchableOpacity
                style={[styles.sendButton, !draft.trim() && styles.sendButtonDisabled]}
                activeOpacity={0.85}
                disabled={!draft.trim()}
                onPress={() => sendMessage(draft)}
                accessibilityRole="button"
                accessibilityLabel="Send message to Gluno">
                <Ionicons name="arrow-up" size={18} color={COLORS.white} />
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: COLORS.backdropModal,
    justifyContent: 'flex-end',
  },
  keyboardAvoider: {
    maxHeight: '85%',
  },
  panel: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: SPACING.xl,
    paddingTop: 10,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.borderInput,
    marginBottom: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  subtitle: {
    fontSize: 12,
    color: COLORS.textMeta,
    marginTop: 1,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.bgLight,
  },
  introCard: {
    marginTop: 16,
    padding: 14,
    borderRadius: 18,
    backgroundColor: COLORS.bgLight,
  },
  introTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  introBody: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.textSecondary,
  },
  messageList: {
    marginTop: 14,
    maxHeight: 280,
  },
  messageListContent: {
    paddingVertical: 4,
  },
  quickActionsRow: {
    gap: 8,
    paddingVertical: 12,
  },
  quickActionChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: COLORS.primaryLight12,
  },
  quickActionText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primary,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  input: {
    flex: 1,
    minHeight: 48,
    maxHeight: 120,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.borderInput,
    backgroundColor: COLORS.bgLightest,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: COLORS.textPrimary,
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
});
