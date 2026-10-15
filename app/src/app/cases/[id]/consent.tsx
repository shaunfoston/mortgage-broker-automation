import React, { useEffect, useRef, useState } from 'react';
import { Alert, Platform, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as Device from 'expo-device';
import { CONSENT_INTRO, CONSENT_ITEMS, FIRM_PLACEHOLDER } from '@mortgage-options/shared/consent.ts';
import { applicantName } from '@mortgage-options/shared/factfind/model.ts';
import { isValidationError } from '@mortgage-options/shared/db/repo.ts';
import { useApp, useData } from '../../../lib/app.tsx';
import { errMsg, fmtDateTime, timeZone } from '../../../lib/format.ts';
import { makePdf, shareFile } from '../../../lib/pdf.ts';
import { C, S, T } from '../../../lib/theme.ts';
import { SignaturePad, type SignaturePadHandle } from '../../../components/SignaturePad.tsx';
import { Badge, Banner, Button, Card, Choice, Field, Loading, SectionTitle, Toggle } from '../../../components/ui.tsx';

export default function ConsentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { repo, bump, brokerName } = useApp();
  const data = useData(async () => ({ k: await repo.getCase(id), consents: await repo.listConsents(id) }), [id]);
  const [applicant, setApplicant] = useState<1 | 2>(1);
  const [signer, setSigner] = useState('');
  const [answers, setAnswers] = useState<Record<string, boolean>>({});
  const [hasInk, setHasInk] = useState(false);
  const [scroll, setScroll] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pad = useRef<SignaturePadHandle>(null);
  const k = data.data?.k;

  useEffect(() => {
    if (k) setSigner(applicantName(k.factFind, applicant === 2 ? 'a2' : 'a1'));
  }, [k, applicant]);

  if (data.loading && !data.data) return <Loading />;
  if (!k) return <Banner tone="danger">Case not found.</Banner>;
  const consents = data.data?.consents ?? [];

  const save = async () => {
    setErrors({});
    setMsg(null);
    const sig = pad.current?.toDataUrl() ?? null;
    if (!sig) {
      setErrors({ signature: 'Please sign in the box (a full signature, not a tap).' });
      return;
    }
    setBusy(true);
    try {
      await repo.saveConsent({
        caseId: id,
        applicantIndex: applicant,
        signerName: signer,
        answers: Object.fromEntries(CONSENT_ITEMS.map((i) => [i.key, answers[i.key] === true])),
        signatureDataUrl: sig,
        signedAt: new Date(),
        timeZone: timeZone(),
        device: `${Device.manufacturer ?? ''} ${Device.modelName ?? ''} · ${Platform.OS} ${Device.osVersion ?? ''}`.trim(),
      });
      pad.current?.clear();
      setAnswers({});
      setMsg('Consent saved.');
      bump();
    } catch (e) {
      if (isValidationError(e)) setErrors(e.fields);
      setMsg(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const pdf = async (consentId: string) => {
    try {
      const f = await makePdf(repo, id, 'consent', { consentId, by: brokerName });
      await shareFile(f.uri, 'application/pdf', f.name);
    } catch (e) {
      Alert.alert('PDF failed', errMsg(e));
    }
  };

  return (
    <ScrollView scrollEnabled={scroll} style={{ backgroundColor: C.surface }} contentContainerStyle={{ padding: S.lg, gap: S.md, paddingBottom: 80 }} keyboardShouldPersistTaps="handled">
      <Banner tone="warning" title="Draft wording">
        This consent text is a draft for testing and must be approved by your compliance function before use with real clients.
      </Banner>

      {k.numApplicants === 2 ? (
        <Choice label="Who is signing?" options={['Applicant 1', 'Applicant 2']} value={`Applicant ${applicant}`} allowClear={false} onChange={(v) => setApplicant(v === 'Applicant 2' ? 2 : 1)} />
      ) : null}

      <Card>
        <Text style={T.h3}>Data protection & consent</Text>
        <Text style={T.body}>{CONSENT_INTRO}</Text>
        <Text style={T.small}>{FIRM_PLACEHOLDER}</Text>
        {CONSENT_ITEMS.map((i) => (
          <Toggle
            key={i.key}
            label={i.label}
            description={i.required ? 'Required' : 'Optional'}
            value={answers[i.key] === true}
            onChange={(v) => setAnswers((a) => ({ ...a, [i.key]: v }))}
          />
        ))}
        {errors.answers ? <Text style={{ color: C.danger }}>Please confirm the required statements.</Text> : null}
      </Card>

      <Card>
        <Field label="Full name of person signing" value={signer} onChangeText={setSigner} error={errors.signerName} autoCapitalize="words" />
        <Text style={[T.small, { marginTop: S.sm }]}>Client signs with a finger below:</Text>
        <SignaturePad ref={pad} height={200} onChange={setHasInk} onDrawingChange={(d) => setScroll(!d)} />
        {errors.signature ? <Text style={{ color: C.danger }}>{errors.signature}</Text> : null}
        <Button title="Clear signature" variant="ghost" small onPress={() => pad.current?.clear()} disabled={!hasInk} />
        <Text style={T.small}>
          Witnessed by {brokerName || 'adviser'} · the date, time and time zone are recorded when you save.
        </Text>
      </Card>

      {msg ? <Banner tone={msg === 'Consent saved.' ? 'success' : 'danger'}>{msg}</Banner> : null}
      <Button title="Save signed consent" icon="checkmark-circle" onPress={save} loading={busy} testID="save-consent" />

      <SectionTitle>Signed consents</SectionTitle>
      {consents.length === 0 ? <Text style={T.small}>None yet.</Text> : null}
      {consents.map((c) => {
        const ok = repo.verifyConsent(c);
        return (
          <Card key={c.id}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={T.h3}>
                {c.signerName} (Applicant {c.applicantIndex})
              </Text>
              {c.withdrawnAt ? <Badge text="WITHDRAWN" tone="danger" /> : ok ? <Badge text="VERIFIED" tone="success" /> : <Badge text="INTEGRITY FAIL" tone="danger" />}
            </View>
            <Text style={T.small}>
              Signed {fmtDateTime(c.signedAtUtc)} ({c.timeZone}) · wording {c.consentVersion}
            </Text>
            <View style={{ flexDirection: 'row', gap: S.sm }}>
              <View style={{ flex: 1 }}>
                <Button title="PDF" variant="secondary" small icon="document-outline" onPress={() => pdf(c.id)} />
              </View>
              {!c.withdrawnAt ? (
                <View style={{ flex: 1 }}>
                  <Button
                    title="Withdraw"
                    variant="danger"
                    small
                    onPress={() =>
                      Alert.alert('Record withdrawal of consent?', 'The signed record is kept (marked withdrawn) as evidence.', [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Withdraw', style: 'destructive', onPress: async () => (await repo.withdrawConsent(c.id), bump()) },
                      ])
                    }
                  />
                </View>
              ) : null}
            </View>
          </Card>
        );
      })}
    </ScrollView>
  );
}
