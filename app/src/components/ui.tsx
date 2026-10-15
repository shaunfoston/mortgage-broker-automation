import React from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, R, S, T } from '../lib/theme.ts';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

export function Screen({ children, scroll = true, padded = true }: { children: React.ReactNode; scroll?: boolean; padded?: boolean }) {
  const inner = <View style={[{ gap: S.md }, padded && { padding: S.lg, paddingBottom: S.xxl * 2 }]}>{children}</View>;
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.surface }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      {scroll ? (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1 }}>
          {inner}
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>{inner}</View>
      )}
    </KeyboardAvoidingView>
  );
}

export function Card({ children, style, onPress, accessibilityLabel }: { children: React.ReactNode; style?: ViewStyle; onPress?: () => void; accessibilityLabel?: string }) {
  const body = <View style={[styles.card, style]}>{children}</View>;
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel} style={({ pressed }) => [pressed && { opacity: 0.85 }]}>
      {body}
    </Pressable>
  );
}

type BtnVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'dark';

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
  small,
  testID,
}: {
  title: string;
  onPress: () => void | Promise<void>;
  variant?: BtnVariant;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  small?: boolean;
  testID?: string;
}) {
  const v = BTN[variant];
  const off = disabled || loading;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      onPress={off ? undefined : onPress}
      style={({ pressed }) => [
        styles.btn,
        small && styles.btnSmall,
        { backgroundColor: v.bg, borderColor: v.border },
        pressed && !off && { backgroundColor: v.pressed },
        off && { opacity: 0.5 },
      ]}
    >
      {loading ? <ActivityIndicator color={v.fg} /> : icon ? <Ionicons name={icon} size={small ? 16 : 19} color={v.fg} /> : null}
      <Text style={[styles.btnText, small && { fontSize: 14 }, { color: v.fg }]}>{title}</Text>
    </Pressable>
  );
}

const BTN: Record<BtnVariant, { bg: string; fg: string; border: string; pressed: string }> = {
  primary: { bg: C.royal, fg: C.white, border: C.royal, pressed: C.royalDark },
  secondary: { bg: C.white, fg: C.royal, border: C.royal, pressed: C.royalTint },
  danger: { bg: C.white, fg: C.danger, border: C.danger, pressed: C.dangerTint },
  ghost: { bg: 'transparent', fg: C.royal, border: 'transparent', pressed: C.royalTint },
  dark: { bg: C.graphite2, fg: C.white, border: C.graphite2, pressed: C.graphite },
};

export function Field({
  label,
  error,
  hint,
  suffix,
  badge,
  ...rest
}: TextInputProps & { label: string; error?: string; hint?: string; suffix?: string; badge?: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text style={styles.fieldLabel}>{label}</Text>
        {badge}
      </View>
      <View style={[styles.inputWrap, error ? { borderColor: C.danger } : null]}>
        <TextInput
          placeholderTextColor={C.muted}
          accessibilityLabel={label}
          style={[styles.input, rest.multiline && { minHeight: 84, textAlignVertical: 'top' }]}
          {...rest}
        />
        {suffix ? <Text style={styles.suffix}>{suffix}</Text> : null}
      </View>
      {error ? <Text style={{ color: C.danger, fontSize: 13 }}>{error}</Text> : hint ? <Text style={T.small}>{hint}</Text> : null}
    </View>
  );
}

export function Choice({
  label,
  options,
  value,
  onChange,
  error,
  badge,
  allowClear = true,
}: {
  label: string;
  options: readonly string[];
  value: string | null;
  onChange: (v: string | null) => void;
  error?: string;
  badge?: React.ReactNode;
  allowClear?: boolean;
}) {
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text style={styles.fieldLabel}>{label}</Text>
        {badge}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {options.map((o) => {
          const on = value === o;
          return (
            <Pressable
              key={o}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              onPress={() => onChange(on && allowClear ? null : o)}
              style={[styles.chip, on && styles.chipOn]}
            >
              <Text style={[styles.chipText, on && { color: C.white }]}>{o}</Text>
            </Pressable>
          );
        })}
      </View>
      {error ? <Text style={{ color: C.danger, fontSize: 13 }}>{error}</Text> : null}
    </View>
  );
}

export function Toggle({ label, value, onChange, description }: { label: string; value: boolean; onChange: (v: boolean) => void; description?: string }) {
  return (
    <Pressable onPress={() => onChange(!value)} accessibilityRole="checkbox" accessibilityState={{ checked: value }} style={styles.toggleRow}>
      <Ionicons name={value ? 'checkbox' : 'square-outline'} size={26} color={value ? C.royal : C.slate} />
      <View style={{ flex: 1 }}>
        <Text style={T.body}>{label}</Text>
        {description ? <Text style={T.small}>{description}</Text> : null}
      </View>
    </Pressable>
  );
}

export function Badge({ text, tone = 'info' }: { text: string; tone?: 'info' | 'success' | 'warning' | 'danger' | 'neutral' | 'ai' }) {
  const t = {
    info: [C.royalTint, C.royal],
    ai: [C.royalTint, C.royal],
    success: [C.successTint, C.success],
    warning: [C.warningTint, C.warning],
    danger: [C.dangerTint, C.danger],
    neutral: ['#EEF1F5', C.slate],
  }[tone];
  return (
    <View style={{ backgroundColor: t[0], borderRadius: R.pill, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start' }}>
      <Text style={{ color: t[1], fontSize: 11, fontWeight: '800', letterSpacing: 0.3 }}>{text}</Text>
    </View>
  );
}

export function Banner({ tone = 'info', title, children, icon }: { tone?: 'info' | 'success' | 'warning' | 'danger'; title?: string; children?: React.ReactNode; icon?: IconName }) {
  const t = { info: [C.royalTint, C.royal], success: [C.successTint, C.success], warning: [C.warningTint, C.warning], danger: [C.dangerTint, C.danger] }[tone];
  const ic: IconName = icon ?? (tone === 'success' ? 'checkmark-circle' : tone === 'info' ? 'information-circle' : 'warning');
  return (
    <View style={{ backgroundColor: t[0], borderRadius: R.md, padding: S.md, flexDirection: 'row', gap: 10 }} accessibilityRole="alert">
      <Ionicons name={ic} size={20} color={t[1]} />
      <View style={{ flex: 1, gap: 2 }}>
        {title ? <Text style={{ color: t[1], fontWeight: '800', fontSize: 14 }}>{title}</Text> : null}
        {typeof children === 'string' ? <Text style={{ color: C.graphite2, fontSize: 14, lineHeight: 20 }}>{children}</Text> : children}
      </View>
    </View>
  );
}

export function ProgressBar({ percent, color = C.royal }: { percent: number; color?: string }) {
  return (
    <View style={{ height: 8, backgroundColor: '#E3E8F0', borderRadius: 4, overflow: 'hidden' }} accessibilityRole="progressbar" accessibilityValue={{ now: percent, min: 0, max: 100 }}>
      <View style={{ width: `${Math.max(0, Math.min(100, percent))}%`, height: '100%', backgroundColor: color }} />
    </View>
  );
}

export function ListRow({
  title,
  subtitle,
  icon,
  right,
  onPress,
  testID,
}: {
  title: string;
  subtitle?: string;
  icon?: IconName;
  right?: React.ReactNode;
  onPress?: () => void;
  testID?: string;
}) {
  return (
    <Pressable testID={testID} onPress={onPress} accessibilityRole={onPress ? 'button' : undefined} style={({ pressed }) => [styles.row, pressed && onPress && { backgroundColor: '#F7F9FC' }]}>
      {icon ? (
        <View style={styles.rowIcon}>
          <Ionicons name={icon} size={20} color={C.royal} />
        </View>
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[T.body, { fontWeight: '600' }]} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={T.small} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
      {onPress ? <Ionicons name="chevron-forward" size={18} color={C.muted} /> : null}
    </Pressable>
  );
}

export function SectionTitle({ children, right }: { children: string; right?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: S.sm }}>
      <Text style={T.label}>{children}</Text>
      {right}
    </View>
  );
}

export function Empty({ icon, title, text }: { icon: IconName; title: string; text?: string }) {
  return (
    <View style={{ alignItems: 'center', padding: S.xl, gap: 8 }}>
      <Ionicons name={icon} size={36} color={C.muted} />
      <Text style={T.h3}>{title}</Text>
      {text ? <Text style={[T.small, { textAlign: 'center' }]}>{text}</Text> : null}
    </View>
  );
}

export function Loading() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: S.xl, backgroundColor: C.surface }}>
      <ActivityIndicator color={C.royal} size="large" />
    </View>
  );
}

export function Divider() {
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: C.line }} />;
}

export const styles = StyleSheet.create({
  card: { backgroundColor: C.white, borderRadius: R.lg, padding: S.lg, gap: S.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: C.line },
  btn: { minHeight: 50, borderRadius: R.md, borderWidth: 1.5, paddingHorizontal: S.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  btnSmall: { minHeight: 38, paddingHorizontal: S.md },
  btnText: { fontSize: 16, fontWeight: '700' },
  fieldLabel: { fontSize: 14, fontWeight: '600', color: C.graphite2 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: R.md },
  input: { flex: 1, minHeight: 48, paddingHorizontal: S.md, paddingVertical: 10, fontSize: 16, color: C.graphite },
  suffix: { paddingRight: S.md, color: C.slate, fontSize: 14 },
  chip: { borderWidth: 1, borderColor: C.line, backgroundColor: C.white, borderRadius: R.pill, paddingHorizontal: 14, paddingVertical: 9, minHeight: 40, justifyContent: 'center' },
  chipOn: { backgroundColor: C.royal, borderColor: C.royal },
  chipText: { color: C.graphite2, fontSize: 14, fontWeight: '600' },
  toggleRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingVertical: 8, minHeight: 44 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: S.md, minHeight: 56, backgroundColor: C.white },
  rowIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.royalTint, alignItems: 'center', justifyContent: 'center' },
});
