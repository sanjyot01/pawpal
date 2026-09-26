import React, { useState, useRef, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet, AppState } from 'react-native';
import { SplashScreen } from './src/screens/SplashScreen';
import { AppNavigator } from './src/navigation/AppNavigator';
import { registerForPush } from './src/utils/push';
import { getToken } from './src/utils/api';

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  // Track whether splash has ever finished — prevents re-showing on background resume
  const splashDone = useRef(false);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && splashDone.current) {
        setShowSplash(false);
      }
    });
    return () => sub.remove();
  }, []);

  // Nothing called registerForPush, so no handset ever registered a device token
  // and the whole push pipeline had no entry point. Only run it for an existing
  // session: on a fresh install there is no auth token to attach the device to,
  // and asking for notification permission before someone has even signed in is
  // the wrong moment. Login and sign-up call it themselves.
  useEffect(() => {
    getToken()
      .then(token => { if (token) registerForPush(); })
      // registerForPush swallows its own failures; this guards getToken itself.
      .catch(() => {});
  }, []);

  const handleSplashFinish = () => {
    splashDone.current = true;
    setShowSplash(false);
  };

  if (showSplash) {
    return (
      <GestureHandlerRootView style={styles.root}>
        <SafeAreaProvider>
          <StatusBar style="light" />
          <SplashScreen onFinish={handleSplashFinish} />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <NavigationContainer>
          <StatusBar style="dark" />
          <AppNavigator />
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#FAF9F6',
  },
});
