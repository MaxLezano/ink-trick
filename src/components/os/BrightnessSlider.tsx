/**
 * Screen brightness slider (InkTrick OS). Changes apply live while dragging and are saved on
 * release. Used by the quick settings and the reader settings.
 */
import React, { useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';
import { useTabletStore } from '../../store/tabletStore';
import { COLORS } from '../../utils/constants';
import { SunIcon } from '../Icons';

const THUMB = 28;

export default function BrightnessSlider({ label = 'Brillo de pantalla' }: { label?: string }) {
  const brightness = useTabletStore(s => s.brightness);
  const [width, setWidth] = useState(0);
  const widthRef = useRef(0);

  const levelAt = (x: number) => (widthRef.current > THUMB ? (x - THUMB / 2) / (widthRef.current - THUMB) : 0);
  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: e => useTabletStore.getState().setBrightness(levelAt(e.nativeEvent.locationX), false),
      onPanResponderMove: e => useTabletStore.getState().setBrightness(levelAt(e.nativeEvent.locationX), false),
      onPanResponderRelease: e => useTabletStore.getState().setBrightness(levelAt(e.nativeEvent.locationX), true),
      onPanResponderTerminate: () => useTabletStore.getState().setBrightness(useTabletStore.getState().brightness, true),
    }),
  ).current;

  const thumbLeft = Math.max(0, width - THUMB) * brightness;

  return (
    <View>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <SunIcon size={18} color={COLORS.gold} />
          <Text style={styles.label}>{label}</Text>
        </View>
        <Text style={styles.value}>{Math.round(brightness * 100)}%</Text>
      </View>
      <View
        style={styles.touch}
        onLayout={e => {
          widthRef.current = e.nativeEvent.layout.width;
          setWidth(e.nativeEvent.layout.width);
        }}
        {...responder.panHandlers}
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ min: 0, max: 100, now: Math.round(brightness * 100) }}
      >
        <View style={styles.track} pointerEvents="none">
          <View style={[styles.fill, { width: thumbLeft + THUMB / 2 }]} />
        </View>
        <View style={[styles.thumb, { left: thumbLeft }]} pointerEvents="none">
          <SunIcon size={12} color={COLORS.background} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { color: COLORS.text, fontSize: 13, fontWeight: '600' },
  value: { color: COLORS.gold, fontSize: 14, fontWeight: '700' },
  touch: { height: 44, justifyContent: 'center' },
  track: { height: 10, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.1)', overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: COLORS.gold },
  thumb: {
    position: 'absolute',
    top: (44 - THUMB) / 2,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: COLORS.text,
    borderWidth: 2,
    borderColor: COLORS.gold,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
});
