import { BRAND } from '@mortgage-options/shared/brand.ts';

export const C = {
  royal: BRAND.royal,
  royalDark: BRAND.royalDark,
  royalTint: BRAND.royalTint,
  graphite: BRAND.graphite,
  graphite2: BRAND.graphite2,
  slate: BRAND.slate,
  line: BRAND.line,
  surface: BRAND.surface,
  white: BRAND.white,
  success: BRAND.success,
  successTint: BRAND.successTint,
  warning: BRAND.warning,
  warningTint: BRAND.warningTint,
  danger: BRAND.danger,
  dangerTint: BRAND.dangerTint,
  muted: '#8A94A3',
};

export const S = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const R = { sm: 6, md: 10, lg: 14, pill: 999 };

export const T = {
  h1: { fontSize: 26, fontWeight: '800' as const, color: C.graphite, letterSpacing: -0.4 },
  h2: { fontSize: 20, fontWeight: '800' as const, color: C.graphite, letterSpacing: -0.2 },
  h3: { fontSize: 16, fontWeight: '700' as const, color: C.graphite },
  body: { fontSize: 15, color: C.graphite, lineHeight: 21 },
  small: { fontSize: 13, color: C.slate, lineHeight: 18 },
  label: { fontSize: 12, fontWeight: '700' as const, color: C.slate, letterSpacing: 0.5, textTransform: 'uppercase' as const },
};
