import React from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { AUDIT_LABELS } from '@mortgage-options/shared/audit.ts';
import { useApp, useData } from '../../../lib/app.tsx';
import { fmtDateTime } from '../../../lib/format.ts';
import { C, S, T } from '../../../lib/theme.ts';
import { Banner, Card, Divider, Loading, Screen } from '../../../components/ui.tsx';

export default function Audit() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { repo } = useApp();
  const data = useData(async () => ({ entries: await repo.listAudit(id, 1000), chain: await repo.verifyAudit() }), [id]);
  if (data.loading && !data.data) return <Loading />;
  const { entries, chain } = data.data!;
  return (
    <Screen>
      {chain.ok ? (
        <Banner tone="success" title="Audit chain verified">{`All ${chain.count} entries on this device are intact — none altered or removed.`}</Banner>
      ) : (
        <Banner tone="danger" title="Audit chain broken">{`Problem at entry #${chain.brokenAtSeq}: ${chain.reason}`}</Banner>
      )}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {entries.map((a, i) => (
          <View key={a.id}>
            {i > 0 ? <Divider /> : null}
            <View style={{ padding: S.md, gap: 2 }}>
              <Text style={[T.body, { fontWeight: '600' }]}>{AUDIT_LABELS[a.action] ?? a.action}</Text>
              <Text style={T.small}>
                #{a.seq} · {fmtDateTime(a.ts)} · {a.actor}
              </Text>
              {Object.keys(a.details).length ? (
                <Text style={[T.small, { color: C.muted }]}>
                  {Object.entries(a.details)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(' · ')}
                </Text>
              ) : null}
            </View>
          </View>
        ))}
      </Card>
    </Screen>
  );
}
