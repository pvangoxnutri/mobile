import { usePreventRemove } from '@react-navigation/native';
import { useNavigation, router } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { PRIMARY_COLOR } from '@/constants/colors';

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

  // usePreventRemove works with native-stack screens (covers iOS edge-swipe,
  // Android hardware back, and any nav action — unlike beforeRemove which
  // native-stack doesn't fully support).
  usePreventRemove(isDirty, ({ data }) => {
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

  return {
    requestBack,
    modalOpen,
    busy,
    handleDiscard,
    handleSave,
    handleCancel,
    setModalOpen,
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
                style={[styles.primaryButton, { backgroundColor: PRIMARY_COLOR }, busy ? styles.buttonDisabled : null]}
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

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(12,16,26,0.5)',
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  card: {
    borderRadius: 22,
    backgroundColor: '#fff',
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 14,
  },
  title: {
    color: '#14161d',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  body: {
    marginTop: 10,
    color: '#5b626f',
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
    borderColor: '#f0d4d8',
    backgroundColor: '#fff',
  },
  discardButtonText: {
    color: '#d53d18',
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
    color: '#5b626f',
    fontSize: 15,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.55,
  },
});
