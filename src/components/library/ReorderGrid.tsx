/**
 * InkTrick - Reorder grid
 * Sortable grid of book cards: long-press and drag a card to move it (the others slide out of the
 * way), or use its arrow buttons. Every position change is animated.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
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
}

const SPRING = { damping: 20, stiffness: 220, mass: 0.7 };

export default function ReorderGrid({ books, columns, cardWidth, gap, renderCard, onMove }: Props) {
  // All cards share the same height; measured from the first one.
  const [cardHeight, setCardHeight] = useState(cardWidth / 0.7 + 52);
  const rows = Math.ceil(books.length / columns);

  return (
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
        />
      ))}
    </View>
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
}

function SortableCard({ book, index, count, columns, cardWidth, cardHeight, gap, onMeasure, renderCard, onMove }: CardProps) {
  const slotX = (index % columns) * (cardWidth + gap);
  const slotY = Math.floor(index / columns) * (cardHeight + gap);

  const x = useSharedValue(slotX);
  const y = useSharedValue(slotY);
  const dragging = useSharedValue(false);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
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

  const pan = Gesture.Pan()
    .activateAfterLongPress(220)
    .onStart(() => {
      dragging.value = true;
      startX.value = x.value;
      startY.value = y.value;
    })
    .onUpdate(e => {
      x.value = startX.value + e.translationX;
      y.value = startY.value + e.translationY;
      // Slot under the card's center.
      const col = Math.min(columns - 1, Math.max(0, Math.round(x.value / (cardWidth + gap))));
      const row = Math.max(0, Math.round(y.value / (cardHeight + gap)));
      const target = Math.min(count - 1, row * columns + col);
      if (target !== lastTarget.value) {
        lastTarget.value = target;
        runOnJS(move)(target);
      }
    })
    .onFinalize(() => {
      if (!dragging.value) return;
      dragging.value = false;
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
