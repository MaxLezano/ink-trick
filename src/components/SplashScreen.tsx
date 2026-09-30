/**
 * InkTrick - Splash screen
 * App name, Japanese reading and an animated loading bar. Stays at least MIN_DURATION so it is
 * seen even when the library loads instantly, then fades out.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, StatusBar, StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../utils/constants';

const MIN_DURATION = 1400;

interface Props {
  ready: boolean;
  onFinish: () => void;
}

export default function SplashScreen({ ready, onFinish }: Props) {
  const progress = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const barDone = useRef(false);
  const finished = useRef(false);

  const finish = () => {
    if (finished.current || !barDone.current || !ready) return;
    finished.current = true;
    Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(onFinish);
  };

  useEffect(() => {
    Animated.timing(progress, { toValue: 1, duration: MIN_DURATION, useNativeDriver: false }).start(() => {
      barDone.current = true;
      finish();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(finish, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const width = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <Animated.View style={[styles.container, { opacity }]}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <Text style={styles.title}>InkTrick</Text>
      <Text style={styles.subtitle}>インクトリック</Text>
      <View style={styles.barOuter}>
        <Animated.View style={[styles.barInner, { width }]} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
    zIndex: 10,
  },
  title: {
    color: COLORS.text,
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: -1,
    marginBottom: 6,
  },
  subtitle: {
    color: 'rgba(240,240,240,0.56)',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 32,
  },
  barOuter: {
    width: 140,
    height: 3,
    borderRadius: 1.5,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  barInner: {
    height: '100%',
    borderRadius: 1.5,
    backgroundColor: 'rgba(240,240,240,0.75)',
  },
});
