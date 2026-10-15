import React, { useEffect, useRef, useState } from 'react';
import { Alert, Linking, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useKeepAwake } from 'expo-keep-awake';
import {
  AudioQuality,
  IOSOutputFormat,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
  type RecordingOptions,
} from 'expo-audio';
import { RECORDING_DISCLOSURE_SCRIPT } from '@mortgage-options/shared/consent.ts';
import { uuid } from '@mortgage-options/shared/crypto.ts';
import type { Recording } from '@mortgage-options/shared/db/repo.ts';
import { useApp, useData } from '../../../lib/app.tsx';
import { deleteFileQuietly, keepRecording } from '../../../lib/files.ts';
import { errMsg, fmtDateTime, fmtDuration } from '../../../lib/format.ts';
import { pollTranscription, runExtraction, startTranscription } from '../../../lib/meeting.ts';
import { C, R, S, T } from '../../../lib/theme.ts';
import { Badge, Banner, Button, Card, Loading, Screen, SectionTitle, Toggle } from '../../../components/ui.tsx';

/** Mono AAC at 64 kbps: clear speech, ~29 MB per hour. */
const SPEECH: RecordingOptions = {
  extension: '.m4a',
  sampleRate: 44100,
  numberOfChannels: 1,
  bitRate: 64000,
  android: { outputFormat: 'mpeg4', audioEncoder: 'aac' },
  ios: { outputFormat: IOSOutputFormat.MPEG4AAC, audioQuality: AudioQuality.HIGH },
  web: { mimeType: 'audio/webm', bitsPerSecond: 64000 },
};
const MAX_MS = 2 * 60 * 60 * 1000;

function KeepAwake() {
  useKeepAwake('mo-recording');
  return null;
}

const STATUS_TONE: Record<string, 'neutral' | 'info' | 'success' | 'danger' | 'warning'> = {
  recorded: 'neutral',
  uploading: 'info',
  processing: 'warning',
  transcribed: 'success',
  failed: 'danger',
};

export default function RecordScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { repo, backend, backendSettings, bump } = useApp();
  const recs = useData(() => repo.listRecordings(id), [id]);
  const exs = useData(() => repo.listExtractions(id), [id]);
  const recorder = useAudioRecorder(SPEECH);
  const state = useAudioRecorderState(recorder);
  const [consentAt, setConsentAt] = useState<string | null>(null);
  const [phase, setPhase] = useState<'idle' | 'recording' | 'paused' | 'saving'>('idle');
  const [permDenied, setPermDenied] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const elapsed = useRef(0);

  elapsed.current = state.durationMillis ?? 0;

  // Stop automatically at the maximum length.
  useEffect(() => {
    if (phase === 'recording' && elapsed.current >= MAX_MS) void stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.durationMillis]);

  // Poll any recordings the server is still transcribing.
  useEffect(() => {
    const processing = (recs.data ?? []).filter((r) => r.status === 'processing');
    if (!processing.length) return;
    let live = true;
    const t = setInterval(async () => {
      for (const r of processing) {
        try {
          if (await pollTranscription(repo, backend, r)) live && bump();
        } catch (e) {
          live && setError(errMsg(e));
        }
      }
    }, 3000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [recs.data, repo, backend, bump]);

  const start = async () => {
    setError(null);
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) {
      setPermDenied(true);
      return;
    }
    setPermDenied(false);
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setPhase('recording');
    } catch (e) {
      setError(`Could not start recording: ${errMsg(e)}`);
    }
  };

  const pause = () => {
    recorder.pause();
    setPhase('paused');
  };
  const resume = () => {
    recorder.record();
    setPhase('recording');
  };

  const stop = async () => {
    setPhase('saving');
    try {
      const duration = elapsed.current;
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      const temp = recorder.uri;
      if (!temp) throw new Error('No audio was captured');
      const kept = await keepRecording(temp, uuid());
      await repo.createRecording({ caseId: id, fileUri: kept.uri, mime: 'audio/mp4', durationMs: duration, sizeBytes: kept.size, consentConfirmedAt: consentAt! });
      setConsentAt(null);
      bump();
    } catch (e) {
      setError(`Recording could not be saved: ${errMsg(e)}`);
    } finally {
      setPhase('idle');
    }
  };

  const transcribe = async (r: Recording) => {
    setBusyId(r.id);
    setError(null);
    try {
      await startTranscription(repo, backend, r);
      bump();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusyId(null);
    }
  };

  const extract = async (r: Recording) => {
    setBusyId(r.id);
    setError(null);
    try {
      const exId = await runExtraction(repo, backend, r);
      bump();
      router.push({ pathname: '/cases/[id]/review', params: { id, extraction: exId } });
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusyId(null);
    }
  };

  const removeAudio = (r: Recording) =>
    Alert.alert('Delete the audio?', 'The transcript (if any) is kept. The audio file is removed from this phone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete audio',
        style: 'destructive',
        onPress: async () => {
          deleteFileQuietly(await repo.clearRecordingAudio(r.id));
          bump();
        },
      },
    ]);

  if (recs.loading && !recs.data) return <Loading />;
  const active = phase === 'recording' || phase === 'paused';

  return (
    <Screen>
      {active ? <KeepAwake /> : null}
      {backendSettings.mode === 'offline-demo' ? (
        <Banner tone="info" title="Offline demo mode">
          Your real recording is saved, but “Transcribe” returns a fictional sample meeting, not your words.
        </Banner>
      ) : null}

      <Card>
        <Text style={T.h3}>Before you record</Text>
        <Text style={T.small}>Read this to the client:</Text>
        <View style={{ backgroundColor: C.royalTint, borderRadius: R.md, padding: S.md }}>
          <Text style={[T.body, { fontStyle: 'italic' }]}>“{RECORDING_DISCLOSURE_SCRIPT}”</Text>
        </View>
        <Toggle
          label="The client has agreed to this meeting being recorded"
          description={consentAt ? `Confirmed ${fmtDateTime(consentAt)}` : 'Required before recording. Also capture written consent on the Consent screen.'}
          value={!!consentAt}
          onChange={(v) => !active && setConsentAt(v ? new Date().toISOString() : null)}
        />
      </Card>

      <Card style={{ alignItems: 'center', gap: S.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {phase === 'recording' ? <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: C.danger }} /> : null}
          <Text style={{ fontSize: 44, fontWeight: '300', color: C.graphite, fontVariant: ['tabular-nums'] }} accessibilityLabel="Recording time">
            {fmtDuration(active || phase === 'saving' ? state.durationMillis : 0)}
          </Text>
        </View>
        <Text style={T.small}>{phase === 'recording' ? 'Recording — keep the phone between you and the client' : phase === 'paused' ? 'Paused' : phase === 'saving' ? 'Saving…' : 'Ready'}</Text>
        {permDenied ? (
          <Banner tone="danger" title="Microphone access is off">
            Allow microphone access for Mortgage Options in your phone’s settings.
          </Banner>
        ) : null}
        {permDenied ? <Button title="Open settings" variant="secondary" onPress={() => Linking.openSettings()} /> : null}
        <View style={{ width: '100%', gap: S.sm }}>
          {phase === 'idle' ? (
            <Button title="Start recording" icon="mic" onPress={start} disabled={!consentAt} testID="start-recording" />
          ) : null}
          {phase === 'recording' ? <Button title="Pause" icon="pause" variant="secondary" onPress={pause} /> : null}
          {phase === 'paused' ? <Button title="Resume" icon="play" variant="secondary" onPress={resume} /> : null}
          {active ? <Button title="Stop and save" icon="stop" variant="dark" onPress={stop} testID="stop-recording" /> : null}
          {phase === 'saving' ? <Button title="Saving…" onPress={() => undefined} loading /> : null}
        </View>
      </Card>

      {error ? <Banner tone="danger">{error}</Banner> : null}

      <SectionTitle>Meetings for this case</SectionTitle>
      {(recs.data ?? []).length === 0 ? <Text style={T.small}>No recordings yet.</Text> : null}
      {(recs.data ?? []).map((r) => {
        const ex = (exs.data ?? []).find((x) => x.recordingId === r.id);
        const busy = busyId === r.id;
        return (
          <Card key={r.id}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="mic-outline" size={18} color={C.royal} />
                <Text style={T.h3}>{fmtDateTime(r.createdAt)}</Text>
              </View>
              <Badge text={r.status.toUpperCase()} tone={STATUS_TONE[r.status]} />
            </View>
            <Text style={T.small}>
              {fmtDuration(r.durationMs)} · consent confirmed {fmtDateTime(r.consentConfirmedAt)}
              {r.provider ? ` · ${r.provider}` : ''}
              {!r.fileUri ? ' · audio deleted' : ''}
            </Text>
            {r.error ? <Banner tone="danger">{r.error}</Banner> : null}
            {r.status === 'processing' ? <Text style={T.small}>Transcribing… this screen checks every few seconds.</Text> : null}
            <View style={{ gap: S.sm }}>
              {(r.status === 'recorded' || r.status === 'failed') && r.fileUri ? (
                <Button title="Transcribe" icon="cloud-upload-outline" onPress={() => transcribe(r)} loading={busy} testID="transcribe" />
              ) : null}
              {r.status === 'transcribed' ? (
                <Button title="View transcript" variant="secondary" icon="reader-outline" onPress={() => router.push({ pathname: '/cases/[id]/transcript', params: { id, recording: r.id } })} />
              ) : null}
              {r.status === 'transcribed' && !ex ? <Button title="Extract fact-find details with AI" icon="sparkles" onPress={() => extract(r)} loading={busy} testID="extract" /> : null}
              {ex ? (
                <Button title={ex.status === 'reviewed' ? 'View AI review' : 'Continue AI review'} variant="secondary" icon="sparkles-outline" onPress={() => router.push({ pathname: '/cases/[id]/review', params: { id, extraction: ex.id } })} />
              ) : null}
              {r.fileUri && r.status === 'transcribed' ? <Button title="Delete audio, keep transcript" variant="ghost" small onPress={() => removeAudio(r)} /> : null}
            </View>
          </Card>
        );
      })}
    </Screen>
  );
}
