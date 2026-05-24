import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SPACING, TYPOGRAPHY, COLORS } from '@/constants/design-tokens';

interface ModalHeaderProps {
  eyebrow?: string;
  title: string;
  onClose: () => void;
  rightAction?: React.ReactNode;
}

export function ModalHeader({
  eyebrow,
  title,
  onClose,
  rightAction,
}: ModalHeaderProps) {
  return (
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        {eyebrow && <Text style={styles.eyebrow}>{eyebrow}</Text>}
        <Text style={styles.title}>{title}</Text>
      </View>
      {rightAction}
      <TouchableOpacity
        style={styles.closeButton}
        activeOpacity={0.88}
        onPress={onClose}>
        <Ionicons name="close" size={20} color={COLORS.textPrimary} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.lg,
    gap: SPACING.md,
  },
  eyebrow: {
    ...TYPOGRAPHY.eyebrow,
    fontWeight: '800',
    color: COLORS.textMeta,
  },
  title: {
    ...TYPOGRAPHY.modalTitle,
    fontWeight: '900',
    color: COLORS.textPrimary,
    marginTop: SPACING.md,
  },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.bgLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
