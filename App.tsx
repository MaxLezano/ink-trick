/**
 * InkTrick - App entry point
 * Offline manga / comic / PDF reader.
 */
import React, { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import { useLibraryStore } from './src/store/libraryStore';
import { AppState } from 'react-native';
import { clearReadingCache } from './src/services/bookCacheService';
import { runAutoBackupIfDue } from './src/services/backupService';
import SplashScreen from './src/components/SplashScreen';
import TourOverlay from './src/components/tour/TourOverlay';

export default function App() {
  const loadLibrary = useLibraryStore(state => state.loadLibrary);
  const isLoaded = useLibraryStore(state => state.isLoaded);
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    // Books are only decompressed while being read; drop anything left from a previous session.
    clearReadingCache();
    loadLibrary();
    // Weekly automatic backup (if enabled): checked shortly after launch and when leaving the app.
    const timer = setTimeout(() => runAutoBackupIfDue().catch(() => {}), 8000);
    const sub = AppState.addEventListener('change', state => {
      if (state === 'background') runAutoBackupIfDue().catch(() => {});
    });
    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppNavigator />
        {showSplash ? <SplashScreen ready={isLoaded} onFinish={() => setShowSplash(false)} /> : <TourOverlay />}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
