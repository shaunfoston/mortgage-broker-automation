import React, { useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { isInsecureUrl, isPrivateHost, normaliseBaseUrl, ServerBackend } from '@mortgage-options/shared/apiClient.ts';
import { applyScreenProtection, useApp } from '../lib/app.tsx';
import { clearBackendSettings } from '../lib/backend.ts';
import { destroyAppDb } from '../lib/db.ts';
import { seedDemo } from '../lib/demoSeed.ts';
import { uploadFile, wipeAllFiles } from '../lib/files.ts';
import { errMsg } from '../lib/format.ts';
import { biometricsAvailable, biometricsEnabled, clearLockData, getLockTimeout, pinProblems, setBiometricsEnabled, setLockTimeout, setPin, tryPin } from '../lib/lock.ts';
import { S, T } from '../lib/theme.ts';
import { Badge, Banner, Button, Card, Choice, Field, Screen, SectionTitle, Toggle } from '../components/ui.tsx';

const TIMEOUTS: Record<string, number> = { Immediately: 0, '1 minute': 60, '5 minutes': 300, '15 minutes': 900 };

export default function Settings() {
  const { repo, brokerName, setBrokerName, backendSettings, updateBackend, dbInfo, bump } = useApp();
  const [name, setName] = useState(brokerName);
  const [url, setUrl] = useState(backendSettings.url);
  const [user, setUser] = useState(backendSettings.serverUser ?? '');
  const [pw, setPw] = useState('');
  const [conn, setConn] = useState<{ tone: 'success' | 'danger' | 'warning' | 'info'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [timeout, setTimeoutState] = useState<string>('1 minute');
  const [bioAvail, setBioAvail] = useState(false);
  const [bio, setBio] = useState(false);
  const [shots, setShots] = useState(false);
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [pinMsg, setPinMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const t = await getLockTimeout();
      setTimeoutState(Object.keys(TIMEOUTS).find((k) => TIMEOUTS[k] === t) ?? '1 minute');
      setBioAvail(await biometricsAvailable());
      setBio(await biometricsEnabled());
      setShots((await repo.getSetting('allow_screenshots')) === '1');
    })();
  }, [repo]);

  const testAndSignIn = async () => {
    setConn(null);
    let base: string;
    try {
      base = normaliseBaseUrl(url);
    } catch (e) {
      return setConn({ tone: 'danger', text: errMsg(e) });
    }
    if (isInsecureUrl(base) && !isPrivateHost(base)) {
      return setConn({ tone: 'danger', text: 'Use https:// for any server outside your own Wi-Fi network.' });
    }
    setBusy('server');
    try {
      const api = new ServerBackend(base, null, fetch, uploadFile);
      const h = await api.health();
      if (!h?.ok) throw new Error('That address did not respond like a Mortgage Options server');
      const s = await api.login(user.trim(), pw);
      await updateBackend({ mode: 'server', url: base, token: s.token, tokenExpiresAt: s.expiresAt, serverUser: user.trim() });
      setPw('');
      setConn({
        tone: h.mode === 'demo' ? 'warning' : 'success',
        text: `Signed in as ${s.displayName}. Server mode: ${h.mode.toUpperCase()} (${h.transcription} / ${h.extraction}).${isInsecureUrl(base) ? ' Connection is not encrypted (http) — LAN testing only.' : ''}`,
      });
    } catch (e) {
      setConn({ tone: 'danger', text: errMsg(e) });
    } finally {
      setBusy(null);
    }
  };

  const wipe = () =>
    Alert.alert('Delete ALL data on this phone?', 'Every client, case, recording, document, consent and the audit log will be permanently deleted, and the app reset. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete everything',
        style: 'destructive',
        onPress: async () => {
          wipeAllFiles();
          await destroyAppDb();
          await clearBackendSettings();
          await clearLockData();
          Alert.alert('Data deleted', 'Close the app completely and reopen it to start again.');
        },
      },
    ]);

  return (
    <Screen>
      <SectionTitle>Adviser</SectionTitle>
      <Card>
        <Field label="Your name (shown on records and PDFs)" value={name} onChangeText={setName} autoCapitalize="words" />
        <Button title="Save name" variant="secondary" small onPress={async () => (await setBrokerName(name), Alert.alert('Saved'))} disabled={name.trim().length < 2} />
      </Card>

      <SectionTitle>Transcription & AI connection</SectionTitle>
      <Card>
        <Choice
          label="Mode"
          options={['Offline demo', 'My server']}
          value={backendSettings.mode === 'server' ? 'My server' : 'Offline demo'}
          allowClear={false}
          onChange={async (v) => updateBackend({ mode: v === 'My server' ? 'server' : 'offline-demo' })}
        />
        {backendSettings.mode === 'offline-demo' ? (
          <Banner tone="info">No server needed. Transcription and AI return a fictional sample meeting so you can try every screen.</Banner>
        ) : (
          <>
            <Field label="Server address" value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://your-tunnel.trycloudflare.com" hint="From the server window on your PC. Include http:// for a Wi-Fi address like http://192.168.1.20:3005" />
            <Field label="Username" value={user} onChangeText={setUser} autoCapitalize="none" autoCorrect={false} />
            <Field label="Password" value={pw} onChangeText={setPw} secureTextEntry autoCapitalize="none" autoCorrect={false} />
            <Button title="Test connection and sign in" icon="log-in-outline" onPress={testAndSignIn} loading={busy === 'server'} disabled={!url || !user || !pw} testID="server-signin" />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.sm }}>
              <Text style={T.small}>Status:</Text>
              {backendSettings.token ? <Badge text={`SIGNED IN · ${backendSettings.serverUser ?? ''}`} tone="success" /> : <Badge text="NOT SIGNED IN" tone="warning" />}
            </View>
            {backendSettings.token ? (
              <Button title="Sign out of server" variant="ghost" small onPress={() => updateBackend({ token: null, tokenExpiresAt: null })} />
            ) : null}
          </>
        )}
        {conn ? <Banner tone={conn.tone}>{conn.text}</Banner> : null}
      </Card>

      <SectionTitle>Security</SectionTitle>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.sm }}>
          <Text style={T.body}>Database encryption</Text>
          {dbInfo.encrypted ? <Badge text={`ON · SQLCipher ${dbInfo.cipherVersion}`} tone="success" /> : <Badge text="OFF" tone="danger" />}
        </View>
        {!dbInfo.encrypted ? (
          <Banner tone="warning">Encryption needs the installed app build (APK/TestFlight). It is not available inside Expo Go.</Banner>
        ) : null}
        <Choice
          label="Lock after leaving the app"
          options={Object.keys(TIMEOUTS)}
          value={timeout}
          allowClear={false}
          onChange={async (v) => {
            if (!v) return;
            setTimeoutState(v);
            await setLockTimeout(TIMEOUTS[v]);
          }}
        />
        {bioAvail ? (
          <Toggle
            label="Unlock with fingerprint / Face ID"
            value={bio}
            onChange={async (v) => {
              setBio(v);
              await setBiometricsEnabled(v);
            }}
          />
        ) : null}
        <Toggle
          label="Allow screenshots"
          description="Off by default so client data cannot be captured or shown in the app switcher."
          value={shots}
          onChange={async (v) => {
            setShots(v);
            await repo.setSetting('allow_screenshots', v ? '1' : '0');
            await applyScreenProtection(!v);
          }}
        />
      </Card>

      <Card>
        <Text style={T.h3}>Change PIN</Text>
        <Field label="Current PIN" value={oldPin} onChangeText={(t) => setOldPin(t.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" secureTextEntry />
        <Field label="New PIN" value={newPin} onChangeText={(t) => setNewPin(t.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" secureTextEntry />
        <Button
          title="Change PIN"
          variant="secondary"
          small
          disabled={oldPin.length !== 6 || newPin.length !== 6}
          onPress={async () => {
            const p = pinProblems(newPin);
            if (p) return setPinMsg(p);
            const r = await tryPin(oldPin);
            if (!r.ok) return setPinMsg('Current PIN is incorrect');
            await setPin(newPin);
            setOldPin('');
            setNewPin('');
            setPinMsg('PIN changed');
          }}
        />
        {pinMsg ? <Text style={T.small}>{pinMsg}</Text> : null}
      </Card>

      <SectionTitle>Data</SectionTitle>
      <Card>
        <Button
          title="Load fictional demo clients"
          variant="secondary"
          icon="flask-outline"
          loading={busy === 'seed'}
          onPress={async () => {
            setBusy('seed');
            try {
              const n = await seedDemo(repo);
              bump();
              Alert.alert('Demo data', n ? `${n} fictional client(s) added.` : 'Demo clients already exist.');
            } catch (e) {
              Alert.alert('Failed', errMsg(e));
            } finally {
              setBusy(null);
            }
          }}
        />
        <Button title="Delete all data on this phone" variant="danger" icon="nuclear-outline" onPress={wipe} />
      </Card>

      <Text style={[T.small, { textAlign: 'center' }]}>
        Mortgage Options {Constants.expoConfig?.version ?? ''} · {String(Constants.expoConfig?.extra?.variant ?? '')} build · DB schema v{dbInfo.schemaVersion}
      </Text>
    </Screen>
  );
}
