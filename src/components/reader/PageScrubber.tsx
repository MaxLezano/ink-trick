/**
 * InkTrick - Page scrubber
 * Draggable progress track to jump quickly through a book. Shows a live page preview label while
 * dragging and only commits the page when the finger is released. Bookmarked pages show as ticks.
 */
import React, { useCallback, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { COLORS } from '../../utils/constants';

interface Props {
  current: number; // 0-based
  total: number;
  reversed?: boolean; // RTL: first page on the right
  onCommit: (index: number) => void;
  marks?: number[]; // Bookmarked pages
  labelFor?: (index: number) => string; // Label of a page (EPUB shows a percentage)
}

const pageLabel = (index: number) => `${index + 1}`;

export default function PageScrubber({ current, total, reversed = false, onCommit, marks, labelFor = pageLabel }: Props) {
  const [trackWidth, setTrackWidth] = useState(1);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const indexAt = useCallback(
    (x: number) => {
      const ratio = Math.min(1, Math.max(0, x / trackWidth));
      const r = reversed ? 1 - ratio : ratio;
      return Math.round(r * Math.max(0, total - 1));
    },
    [reversed, total, trackWidth],
  );

  const update = useCallback((x: number) => setDragIndex(indexAt(x)), [indexAt]);
  const commit = useCallback(
    (x: number) => {
      const idx = indexAt(x);
      setDragIndex(null);
      onCommit(idx);
    },
    [indexAt, onCommit],
  );

  const gesture = Gesture.Pan()
    .minDistance(0)
    .onBegin(e => runOnJS(update)(e.x))
    .onUpdate(e => runOnJS(update)(e.x))
    .onEnd(e => runOnJS(commit)(e.x))
    .onFinalize((_, success) => {
      if (!success) runOnJS(setDragIndex)(null);
    });

  const shown = dragIndex ?? current;
  const fraction = total > 1 ? shown / (total - 1) : 1;
  const fillFraction = reversed ? 1 - fraction : fraction;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{labelFor(reversed ? total - 1 : 0)}</Text>
      <GestureDetector gesture={gesture}>
        <View
          style={styles.hitArea}
          onLayout={(e: LayoutChangeEvent) => setTrackWidth(Math.max(1, e.nativeEvent.layout.width))}
        >
          <View style={styles.track}>
            <View
              style={[
                styles.fill,
                reversed
                  ? { right: 0, width: `${(1 - fillFraction) * 100}%` }
                  : { left: 0, width: `${fillFraction * 100}%` },
              ]}
            />
          </View>
          {marks?.map(page => {
            const f = total > 1 ? page / (total - 1) : 0;
            return <View key={page} style={[styles.mark, { left: (reversed ? 1 - f : f) * trackWidth - 1.5 }]} />;
          })}
          <View style={[styles.thumb, { left: fillFraction * trackWidth - 9 }]} />
          {dragIndex !== null && (
            <View style={[styles.bubble, { left: Math.min(trackWidth - 70, Math.max(0, fillFraction * trackWidth - 35)) }]}>
              <Text style={styles.bubbleText}>{labelFor(dragIndex)}</Text>
            </View>
          )}
        </View>
      </GestureDetector>
      <Text style={styles.label}>{labelFor(reversed ? 0 : total - 1)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  label: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    fontWeight: '700',
    minWidth: 28,
    textAlign: 'center',
  },
  hitArea: {
    flex: 1,
    height: 36,
    justifyContent: 'center',
  },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
    overflow: 'hidden',
  },
  fill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
  },
  mark: {
    position: 'absolute',
    width: 3,
    height: 12,
    borderRadius: 1.5,
    top: 12,
    backgroundColor: COLORS.gold,
  },
  thumb: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FFFFFF',
    top: 9,
  },
  bubble: {
    position: 'absolute',
    bottom: 40,
    width: 70,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(20,20,20,0.95)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
  },
  bubbleText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
});
