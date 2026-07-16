import * as ImageManipulator from 'expo-image-manipulator';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import {
  Image,
  Modal,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

/**
 * Crop the local image URI to the area selected in the positioner.
 * frameW/frameH are the preview frame's display dimensions (used for
 * aspect ratio). scale is from the pinch gesture (1 = no zoom).
 */
export async function cropToPreview(
  uri: string,
  imgSize: { width: number; height: number },
  offset: { x: number; y: number },
  scale: number,
  frameW: number,
  frameH: number,
): Promise<string> {
  const coverScale = Math.max(frameW / imgSize.width, frameH / imgSize.height) * scale;
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{
      crop: {
        originX: Math.max(0, Math.round(-offset.x / coverScale)),
        originY: Math.max(0, Math.round(-offset.y / coverScale)),
        width: Math.min(imgSize.width, Math.round(frameW / coverScale)),
        height: Math.min(imgSize.height, Math.round(frameH / coverScale)),
      },
    }],
    { compress: 0.92, format: ImageManipulator.SaveFormat.JPEG },
  );
  return result.uri;
}

/**
 * Full-screen pan+zoom image positioner modal.
 *
 * cardAspectRatio  — width/height of the card where the image will be
 *                    displayed; determines the preview frame's shape.
 * screenWidth      — used as the frame's full-bleed width.
 */
export function ImagePositionerModal({
  visible,
  uri,
  imageSize,
  cardAspectRatio,
  screenWidth,
  insetTop,
  insetBottom,
  onConfirm,
  onCancel,
  confirmLabel = 'Confirm',
  hintLabel = 'Drag to position · Pinch to zoom',
}: {
  visible: boolean;
  uri: string;
  imageSize: { width: number; height: number };
  cardAspectRatio: number;
  screenWidth: number;
  insetTop: number;
  insetBottom: number;
  onConfirm: (offset: { x: number; y: number }, scale: number) => void;
  onCancel: () => void;
  confirmLabel?: string;
  hintLabel?: string;
}) {
  const frameW = screenWidth;
  const frameH = Math.round(screenWidth / cardAspectRatio);

  const baseCoverScale = Math.max(frameW / imageSize.width, frameH / imageSize.height);

  function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }

  function getBounds(s: number) {
    const dw = imageSize.width * baseCoverScale * s;
    const dh = imageSize.height * baseCoverScale * s;
    return { minX: Math.min(0, frameW - dw), minY: Math.min(0, frameH - dh) };
  }

  const scaleRef = useRef(1);
  const [scale, setScale] = useState(1);
  const { minX: initMinX, minY: initMinY } = getBounds(1);
  const init = { x: initMinX / 2, y: initMinY / 2 };
  const offsetRef = useRef(init);
  const [offset, setOffset] = useState(init);
  const baseRef = useRef(init);
  const pinchRef = useRef<{ dist: number; scale: number } | null>(null);
  const prevTouchCountRef = useRef(0);

  useEffect(() => {
    if (visible) {
      scaleRef.current = 1;
      setScale(1);
      const { minX, minY } = getBounds(1);
      const next = { x: minX / 2, y: minY / 2 };
      offsetRef.current = next;
      baseRef.current = next;
      setOffset(next);
      pinchRef.current = null;
      prevTouchCountRef.current = 0;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (evt) => {
        baseRef.current = { ...offsetRef.current };
        pinchRef.current = null;
        prevTouchCountRef.current = evt.nativeEvent.touches.length;
      },
      onPanResponderMove: (evt, g) => {
        const touches = evt.nativeEvent.touches;
        const tc = touches.length;
        if (tc !== prevTouchCountRef.current) {
          prevTouchCountRef.current = tc;
          baseRef.current = { ...offsetRef.current };
          pinchRef.current = null;
        }
        if (tc >= 2) {
          const dx = touches[0].pageX - touches[1].pageX;
          const dy = touches[0].pageY - touches[1].pageY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (!pinchRef.current) pinchRef.current = { dist, scale: scaleRef.current };
          const newScale = clamp(pinchRef.current.scale * dist / pinchRef.current.dist, 0.8, 5);
          scaleRef.current = newScale;
          setScale(newScale);
          const { minX, minY } = getBounds(newScale);
          const cx = clamp(offsetRef.current.x, minX, 0);
          const cy = clamp(offsetRef.current.y, minY, 0);
          offsetRef.current = { x: cx, y: cy };
          setOffset({ x: cx, y: cy });
        } else {
          const { minX, minY } = getBounds(scaleRef.current);
          const next = {
            x: clamp(baseRef.current.x + g.dx, minX, 0),
            y: clamp(baseRef.current.y + g.dy, minY, 0),
          };
          offsetRef.current = next;
          setOffset(next);
        }
      },
      onPanResponderRelease: () => { pinchRef.current = null; },
      onPanResponderTerminate: () => { pinchRef.current = null; },
    }),
  ).current;

  const screenH_approx = screenWidth * 2.16;
  const frameTop = Math.max(insetTop + 60, (screenH_approx - frameH) / 2 - 40);
  const displayW = imageSize.width * baseCoverScale * scale;
  const displayH = imageSize.height * baseCoverScale * scale;

  return (
    <Modal visible={visible} transparent={false} animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <View style={s.screen}>
        <Image source={{ uri }} style={[StyleSheet.absoluteFillObject, { opacity: 0.3 }]} resizeMode="cover" />
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.6)' }]} />

        <TouchableOpacity style={[s.cancelBtn, { top: insetTop + 12 }]} activeOpacity={0.8} onPress={onCancel}>
          <Ionicons name="close" size={22} color="#fff" />
        </TouchableOpacity>

        <View style={[s.hintRow, { top: frameTop - 38 }]}>
          <Ionicons name="move-outline" size={14} color="rgba(255,255,255,0.7)" />
          <Text style={s.hintText}>{hintLabel}</Text>
        </View>

        <View style={[s.frame, { top: frameTop, height: frameH }]}>
          <Image
            source={{ uri }}
            style={{ position: 'absolute', top: offset.y, left: offset.x, width: displayW, height: displayH }}
            resizeMode="stretch"
          />
          <View style={s.previewLabel}>
            <Text style={s.previewLabelText}>PREVIEW</Text>
          </View>
        </View>

        <TouchableOpacity
          style={[s.confirmBtn, { bottom: insetBottom + 32 }]}
          activeOpacity={0.88}
          onPress={() => onConfirm(offsetRef.current, scaleRef.current)}>
          <Text style={s.confirmBtnText}>{confirmLabel}</Text>
        </TouchableOpacity>

        {/* zIndex 5: above frame (2) so the whole screen is draggable,
            below cancel/confirm (20) so those buttons still work. */}
        <View style={[StyleSheet.absoluteFillObject, s.gestureOverlay]} {...responder.panHandlers} />
      </View>
    </Modal>
  );
}

// THEME EXEMPTION (deliberate): this is a full-screen image-editing surface —
// like the iOS Photos crop tool it is dark in BOTH themes. Every color below
// is an on-image overlay (dim scrim, white controls readable on any photo,
// white confirm pill); a light-mode surface behind a dimmed photo would
// wreck crop contrast. Do not migrate these to surface/text tokens.
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#080a12' },
  cancelBtn: {
    position: 'absolute', right: 18,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center', justifyContent: 'center', zIndex: 20,
  },
  hintRow: {
    position: 'absolute', left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, zIndex: 20,
  },
  hintText: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600', letterSpacing: 0.1 },
  frame: { position: 'absolute', left: 0, right: 0, overflow: 'hidden', zIndex: 2 },
  previewLabel: {
    position: 'absolute', top: 14, left: 16,
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.32)', zIndex: 3,
  },
  previewLabelText: { color: '#fff', fontSize: 9, fontWeight: '700', letterSpacing: 1.4 },
  gestureOverlay: { zIndex: 5 },
  confirmBtn: {
    position: 'absolute', left: 24, right: 24,
    height: 60, borderRadius: 30,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', zIndex: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25, shadowRadius: 16, elevation: 8,
  },
  confirmBtnText: { color: '#0a0c14', fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
});
