/**
 * InkTrick - Zoomable view
 * Pinch-to-zoom (focal point), pan with inertia, double tap zoom and single tap reporting.
 * Content is laid out centered inside a `width` x `height` viewport; when the content is taller
 * or wider than the viewport it can be panned even at scale 1 (e.g. fit-width on a tall page).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDecay,
  withTiming,
} from 'react-native-reanimated';

const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;
const ZOOM_EPSILON = 0.02;

export interface ZoomableViewProps {
  width: number;
  height: number;
  contentWidth: number;
  contentHeight: number;
  /** Only horizontal panning while zoomed (vertical movement belongs to a parent scroll view). */
  panXOnly?: boolean;
  doubleTapZoom?: boolean;
  /** When false the zoom is reset (e.g. the page scrolled out of view). */
  active?: boolean;
  onTap?: (x: number, y: number) => void;
  onZoomChange?: (zoomed: boolean) => void;
  children: React.ReactNode;
}

export default function ZoomableView({
  width,
  height,
  contentWidth,
  contentHeight,
  panXOnly = false,
  doubleTapZoom = true,
  active = true,
  onTap,
  onZoomChange,
  children,
}: ZoomableViewProps) {
  const scale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const startScale = useSharedValue(1);
  const startTx = useSharedValue(0);
  const startTy = useSharedValue(0);
  const startFocalX = useSharedValue(0);
  const startFocalY = useSharedValue(0);
  const [zoomed, setZoomed] = useState(false);

  // Initial vertical offset: show the top of tall content.
  const topOffset = Math.max(0, (contentHeight - height) / 2);
  const overflowsAtRest = contentHeight > height + 1 || contentWidth > width + 1;

  const reportZoom = useCallback(
    (value: boolean) => {
      setZoomed(prev => {
        if (prev !== value) onZoomChange?.(value);
        return value;
      });
    },
    [onZoomChange],
  );

  const reset = useCallback(
    (animated: boolean) => {
      const cfg = { duration: animated ? 220 : 0 };
      scale.value = withTiming(1, cfg);
      tx.value = withTiming(0, cfg);
      ty.value = withTiming(panXOnly ? 0 : topOffset, cfg);
      reportZoom(false);
    },
    [panXOnly, reportZoom, scale, topOffset, tx, ty],
  );

  // Reset when the page becomes inactive or its geometry changes (rotation, fit mode).
  useEffect(() => {
    reset(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, contentWidth, contentHeight]);

  useEffect(() => {
    if (!active) reset(false);
  }, [active, reset]);

  const pinch = Gesture.Pinch()
    .onStart(e => {
      startScale.value = scale.value;
      startTx.value = tx.value;
      startTy.value = ty.value;
      startFocalX.value = e.focalX - width / 2;
      startFocalY.value = e.focalY - height / 2;
    })
    .onUpdate(e => {
      const s = Math.min(MAX_SCALE * 1.15, Math.max(0.85, startScale.value * e.scale));
      const px = e.focalX - width / 2;
      const py = e.focalY - height / 2;
      // Keep the content point that was under the fingers under the fingers.
      tx.value = px - ((startFocalX.value - startTx.value) * s) / startScale.value;
      ty.value = panXOnly ? ty.value : py - ((startFocalY.value - startTy.value) * s) / startScale.value;
      scale.value = s;
    })
    .onEnd(() => {
      const s = Math.min(MAX_SCALE, Math.max(1, scale.value));
      const maxX = Math.max(0, (contentWidth * s - width) / 2);
      const maxY = Math.max(0, (contentHeight * s - height) / 2);
      scale.value = withTiming(s, { duration: 180 });
      tx.value = withTiming(Math.min(maxX, Math.max(-maxX, tx.value)), { duration: 180 });
      ty.value = panXOnly ? 0 : withTiming(Math.min(maxY, Math.max(-maxY, ty.value)), { duration: 180 });
      runOnJS(reportZoom)(s > 1 + ZOOM_EPSILON);
    });

  const pan = Gesture.Pan()
    .enabled(zoomed || (overflowsAtRest && !panXOnly))
    .averageTouches(true)
    .onStart(() => {
      startTx.value = tx.value;
      startTy.value = ty.value;
    })
    .onUpdate(e => {
      const s = scale.value;
      const maxX = Math.max(0, (contentWidth * s - width) / 2);
      const maxY = Math.max(0, (contentHeight * s - height) / 2);
      tx.value = Math.min(maxX, Math.max(-maxX, startTx.value + e.translationX));
      if (!panXOnly) ty.value = Math.min(maxY, Math.max(-maxY, startTy.value + e.translationY));
    })
    .onEnd(e => {
      const s = scale.value;
      const maxX = Math.max(0, (contentWidth * s - width) / 2);
      const maxY = Math.max(0, (contentHeight * s - height) / 2);
      tx.value = withDecay({ velocity: e.velocityX, clamp: [-maxX, maxX] });
      if (!panXOnly) ty.value = withDecay({ velocity: e.velocityY, clamp: [-maxY, maxY] });
    });

  if (!zoomed) {
    // At rest only vertical drags pan (horizontal swipes turn the page in the parent list).
    pan.activeOffsetY([-12, 12]).failOffsetX([-12, 12]);
  } else if (panXOnly) {
    pan.activeOffsetX([-8, 8]).failOffsetY([-14, 14]);
  }

  const doubleTap = Gesture.Tap()
    .enabled(doubleTapZoom)
    .numberOfTaps(2)
    .maxDelay(260)
    .onEnd(e => {
      if (scale.value > 1 + ZOOM_EPSILON) {
        scale.value = withTiming(1, { duration: 220 });
        tx.value = withTiming(0, { duration: 220 });
        ty.value = withTiming(panXOnly ? 0 : topOffset, { duration: 220 });
        runOnJS(reportZoom)(false);
        return;
      }
      const s = DOUBLE_TAP_SCALE;
      const px = e.x - width / 2;
      const py = e.y - height / 2;
      const maxX = Math.max(0, (contentWidth * s - width) / 2);
      const maxY = Math.max(0, (contentHeight * s - height) / 2);
      const nx = px - ((px - tx.value) * s);
      const ny = py - ((py - ty.value) * s);
      scale.value = withTiming(s, { duration: 220 });
      tx.value = withTiming(Math.min(maxX, Math.max(-maxX, nx)), { duration: 220 });
      ty.value = panXOnly ? 0 : withTiming(Math.min(maxY, Math.max(-maxY, ny)), { duration: 220 });
      runOnJS(reportZoom)(true);
    });

  const singleTap = Gesture.Tap()
    .numberOfTaps(1)
    .maxDuration(250)
    .onEnd((e, success) => {
      if (success && onTap) runOnJS(onTap)(e.absoluteX, e.absoluteY);
    });

  const taps = doubleTapZoom ? Gesture.Exclusive(doubleTap, singleTap) : singleTap;
  const gesture = Gesture.Simultaneous(pinch, pan, taps);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <View style={[styles.viewport, { width, height }]} collapsable={false}>
        <Animated.View
          style={[
            {
              width: contentWidth,
              height: contentHeight,
              left: (width - contentWidth) / 2,
              top: (height - contentHeight) / 2,
            },
            styles.content,
            animatedStyle,
          ]}
        >
          {children}
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  viewport: {
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  content: {
    position: 'absolute',
  },
});
