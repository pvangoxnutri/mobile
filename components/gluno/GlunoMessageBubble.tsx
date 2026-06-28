import { StyleSheet, Text, View } from 'react-native';
import { COLORS } from '@/constants/design-tokens';

// EXPERIMENTAL — part of the Gluno assistant UI shell (see
// components/gluno/GlunoAssistant.tsx, gated by ENABLE_GLUNO_ASSISTANT in
// constants/feature-flags.ts). Purely presentational — no AI logic here.

export type GlunoMessage = {
  id: string;
  role: 'user' | 'gluno';
  text: string;
};

export default function GlunoMessageBubble({ message }: { message: GlunoMessage }) {
  const isUser = message.role === 'user';
  return (
    <View style={[styles.row, isUser ? styles.rowUser : styles.rowGluno]}>
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleGluno]}>
        <Text style={[styles.text, isUser ? styles.textUser : styles.textGluno]}>{message.text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  rowUser: {
    justifyContent: 'flex-end',
  },
  rowGluno: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '82%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  bubbleUser: {
    backgroundColor: COLORS.primary,
    borderBottomRightRadius: 4,
  },
  bubbleGluno: {
    backgroundColor: COLORS.bgLight,
    borderBottomLeftRadius: 4,
  },
  text: {
    fontSize: 14,
    lineHeight: 20,
  },
  textUser: {
    color: COLORS.white,
  },
  textGluno: {
    color: COLORS.textPrimary,
  },
});
