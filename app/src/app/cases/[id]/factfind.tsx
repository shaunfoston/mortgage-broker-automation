import React from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { applicantName, overallProgress } from '@mortgage-options/shared/factfind/model.ts';
import { ownerLabel, type Owner } from '@mortgage-options/shared/factfind/schema.ts';
import { useApp, useData } from '../../../lib/app.tsx';
import { C, S } from '../../../lib/theme.ts';
import { Banner, Card, ListRow, Loading, ProgressBar, Screen, SectionTitle } from '../../../components/ui.tsx';

export default function FactFindOverview() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { repo } = useApp();
  const kase = useData(() => repo.getCase(id), [id]);
  if (kase.loading && !kase.data) return <Loading />;
  const k = kase.data;
  if (!k) return <Screen><Banner tone="danger">Case not found.</Banner></Screen>;
  const p = overallProgress(k.factFind);
  const owners: Owner[] = k.numApplicants === 2 ? ['a1', 'a2', 'case'] : ['a1', 'case'];

  return (
    <Screen>
      <Card>
        <ProgressBar percent={p.percent} />
        <Banner tone="info">Tap a section to complete it. Values you accept from an AI review appear here marked “AI · reviewed”.</Banner>
      </Card>
      {owners.map((o) => {
        const name = o === 'case' ? '' : applicantName(k.factFind, o);
        return (
          <React.Fragment key={o}>
            <SectionTitle>{o === 'case' ? 'Household, property & mortgage' : `${ownerLabel(o)}${name ? ` — ${name}` : ''}`}</SectionTitle>
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              {p.sections
                .filter((s) => s.owner === o)
                .map((s) => (
                  <ListRow
                    key={`${o}.${s.section.id}`}
                    testID={`section-${o}-${s.section.id}`}
                    title={s.section.title}
                    subtitle={
                      s.section.kind === 'list'
                        ? s.filled
                          ? `${s.filled} ${s.section.itemLabel?.toLowerCase() ?? 'item'}${s.filled === 1 ? '' : 's'}`
                          : s.complete
                            ? 'None declared'
                            : 'Not started'
                        : s.requiredMissing.length
                          ? `${s.filled}/${s.total} answered · needs ${s.requiredMissing.map((f) => f.label).join(', ')}`
                          : `${s.filled}/${s.total} answered`
                    }
                    right={<Ionicons name={s.complete ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={s.complete ? C.success : C.muted} style={{ marginRight: S.xs }} />}
                    onPress={() => router.push({ pathname: '/cases/[id]/section', params: { id, owner: o, section: s.section.id } })}
                  />
                ))}
            </Card>
          </React.Fragment>
        );
      })}
    </Screen>
  );
}
