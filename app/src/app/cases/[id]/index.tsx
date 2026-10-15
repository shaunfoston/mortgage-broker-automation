import React, { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { CASE_STATUSES, type CaseStatus } from '@mortgage-options/shared/db/repo.ts';
import { applicantName, computeMetrics, overallProgress } from '@mortgage-options/shared/factfind/model.ts';
import { formatGBP } from '@mortgage-options/shared/factfind/values.ts';
import { useApp, useData } from '../../../lib/app.tsx';
import { errMsg } from '../../../lib/format.ts';
import { C, S, T } from '../../../lib/theme.ts';
import { Badge, Banner, Button, Card, Choice, ListRow, Loading, ProgressBar, Screen, SectionTitle } from '../../../components/ui.tsx';

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ width: '48%', paddingVertical: 6 }}>
      <Text style={T.label}>{label}</Text>
      <Text style={[T.h3, { marginTop: 2 }]}>{value || '—'}</Text>
    </View>
  );
}

export default function CaseHub() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { repo, bump } = useApp();
  const data = useData(async () => {
    const k = await repo.getCase(id);
    if (!k) return null;
    const [client, recs, exs, consents, docs, notes] = await Promise.all([
      repo.getClient(k.clientId),
      repo.listRecordings(id),
      repo.listExtractions(id),
      repo.listConsents(id),
      repo.listDocuments(id),
      repo.listNotes(id),
    ]);
    return { k, client, recs, exs, consents, docs, notes };
  }, [id]);
  const [editStatus, setEditStatus] = useState(false);

  if (data.loading && !data.data) return <Loading />;
  if (!data.data) return <Screen><Banner tone="danger">Case not found.</Banner></Screen>;
  const { k, client, recs, exs, consents, docs, notes } = data.data;
  const progress = overallProgress(k.factFind);
  const m = computeMetrics(k.factFind);
  const pending = exs.reduce((n, x) => n + x.items.filter((i) => i.decision === 'pending').length, 0);
  const latestEx = exs[0];
  const activeConsents = consents.filter((c) => !c.withdrawnAt);
  const signed = new Set(activeConsents.map((c) => c.applicantIndex)).size;
  const go = (p: string, params: Record<string, string> = {}) => router.push({ pathname: p as any, params: { id, ...params } });
  const names = [applicantName(k.factFind, 'a1'), k.numApplicants === 2 ? applicantName(k.factFind, 'a2') : ''].filter(Boolean).join(' & ');

  return (
    <Screen>
      <Stack.Screen options={{ title: k.reference }} />
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: S.sm }}>
          <View style={{ flex: 1 }}>
            <Text style={T.h2}>{names || `${client?.firstName ?? ''} ${client?.lastName ?? ''}`}</Text>
            <Text style={T.small}>
              {k.reference} · {k.purpose ?? 'Purpose not set'} · {k.numApplicants === 2 ? 'Joint' : 'Single applicant'}
            </Text>
          </View>
          {client?.isDemo ? <Badge text="DEMO" tone="neutral" /> : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.sm, marginTop: S.xs }}>
          <Badge text={k.status.toUpperCase()} tone="info" />
          <Button title={editStatus ? 'Done' : 'Change status'} variant="ghost" small onPress={() => setEditStatus((v) => !v)} />
        </View>
        {editStatus ? (
          <Choice
            label="Case status"
            options={CASE_STATUSES}
            value={k.status}
            allowClear={false}
            onChange={async (v) => {
              if (!v) return;
              try {
                await repo.setCaseStatus(id, v as CaseStatus);
                bump();
              } catch (e) {
                Alert.alert('Could not update', errMsg(e));
              }
            }}
          />
        ) : null}
        <View style={{ marginTop: S.sm, gap: 6 }}>
          <Text style={T.small}>
            Fact-find {progress.percent}% complete ({progress.complete} of {progress.total} sections)
          </Text>
          <ProgressBar percent={progress.percent} />
        </View>
      </Card>

      <Card>
        <Text style={T.h3}>Indicative figures</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <Metric label="Gross income" value={m.grossAnnualIncome ? `${formatGBP(m.grossAnnualIncome)}/yr` : ''} />
          <Metric label="Loan" value={m.loanAmount ? formatGBP(m.loanAmount) : ''} />
          <Metric label="LTV" value={m.ltvPercent !== null ? `${m.ltvPercent}%` : ''} />
          <Metric label="Loan to income" value={m.loanToIncome !== null ? `${m.loanToIncome}×` : ''} />
          <Metric label="Outgoings" value={m.monthlyExpenditure ? `${formatGBP(m.monthlyExpenditure)}/mo` : ''} />
          <Metric label="Credit (after completion)" value={m.creditCommitmentsAfterCompletion ? `${formatGBP(m.creditCommitmentsAfterCompletion)}/mo` : ''} />
        </View>
        <Text style={T.small}>From the fact-find only — not a lender affordability check.</Text>
      </Card>

      <SectionTitle>Workflow</SectionTitle>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <ListRow icon="document-text-outline" title="1. Fact-find" subtitle={`${progress.percent}% complete`} onPress={() => go('/cases/[id]/factfind')} testID="open-factfind" />
        <ListRow
          icon="mic-outline"
          title="2. Record & transcribe meeting"
          subtitle={recs.length ? `${recs.length} recording${recs.length === 1 ? '' : 's'} · latest: ${recs[0].status}` : 'Not recorded yet'}
          onPress={() => go('/cases/[id]/record')}
          testID="open-record"
        />
        <ListRow
          icon="sparkles-outline"
          title="3. Review AI proposals"
          subtitle={latestEx ? (pending ? `${pending} waiting for your decision` : 'All proposals reviewed') : 'Run after transcription'}
          right={pending ? <Badge text={String(pending)} tone="warning" /> : undefined}
          onPress={latestEx ? () => go('/cases/[id]/review', { extraction: latestEx.id }) : undefined}
          testID="open-review"
        />
        <ListRow
          icon="create-outline"
          title="4. Consent & signature"
          subtitle={`${signed} of ${k.numApplicants} applicant${k.numApplicants === 2 ? 's' : ''} signed`}
          right={signed >= k.numApplicants ? <Badge text="DONE" tone="success" /> : undefined}
          onPress={() => go('/cases/[id]/consent')}
          testID="open-consent"
        />
        <ListRow icon="share-outline" title="5. PDFs & secure export" subtitle="Fact-find, meeting summary, consent, audit" onPress={() => go('/cases/[id]/export')} testID="open-export" />
      </Card>

      <SectionTitle>Case file</SectionTitle>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <ListRow icon="attach-outline" title="Documents" subtitle={`${docs.length} file${docs.length === 1 ? '' : 's'}`} onPress={() => go('/cases/[id]/documents')} />
        <ListRow icon="chatbox-ellipses-outline" title="Case notes" subtitle={`${notes.length} note${notes.length === 1 ? '' : 's'}`} onPress={() => go('/cases/[id]/notes')} />
        <ListRow icon="shield-checkmark-outline" title="Audit history" subtitle="Tamper-evident log of every change" onPress={() => go('/cases/[id]/audit')} />
        {client ? <ListRow icon="person-outline" title="Client record" subtitle={`${client.firstName} ${client.lastName}`} onPress={() => router.push({ pathname: '/clients/[id]', params: { id: client.id } })} /> : null}
      </Card>

      <Button
        title={k.numApplicants === 2 ? 'Change to single applicant' : 'Add a second applicant (joint)'}
        variant="ghost"
        icon="people-outline"
        onPress={async () => {
          if (k.numApplicants === 2) {
            Alert.alert('Remove applicant 2?', 'Applicant 2 details are kept but hidden and excluded from PDFs.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Change', onPress: async () => (await repo.setNumApplicants(id, 1), bump()) },
            ]);
          } else {
            await repo.setNumApplicants(id, 2);
            bump();
          }
        }}
      />
      <Text style={[T.small, { color: C.muted, textAlign: 'center' }]}>Case opened {new Date(k.createdAt).toLocaleDateString('en-GB')}</Text>
    </Screen>
  );
}
