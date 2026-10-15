import React from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { msToClock } from '@mortgage-options/shared/extraction.ts';
import { useApp, useData } from '../../../lib/app.tsx';
import { fmtDateTime } from '../../../lib/format.ts';
import { C, S, T } from '../../../lib/theme.ts';
import { Banner, Card, Loading, Screen } from '../../../components/ui.tsx';

const SPEAKER_COLOURS = [C.royal, C.success, C.warning, C.danger];

export default function Transcript() {
  const { recording } = useLocalSearchParams<{ id: string; recording: string }>();
  const { repo } = useApp();
  const rec = useData(() => repo.getRecording(recording), [recording]);
  if (rec.loading && !rec.data) return <Loading />;
  const r = rec.data;
  if (!r) return <Screen><Banner tone="danger">Recording not found.</Banner></Screen>;
  const speakers = [...new Set(r.utterances.map((u) => u.speaker))];
  return (
    <Screen>
      {r.provider === 'demo' ? <Banner tone="info" title="Demo transcript">This is the built-in fictional sample, not your recording.</Banner> : null}
      <Text style={T.small}>
        Recorded {fmtDateTime(r.createdAt)} · {r.provider} · speakers are labelled automatically (A, B…) and may be imperfect.
      </Text>
      <Card style={{ gap: S.md }}>
        {r.utterances.length
          ? r.utterances.map((u, i) => (
              <View key={i} style={{ gap: 2 }}>
                <Text style={{ fontWeight: '800', color: SPEAKER_COLOURS[speakers.indexOf(u.speaker) % SPEAKER_COLOURS.length] }}>
                  Speaker {u.speaker} <Text style={[T.small, { fontWeight: '400' }]}>{msToClock(u.start)}</Text>
                </Text>
                <Text style={T.body} selectable>
                  {u.text}
                </Text>
              </View>
            ))
          : <Text style={T.body} selectable>{r.transcript ?? 'No transcript.'}</Text>}
      </Card>
    </Screen>
  );
}
