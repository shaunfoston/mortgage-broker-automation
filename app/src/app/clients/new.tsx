import React, { useState } from 'react';
import { router } from 'expo-router';
import { getSection } from '@mortgage-options/shared/factfind/schema.ts';
import { ValidationError } from '@mortgage-options/shared/db/repo.ts';
import { useApp } from '../../lib/app.tsx';
import { errMsg } from '../../lib/format.ts';
import { Banner, Button, Choice, Field, Screen } from '../../components/ui.tsx';

const PURPOSES = getSection('mortgage')!.fields.find((f) => f.key === 'purpose')!.options!;

export default function NewClient() {
  const { repo, bump } = useApp();
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [purpose, setPurpose] = useState<string | null>('First-time purchase');
  const [joint, setJoint] = useState<string | null>('Single applicant');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    setErrors({});
    setMsg(null);
    try {
      const c = await repo.createClient({ firstName: first, lastName: last, email, phone });
      const k = await repo.createCase(c.id, { purpose: purpose ?? undefined, numApplicants: joint === 'Joint (2 applicants)' ? 2 : 1 });
      bump();
      router.replace({ pathname: '/cases/[id]', params: { id: k.id } });
    } catch (e) {
      if (e instanceof ValidationError) setErrors(e.fields);
      setMsg(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Banner tone="warning">Use fictional details only while testing.</Banner>
      <Field label="First name" value={first} onChangeText={setFirst} error={errors.firstName} autoCapitalize="words" testID="first-name" />
      <Field label="Surname" value={last} onChangeText={setLast} error={errors.lastName} autoCapitalize="words" testID="last-name" />
      <Field label="Email (optional)" value={email} onChangeText={setEmail} error={errors.email} keyboardType="email-address" autoCapitalize="none" />
      <Field label="Mobile (optional)" value={phone} onChangeText={setPhone} error={errors.phone} keyboardType="phone-pad" />
      <Choice label="Mortgage purpose" options={PURPOSES} value={purpose} onChange={setPurpose} />
      <Choice label="Applicants" options={['Single applicant', 'Joint (2 applicants)']} value={joint} onChange={setJoint} allowClear={false} />
      {msg ? <Banner tone="danger">{msg}</Banner> : null}
      <Button title="Create client and case" icon="checkmark" onPress={save} loading={busy} testID="create-client" />
    </Screen>
  );
}
