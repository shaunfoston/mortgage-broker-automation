import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../lib/app.tsx';
import { biometricsAvailable, biometricsEnabled, lockoutRemaining, pinProblems, setBiometricsEnabled, setPin, tryPin, unlockWithBiometrics } from '../lib/lock.ts';
import { C, R, S, T } from '../lib/theme.ts';
import { Wordmark } from './Brand.tsx';
import { Banner, Button, Field, Screen, Toggle } from './ui.tsx';

function PinDots({ length }: { length: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 14, justifyContent: 'center', marginVertical: S.lg }} accessibilityLabel={`${length} of 6 digits entered`}>
      {Array.from({ length: 6 }, (_, i) => (
        <View key={i} style={{ width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: C.white, backgroundColor: i < length ? C.white : 'transparent' }} />
      ))}
    </View>
  );
}

function Keypad({ onDigit, onDelete, onBio }: { onDigit: (d: string) => void; onDelete: () => void; onBio?: () => void }) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'bio', '0', 'del'];
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: 300, alignSelf: 'center', gap: 18, justifyContent: 'center' }}>
      {keys.map((k) => {
        if (k === 'bio' && !onBio) return <View key={k} style={{ width: 76, height: 76 }} />;
        const label = k === 'del' ? 'Delete' : k === 'bio' ? 'Biometric unlock' : k;
        return (
          <Pressable
            key={k}
            accessibilityRole="button"
            accessibilityLabel={label}
            onPress={() => (k === 'del' ? onDelete() : k === 'bio' ? onBio?.() : onDigit(k))}
            style={({ pressed }) => ({
              width: 76,
              height: 76,
              borderRadius: 38,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: pressed ? 'rgba(255,255,255,0.25)' : k === 'del' || k === 'bio' ? 'transparent' : 'rgba(255,255,255,0.1)',
            })}
          >
            {k === 'del' ? (
              <Ionicons name="backspace-outline" size={28} color={C.white} />
            ) : k === 'bio' ? (
              <Ionicons name="finger-print" size={30} color={C.white} />
            ) : (
              <Text style={{ color: C.white, fontSize: 30, fontWeight: '600' }}>{k}</Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

export function LockScreen() {
  const { unlock } = useApp();
  const [pin, setPinState] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [bio, setBio] = useState(false);

  useEffect(() => {
    (async () => {
      const on = (await biometricsEnabled()) && (await biometricsAvailable());
      setBio(on);
      const wait = await lockoutRemaining();
      if (wait) setMsg(`Too many attempts. Try again in ${wait} s.`);
      else if (on && (await unlockWithBiometrics())) unlock();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (p: string) => {
    setBusy(true);
    const r = await tryPin(p);
    setBusy(false);
    setPinState('');
    if (r.ok) return unlock();
    if (r.waitSeconds) setMsg(`Too many attempts. Try again in ${r.waitSeconds >= 60 ? `${Math.ceil(r.waitSeconds / 60)} min` : `${r.waitSeconds} s`}.`);
    else setMsg(`Incorrect PIN.${r.attemptsLeft !== null ? ` ${r.attemptsLeft} attempt${r.attemptsLeft === 1 ? '' : 's'} before a delay.` : ''}`);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.graphite, justifyContent: 'center', padding: S.xl }}>
      <View style={{ alignItems: 'center', gap: S.sm }}>
        <Wordmark size={44} light />
        <Text style={{ color: '#C9D1DC', marginTop: S.lg, fontSize: 16 }}>{busy ? 'Checking…' : 'Enter your PIN'}</Text>
        <PinDots length={pin.length} />
        <Text style={{ color: '#FFB4AB', minHeight: 22, textAlign: 'center' }} accessibilityLiveRegion="polite">
          {msg ?? ''}
        </Text>
      </View>
      <Keypad
        onDigit={(d) => {
          if (busy || pin.length >= 6) return;
          const next = pin + d;
          setPinState(next);
          if (next.length === 6) submit(next);
        }}
        onDelete={() => setPinState((p) => p.slice(0, -1))}
        onBio={bio ? async () => (await unlockWithBiometrics()) && unlock() : undefined}
      />
    </SafeAreaView>
  );
}

export function SetupScreen() {
  const { setBrokerName, markPinSet, unlock, repo } = useApp();
  const [name, setName] = useState('');
  const [pin1, setPin1] = useState('');
  const [pin2, setPin2] = useState('');
  const [bioAvail, setBioAvail] = useState(false);
  const [bio, setBio] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    biometricsAvailable().then(setBioAvail);
  }, []);

  const save = async () => {
    setErr(null);
    if (name.trim().length < 2) return setErr('Enter your name as it should appear on records');
    const p = pinProblems(pin1);
    if (p) return setErr(p);
    if (pin1 !== pin2) return setErr('PINs do not match');
    setBusy(true);
    try {
      await setBrokerName(name);
      await setPin(pin1);
      await setBiometricsEnabled(bio);
      await repo.audit({ action: 'app.pin_set', entityType: 'app', entityId: null, caseId: null });
      markPinSet();
      unlock();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <View style={{ paddingTop: S.xxl, gap: S.md }}>
        <Wordmark size={44} />
        <Text style={T.h1}>Welcome</Text>
        <Text style={T.body}>Set up this device. Client data is stored encrypted on this phone and protected by your PIN.</Text>
      </View>
      <Banner tone="warning" title="Test with fictional clients only">
        This build has not yet had a professional security and compliance review. Do not enter real client data until it has.
      </Banner>
      <Field label="Your name (adviser)" value={name} onChangeText={setName} autoCapitalize="words" placeholder="e.g. Alan Smith" />
      <Field label="Choose a 6-digit PIN" value={pin1} onChangeText={(t) => setPin1(t.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" secureTextEntry maxLength={6} />
      <Field label="Confirm PIN" value={pin2} onChangeText={(t) => setPin2(t.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" secureTextEntry maxLength={6} />
      {bioAvail ? <Toggle label="Also allow fingerprint / Face ID unlock" value={bio} onChange={setBio} /> : null}
      {err ? <Banner tone="danger">{err}</Banner> : null}
      <View style={{ borderRadius: R.md }}>
        <Button title="Set up and continue" icon="lock-closed" onPress={save} loading={busy} testID="setup-continue" />
      </View>
    </Screen>
  );
}
