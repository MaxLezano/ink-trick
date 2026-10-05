/**
 * Time and battery in the reader's top bar: fullscreen reading hides Android's status bar, so
 * this is where to check them without leaving the book. Only mounted while the controls show.
 */
import React, { useEffect, useState } from 'react';
import { NativeModules, StyleSheet, Text, View } from 'react-native';

const { ReaderKeysModule } = NativeModules;

const timeLabel = () => {
  const d = new Date();
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export default function ReaderClock() {
  const [time, setTime] = useState(timeLabel);
  const [battery, setBattery] = useState<number | null>(null);

  useEffect(() => {
    const refresh = () => {
      setTime(timeLabel());
      ReaderKeysModule?.getBatteryLevel?.()
        .then((level: number) => setBattery(level >= 0 ? level : null))
        .catch(() => {});
    };
    refresh();
    const timer = setInterval(refresh, 20000);
    return () => clearInterval(timer);
  }, []);

  return (
    <View style={styles.box} accessibilityLabel={`Hora ${time}${battery != null ? `, batería ${battery} por ciento` : ''}`}>
      <Text style={styles.time}>{time}</Text>
      {battery != null ? <Text style={styles.battery}>{battery}%</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'flex-end', marginRight: 2 },
  time: { color: '#FFF', fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  battery: { color: 'rgba(255,255,255,0.5)', fontSize: 11, fontVariant: ['tabular-nums'] },
});
