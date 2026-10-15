import React, { useState } from 'react';
import { Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useApp, useData } from '../../../lib/app.tsx';
import { errMsg, fmtDateTime } from '../../../lib/format.ts';
import { T } from '../../../lib/theme.ts';
import { Banner, Button, Card, Empty, Field, Loading, Screen, SectionTitle } from '../../../components/ui.tsx';

export default function Notes() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { repo, bump } = useApp();
  const notes = useData(() => repo.listNotes(id), [id]);
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (notes.loading && !notes.data) return <Loading />;
  return (
    <Screen>
      <Card>
        <Field label="New note" value={text} onChangeText={setText} multiline placeholder="Notes are time-stamped and cannot be edited afterwards." />
        <Button
          title="Add note"
          icon="add"
          loading={busy}
          disabled={!text.trim()}
          onPress={async () => {
            setBusy(true);
            setErr(null);
            try {
              await repo.addNote(id, text);
              setText('');
              bump();
            } catch (e) {
              setErr(errMsg(e));
            } finally {
              setBusy(false);
            }
          }}
        />
      </Card>
      {err ? <Banner tone="danger">{err}</Banner> : null}
      <SectionTitle>History</SectionTitle>
      {(notes.data ?? []).length === 0 ? (
        <Card>
          <Empty icon="chatbox-outline" title="No notes yet" />
        </Card>
      ) : null}
      {(notes.data ?? []).map((n) => (
        <Card key={n.id}>
          <Text style={T.small}>
            {fmtDateTime(n.createdAt)} · {n.author}
          </Text>
          <Text style={T.body} selectable>
            {n.body}
          </Text>
        </Card>
      ))}
    </Screen>
  );
}
