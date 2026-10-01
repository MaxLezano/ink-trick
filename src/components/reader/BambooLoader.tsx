/**
 * InkTrick - Bamboo loader
 * A row of bamboo stalks cut one by one by a gold blade stroke. With a known progress each stalk
 * stands for an equal share of it (the cuts follow the real work); without one (PDF / EPUB copies)
 * the stalks are cut in a loop and grow back.
 * The stalks are sprites generated with ComfyUI (assets/loader/); each one is drawn twice, clipped
 * above and below its own slanted cut line.
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { ClipPath, Defs, G, Image as SvgImage, Line, LinearGradient, Path, Polygon, Stop } from 'react-native-svg';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { COLORS } from '../../utils/constants';

const SPRITES = [require('../../../assets/loader/bamboo_stalk_0.png'), require('../../../assets/loader/bamboo_stalk_1.png')];
// Washi-white sprites. Geometry (px): the cane is centered and 46 px wide; leaves stick out to the sides.
const SPRITE_W = 282;
const SPRITE_H = 791;
const SPRITE_CANE = 46;

const CANE_W = 10; // dp
const SCALE = CANE_W / SPRITE_CANE;
const IMG_W = SPRITE_W * SCALE;
const IMG_H = SPRITE_H * SCALE;
const SLOT_W = 21; // distance between stalks (leaves overlap the neighbours a little)

// Natural-looking row: per stalk sprite, mirror, height (dp), cut height and cut slope.
const STALKS = [
  { sprite: 0, flip: false, height: 72, cutAt: 0.42, slope: -0.35 },
  { sprite: 1, flip: false, height: 84, cutAt: 0.36, slope: 0.55 },
  { sprite: 0, flip: true, height: 66, cutAt: 0.48, slope: -0.65 },
  { sprite: 1, flip: true, height: 78, cutAt: 0.4, slope: 0.3 },
  { sprite: 0, flip: false, height: 88, cutAt: 0.34, slope: 0.45 },
  { sprite: 1, flip: false, height: 69, cutAt: 0.46, slope: -0.5 },
  { sprite: 0, flip: true, height: 81, cutAt: 0.38, slope: 0.7 },
  { sprite: 1, flip: true, height: 74, cutAt: 0.44, slope: -0.25 },
];
const LOOP_STEP_MS = 380;
// The blade stroke: a thin curved crescent, pointed and fading at both ends.
const SLASH_L = CANE_W + 16;
const SLASH_H = 6;
const SLASH_PATH = `M0,${SLASH_H * 0.7} Q${SLASH_L * 0.5},${-SLASH_H * 0.35} ${SLASH_L},${SLASH_H * 0.3} Q${SLASH_L * 0.5},${SLASH_H * 0.55} 0,${SLASH_H * 0.7} Z`;

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
    const timer = setInterval(() => setLoopCut(n => (n >= STALKS.length + 2 ? 0 : n + 1)), LOOP_STEP_MS);
    return () => clearInterval(timer);
  }, [indeterminate]);

  const cutCount = indeterminate
    ? Math.min(loopCut, STALKS.length)
    : Math.floor(Math.min(1, Math.max(0, progress)) * STALKS.length);
  const rowHeight = Math.max(...STALKS.map(s => s.height));

  return (
    <View style={[styles.row, { height: rowHeight + 30 }]} accessibilityRole="progressbar">
      {STALKS.map((s, i) => (
        <Stalk key={i} id={`bamboo${i}`} {...s} cut={i < cutCount} rowHeight={rowHeight} />
      ))}
      <View style={styles.ground} />
    </View>
  );
}

interface StalkProps {
  id: string;
  sprite: number;
  flip: boolean;
  height: number;
  /** Cut height as a fraction of the stalk height. */
  cutAt: number;
  /** Slope of the cut line (dy / dx); its sign is the side the top slides to. */
  slope: number;
  cut: boolean;
  rowHeight: number;
}

function Stalk({ id, sprite, flip, height, cutAt, slope, cut, rowHeight }: StalkProps) {
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

  const cx = IMG_W / 2;
  const cutY = height * cutAt;
  const lineY = (x: number) => cutY + slope * (x - cx);
  const side = Math.sign(slope);
  const angle = (Math.atan(slope) * 180) / Math.PI;

  // The blade: a quick curved gold stroke swept along the cut line, then gone.
  const slashStyle = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 0.05, 0.18, 0.36], [0, 1, 1, 0], 'clamp'),
    transform: [
      { rotate: `${angle}deg` },
      { translateX: interpolate(t.value, [0, 0.1], [-SLASH_L * 0.35, 0], 'clamp') },
      { scaleX: interpolate(t.value, [0, 0.1], [0.2, 1], 'clamp') },
    ],
  }));
  // The cut top slides down the slant, tips over and falls away.
  const topStyle = useAnimatedStyle(() => {
    const fall = interpolate(t.value, [0.15, 1], [0, 1], 'clamp');
    return {
      opacity: (1 - fall) * regrow.value,
      transform: [
        { translateX: side * fall * 12 },
        { translateY: fall * fall * 55 },
        { rotate: `${side * fall * 28}deg` },
      ],
    };
  });
  const faceStyle = useAnimatedStyle(() => ({ opacity: interpolate(t.value, [0.1, 0.3], [0, 1], 'clamp') }));

  const top = `0,-1 ${IMG_W},-1 ${IMG_W},${lineY(IMG_W)} 0,${lineY(0)}`;
  // The lower part starts a hair above the line, hidden under the top, so no seam shows through.
  const bottom = `0,${lineY(0) - 0.8} ${IMG_W},${lineY(IMG_W) - 0.8} ${IMG_W},${height} 0,${height}`;
  const svgStyle = { position: 'absolute' as const, left: (SLOT_W - IMG_W) / 2, top: 0 };
  const caneL = cx - CANE_W / 2;
  const caneR = cx + CANE_W / 2;

  const part = (clipId: string, points: string) => (
    <>
      <Defs>
        <ClipPath id={clipId}>
          <Polygon points={points} />
        </ClipPath>
      </Defs>
      <G clipPath={`url(#${clipId})`}>
        <G transform={flip ? `translate(${IMG_W},0) scale(-1,1)` : undefined}>
          <SvgImage href={SPRITES[sprite]} x={0} y={0} width={IMG_W} height={IMG_H} preserveAspectRatio="none" />
        </G>
      </G>
    </>
  );

  return (
    <View style={{ width: SLOT_W, height: rowHeight, justifyContent: 'flex-end' }}>
      <View style={{ width: SLOT_W, height }}>
        <Svg width={IMG_W} height={height} style={svgStyle}>
          {part(`${id}b`, bottom)}
        </Svg>
        {/* Fresh cut face, in the logo's gold. */}
        <Animated.View style={[StyleSheet.absoluteFill, faceStyle]} pointerEvents="none">
          <Svg width={IMG_W} height={height} style={svgStyle}>
            <Line x1={caneL} y1={lineY(caneL)} x2={caneR} y2={lineY(caneR)} stroke={COLORS.gold} strokeWidth={1.6} />
          </Svg>
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, topStyle]} pointerEvents="none">
          <Svg width={IMG_W} height={height} style={svgStyle}>
            {part(`${id}t`, top)}
          </Svg>
        </Animated.View>
        <Animated.View
          pointerEvents="none"
          style={[styles.slash, { top: cutY - SLASH_H / 2, left: (SLOT_W - SLASH_L) / 2 }, slashStyle]}
        >
          <Svg width={SLASH_L} height={SLASH_H}>
            <Defs>
              <LinearGradient id={`${id}s`} x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor={COLORS.gold} stopOpacity={0} />
                <Stop offset="0.35" stopColor={COLORS.gold} stopOpacity={1} />
                <Stop offset="0.6" stopColor="#FFF1C4" stopOpacity={1} />
                <Stop offset="1" stopColor={COLORS.gold} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Path d={SLASH_PATH} fill={`url(#${id}s)`} />
          </Svg>
        </Animated.View>
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
    width: SLASH_L,
    height: SLASH_H,
  },
});
