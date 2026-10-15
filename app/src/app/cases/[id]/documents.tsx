import React, { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { DOCUMENT_CATEGORIES } from '@mortgage-options/shared/db/repo.ts';
import { useApp, useData } from '../../../lib/app.tsx';
import { deleteFileQuietly, importDocument } from '../../../lib/files.ts';
import { errMsg, fmtDateTime } from '../../../lib/format.ts';
import { shareFile } from '../../../lib/pdf.ts';
import { S, T } from '../../../lib/theme.ts';
import { Banner, Button, Card, Choice, Empty, Loading, Screen, SectionTitle } from '../../../components/ui.tsx';

const MAX_BYTES = 25 * 1024 * 1024;

export default function Documents() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { repo, bump } = useApp();
  const docs = useData(() => repo.listDocuments(id), [id]);
  const [category, setCategory] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const add = async () => {
    if (!category) return setErr('Choose a category first');
    setErr(null);
    const r = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true, multiple: false });
    if (r.canceled || !r.assets?.length) return;
    const a = r.assets[0];
    if ((a.size ?? 0) > MAX_BYTES) return setErr('That file is over 25 MB.');
    setBusy(true);
    try {
      const f = await importDocument(a.uri, a.name);
      deleteFileQuietly(a.uri);
      await repo.addDocument({ caseId: id, category, name: a.name, mime: a.mimeType ?? null, sizeBytes: f.size, fileUri: f.uri, sha256: f.sha256 });
      setCategory(null);
      bump();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  if (docs.loading && !docs.data) return <Loading />;
  return (
    <Screen>
      <Card>
        <Text style={T.h3}>Add a document</Text>
        <Choice label="Category" options={DOCUMENT_CATEGORIES} value={category} onChange={setCategory} />
        <Button title="Choose PDF or photo" icon="attach" onPress={add} loading={busy} />
        <Text style={T.small}>Files are copied into the app’s private storage. A SHA-256 fingerprint is recorded in the audit log.</Text>
      </Card>
      {err ? <Banner tone="danger">{err}</Banner> : null}
      <SectionTitle>{`On file (${docs.data?.length ?? 0})`}</SectionTitle>
      {(docs.data ?? []).length === 0 ? (
        <Card>
          <Empty icon="folder-open-outline" title="No documents yet" />
        </Card>
      ) : null}
      {(docs.data ?? []).map((d) => (
        <Card key={d.id}>
          <Text style={T.h3}>{d.name}</Text>
          <Text style={T.small}>
            {d.category} · {d.sizeBytes ? `${Math.round(d.sizeBytes / 1024)} KB` : ''} · added {fmtDateTime(d.createdAt)}
          </Text>
          <View style={{ flexDirection: 'row', gap: S.sm }}>
            <View style={{ flex: 1 }}>
              <Button title="Open / share" variant="secondary" small onPress={() => shareFile(d.fileUri, d.mime ?? 'application/octet-stream', d.name).catch((e) => Alert.alert('Cannot open', errMsg(e)))} />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                title="Delete"
                variant="danger"
                small
                onPress={() =>
                  Alert.alert('Delete document?', d.name, [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Delete',
                      style: 'destructive',
                      onPress: async () => {
                        deleteFileQuietly(await repo.deleteDocument(d.id));
                        bump();
                      },
                    },
                  ])
                }
              />
            </View>
          </View>
        </Card>
      ))}
    </Screen>
  );
}
