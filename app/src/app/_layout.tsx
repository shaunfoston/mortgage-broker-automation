import '../lib/polyfills.ts';
import React from 'react';
import { Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider, useApp, type InitState } from '../lib/app.tsx';
import { LockScreen, SetupScreen } from '../components/LockScreens.tsx';
import { Loading } from '../components/ui.tsx';
import { C, S, T } from '../lib/theme.ts';

function InitFallback({ state }: { state: InitState }) {
  if (state.status === 'error') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: S.xl, gap: S.md, backgroundColor: C.surface }}>
        <Text style={T.h2}>Mortgage Options could not start</Text>
        <Text style={T.body}>{state.message}</Text>
        <Text style={T.small}>Close and reopen the app. If this keeps happening, note the message above and contact support.</Text>
      </View>
    );
  }
  return <Loading />;
}

function Gate() {
  const { pinSet, locked } = useApp();
  if (!pinSet) return <SetupScreen />;
  // The lock screen is an overlay so navigation state and any in-progress work survive locking.
  return (
    <View style={{ flex: 1 }}>
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: C.graphite },
        headerTintColor: C.white,
        headerTitleStyle: { fontWeight: '700' },
        contentStyle: { backgroundColor: C.surface },
        headerBackButtonDisplayMode: 'minimal',
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      <Stack.Screen name="clients/new" options={{ title: 'New client' }} />
      <Stack.Screen name="clients/[id]" options={{ title: 'Client' }} />
      <Stack.Screen name="cases/[id]/index" options={{ title: 'Case' }} />
      <Stack.Screen name="cases/[id]/factfind" options={{ title: 'Fact-find' }} />
      <Stack.Screen name="cases/[id]/section" options={{ title: 'Section' }} />
      <Stack.Screen name="cases/[id]/record" options={{ title: 'Record meeting' }} />
      <Stack.Screen name="cases/[id]/review" options={{ title: 'Review AI proposals' }} />
      <Stack.Screen name="cases/[id]/transcript" options={{ title: 'Transcript' }} />
      <Stack.Screen name="cases/[id]/consent" options={{ title: 'Consent & signature' }} />
      <Stack.Screen name="cases/[id]/documents" options={{ title: 'Documents' }} />
      <Stack.Screen name="cases/[id]/notes" options={{ title: 'Case notes' }} />
      <Stack.Screen name="cases/[id]/audit" options={{ title: 'Audit history' }} />
      <Stack.Screen name="cases/[id]/export" options={{ title: 'PDFs & export' }} />
    </Stack>
      {locked ? (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
          <LockScreen />
        </View>
      ) : null}
    </View>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <AppProvider fallback={(s) => <InitFallback state={s} />}>
        <Gate />
      </AppProvider>
    </SafeAreaProvider>
  );
}
