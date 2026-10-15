import React, { useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useApp, useData } from '../lib/app.tsx';
import { seedDemo } from '../lib/demoSeed.ts';
import { errMsg, fmtDateTime } from '../lib/format.ts';
import { C, R, S, T } from '../lib/theme.ts';
import { Wordmark } from '../components/Brand.tsx';
import { Badge, Banner, Button, Card, Empty, ListRow, Screen, SectionTitle } from '../components/ui.tsx';

export default function Home() {
  const { repo, backendSettings, brokerName, bump, lockNow } = useApp();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState('');
  const clients = useData(() => repo.listClients(q), [q]);
  const recent = useData(() => repo.listRecentCases(5), []);
  const [seeding, setSeeding] = useState(false);

  return (
    <View style={{ flex: 1, backgroundColor: C.surface }}>
      <View style={{ backgroundColor: C.graphite, paddingTop: insets.top + S.md, paddingBottom: S.lg, paddingHorizontal: S.lg, gap: S.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Wordmark size={34} light />
          <View style={{ flexDirection: 'row', gap: 4 }}>
            <Pressable accessibilityLabel="Lock app" onPress={lockNow} style={{ padding: 10 }}>
              <Ionicons name="lock-closed-outline" size={22} color={C.white} />
            </Pressable>
            <Pressable accessibilityLabel="Settings" onPress={() => router.push('/settings')} style={{ padding: 10 }} testID="open-settings">
              <Ionicons name="settings-outline" size={22} color={C.white} />
            </Pressable>
          </View>
        </View>
        <Text style={{ color: '#C9D1DC', fontSize: 14 }}>Signed in on this device as {brokerName || 'Broker'}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#2E3238', borderRadius: R.md, paddingHorizontal: S.md }}>
          <Ionicons name="search" size={18} color="#9AA3AE" />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search clients or case reference"
            placeholderTextColor="#9AA3AE"
            style={{ flex: 1, color: C.white, minHeight: 46, paddingHorizontal: S.sm, fontSize: 16 }}
            accessibilityLabel="Search clients"
          />
        </View>
      </View>

      <Screen>
        {backendSettings.mode === 'offline-demo' ? (
          <Banner tone="info" title="Offline demo mode">
            No server is connected. Recording works, but the transcript and AI proposals are a built-in fictional sample. Connect a server in Settings for real transcription.
          </Banner>
        ) : !backendSettings.token ? (
          <Banner tone="warning" title="Not signed in to the server">
            Sign in under Settings before transcribing meetings.
          </Banner>
        ) : null}

        <Button title="New client" icon="person-add" onPress={() => router.push('/clients/new')} testID="new-client" />

        {recent.data && recent.data.length > 0 && !q ? (
          <>
            <SectionTitle>Recent cases</SectionTitle>
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              {recent.data.map((k) => (
                <ListRow
                  key={k.id}
                  icon="folder-open-outline"
                  title={`${k.clientName} · ${k.reference}`}
                  subtitle={`${k.status} · updated ${fmtDateTime(k.updatedAt)}`}
                  onPress={() => router.push({ pathname: '/cases/[id]', params: { id: k.id } })}
                />
              ))}
            </Card>
          </>
        ) : null}

        <SectionTitle>{q ? 'Search results' : 'All clients'}</SectionTitle>
        {clients.error ? <Banner tone="danger">{clients.error}</Banner> : null}
        {clients.data && clients.data.length === 0 ? (
          <Card>
            <Empty icon="people-outline" title={q ? 'No matches' : 'No clients yet'} text={q ? undefined : 'Create a client, or load two fictional demo clients to try the app.'} />
            {!q ? (
              <Button
                title="Load fictional demo clients"
                variant="secondary"
                icon="flask-outline"
                loading={seeding}
                onPress={async () => {
                  setSeeding(true);
                  try {
                    await seedDemo(repo);
                    bump();
                  } catch (e) {
                    Alert.alert('Could not create demo data', errMsg(e));
                  } finally {
                    setSeeding(false);
                  }
                }}
              />
            ) : null}
          </Card>
        ) : (
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {(clients.data ?? []).map((c) => (
              <ListRow
                key={c.id}
                icon="person-outline"
                title={`${c.firstName} ${c.lastName}`}
                subtitle={`${c.caseCount} case${c.caseCount === 1 ? '' : 's'} · ${fmtDateTime(c.lastActivity)}`}
                right={c.isDemo ? <Badge text="DEMO" tone="neutral" /> : undefined}
                onPress={() => router.push({ pathname: '/clients/[id]', params: { id: c.id } })}
              />
            ))}
          </Card>
        )}
        <Text style={[T.small, { textAlign: 'center', marginTop: S.lg }]}>Mortgage Options · test build · not for real client data until reviewed</Text>
      </Screen>
    </View>
  );
}
