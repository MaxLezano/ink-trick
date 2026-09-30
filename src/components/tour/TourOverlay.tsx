/**
 * InkTrick - Guided tour overlay
 * Coach marks drawn over the whole app: dims everything except the current target (a spotlight
 * with a gold ring) and explains it in a bubble with back / next buttons.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, BackHandler, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Rect as SvgRect } from 'react-native-svg';
import { COLORS } from '../../utils/constants';
import { EDGE_BOTTOM, EDGE_TOP, EDGE_WIDTH, MENU_BAND } from '../reader/tapZones';
import {
  ArrowIcon,
  ChartIcon,
  CheckDoneIcon,
  EnsoIcon,
  FolderIcon,
  IndexIcon,
  ReadIcon,
  RefreshIcon,
  SearchIcon,
} from '../Icons';
import { TOUR_STEPS, TourIcon } from './steps';
import { measureTarget, Rect, Tour, useTour } from './tour';

const HOLE_PAD = 8;
const GAP = 16;
const SIDE = 16;
const ARROW = 14;
/** Screens settle (navigation back, scroll to top) before targets are measured. */
const SETTLE_MS = 350;

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function roundedRect({ x, y, width: w, height: h }: Rect, r: number) {
  return (
    `M${x + r},${y}H${x + w - r}A${r},${r} 0 0 1 ${x + w},${y + r}V${y + h - r}` +
    `A${r},${r} 0 0 1 ${x + w - r},${y + h}H${x + r}A${r},${r} 0 0 1 ${x},${y + h - r}V${y + r}A${r},${r} 0 0 1 ${x + r},${y}Z`
  );
}

/** Pads the target and keeps it on screen. */
function holeFor(rect: Rect, width: number, height: number): Rect | null {
  const top = Math.max(HOLE_PAD, rect.y - HOLE_PAD);
  const bottom = Math.min(height - HOLE_PAD, rect.y + rect.height + HOLE_PAD);
  const left = Math.max(HOLE_PAD, rect.x - HOLE_PAD);
  const right = Math.min(width - HOLE_PAD, rect.x + rect.width + HOLE_PAD);
  if (bottom - top < 24 || right - left < 24) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function StepIcon({ icon }: { icon: TourIcon }) {
  const color = COLORS.gold;
  switch (icon) {
    case 'folder':
      return <FolderIcon size={18} color={color} />;
    case 'refresh':
      return <RefreshIcon size={18} color={color} />;
    case 'search':
      return <SearchIcon size={18} color={color} />;
    case 'chart':
      return <ChartIcon size={18} color={color} />;
    case 'read':
    case 'reader':
      return <ReadIcon size={18} color={color} />;
    case 'collection':
      return <IndexIcon size={18} color={color} />;
    case 'card':
      return <CheckDoneIcon size={18} color={color} />;
    default:
      return <EnsoIcon size={20} color={color} />;
  }
}

/** A tablet page with the reader's real tap zones (same constants the readers use). */
function TapZonesDiagram() {
  const w = 104;
  const h = 150;
  const edgeW = w * EDGE_WIDTH;
  const edgeY = h * EDGE_TOP;
  const edgeH = h * (EDGE_BOTTOM - EDGE_TOP);
  return (
    <View style={styles.diagram}>
      <Svg width={w} height={h}>
        <SvgRect x={0.5} y={0.5} width={w - 1} height={h - 1} rx={8} fill="#1E1E1E" stroke="rgba(255,255,255,0.25)" />
        <Path d={`M8.5,0.5H${w - 8.5}A8,8 0 0 1 ${w - 0.5},8.5V${h * MENU_BAND}H0.5V8.5A8,8 0 0 1 8.5,0.5Z`} fill={COLORS.gold} opacity={0.9} />
        <SvgRect x={3} y={edgeY} width={edgeW - 3} height={edgeH} rx={4} fill={COLORS.wisteria} opacity={0.6} />
        <SvgRect x={w - edgeW} y={edgeY} width={edgeW - 3} height={edgeH} rx={4} fill={COLORS.wisteria} opacity={0.6} />
      </Svg>
      <View style={styles.legend}>
        <View style={styles.legendRow}>
          <View style={[styles.swatch, { backgroundColor: COLORS.gold }]} />
          <Text style={styles.legendText}>Controles</Text>
        </View>
        <View style={styles.legendRow}>
          <View style={[styles.swatch, { backgroundColor: COLORS.wisteria }]} />
          <Text style={styles.legendText}>Pasar página</Text>
        </View>
        <Text style={styles.legendHint}>El resto de la página no hace nada, así nunca pasas de página sin querer.</Text>
      </View>
    </View>
  );
}

export default function TourOverlay() {
  const { active, run, order, index } = useTour();
  const insets = useSafeAreaInsets();
  const rootRef = useRef<View>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [shown, setShown] = useState<{ index: number; rect: Rect | null } | null>(null);
  const [bubbleHeight, setBubbleHeight] = useState(0);
  const [fade] = useState(() => new Animated.Value(0));
  const step = TOUR_STEPS[order[index] ?? 0];

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    fade.setValue(0);
    (async () => {
      await wait(SETTLE_MS);
      const target = step.target ? await measureTarget(step.target) : null;
      // The overlay may not start at the window origin: compare both in window coordinates.
      const origin = await new Promise<{ x: number; y: number }>(resolve =>
        rootRef.current ? rootRef.current.measureInWindow((x, y) => resolve({ x, y })) : resolve({ x: 0, y: 0 }),
      );
      if (cancelled) return;
      if (step.target && !target) {
        Tour.skipMissing();
        return;
      }
      setShown({ index, rect: target && { ...target, x: target.x - origin.x, y: target.y - origin.y } });
      Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    })();
    return () => {
      cancelled = true;
    };
  }, [active, index, step, fade]);

  useEffect(() => {
    if (!active) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (index === 0) Tour.finish();
      else Tour.prev();
      return true;
    });
    return () => sub.remove();
  }, [active, index]);

  if (!active) return null;

  const { width, height } = size;
  const ready = shown?.index === index;
  const hole = ready && shown.rect ? holeFor(shown.rect, width, height) : null;
  // Round header buttons get a round spotlight; cards and sections get soft corners.
  const radius = hole ? (Math.max(hole.width, hole.height) < 90 ? Math.min(hole.width, hole.height) / 2 : 18) : 0;
  const isFirst = index === 0;
  const isLast = index === order.length - 1;

  // Below the target when it fits, otherwise above it; centered when there is no target.
  const bubbleWidth = Math.min(width - SIDE * 2, 460);
  let bubbleLeft = (width - bubbleWidth) / 2;
  let bubbleTop = (height - bubbleHeight) / 2;
  let arrowTop: number | null = null;
  if (hole) {
    // Keep the bubble near its target horizontally (header buttons sit at the right edge).
    const center = hole.x + hole.width / 2;
    bubbleLeft = Math.min(Math.max(center - bubbleWidth / 2, SIDE), width - SIDE - bubbleWidth);
    const below = hole.y + hole.height + GAP;
    if (below + bubbleHeight <= height - insets.bottom - SIDE) {
      bubbleTop = below;
      arrowTop = -ARROW / 2;
    } else {
      bubbleTop = Math.max(insets.top + SIDE, hole.y - GAP - bubbleHeight);
      arrowTop = bubbleHeight - ARROW / 2;
    }
  }
  const arrowLeft = hole
    ? Math.min(Math.max(hole.x + hole.width / 2 - bubbleLeft - ARROW / 2, 20), bubbleWidth - 20 - ARROW)
    : 0;
  const stepCount = order.length - 1;

  return (
    <View
      ref={rootRef}
      style={StyleSheet.absoluteFill}
      onLayout={e => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
      // Swallows every touch: the app underneath stays still while the tour runs.
      onStartShouldSetResponder={() => true}
    >
      {width > 0 && (
        <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Path
            d={`M0,0H${width}V${height}H0Z${hole ? roundedRect(hole, radius) : ''}`}
            fill="rgba(0, 0, 0, 0.8)"
            fillRule="evenodd"
          />
          {hole && (
            <SvgRect
              x={hole.x}
              y={hole.y}
              width={hole.width}
              height={hole.height}
              rx={radius}
              fill="none"
              stroke={COLORS.gold}
              strokeWidth={2}
            />
          )}
        </Svg>
      )}

      <Animated.View
        accessibilityViewIsModal
        onLayout={e => setBubbleHeight(e.nativeEvent.layout.height)}
        style={[styles.bubble, { width: bubbleWidth, left: bubbleLeft, top: bubbleTop, opacity: ready ? fade : 0 }]}
      >
        {arrowTop !== null && <View style={[styles.arrow, { top: arrowTop, left: arrowLeft }]} />}

        <View style={styles.head}>
          <View style={styles.icon}>
            <StepIcon icon={step.icon} />
          </View>
          <Text style={styles.overline}>{isFirst ? 'TUTORIAL' : `PASO ${index} DE ${stepCount}`}</Text>
          {!isFirst && !isLast && (
            <TouchableOpacity onPress={Tour.finish} hitSlop={10} accessibilityLabel="Saltar tutorial">
              <Text style={styles.skip}>Saltar</Text>
            </TouchableOpacity>
          )}
        </View>

        <Text style={styles.title} accessibilityRole="header">{step.title}</Text>
        <Text style={styles.body}>{step.body}</Text>
        {step.diagram === 'tapZones' && <TapZonesDiagram />}

        {!isFirst && (
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${(index / stepCount) * 100}%` }]} />
          </View>
        )}

        <View style={styles.actions}>
          {isFirst ? (
            <TouchableOpacity style={styles.ghostBtn} onPress={Tour.finish}>
              <Text style={styles.ghostBtnText}>Ahora no</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.ghostBtn} onPress={Tour.prev}>
              <ArrowIcon size={15} color={COLORS.text} direction="left" />
              <Text style={styles.ghostBtnText}>Atrás</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.primaryBtn} onPress={Tour.next}>
            <Text style={styles.primaryBtnText}>{isFirst ? 'Empezar' : isLast ? (run === 'intro' ? 'Entendido' : '¡A leer!') : 'Siguiente'}</Text>
            {!isLast && <ArrowIcon size={15} color="#0A0A0A" />}
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    position: 'absolute',
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    padding: 20,
    gap: 10,
    elevation: 12,
  },
  arrow: {
    position: 'absolute',
    width: ARROW,
    height: ARROW,
    backgroundColor: COLORS.surface,
    transform: [{ rotate: '45deg' }],
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 34,
  },
  icon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(226,184,78,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overline: {
    flex: 1,
    color: 'rgba(240,240,240,0.5)',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  skip: {
    color: 'rgba(240,240,240,0.65)',
    fontSize: 13,
    fontWeight: '700',
  },
  title: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: '900',
  },
  body: {
    color: 'rgba(240,240,240,0.72)',
    fontSize: 14,
    lineHeight: 21,
  },
  diagram: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 4,
  },
  legend: {
    flex: 1,
    gap: 8,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  swatch: {
    width: 14,
    height: 14,
    borderRadius: 4,
  },
  legendText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '700',
  },
  legendHint: {
    color: 'rgba(240,240,240,0.5)',
    fontSize: 12,
    lineHeight: 17,
  },
  track: {
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
    marginTop: 4,
  },
  fill: {
    height: 3,
    backgroundColor: COLORS.gold,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  ghostBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  ghostBtnText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '700',
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: COLORS.accent,
  },
  primaryBtnText: {
    color: '#0A0A0A',
    fontSize: 14,
    fontWeight: '800',
  },
});
