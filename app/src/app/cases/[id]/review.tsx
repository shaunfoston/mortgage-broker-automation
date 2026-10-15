import React, { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { confidenceBand } from '@mortgage-options/shared/extraction.ts';
import { getValue, type Row } from '@mortgage-options/shared/factfind/model.ts';
import { parsePath, pathLabel } from '@mortgage-options/shared/factfind/schema.ts';
import { formatValue, toInputString } from '@mortgage-options/shared/factfind/values.ts';
import type { CaseRecord, ExtractionItem } from '@mortgage-options/shared/db/repo.ts';
import { useApp, useData } from '../../../lib/app.tsx';
import { errMsg } from '../../../lib/format.ts';
import { C, R, S, T } from '../../../lib/theme.ts';
import { FieldEditor } from '../../../components/FieldEditor.tsx';
import { Badge, Banner, Button, Card, Loading, Screen, SectionTitle } from '../../../components/ui.tsx';

function Confidence({ c }: { c: number }) {
  const b = confidenceBand(c);
  return <Badge text={`${b === 'high' ? 'HIGH' : b === 'medium' ? 'MEDIUM' : 'LOW'} ${Math.round(c * 100)}%`} tone={b === 'high' ? 'success' : b === 'medium' ? 'warning' : 'danger'} />;
}

function display(it: ExtractionItem, v: unknown): string {
  const p = parsePath(it.path);
  if (!p) return String(v);
  if (it.kind === 'field' && p.field) return formatValue(p.field, v);
  const row = (v ?? {}) as Row;
  return p.section.fields
    .filter((f) => row[f.key] !== undefined)
    .map((f) => `${f.label}: ${formatValue(f, row[f.key])}`)
    .join('\n');
}

function ItemCard({ it, k, onDone }: { it: ExtractionItem; k: CaseRecord; onDone: () => void }) {
  const { repo } = useApp();
  const [editing, setEditing] = useState(false);
  const p = parsePath(it.path);
  const [raw, setRaw] = useState(p?.field ? toInputString(p.field, it.proposed) : '');
  const [err, setErr] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const current = it.kind === 'field' ? getValue(k.factFind, it.path) : null;
  const conflict = current !== null && current !== it.proposed;
  const needsApplicant2 = p?.owner === 'a2' && k.numApplicants !== 2;

  const decide = async (d: 'accepted' | 'rejected' | 'edited') => {
    setBusy(true);
    setErr(undefined);
    try {
      await repo.decideItem(it.id, d, d === 'edited' ? raw : undefined);
      onDone();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ gap: S.sm }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: S.sm }}>
        <Text style={[T.small, { flex: 1, fontWeight: '700', color: C.graphite2 }]}>{it.kind === 'list_item' ? `Add to ${pathLabel(it.path)}` : pathLabel(it.path)}</Text>
        <Confidence c={it.confidence} />
      </View>
      {!editing ? <Text style={[T.h3, { fontSize: 18 }]}>{display(it, it.proposed)}</Text> : null}
      {editing && p?.field ? <FieldEditor field={p.field} value={raw} onChange={setRaw} error={err} /> : null}
      {it.evidence ? (
        <View style={{ borderLeftWidth: 3, borderLeftColor: C.royal, paddingLeft: S.sm, paddingVertical: 2 }}>
          <Text style={[T.small, { fontStyle: 'italic' }]}>“{it.evidence}”</Text>
        </View>
      ) : null}
      {conflict ? <Banner tone="warning">Currently recorded: {display(it, current)}. Accepting replaces it.</Banner> : null}
      {needsApplicant2 ? <Banner tone="warning">This is for applicant 2. Make the case joint (case screen) before accepting.</Banner> : null}
      {err && !editing ? <Banner tone="danger">{err}</Banner> : null}
      <View style={{ flexDirection: 'row', gap: S.sm }}>
        {editing ? (
          <>
            <View style={{ flex: 1 }}>
              <Button title="Cancel" variant="ghost" small onPress={() => setEditing(false)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button title="Save edit" small onPress={() => decide('edited')} loading={busy} />
            </View>
          </>
        ) : (
          <>
            <View style={{ flex: 1 }}>
              <Button title="Reject" variant="danger" small icon="close" onPress={() => decide('rejected')} disabled={busy} />
            </View>
            {it.kind === 'field' ? (
              <View style={{ flex: 1 }}>
                <Button title="Edit" variant="secondary" small icon="pencil" onPress={() => setEditing(true)} disabled={busy} />
              </View>
            ) : null}
            <View style={{ flex: 1 }}>
              <Button title="Accept" small icon="checkmark" onPress={() => decide('accepted')} loading={busy} disabled={needsApplicant2} testID={`accept-${it.path}`} />
            </View>
          </>
        )}
      </View>
    </Card>
  );
}

function SummaryList({ title, items, tone }: { title: string; items: string[]; tone?: 'warning' }) {
  if (!items?.length) return null;
  return (
    <View style={{ gap: 4 }}>
      <Text style={[T.label, tone === 'warning' && { color: C.warning }]}>{title}</Text>
      {items.map((t, i) => (
        <Text key={i} style={T.body}>
          • {t}
        </Text>
      ))}
    </View>
  );
}

export default function Review() {
  const { id, extraction } = useLocalSearchParams<{ id: string; extraction: string }>();
  const { repo, bump } = useApp();
  const data = useData(async () => ({ ex: await repo.getExtraction(extraction), k: await repo.getCase(id) }), [extraction, id]);
  const [showDecided, setShowDecided] = useState(false);
  const [showRejected, setShowRejected] = useState(false);
  const [bulk, setBulk] = useState(false);

  if (data.loading && !data.data) return <Loading />;
  const ex = data.data?.ex;
  const k = data.data?.k;
  if (!ex || !k) return <Screen><Banner tone="danger">Review not found.</Banner></Screen>;
  const pending = ex.items.filter((i) => i.decision === 'pending').sort((a, b) => b.confidence - a.confidence);
  const decided = ex.items.filter((i) => i.decision !== 'pending');
  const highCount = pending.filter((i) => i.confidence >= 0.85).length;
  const s = ex.summary;

  return (
    <Screen>
      {ex.model === 'demo' ? <Banner tone="info" title="Demo extraction">These proposals come from the built-in fictional sample, not your recording.</Banner> : null}
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={T.h3}>Meeting summary (AI draft)</Text>
          <Badge text={ex.status === 'reviewed' ? 'REVIEWED' : `${pending.length} TO REVIEW`} tone={ex.status === 'reviewed' ? 'success' : 'warning'} />
        </View>
        <Text style={T.body}>{s.overview || 'No summary returned.'}</Text>
        <SummaryList title="Client objectives" items={s.client_objectives} />
        <SummaryList title="Action items" items={s.action_items} />
        <SummaryList title="Concerns / risks" items={s.concerns_or_risks} />
        <SummaryList title="Still needed" items={s.missing_information} />
        {s.possible_vulnerability_indicators?.length ? (
          <Banner tone="warning" title="Possible vulnerability indicators — your judgement needed">
            <View style={{ gap: 4 }}>
              {s.possible_vulnerability_indicators.map((t, i) => (
                <Text key={i} style={T.body}>
                  • {t}
                </Text>
              ))}
              <Text style={T.small}>Record your assessment in the “Customer circumstances” section. AI never fills it in.</Text>
            </View>
          </Banner>
        ) : null}
        <Text style={[T.small, { color: C.muted }]}>Model: {ex.model}</Text>
      </Card>

      <Banner tone="info">Nothing below is on the case until you accept it. Check each value against the quote from the meeting.</Banner>

      {highCount > 0 ? (
        <Button
          title={`Accept all high-confidence (${highCount})`}
          icon="checkmark-done"
          loading={bulk}
          testID="accept-high"
          onPress={() =>
            Alert.alert('Accept high-confidence values?', 'Values that would overwrite something already recorded are skipped so you can decide those one by one.', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Accept',
                onPress: async () => {
                  setBulk(true);
                  try {
                    const r = await repo.acceptAllAbove(ex.id, 0.85);
                    bump();
                    if (r.skippedConflicts || r.failed) Alert.alert('Done', `${r.accepted} accepted. ${r.skippedConflicts} need your decision because they differ from what is recorded.${r.failed ? ` ${r.failed} could not be applied.` : ''}`);
                  } finally {
                    setBulk(false);
                  }
                },
              },
            ])
          }
        />
      ) : null}

      <SectionTitle>{`Waiting for your decision (${pending.length})`}</SectionTitle>
      {pending.length === 0 ? <Banner tone="success">All proposals reviewed.</Banner> : null}
      {pending.map((it) => (
        <ItemCard key={it.id} it={it} k={k} onDone={bump} />
      ))}

      <Button title={`${showDecided ? 'Hide' : 'Show'} decided (${decided.length})`} variant="ghost" onPress={() => setShowDecided((v) => !v)} />
      {showDecided
        ? decided.map((it) => (
            <View key={it.id} style={{ backgroundColor: C.white, borderRadius: R.md, padding: S.md, gap: 4 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={[T.small, { flex: 1 }]}>{pathLabel(it.path)}</Text>
                <Badge text={it.decision.toUpperCase()} tone={it.decision === 'rejected' ? 'danger' : 'success'} />
              </View>
              <Text style={T.body}>{display(it, it.decision === 'edited' ? it.finalValue : it.proposed)}</Text>
            </View>
          ))
        : null}

      {ex.rejected.length ? (
        <>
          <Button title={`${showRejected ? 'Hide' : 'Show'} automatically discarded (${ex.rejected.length})`} variant="ghost" onPress={() => setShowRejected((v) => !v)} />
          {showRejected
            ? ex.rejected.map((r, i) => (
                <View key={i} style={{ backgroundColor: C.white, borderRadius: R.md, padding: S.md, gap: 2 }}>
                  <Text style={T.small}>{pathLabel(r.path)}</Text>
                  <Text style={T.body}>{r.value}</Text>
                  <Text style={[T.small, { color: C.danger }]}>{r.reason}</Text>
                </View>
              ))
            : null}
        </>
      ) : null}
    </Screen>
  );
}
