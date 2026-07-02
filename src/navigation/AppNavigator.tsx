/**
 * InkTrick - App Navigator
 * Stack Navigator para el flujo: Dashboard → Reader
 */
import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { NavigationContainer } from '@react-navigation/native';
import { RootStackParamList } from '../utils/types';
import { COLORS } from '../utils/constants';
import DashboardScreen from '../screens/DashboardScreen';
import ReaderScreen from '../screens/ReaderScreen';

const Stack = createStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  return (
    <NavigationContainer
      theme={{
        dark: true,
        colors: {
          primary: COLORS.accent,
          background: COLORS.background,
          card: COLORS.surface,
          text: COLORS.text,
          border: COLORS.border,
          notification: COLORS.accent,
        },
        fonts: {
          regular: { fontFamily: 'System', fontWeight: '400' as const },
          medium: { fontFamily: 'System', fontWeight: '500' as const },
          bold: { fontFamily: 'System', fontWeight: '700' as const },
          heavy: { fontFamily: 'System', fontWeight: '900' as const },
        },
      }}
    >
      <Stack.Navigator
        initialRouteName="Dashboard"
        screenOptions={{
          headerShown: false,
          cardStyle: { backgroundColor: COLORS.background },
          gestureEnabled: true,
        }}
      >
        <Stack.Screen
          name="Dashboard"
          component={DashboardScreen}
          options={{ title: 'InkTrick - Biblioteca' }}
        />
        <Stack.Screen
          name="Reader"
          component={ReaderScreen}
          options={{
            title: 'Lectura',
            gestureEnabled: false, // Prevenir swipe back accidental durante lectura
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
