import React, { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ERASURE_REASONS, type ErasureReason } from '@mortgage-options/shared/db/repo.ts';
import { useApp, useData } from '../../lib/app.tsx';
import { deleteFileQuietly } from '../../lib/files.ts';
import { errMsg, fmtDateTime } from '../../lib/format.ts';
import { C, S, T } from '../../lib/theme.ts';
import { Badge, Banner, Button, Card, Choice, ListRow, Loading, Screen, SectionTitle } from '../../components/ui.tsx';

export default function ClientScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { repo, bump } = useApp();
  const client = useData(() => repo.getClient(id), [id]);
  const cases = useData(() => repo.listCases(id), [id]);
  const [erasing, setErasing] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (client.loading && !client.data) return <Loading />;
  const c = client.data;
  if (!c) return <Screen><Banner tone="danger">Client not found.</Banner></Screen>;

  const newCase = async () => {
    try {
      const k = await repo.createCase(c.id);
      bump();
      router.push({ pathname: '/cases/[id]', params: { id: k.id } });
    } catch (e) {
      Alert.alert('Could not create case', errMsg(e));
    }
  };

  const erase = () => {
    if (!reason) return;
    Alert.alert(
      'Permanently erase this client?',
      'Every case, recording, transcript, consent, document and note for this client will be deleted from this device. This cannot be undone. The audit log keeps a record that an erasure happened, without personal details.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Erase',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              const r = await repo.eraseClient(c.id, reason as ErasureReason);
              r.fileUris.forEach(deleteFileQuietly);
              bump();
              router.replace('/');
            } catch (e) {
              Alert.alert('Erasure failed', errMsg(e));
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: `${c.firstName} ${c.lastName}` }} />
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={T.h2}>
            {c.firstName} {c.lastName}
          </Text>
          {c.isDemo ? <Badge text="DEMO" tone="neutral" /> : null}
        </View>
        <Text style={T.body}>{c.email ?? 'No email'}</Text>
        <Text style={T.body}>{c.phone ?? 'No phone'}</Text>
        <Text style={T.small}>Client since {fmtDateTime(c.createdAt)}</Text>
        <Text style={T.small}>Name and contact details update automatically from Applicant 1 in the fact-find.</Text>
      </Card>

      <SectionTitle>Cases</SectionTitle>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {(cases.data ?? []).map((k) => (
          <ListRow
            key={k.id}
            icon="folder-open-outline"
            title={`${k.reference} · ${k.purpose ?? 'Purpose not set'}`}
            subtitle={`${k.status} · ${k.numApplicants === 2 ? 'Joint' : 'Single'} · ${fmtDateTime(k.updatedAt)}`}
            onPress={() => router.push({ pathname: '/cases/[id]', params: { id: k.id } })}
          />
        ))}
      </Card>
      <Button title="Open new case for this client" variant="secondary" icon="add" onPress={newCase} />

      <SectionTitle>Data protection</SectionTitle>
      {!erasing ? (
        <Button title="Erase client (right to erasure)" variant="danger" icon="trash-outline" onPress={() => setErasing(true)} />
      ) : (
        <Card style={{ borderColor: C.danger }}>
          <Text style={T.h3}>Erase all data for this client</Text>
          <Text style={T.small}>
            Check your retention obligations first — regulated firms usually must keep advice records for a minimum period. Consider exporting an encrypted copy before erasing.
          </Text>
          <Choice label="Reason" options={ERASURE_REASONS} value={reason} onChange={setReason} />
          <View style={{ flexDirection: 'row', gap: S.sm }}>
            <View style={{ flex: 1 }}>
              <Button title="Cancel" variant="ghost" onPress={() => setErasing(false)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button title="Erase" variant="danger" onPress={erase} disabled={!reason} loading={busy} />
            </View>
          </View>
        </Card>
      )}
    </Screen>
  );
}
