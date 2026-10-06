/**
 * InkTrick - App entry point
 * Offline manga / comic / PDF reader.
 */
import React, { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import { useLibraryStore } from './src/store/libraryStore';
import { useTabletStore, WARM_TINT } from './src/store/tabletStore';
import { useOsLibrarySync } from './src/components/os/useOsLibrarySync';
import { AppState, StyleSheet, View } from 'react-native';
import { clearReadingCache } from './src/services/bookCacheService';
import { runAutoBackupIfDue } from './src/services/backupService';
import SplashScreen from './src/components/SplashScreen';
import TourOverlay from './src/components/tour/TourOverlay';

export default function App() {
  const loadLibrary = useLibraryStore(state => state.loadLibrary);
  const isLoaded = useLibraryStore(state => state.isLoaded);
  const warmth = useTabletStore(state => state.warmth);
  const loadTabletSettings = useTabletStore(state => state.loadSettings);
  const [showSplash, setShowSplash] = useState(true);
  useOsLibrarySync();

  useEffect(() => {
    // Books are only decompressed while being read; drop anything left from a previous session.
    clearReadingCache();
    loadLibrary();
    loadTabletSettings();
    // Weekly automatic backup (if enabled): checked shortly after launch and when leaving the app.
    const timer = setTimeout(() => runAutoBackupIfDue().catch(() => {}), 8000);
    const sub = AppState.addEventListener('change', state => {
      if (state === 'background') runAutoBackupIfDue().catch(() => {});
    });
    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, [loadLibrary, loadTabletSettings]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppNavigator />
        {showSplash ? <SplashScreen ready={isLoaded} onFinish={() => setShowSplash(false)} /> : <TourOverlay />}
        {/* "Tono cálido" over every screen, reader included. */}
        {warmth > 0 && (
          <View
            pointerEvents="none"
            style={[StyleSheet.absoluteFillObject, { backgroundColor: WARM_TINT, opacity: warmth, zIndex: 99999 }]}
          />
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

