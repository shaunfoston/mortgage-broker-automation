import React from 'react';
import type { FieldDef } from '@mortgage-options/shared/factfind/schema.ts';
import { Badge, Choice, Field } from './ui.tsx';

const PERIOD: Record<string, string> = { annual: 'per year', monthly: 'per month', 'one-off': '' };

export function FieldEditor({ field, value, onChange, error, source }: { field: FieldDef; value: string; onChange: (v: string) => void; error?: string; source?: 'ai' | 'manual' }) {
  const badge = source === 'ai' ? <Badge text="AI · reviewed" tone="ai" /> : field.required ? <Badge text="Required" tone="neutral" /> : undefined;
  switch (field.type) {
    case 'select':
      return <Choice label={field.label} options={field.options ?? []} value={value || null} onChange={(v) => onChange(v ?? '')} error={error} badge={badge} />;
    case 'yesno':
      return (
        <Choice
          label={field.label}
          options={['Yes', 'No']}
          value={value === 'yes' ? 'Yes' : value === 'no' ? 'No' : null}
          onChange={(v) => onChange(v === 'Yes' ? 'yes' : v === 'No' ? 'no' : '')}
          error={error}
          badge={badge}
        />
      );
    case 'textarea':
      return <Field label={field.label} value={value} onChangeText={onChange} error={error} hint={field.help} badge={badge} multiline />;
    case 'currency':
      return (
        <Field
          label={`${field.label} (£)`}
          value={value}
          onChangeText={onChange}
          error={error}
          hint={field.help}
          badge={badge}
          keyboardType="decimal-pad"
          suffix={PERIOD[field.period ?? 'one-off']}
          placeholder="0"
        />
      );
    case 'number':
    case 'percent':
      return <Field label={field.label} value={value} onChangeText={onChange} error={error} hint={field.help} badge={badge} keyboardType="decimal-pad" suffix={field.type === 'percent' ? '%' : undefined} />;
    case 'date':
      return <Field label={field.label} value={value} onChangeText={onChange} error={error} hint={field.help} badge={badge} placeholder="DD/MM/YYYY" keyboardType="numbers-and-punctuation" maxLength={10} />;
    case 'email':
      return <Field label={field.label} value={value} onChangeText={onChange} error={error} badge={badge} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />;
    case 'phone':
      return <Field label={field.label} value={value} onChangeText={onChange} error={error} badge={badge} keyboardType="phone-pad" />;
    case 'postcode':
      return <Field label={field.label} value={value} onChangeText={onChange} error={error} badge={badge} autoCapitalize="characters" autoCorrect={false} maxLength={8} />;
    default:
      return <Field label={field.label} value={value} onChangeText={onChange} error={error} hint={field.help} badge={badge} autoCapitalize="words" />;
  }
}
