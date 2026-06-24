/**
 * KEYBOARD FOCUS SCROLL — keep the focused field visible above the keyboard
 *
 * Pairs with the app's existing KeyboardAvoidingView(behavior="padding") +
 * ScrollView pattern. KeyboardAvoidingView only reclaims space for the
 * keyboard — it never moves the scroll position, so a field below the fold
 * stays hidden behind (or pinned right above) the keyboard once it opens.
 * This hook adds the missing half: on focus, scroll just enough to land the
 * field in a calm, readable spot above the keyboard, and do nothing if it's
 * already comfortably visible.
 *
 * Usage:
 *   const { scrollRef, scrollViewProps, onFocusField } = useKeyboardFocusScroll();
 *   <ScrollView ref={scrollRef} {...scrollViewProps}>
 *     <TextInput ref={emailRef} onFocus={onFocusField(emailRef)} ... />
 *   </ScrollView>
 *
 * Field-to-field "Next" chaining is just a plain ref call —
 * onSubmitEditing={() => passwordRef.current?.focus()} — no helper needed.
 */
import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { Dimensions, Keyboard, Platform, ScrollView, TextInput, type KeyboardEvent } from 'react-native';

// Below this height fraction (top) → too close to the top edge / status bar.
// Above this fraction (bottom) → at risk of being under or right against the
// keyboard. Anything already inside this band is left untouched (req. 2: no
// unnecessary scroll, no jitter).
const COMFORTABLE_TOP_FRACTION = 0.16;
const COMFORTABLE_BOTTOM_FRACTION = 0.62;
// Where a field outside the comfortable band gets moved to — "lower-middle"
// of the remaining visible area, not pressed against the keyboard.
const TARGET_FRACTION = 0.46;
// Skip corrections smaller than this — avoids micro-adjustments that read as
// jitter when a field is already very close to the target.
const MIN_ADJUSTMENT_PX = 20;
// Lets the keyboard's show animation get underway before measuring — measuring
// one frame too early can read a pre-animation layout on some Android devices.
const MEASURE_DELAY_MS = Platform.OS === 'android' ? 80 : 0;

// Pass an existing ScrollView ref when the screen already manages its own
// (e.g. for an unrelated scroll-to-anchor feature) so there's exactly one
// ref/one source of truth for that ScrollView's position — never two
// independent scroll controllers fighting each other.
export function useKeyboardFocusScroll(externalScrollRef?: RefObject<ScrollView | null>) {
  const ownScrollRef = useRef<ScrollView>(null);
  const scrollRef = externalScrollRef ?? ownScrollRef;
  const scrollYRef = useRef(0);
  const keyboardHeightRef = useRef(0);
  const activeInputRef = useRef<TextInput | null>(null);
  const windowHeightRef = useRef(Dimensions.get('window').height);

  const performScroll = useCallback(() => {
    const input = activeInputRef.current;
    const scroller = scrollRef.current;
    const keyboardHeight = keyboardHeightRef.current;
    if (!input || !scroller || keyboardHeight <= 0) return;

    input.measureInWindow((_x, y, _width, height) => {
      const visibleHeight = windowHeightRef.current - keyboardHeight;
      const comfortableTop = visibleHeight * COMFORTABLE_TOP_FRACTION;
      const comfortableBottom = visibleHeight * COMFORTABLE_BOTTOM_FRACTION;

      // Already readable above the keyboard with breathing room on both
      // sides — leave it alone.
      if (y >= comfortableTop && y + height <= comfortableBottom) return;

      const targetY = visibleHeight * TARGET_FRACTION;
      const delta = y - targetY;
      if (Math.abs(delta) < MIN_ADJUSTMENT_PX) return;

      scroller.scrollTo({ y: Math.max(0, scrollYRef.current + delta), animated: true });
    });
  }, []);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const subShow = Keyboard.addListener(showEvent, (e: KeyboardEvent) => {
      keyboardHeightRef.current = e.endCoordinates.height;
      if (MEASURE_DELAY_MS > 0) {
        setTimeout(performScroll, MEASURE_DELAY_MS);
      } else {
        requestAnimationFrame(performScroll);
      }
    });
    // Keyboard hide deliberately does NOT trigger any scroll — restoring
    // calmly means leaving the scroll position exactly where the user left
    // it (req. 3), not snapping back to top or re-centering anything.
    const subHide = Keyboard.addListener(hideEvent, () => {
      keyboardHeightRef.current = 0;
      activeInputRef.current = null;
    });

    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, [performScroll]);

  useEffect(() => {
    const onChange = ({ window }: { window: { height: number } }) => {
      windowHeightRef.current = window.height;
    };
    const sub = Dimensions.addEventListener('change', onChange);
    return () => sub.remove();
  }, []);

  const handleScroll = useCallback((e: { nativeEvent: { contentOffset: { y: number } } }) => {
    scrollYRef.current = e.nativeEvent.contentOffset.y;
  }, []);

  // Returns an onFocus handler for a given field ref. Switching directly
  // between two already-focused-keyboard fields (no keyboardWillShow refire)
  // is handled here by scrolling immediately when the keyboard height is
  // already known.
  const onFocusField = useCallback(
    (ref: { current: TextInput | null }) => () => {
      activeInputRef.current = ref.current;
      if (keyboardHeightRef.current > 0) {
        requestAnimationFrame(performScroll);
      }
    },
    [performScroll],
  );

  return {
    scrollRef,
    onFocusField,
    // Spread onto the ScrollView: keyboardShouldPersistTaps lets the next
    // field be tapped without first dismissing the keyboard (req. 4 — moving
    // field-to-field should feel uninterrupted).
    scrollViewProps: {
      onScroll: handleScroll,
      scrollEventThrottle: 16,
      keyboardShouldPersistTaps: 'handled' as const,
    },
  };
}
