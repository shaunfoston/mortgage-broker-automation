import React, { useState } from 'react';
import { Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { passphraseProblems } from '@mortgage-options/shared/secureExport.ts';
import { useApp, useData } from '../../../lib/app.tsx';
import { createSecureExport } from '../../../lib/exportCase.ts';
import { errMsg } from '../../../lib/format.ts';
import { makePdf, shareFile, type PdfKind } from '../../../lib/pdf.ts';
import { T } from '../../../lib/theme.ts';
import { Banner, Button, Card, Field, Loading, Screen, SectionTitle, Toggle } from '../../../components/ui.tsx';

export default function ExportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { repo, brokerName } = useApp();
  const data = useData(async () => ({ recs: await repo.listRecordings(id), consents: await repo.listConsents(id) }), [id]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [pass1, setPass1] = useState('');
  const [pass2, setPass2] = useState('');
  const [audio, setAudio] = useState(false);

  if (data.loading && !data.data) return <Loading />;
  const hasTranscript = (data.data?.recs ?? []).some((r) => r.status === 'transcribed');
  const hasConsent = (data.data?.consents ?? []).length > 0;

  const pdf = async (kind: PdfKind) => {
    setBusy(kind);
    setMsg(null);
    try {
      const f = await makePdf(repo, id, kind, { by: brokerName });
      await shareFile(f.uri, 'application/pdf', f.name);
    } catch (e) {
      setMsg({ tone: 'danger', text: errMsg(e) });
    } finally {
      setBusy(null);
    }
  };

  const secure = async () => {
    setMsg(null);
    const problems = passphraseProblems(pass1);
    if (problems.length) return setMsg({ tone: 'danger', text: problems.join('. ') });
    if (pass1 !== pass2) return setMsg({ tone: 'danger', text: 'Passphrases do not match' });
    setBusy('secure');
    try {
      const f = await createSecureExport(repo, id, pass1, brokerName, audio);
      setPass1('');
      setPass2('');
      await shareFile(f.uri, 'application/octet-stream', f.name);
      setMsg({ tone: 'success', text: `Created ${f.name}. Send the passphrase separately (e.g. by phone), never with the file.` });
    } catch (e) {
      setMsg({ tone: 'danger', text: errMsg(e) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen>
      <SectionTitle>Branded PDFs</SectionTitle>
      <Card>
        <Button title="Fact-find PDF" icon="document-text-outline" onPress={() => pdf('factfind')} loading={busy === 'factfind'} disabled={!!busy} testID="pdf-factfind" />
        <Button title="Meeting summary PDF" icon="mic-outline" variant="secondary" onPress={() => pdf('summary')} loading={busy === 'summary'} disabled={!!busy || !hasTranscript} />
        <Button title="Consent record PDF" icon="create-outline" variant="secondary" onPress={() => pdf('consent')} loading={busy === 'consent'} disabled={!!busy || !hasConsent} />
        <Button title="Audit history PDF" icon="shield-checkmark-outline" variant="secondary" onPress={() => pdf('audit')} loading={busy === 'audit'} disabled={!!busy} />
        <Text style={T.small}>PDFs contain personal data and are not encrypted. Share only through secure channels approved by your firm.</Text>
      </Card>

      <SectionTitle>Secure encrypted export</SectionTitle>
      <Card>
        <Text style={T.body}>
          Exports everything held for this case (fact-find, transcripts, AI decisions, consents with signatures, notes, documents and audit trail) as one AES-256 encrypted file. Use it for subject access requests, archiving or moving a case.
        </Text>
        <Field label="Passphrase (12+ characters)" value={pass1} onChangeText={setPass1} secureTextEntry autoCapitalize="none" autoCorrect={false} />
        <Field label="Confirm passphrase" value={pass2} onChangeText={setPass2} secureTextEntry autoCapitalize="none" autoCorrect={false} />
        <Toggle label="Include meeting audio" description="Makes the file much larger." value={audio} onChange={setAudio} />
        <Button title="Create encrypted export" icon="lock-closed" variant="dark" onPress={secure} loading={busy === 'secure'} disabled={!!busy} />
        <Text style={T.small}>Decrypt on a PC with the included tool (see the setup guide). The passphrase cannot be recovered if lost.</Text>
      </Card>
      {msg ? <Banner tone={msg.tone}>{msg.text}</Banner> : null}
    </Screen>
  );
}
