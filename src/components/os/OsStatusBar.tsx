/**
 * Slim clock / Wi-Fi / battery line for the home screen. InkTrick OS hides Android's status bar,
 * so this is the only place the time and battery are always visible (only shown in that mode).
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { COLORS } from '../../utils/constants';
import { BatteryIcon, WifiIcon } from '../Icons';
import { useTabletStore } from '../../store/tabletStore';
import { useDeviceStatus } from './useDeviceStatus';

const timeLabel = () => {
  const d = new Date();
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export default function OsStatusBar() {
  const isDeviceOwner = useTabletStore(s => s.isDeviceOwner);
  const focused = useIsFocused();
  const active = isDeviceOwner && focused;
  const status = useDeviceStatus(active);
  const [time, setTime] = useState(timeLabel);

  useEffect(() => {
    if (!active) return;
    setTime(timeLabel());
    let interval: ReturnType<typeof setInterval> | undefined;
    // Tick on the minute boundary.
    const first = setTimeout(() => {
      setTime(timeLabel());
      interval = setInterval(() => setTime(timeLabel()), 60000);
    }, 60000 - (Date.now() % 60000) + 50);
    return () => {
      clearTimeout(first);
      if (interval) clearInterval(interval);
    };
  }, [active]);

  if (!isDeviceOwner) return null;
  return (
    <View style={styles.bar} pointerEvents="none">
      <Text style={styles.text}>{time}</Text>
      <View style={styles.right}>
        {status.isWifiConnected ? <WifiIcon size={14} color={COLORS.accent} /> : null}
        {status.batteryLevel >= 0 ? (
          <>
            <Text style={styles.text}>{status.batteryLevel}%</Text>
            <BatteryIcon size={18} color={COLORS.accent} level={status.batteryLevel} charging={status.isCharging} />
          </>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: 24,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  right: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  text: { color: COLORS.accent, fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
});
