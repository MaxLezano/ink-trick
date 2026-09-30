/**
 * InkTrick - Bamboo loader
 * A row of bamboo stalks cut one by one by a gold blade stroke. With a known progress each stalk
 * stands for an equal share of it (the cuts follow the real work); without one (PDF / EPUB copies)
 * the stalks are cut in a loop and grow back.
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Line, Polygon } from 'react-native-svg';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { COLORS } from '../../utils/constants';

const STALKS = 8;
const STALK_W = 13;
const STALK_GAP = 14;
const SLANT = 4; // half the vertical drop of the diagonal cut
// Natural-looking row: fixed heights and cut heights per stalk (dp).
const HEIGHTS = [96, 112, 88, 104, 118, 92, 108, 98];
const CUTS = [0.42, 0.36, 0.48, 0.4, 0.34, 0.46, 0.38, 0.44];
const NODE_EVERY = 26;
const BAMBOO = 'rgba(236,232,220,0.92)'; // washi white ink
const NODE = 'rgba(10,10,10,0.38)';
const LOOP_STEP_MS = 380;

interface Props {
  /** 0..1, or null when the amount of work is unknown. */
  progress: number | null;
}

export default function BambooLoader({ progress }: Props) {
  const [loopCut, setLoopCut] = useState(0);
  const indeterminate = progress === null;

  useEffect(() => {
    if (!indeterminate) return;
    // One more stalk each step; a pause with all of them cut, then they grow back.
    const timer = setInterval(() => setLoopCut(n => (n >= STALKS + 2 ? 0 : n + 1)), LOOP_STEP_MS);
    return () => clearInterval(timer);
  }, [indeterminate]);

  const cutCount = indeterminate ? Math.min(loopCut, STALKS) : Math.floor(Math.min(1, Math.max(0, progress)) * STALKS);
  const height = Math.max(...HEIGHTS);

  return (
    <View style={[styles.row, { height: height + 30 }]} accessibilityRole="progressbar">
      {HEIGHTS.map((h, i) => (
        <Stalk key={i} height={h} cutRatio={CUTS[i]} cut={i < cutCount} rowHeight={height} />
      ))}
      <View style={styles.ground} />
    </View>
  );
}

function nodesBetween(from: number, to: number, height: number) {
  const ys: number[] = [];
  for (let y = height - NODE_EVERY; y > 6; y -= NODE_EVERY) if (y > from + 3 && y < to - 3) ys.push(y);
  return ys;
}

function Stalk({ height, cutRatio, cut, rowHeight }: { height: number; cutRatio: number; cut: boolean; rowHeight: number }) {
  const t = useSharedValue(cut ? 1 : 0);
  const regrow = useSharedValue(1);

  useEffect(() => {
    if (cut) {
      t.value = withTiming(1, { duration: 900, easing: Easing.in(Easing.quad) });
    } else if (t.value > 0) {
      // Grows back: the top reappears in place with a soft fade.
      t.value = 0;
      regrow.value = 0;
      regrow.value = withTiming(1, { duration: 320 });
    }
  }, [cut, regrow, t]);

  const cutY = height * cutRatio;
  const w = STALK_W;

  // The blade: a gold diagonal stroke drawn across the stalk, then gone.
  const slashStyle = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 0.06, 0.2, 0.4], [0, 1, 1, 0], 'clamp'),
    transform: [{ rotate: '-18deg' }, { scaleX: interpolate(t.value, [0, 0.12], [0.1, 1], 'clamp') }],
  }));
  // The cut top slides down the slant, tips over and falls away.
  const topStyle = useAnimatedStyle(() => {
    const fall = interpolate(t.value, [0.15, 1], [0, 1], 'clamp');
    return {
      opacity: (1 - fall) * regrow.value,
      transform: [
        { translateX: fall * 16 },
        { translateY: fall * fall * 70 },
        { rotate: `${fall * 28}deg` },
      ],
    };
  });
  const faceStyle = useAnimatedStyle(() => ({ opacity: interpolate(t.value, [0.1, 0.3], [0, 1], 'clamp') }));

  const top = `0,0 ${w},0 ${w},${cutY - SLANT} 0,${cutY + SLANT}`;
  const bottom = `0,${cutY + SLANT} ${w},${cutY - SLANT} ${w},${height} 0,${height}`;

  return (
    <View style={{ width: w, height: rowHeight, marginHorizontal: STALK_GAP / 2, justifyContent: 'flex-end' }}>
      <View style={{ width: w, height }}>
        <Svg width={w} height={height} style={StyleSheet.absoluteFill}>
          <Polygon points={bottom} fill={BAMBOO} />
          {nodesBetween(cutY, height, height).map(y => (
            <Line key={y} x1={0} y1={y} x2={w} y2={y} stroke={NODE} strokeWidth={1.6} />
          ))}
        </Svg>
        {/* Fresh cut face, in the logo's gold. */}
        <Animated.View style={[StyleSheet.absoluteFill, faceStyle]} pointerEvents="none">
          <Svg width={w} height={height}>
            <Line x1={0} y1={cutY + SLANT} x2={w} y2={cutY - SLANT} stroke={COLORS.gold} strokeWidth={2} />
          </Svg>
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, topStyle]} pointerEvents="none">
          <Svg width={w} height={height}>
            <Polygon points={top} fill={BAMBOO} />
            {nodesBetween(0, cutY - SLANT, height).map(y => (
              <Line key={y} x1={0} y1={y} x2={w} y2={y} stroke={NODE} strokeWidth={1.6} />
            ))}
          </Svg>
        </Animated.View>
        <Animated.View
          pointerEvents="none"
          style={[styles.slash, { top: cutY - 1, left: -STALK_GAP }, { width: w + STALK_GAP * 2 }, slashStyle]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingBottom: 30,
  },
  ground: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 29,
    height: 1,
    backgroundColor: 'rgba(240,240,240,0.18)',
  },
  slash: {
    position: 'absolute',
    height: 2,
    borderRadius: 1,
    backgroundColor: COLORS.gold,
    shadowColor: COLORS.gold,
    shadowOpacity: 0.9,
    shadowRadius: 6,
    elevation: 4,
  },
});
