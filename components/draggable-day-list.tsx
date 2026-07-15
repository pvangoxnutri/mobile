/**
 * DRAGGABLE DAY LIST — free drag-to-reorder for "What the group will discover"
 *
 * Hold an item, drag it anywhere within the same day, see a line where it'll
 * land, release to drop. Built on react-native-gesture-handler's Pan gesture
 * with activateAfterLongPress: the gesture only activates once held still
 * for the long-press duration, so a normal tap or a vertical scroll swipe
 * that starts on a row both fall through untouched — to the row's own
 * existing TouchableOpacity (navigate to detail) and to the parent
 * ScrollView respectively. This component only wraps each row; it never
 * replaces its content or behavior.
 *
 * Deliberately the simple version of a reorder list: only the dragged row
 * actually moves during the gesture. Other rows don't live-reflow — the drop
 * line alone communicates the target slot. On release the array is reordered
 * and everything settles into its new resting position on the next render.
 * This keeps the gesture math (and the risk of getting it wrong) to a single
 * row's offset instead of a shared live-position map across the whole list.
 */
import { useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, runOnJS } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { PRIMARY_COLOR } from '@/constants/colors';

const LONG_PRESS_DURATION_MS = 350;

type DraggableDayListProps<T> = {
  items: T[];
  keyExtractor: (item: T) => string;
  renderItem: (item: T, isDragging: boolean) => ReactNode;
  /** Receives the full reordered array plus which item was dragged — the
   * caller needs the id to tell a same-day reorder from a cross-day move. */
  onReorder: (newItems: T[], draggedId: string) => void;
  enabled: boolean;
  /** Per-row drag opt-out (e.g. day headers in a mixed feed list). Rows
   * returning false still participate in layout/slot math as drop context —
   * they just can't be picked up. Defaults to all rows draggable. */
  isDraggable?: (item: T) => boolean;
};

export default function DraggableDayList<T>({ items, keyExtractor, renderItem, onReorder, enabled, isDraggable }: DraggableDayListProps<T>) {
  // Measured top offset + height of every row, relative to this list — kept
  // up to date via each row's onLayout. Drives the slot math; no separate
  // FlatList/virtualization here since a single day's activity list is short.
  const offsetsRef = useRef<Map<string, number>>(new Map());
  const heightsRef = useRef<Map<string, number>>(new Map());
  const [dropLineY, setDropLineY] = useState<number | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  function recomputeOffsets() {
    let y = 0;
    for (const item of items) {
      const id = keyExtractor(item);
      offsetsRef.current.set(id, y);
      y += heightsRef.current.get(id) ?? 0;
    }
  }

  function handleLayoutHeight(id: string, height: number) {
    if (heightsRef.current.get(id) === height) return;
    heightsRef.current.set(id, height);
    recomputeOffsets();
  }

  function centerYFor(draggedId: string, dy: number): number {
    const top = offsetsRef.current.get(draggedId) ?? 0;
    const height = heightsRef.current.get(draggedId) ?? 0;
    return top + height / 2 + dy;
  }

  // Where the dragged item would land among the OTHER items (0..others.length).
  function computeInsertionPoint(draggedId: string, centerY: number): number {
    const others = items.filter((it) => keyExtractor(it) !== draggedId);
    for (let i = 0; i < others.length; i++) {
      const id = keyExtractor(others[i]);
      const top = offsetsRef.current.get(id) ?? 0;
      const height = heightsRef.current.get(id) ?? 0;
      if (centerY < top + height / 2) return i;
    }
    return others.length;
  }

  function lineYForInsertionPoint(draggedId: string, insertionPoint: number): number {
    const others = items.filter((it) => keyExtractor(it) !== draggedId);
    if (insertionPoint < others.length) {
      return offsetsRef.current.get(keyExtractor(others[insertionPoint])) ?? 0;
    }
    if (others.length === 0) return 0;
    const lastId = keyExtractor(others[others.length - 1]);
    return (offsetsRef.current.get(lastId) ?? 0) + (heightsRef.current.get(lastId) ?? 0);
  }

  function handleDragStart(id: string) {
    setDraggingId(id);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }

  function handleDragMove(id: string, dy: number) {
    const insertionPoint = computeInsertionPoint(id, centerYFor(id, dy));
    setDropLineY(lineYForInsertionPoint(id, insertionPoint));
  }

  function handleDragEnd(id: string, dy: number) {
    setDraggingId(null);
    setDropLineY(null);

    const fromIndex = items.findIndex((it) => keyExtractor(it) === id);
    if (fromIndex === -1) return;

    const insertionPoint = computeInsertionPoint(id, centerYFor(id, dy));
    const others = items.filter((it) => keyExtractor(it) !== id);
    const reordered = [...others];
    reordered.splice(insertionPoint, 0, items[fromIndex]);

    const unchanged = reordered.every((it, i) => keyExtractor(it) === keyExtractor(items[i]));
    if (unchanged) return;

    onReorder(reordered, id);
  }

  return (
    <View style={styles.container}>
      {dropLineY !== null ? <View pointerEvents="none" style={[styles.dropLine, { top: dropLineY - 1 }]} /> : null}
      {items.map((item) => {
        const id = keyExtractor(item);
        return (
          <DraggableRow
            key={id}
            enabled={enabled && (isDraggable?.(item) ?? true)}
            onLayoutHeight={(h) => handleLayoutHeight(id, h)}
            onDragStart={() => handleDragStart(id)}
            onDragMove={(dy) => handleDragMove(id, dy)}
            onDragEnd={(dy) => handleDragEnd(id, dy)}>
            {renderItem(item, draggingId === id)}
          </DraggableRow>
        );
      })}
    </View>
  );
}

function DraggableRow({
  enabled,
  onLayoutHeight,
  onDragStart,
  onDragMove,
  onDragEnd,
  children,
}: {
  enabled: boolean;
  onLayoutHeight: (height: number) => void;
  onDragStart: () => void;
  onDragMove: (dy: number) => void;
  onDragEnd: (dy: number) => void;
  children: ReactNode;
}) {
  const translateY = useSharedValue(0);
  const isActive = useSharedValue(false);

  // activateAfterLongPress means this Pan simply never activates for a quick
  // tap or a normal scroll swipe — both pass through untouched. It only
  // takes over once the finger has been held ~still for the full duration.
  const pan = Gesture.Pan()
    .enabled(enabled)
    .activateAfterLongPress(LONG_PRESS_DURATION_MS)
    .onStart(() => {
      isActive.value = true;
      runOnJS(onDragStart)();
    })
    .onChange((e) => {
      if (!isActive.value) return;
      translateY.value += e.changeY;
      runOnJS(onDragMove)(translateY.value);
    })
    .onEnd(() => {
      if (!isActive.value) return;
      runOnJS(onDragEnd)(translateY.value);
      isActive.value = false;
      translateY.value = withSpring(0, { damping: 18, mass: 0.6, stiffness: 220 });
    })
    .onFinalize(() => {
      if (isActive.value) {
        isActive.value = false;
        translateY.value = withSpring(0, { damping: 18, mass: 0.6, stiffness: 220 });
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    zIndex: isActive.value ? 20 : 0,
    opacity: isActive.value ? 0.94 : 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: isActive.value ? 6 : 0 },
    shadowOpacity: isActive.value ? 0.16 : 0,
    shadowRadius: isActive.value ? 10 : 0,
    elevation: isActive.value ? 6 : 0,
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View onLayout={(e) => onLayoutHeight(e.nativeEvent.layout.height)} style={animatedStyle}>
        {children}
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  dropLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: PRIMARY_COLOR,
    borderRadius: 1.5,
    zIndex: 30,
  },
});
