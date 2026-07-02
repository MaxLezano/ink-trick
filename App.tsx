/**
 * InkTrick - App Entry Point
 * Lector de PDF manga/anime con scroll infinito vertical.
 */
import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import { useLibraryStore } from './src/store/libraryStore';

export default function App() {
  const loadLibrary = useLibraryStore(state => state.loadLibrary);

  useEffect(() => {
    loadLibrary();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppNavigator />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
