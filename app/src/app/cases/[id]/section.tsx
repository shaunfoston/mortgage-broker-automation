import React, { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { getSection, ownerLabel, SECTIONS, type Owner } from '@mortgage-options/shared/factfind/schema.ts';
import { getList, isListNone, type Row } from '@mortgage-options/shared/factfind/model.ts';
import { toInputString } from '@mortgage-options/shared/factfind/values.ts';
import { isValidationError } from '@mortgage-options/shared/db/repo.ts';
import { useApp, useData } from '../../../lib/app.tsx';
import { errMsg } from '../../../lib/format.ts';
import { S, T } from '../../../lib/theme.ts';
import { FieldEditor } from '../../../components/FieldEditor.tsx';
import { Banner, Button, Card, Loading, Screen, Toggle } from '../../../components/ui.tsx';

type Raw = Record<string, string>;

export default function SectionEditor() {
  const { id, owner, section } = useLocalSearchParams<{ id: string; owner: Owner; section: string }>();
  const { repo, bump } = useApp();
  const def = getSection(section);
  const kase = useData(() => repo.getCase(id), [id]);
  const [raw, setRaw] = useState<Raw>({});
  const [rows, setRows] = useState<Raw[]>([]);
  const [none, setNone] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Initialise form state once the case loads.
  useEffect(() => {
    const k = kase.data;
    if (!k || !def || dirty) return;
    if (def.kind === 'fields') {
      const data = ((k.factFind[owner] as any)?.[def.id] ?? {}) as Row;
      const r: Raw = {};
      for (const f of def.fields) r[f.key] = toInputString(f, data[f.key]);
      setRaw(r);
    } else {
      const list = getList(k.factFind, `${owner}.${def.id}`);
      setRows(list.map((row) => Object.fromEntries(def.fields.map((f) => [f.key, toInputString(f, row[f.key])]))));
      setNone(isListNone(k.factFind, `${owner}.${def.id}`));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kase.data]);

  const next = useMemo(() => {
    if (!kase.data) return null;
    const owners: Owner[] = kase.data.numApplicants === 2 ? ['a1', 'a2', 'case'] : ['a1', 'case'];
    const order = owners.flatMap((o) => SECTIONS.filter((s) => (o === 'case') === (s.scope === 'case')).map((s) => ({ owner: o, section: s })));
    const i = order.findIndex((x) => x.owner === owner && x.section.id === section);
    return i >= 0 && i < order.length - 1 ? order[i + 1] : null;
  }, [kase.data, owner, section]);

  if (!def) return <Screen><Banner tone="danger">Unknown section.</Banner></Screen>;
  if (kase.loading && !kase.data) return <Loading />;
  const k = kase.data;
  if (!k) return <Screen><Banner tone="danger">Case not found.</Banner></Screen>;

  const title = owner === 'case' ? def.title : `${ownerLabel(owner)} · ${def.title}`;

  const save = async (thenNext: boolean) => {
    setBusy(true);
    setErrors({});
    setMsg(null);
    try {
      if (def.kind === 'fields') await repo.saveSection(id, owner, def.id, raw);
      else await repo.saveList(id, owner, def.id, rows, none);
      setDirty(false);
      bump();
      if (thenNext && next) router.replace({ pathname: '/cases/[id]/section', params: { id, owner: next.owner, section: next.section.id } });
      else setMsg({ tone: 'success', text: 'Saved.' });
    } catch (e) {
      if (isValidationError(e)) setErrors(e.fields);
      setMsg({ tone: 'danger', text: isValidationError(e) ? 'Please correct the highlighted fields — nothing was saved.' : errMsg(e) });
    } finally {
      setBusy(false);
    }
  };

  const setField = (key: string, v: string) => {
    setRaw((r) => ({ ...r, [key]: v }));
    setDirty(true);
  };

  return (
    <Screen>
      <Stack.Screen options={{ title }} />
      {def.description ? <Banner tone="info">{def.description}</Banner> : null}

      {def.kind === 'fields' ? (
        <Card style={{ gap: S.lg }}>
          {def.fields.map((f) => (
            <FieldEditor
              key={f.key}
              field={f}
              value={raw[f.key] ?? ''}
              onChange={(v) => setField(f.key, v)}
              error={errors[f.key]}
              source={k.provenance[`${owner}.${def.id}.${f.key}`]?.source}
            />
          ))}
        </Card>
      ) : (
        <>
          {rows.map((row, i) => (
            <Card key={i} style={{ gap: S.lg }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={T.h3}>
                  {def.itemLabel ?? 'Item'} {i + 1}
                </Text>
                <Button
                  title="Remove"
                  variant="ghost"
                  icon="trash-outline"
                  small
                  onPress={() => {
                    setRows((rs) => rs.filter((_, j) => j !== i));
                    setDirty(true);
                  }}
                />
              </View>
              {def.fields.map((f) => (
                <FieldEditor
                  key={f.key}
                  field={f}
                  value={row[f.key] ?? ''}
                  error={errors[`${i}.${f.key}`]}
                  onChange={(v) => {
                    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [f.key]: v } : r)));
                    setDirty(true);
                  }}
                />
              ))}
            </Card>
          ))}
          <Button
            title={`Add ${def.itemLabel?.toLowerCase() ?? 'item'}`}
            variant="secondary"
            icon="add"
            onPress={() => {
              setRows((rs) => [...rs, {}]);
              setNone(false);
              setDirty(true);
            }}
          />
          {rows.length === 0 ? (
            <Card>
              <Toggle
                label={`None to declare`}
                description="Confirms you asked and the answer was none."
                value={none}
                onChange={(v) => {
                  setNone(v);
                  setDirty(true);
                }}
              />
            </Card>
          ) : null}
        </>
      )}

      {msg ? <Banner tone={msg.tone}>{msg.text}</Banner> : null}
      <Button title="Save" icon="save-outline" onPress={() => save(false)} loading={busy} testID="save-section" />
      {next ? <Button title={`Save and next: ${next.owner === 'case' ? '' : `${ownerLabel(next.owner)} · `}${next.section.title}`} variant="secondary" onPress={() => save(true)} disabled={busy} /> : null}
    </Screen>
  );
}
