import { usePreventRemove } from '@react-navigation/native';
import { useNavigation, router } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useTheme } from '@/components/theme-provider';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { AppTheme } from '@/constants/themes';

type UseUnsavedChangesArgs = {
  isDirty: boolean;
  onSave?: () => Promise<boolean | void>;
};

/**
 * Guards a back navigation when the form has unsaved changes.
 * Returns helpers + the modal component (call <Modal /> in your JSX).
 *
 * onSave: optional. If provided, the modal shows a "Save" option that calls
 *         this function and only navigates back if it returns true (or void).
 *         Returning false means the save failed — modal stays open and the
 *         screen stays on the form.
 */
export function useUnsavedChanges({ isDirty, onSave }: UseUnsavedChangesArgs) {
  const navigation = useNavigation();
  const [modalOpen, setModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // The navigation action that was intercepted. Re-dispatching it (after the
  // user picks Save or Discard) routes them to wherever they originally
  // wanted to go — without retriggering usePreventRemove.
  const pendingActionRef = useRef<(() => void) | null>(null);
  // When the screen has explicitly saved (e.g. user pressed "Create Adventure"),
  // we want the next navigation to go through without the guard popping the
  // "Unsaved changes" modal. We can't just clear isDirty in time because
  // navigation fires synchronously after the screen's save handler.
  const savedRef = useRef(false);

  // usePreventRemove works with native-stack screens (covers iOS edge-swipe,
  // Android hardware back, and any nav action — unlike beforeRemove which
  // native-stack doesn't fully support).
  usePreventRemove(isDirty, ({ data }) => {
    if (savedRef.current) {
      // Just saved — let navigation through. preventDefault has already
      // intercepted the original action; re-dispatching it works because
      // navigation tracks the dispatched action and won't re-intercept it.
      savedRef.current = false;
      navigation.dispatch(data.action);
      return;
    }
    pendingActionRef.current = () => navigation.dispatch(data.action);
    setModalOpen(true);
  });

  function leaveNow() {
    const pending = pendingActionRef.current;
    pendingActionRef.current = null;
    if (pending) {
      pending();
    } else {
      // No intercepted action — fall back to a normal back. usePreventRemove
      // sees isDirty=false now (if it became false) or will re-intercept (if
      // it's still true), which is the correct behavior.
      router.back();
    }
  }

  const requestBack = useCallback(() => {
    // Always try to go back — usePreventRemove handles the dirty case by
    // intercepting and showing the modal.
    router.back();
  }, []);

  const handleDiscard = useCallback(() => {
    setModalOpen(false);
    setTimeout(() => leaveNow(), 80);
  }, []);

  const handleSave = useCallback(async () => {
    if (!onSave) {
      setModalOpen(false);
      setTimeout(() => leaveNow(), 80);
      return;
    }
    setBusy(true);
    try {
      const result = await onSave();
      if (result === false) {
        return;
      }
      setModalOpen(false);
      setTimeout(() => leaveNow(), 80);
    } catch {
      // onSave threw — keep modal open so user can see the error from their form
    } finally {
      setBusy(false);
    }
  }, [onSave]);

  const handleCancel = useCallback(() => {
    if (busy) return;
    pendingActionRef.current = null;
    setModalOpen(false);
  }, [busy]);

  // Called by the screen right before it navigates away after a successful
  // save. Tells the guard to skip its check for the next navigation event.
  const markSaved = useCallback(() => {
    savedRef.current = true;
  }, []);

  return {
    requestBack,
    modalOpen,
    busy,
    handleDiscard,
    handleSave,
    handleCancel,
    setModalOpen,
    markSaved,
  };
}

type ModalProps = {
  visible: boolean;
  busy: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
  hasSave: boolean;
};

export function UnsavedChangesModal({ visible, busy, onSave, onDiscard, onCancel, hasSave }: ModalProps) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onCancel} />
        <View style={styles.card}>
          <Text style={styles.title}>Unsaved changes</Text>
          <Text style={styles.body}>
            You have unsaved changes. Do you want to save them before leaving?
          </Text>

          <View style={styles.buttons}>
            {hasSave ? (
              <TouchableOpacity
                style={[styles.primaryButton, { backgroundColor: theme.colors.primary }, busy ? styles.buttonDisabled : null]}
                activeOpacity={0.88}
                disabled={busy}
                onPress={onSave}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Save</Text>}
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              style={[styles.discardButton, busy ? styles.buttonDisabled : null]}
              activeOpacity={0.88}
              disabled={busy}
              onPress={onDiscard}>
              <Text style={styles.discardButtonText}>Discard changes</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.cancelButton, busy ? styles.buttonDisabled : null]}
              activeOpacity={0.88}
              disabled={busy}
              onPress={onCancel}>
              <Text style={styles.cancelButtonText}>Keep editing</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: theme.isDark ? theme.colors.backdropModal : 'rgba(12,16,26,0.5)',
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  card: {
    borderRadius: 22,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: theme.isDark ? StyleSheet.hairlineWidth : 0,
    borderColor: theme.colors.borderPrimary,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 14,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  body: {
    marginTop: 10,
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
  },
  buttons: {
    marginTop: 20,
    gap: 8,
  },
  primaryButton: {
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
  discardButton: {
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.isDark ? theme.colors.errorBorder : '#f0d4d8',
    backgroundColor: theme.colors.surfaceElevated,
  },
  discardButtonText: {
    color: theme.colors.error,
    fontSize: 15,
    fontWeight: '700',
  },
  cancelButton: {
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    color: theme.colors.textSecondary,
    fontSize: 15,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.55,
  },
});
