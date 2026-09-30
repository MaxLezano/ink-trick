/**
 * InkTrick - App entry point
 * Offline manga / comic / PDF reader.
 */
import React, { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import { useLibraryStore } from './src/store/libraryStore';
import { clearReadingCache } from './src/services/bookCacheService';
import SplashScreen from './src/components/SplashScreen';

export default function App() {
  const loadLibrary = useLibraryStore(state => state.loadLibrary);
  const isLoaded = useLibraryStore(state => state.isLoaded);
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    // Books are only decompressed while being read; drop anything left from a previous session.
    clearReadingCache();
    loadLibrary();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppNavigator />
        {showSplash && <SplashScreen ready={isLoaded} onFinish={() => setShowSplash(false)} />}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
