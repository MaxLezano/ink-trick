/**
 * InkTrick - Reorder grid
 * Sortable grid of book cards: long-press and drag a card to move it (the others slide out of the
 * way), or use its arrow buttons. Every position change is animated. Holding a dragged card near
 * the top or bottom edge auto-scrolls the list (the grid owns its scroll view for that).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleProp, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { Gesture, GestureDetector, ScrollView as GHScrollView } from 'react-native-gesture-handler';
import Animated, {
  measure,
  runOnJS,
  scrollTo,
  SharedValue,
  useAnimatedProps,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedStyle,
  useFrameCallback,
  useScrollViewOffset,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { BookFile } from '../../utils/types';
import { COLORS } from '../../utils/constants';
import { ArrowIcon } from '../Icons';

interface Props {
  books: BookFile[]; // current order
  columns: number;
  cardWidth: number;
  gap: number;
  renderCard: (book: BookFile) => React.ReactNode;
  onMove: (id: string, toIndex: number) => void;
  contentContainerStyle?: StyleProp<ViewStyle>;
}

const SPRING = { damping: 20, stiffness: 220, mass: 0.7 };
// Auto-scroll: band at each edge of the viewport (dp) and top speed (dp per 60 Hz frame).
const EDGE_BAND = 90;
const MAX_SCROLL_SPEED = 16;

const AnimatedScrollView = Animated.createAnimatedComponent(GHScrollView);

export default function ReorderGrid({ books, columns, cardWidth, gap, renderCard, onMove, contentContainerStyle }: Props) {
  // All cards share the same height; measured from the first one.
  const [cardHeight, setCardHeight] = useState(cardWidth / 0.7 + 52);
  const rows = Math.ceil(books.length / columns);

  const scrollRef = useAnimatedRef<any>();
  const scrollY = useScrollViewOffset(scrollRef);
  const contentHeight = useSharedValue(0);
  const fingerY = useSharedValue(-1); // absolute Y of the dragging finger; -1 when idle
  // Scroll offset owned by the drag: only the auto-scroll moves the list while a card is held.
  const dragScroll = useSharedValue(0);
  // The scroll view would otherwise also follow the dragging finger and fight the auto-scroll.
  // Disabled on the UI thread the moment the drag starts (a JS round trip arrives too late on slow
  // tablets: the list bounced between the finger and the auto-scroll); the state mirrors it.
  const [dragActive, setDragActive] = useState(false);
  const scrollProps = useAnimatedProps(() => ({ scrollEnabled: fingerY.value < 0 }));
  useAnimatedReaction(
    () => fingerY.value >= 0,
    (active, previous) => {
      if (active !== previous && previous !== null) runOnJS(setDragActive)(active);
    },
  );

  // While a card is dragged, scroll faster the deeper the finger is into an edge band. Any other
  // movement of the list (a native drag that slipped through) is undone on the next frame.
  useFrameCallback(frame => {
    if (fingerY.value < 0) return;
    const m = measure(scrollRef);
    if (!m) return;
    const band = Math.min(EDGE_BAND, m.height / 4);
    const fromTop = fingerY.value - m.pageY;
    const fromBottom = m.pageY + m.height - fingerY.value;
    let speed = 0;
    if (fromTop < band) speed = -MAX_SCROLL_SPEED * Math.min(1, 1 - fromTop / band);
    else if (fromBottom < band) speed = MAX_SCROLL_SPEED * Math.min(1, 1 - fromBottom / band);
    const step = speed * Math.min(3, (frame.timeSincePreviousFrame ?? 16) / 16);
    const maxScroll = Math.max(0, contentHeight.value - m.height);
    const next = Math.min(maxScroll, Math.max(0, dragScroll.value + step));
    dragScroll.value = next;
    if (Math.abs(scrollY.value - next) > 0.5) scrollTo(scrollRef, 0, next, false);
  });

  return (
    <AnimatedScrollView
      ref={scrollRef}
      scrollEnabled={!dragActive}
      animatedProps={scrollProps}
      contentContainerStyle={contentContainerStyle}
      onContentSizeChange={(_w: number, h: number) => { contentHeight.value = h; }}
    >
    <View style={{ height: rows * cardHeight + (rows - 1) * gap }}>
      {books.map((book, index) => (
        <SortableCard
          key={book.id}
          book={book}
          index={index}
          count={books.length}
          columns={columns}
          cardWidth={cardWidth}
          cardHeight={cardHeight}
          gap={gap}
          onMeasure={index === 0 ? setCardHeight : undefined}
          renderCard={renderCard}
          onMove={onMove}
          scrollY={scrollY}
          dragScroll={dragScroll}
          fingerY={fingerY}
        />
      ))}
    </View>
    </AnimatedScrollView>
  );
}

interface CardProps {
  book: BookFile;
  index: number;
  count: number;
  columns: number;
  cardWidth: number;
  cardHeight: number;
  gap: number;
  onMeasure?: (height: number) => void;
  renderCard: (book: BookFile) => React.ReactNode;
  onMove: (id: string, toIndex: number) => void;
  scrollY: SharedValue<number>;
  dragScroll: SharedValue<number>;
  fingerY: SharedValue<number>;
}

function SortableCard({
  book, index, count, columns, cardWidth, cardHeight, gap, onMeasure, renderCard, onMove, scrollY, dragScroll, fingerY,
}: CardProps) {
  const slotX = (index % columns) * (cardWidth + gap);
  const slotY = Math.floor(index / columns) * (cardHeight + gap);

  const x = useSharedValue(slotX);
  const y = useSharedValue(slotY);
  const dragging = useSharedValue(false);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const startScroll = useSharedValue(0);
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const lastTarget = useSharedValue(index);
  const firstLayout = useRef(true);

  // Slide to the new slot whenever the position changes (arrows or another card being dragged).
  useEffect(() => {
    lastTarget.value = index;
    if (dragging.value) return;
    if (firstLayout.current) {
      firstLayout.current = false;
      x.value = slotX;
      y.value = slotY;
      return;
    }
    x.value = withSpring(slotX, SPRING);
    y.value = withSpring(slotY, SPRING);
  }, [dragging, index, lastTarget, slotX, slotY, x, y]);

  const move = useCallback((to: number) => onMove(book.id, to), [book.id, onMove]);

  // Card follows the finger plus whatever the list scrolled since the drag began.
  const follow = () => {
    'worklet';
    x.value = startX.value + dragX.value;
    y.value = startY.value + dragY.value + dragScroll.value - startScroll.value;
    // Slot under the card's center.
    const col = Math.min(columns - 1, Math.max(0, Math.round(x.value / (cardWidth + gap))));
    const row = Math.max(0, Math.round(y.value / (cardHeight + gap)));
    const target = Math.min(count - 1, row * columns + col);
    if (target !== lastTarget.value) {
      lastTarget.value = target;
      runOnJS(move)(target);
    }
  };

  // Auto-scroll moves the content under a still finger: keep the dragged card with it.
  useAnimatedReaction(
    () => dragScroll.value,
    (current, previous) => {
      if (dragging.value && current !== previous) follow();
    },
  );

  const pan = Gesture.Pan()
    .activateAfterLongPress(220)
    .onStart(e => {
      dragging.value = true;
      startX.value = x.value;
      startY.value = y.value;
      // The drag takes over the list's offset from where it is now.
      dragScroll.value = scrollY.value;
      startScroll.value = scrollY.value;
      dragX.value = 0;
      dragY.value = 0;
      fingerY.value = e.absoluteY;
    })
    .onUpdate(e => {
      dragX.value = e.translationX;
      dragY.value = e.translationY;
      fingerY.value = e.absoluteY;
      follow();
    })
    .onFinalize(() => {
      if (!dragging.value) return;
      dragging.value = false;
      fingerY.value = -1;
      const target = lastTarget.value;
      x.value = withSpring((target % columns) * (cardWidth + gap), SPRING);
      y.value = withSpring(Math.floor(target / columns) * (cardHeight + gap), SPRING);
    });

  const style = useAnimatedStyle(() => ({
    zIndex: dragging.value ? 100 : 1,
    elevation: dragging.value ? 16 : 0,
    transform: [
      { translateX: x.value },
      { translateY: y.value },
      { scale: withTiming(dragging.value ? 1.06 : 1, { duration: 150 }) },
    ],
    opacity: withTiming(dragging.value ? 0.92 : 1, { duration: 150 }),
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        style={[styles.card, { width: cardWidth }, style]}
        onLayout={onMeasure ? e => onMeasure(e.nativeEvent.layout.height) : undefined}
      >
        <View pointerEvents="none">{renderCard(book)}</View>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{index + 1}</Text>
        </View>
        <View style={styles.controls}>
          <TouchableOpacity
            style={[styles.arrow, index === 0 && styles.arrowDisabled]}
            disabled={index === 0}
            onPress={() => move(index - 1)}
            accessibilityLabel="Mover antes"
          >
            <ArrowIcon size={18} color={COLORS.text} direction="left" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.arrow, index === count - 1 && styles.arrowDisabled]}
            disabled={index === count - 1}
            onPress={() => move(index + 1)}
            accessibilityLabel="Mover después"
          >
            <ArrowIcon size={18} color={COLORS.text} />
          </TouchableOpacity>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  badge: {
    position: 'absolute',
    top: 8,
    left: 8,
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    paddingHorizontal: 6,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#0A0A0A',
    fontSize: 13,
    fontWeight: '900',
  },
  controls: {
    position: 'absolute',
    left: 8,
    right: 8,
    top: '38%',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  arrow: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(10,10,10,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowDisabled: {
    opacity: 0.25,
  },
});
