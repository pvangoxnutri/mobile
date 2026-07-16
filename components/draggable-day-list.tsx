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
import { useEffect, useRef, useState, type MutableRefObject, type ReactNode, type RefObject } from 'react';
import { Dimensions, StyleSheet, View, type ScrollView } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, runOnJS } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/components/theme-provider';

const LONG_PRESS_DURATION_MS = 350;

// Auto-scroll when the finger drags into these window-edge zones. The top
// zone is slightly larger to clear headers/notches.
const EDGE_ZONE_TOP = 150;
const EDGE_ZONE_BOTTOM = 140;
const AUTO_SCROLL_INTERVAL_MS = 16;
const AUTO_SCROLL_MAX_STEP = 14;

type AutoScrollConfig = {
  scrollRef: RefObject<ScrollView | null>;
  /** Kept current by the ScrollView's own onScroll. */
  scrollYRef: MutableRefObject<number>;
  contentHeightRef: MutableRefObject<number>;
  viewportHeightRef: MutableRefObject<number>;
};

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
  /** When provided, dragging near the top/bottom of the window auto-scrolls
   * the parent ScrollView so long lists can be traversed in one drag. */
  autoScroll?: AutoScrollConfig;
};

export default function DraggableDayList<T>({ items, keyExtractor, renderItem, onReorder, enabled, isDraggable, autoScroll }: DraggableDayListProps<T>) {
  const { theme } = useTheme();
  // Measured top offset + height of every row, straight from onLayout's
  // layout.y/height relative to this list. Using the real measured y (not a
  // sum of heights) keeps the slot math exact even when rows have margins
  // or the container uses gap. No FlatList/virtualization here since the
  // feed list is short.
  const offsetsRef = useRef<Map<string, number>>(new Map());
  const heightsRef = useRef<Map<string, number>>(new Map());
  const [dropLineY, setDropLineY] = useState<number | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  // Live drag bookkeeping for auto-scroll: the active row's translateY
  // bumper (keeps the card under a stationary finger while the list scrolls
  // beneath it) plus the latest dy so the drop line can follow.
  const activeIdRef = useRef<string | null>(null);
  const lastDyRef = useRef(0);
  const adjustActiveRef = useRef<((delta: number) => void) | null>(null);
  const autoScrollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoScrollDirectionRef = useRef<0 | 1 | -1>(0);
  const autoScrollSpeedRef = useRef(0);

  useEffect(() => () => stopAutoScroll(), []);

  function handleLayout(id: string, y: number, height: number) {
    offsetsRef.current.set(id, y);
    heightsRef.current.set(id, height);
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

  function updateDropLine(id: string, dy: number) {
    const insertionPoint = computeInsertionPoint(id, centerYFor(id, dy));
    setDropLineY(lineYForInsertionPoint(id, insertionPoint));
  }

  function stopAutoScroll() {
    if (autoScrollTimerRef.current) {
      clearInterval(autoScrollTimerRef.current);
      autoScrollTimerRef.current = null;
    }
    autoScrollDirectionRef.current = 0;
  }

  function autoScrollTick() {
    const config = autoScroll;
    const direction = autoScrollDirectionRef.current;
    const id = activeIdRef.current;
    if (!config || direction === 0 || !id) return;

    const current = config.scrollYRef.current;
    const maxY = Math.max(0, config.contentHeightRef.current - config.viewportHeightRef.current);
    const next = Math.min(maxY, Math.max(0, current + direction * autoScrollSpeedRef.current));
    const delta = next - current;
    if (delta === 0) return;

    config.scrollRef.current?.scrollTo({ y: next, animated: false });
    // onScroll will confirm shortly, but stamp immediately so back-to-back
    // ticks don't re-apply the same base offset.
    config.scrollYRef.current = next;

    // The content moved by -delta under the stationary finger — bump the
    // dragged card by +delta so it stays put on screen, and let the drop
    // line follow the card's new position within the list.
    adjustActiveRef.current?.(delta);
    lastDyRef.current += delta;
    updateDropLine(id, lastDyRef.current);
  }

  function maybeAutoScroll(absoluteY: number) {
    if (!autoScroll) return;
    const windowHeight = Dimensions.get('window').height;

    let direction: 0 | 1 | -1 = 0;
    let intensity = 0;
    if (absoluteY < EDGE_ZONE_TOP) {
      direction = -1;
      intensity = (EDGE_ZONE_TOP - absoluteY) / EDGE_ZONE_TOP;
    } else if (absoluteY > windowHeight - EDGE_ZONE_BOTTOM) {
      direction = 1;
      intensity = (absoluteY - (windowHeight - EDGE_ZONE_BOTTOM)) / EDGE_ZONE_BOTTOM;
    }

    autoScrollSpeedRef.current = Math.max(4, Math.min(1, intensity) * AUTO_SCROLL_MAX_STEP);
    autoScrollDirectionRef.current = direction;

    if (direction === 0) {
      stopAutoScroll();
      return;
    }
    if (!autoScrollTimerRef.current) {
      autoScrollTimerRef.current = setInterval(autoScrollTick, AUTO_SCROLL_INTERVAL_MS);
    }
  }

  function handleDragStart(id: string, adjust: (delta: number) => void) {
    setDraggingId(id);
    activeIdRef.current = id;
    lastDyRef.current = 0;
    adjustActiveRef.current = adjust;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }

  function handleDragMove(id: string, dy: number, absoluteY: number) {
    lastDyRef.current = dy;
    updateDropLine(id, dy);
    maybeAutoScroll(absoluteY);
  }

  function clearDragState() {
    stopAutoScroll();
    activeIdRef.current = null;
    adjustActiveRef.current = null;
    setDraggingId(null);
    setDropLineY(null);
  }

  function handleDragEnd(id: string, dy: number) {
    clearDragState();

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
      {dropLineY !== null ? (
        <View pointerEvents="none" style={[styles.dropLine, { top: dropLineY - 1, backgroundColor: theme.colors.primary }]} />
      ) : null}
      {items.map((item) => {
        const id = keyExtractor(item);
        return (
          <DraggableRow
            key={id}
            enabled={enabled && (isDraggable?.(item) ?? true)}
            onLayoutRow={(y, h) => handleLayout(id, y, h)}
            onDragStart={(adjust) => handleDragStart(id, adjust)}
            onDragMove={(dy, absoluteY) => handleDragMove(id, dy, absoluteY)}
            onDragEnd={(dy) => handleDragEnd(id, dy)}
            onDragCancel={() => clearDragState()}>
            {renderItem(item, draggingId === id)}
          </DraggableRow>
        );
      })}
    </View>
  );
}

function DraggableRow({
  enabled,
  onLayoutRow,
  onDragStart,
  onDragMove,
  onDragEnd,
  onDragCancel,
  children,
}: {
  enabled: boolean;
  onLayoutRow: (y: number, height: number) => void;
  onDragStart: (adjust: (delta: number) => void) => void;
  onDragMove: (dy: number, absoluteY: number) => void;
  onDragEnd: (dy: number) => void;
  onDragCancel: () => void;
  children: ReactNode;
}) {
  const translateY = useSharedValue(0);
  const isActive = useSharedValue(false);

  // Stable JS-side bumper handed to the list on drag start — auto-scroll
  // nudges the active card through this so it stays under the finger while
  // the parent ScrollView moves beneath it.
  const adjustRef = useRef((delta: number) => {
    translateY.value += delta;
  });

  const startJS = () => onDragStart(adjustRef.current);

  // activateAfterLongPress means this Pan simply never activates for a quick
  // tap or a normal scroll swipe — both pass through untouched. It only
  // takes over once the finger has been held ~still for the full duration.
  const pan = Gesture.Pan()
    .enabled(enabled)
    .activateAfterLongPress(LONG_PRESS_DURATION_MS)
    .onStart(() => {
      isActive.value = true;
      runOnJS(startJS)();
    })
    .onChange((e) => {
      if (!isActive.value) return;
      translateY.value += e.changeY;
      runOnJS(onDragMove)(translateY.value, e.absoluteY);
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
        runOnJS(onDragCancel)();
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
      <Animated.View
        onLayout={(e) => onLayoutRow(e.nativeEvent.layout.y, e.nativeEvent.layout.height)}
        style={animatedStyle}>
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
    // backgroundColor set inline from theme.colors.primary.
    borderRadius: 1.5,
    zIndex: 30,
  },
});
