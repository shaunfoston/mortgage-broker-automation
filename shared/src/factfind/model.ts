import { SECTIONS, parsePath, type FieldDef, type Owner, type SectionDef } from './schema.ts';
import { coerceValue, type FieldValue } from './values.ts';

export type Row = Record<string, FieldValue>;
export type SectionData = Row | Row[];
export type OwnerData = Record<string, SectionData>;

export interface FactFind {
  version: 1;
  numApplicants: 1 | 2;
  a1: OwnerData;
  a2: OwnerData;
  case: OwnerData;
}

export interface Provenance {
  source: 'manual' | 'ai';
  at: string;
  by: string;
  /** For AI-sourced values: which extraction/recording produced it. */
  extractionId?: string;
  confidence?: number;
}

export type ProvenanceMap = Record<string, Provenance>;

export function emptyFactFind(numApplicants: 1 | 2 = 1): FactFind {
  return { version: 1, numApplicants, a1: {}, a2: {}, case: {} };
}

/** Defensive parse of stored JSON (tolerates partial / older documents). */
export function parseFactFind(json: string | null | undefined, numApplicants: 1 | 2 = 1): FactFind {
  if (!json) return emptyFactFind(numApplicants);
  try {
    const v = JSON.parse(json);
    if (!v || typeof v !== 'object') return emptyFactFind(numApplicants);
    return {
      version: 1,
      numApplicants: v.numApplicants === 2 ? 2 : 1,
      a1: isObj(v.a1) ? v.a1 : {},
      a2: isObj(v.a2) ? v.a2 : {},
      case: isObj(v.case) ? v.case : {},
    };
  } catch {
    return emptyFactFind(numApplicants);
  }
}

function isObj(x: unknown): x is Record<string, any> {
  return !!x && typeof x === 'object' && !Array.isArray(x);
}

export function getValue(ff: FactFind, path: string): FieldValue {
  const p = parsePath(path);
  if (!p || !p.field) return null;
  const sec = ff[p.owner][p.section.id];
  if (!isObj(sec)) return null;
  const v = (sec as Row)[p.field.key];
  return v === undefined ? null : v;
}

export function getList(ff: FactFind, path: string): Row[] {
  const p = parsePath(path);
  if (!p || p.field || p.section.kind !== 'list') return [];
  const v = ff[p.owner][p.section.id];
  return Array.isArray(v) ? v : [];
}

/** Immutable set of a scalar field. Value must already be coerced. */
export function setValue(ff: FactFind, path: string, value: FieldValue): FactFind {
  const p = parsePath(path);
  if (!p || !p.field) throw new Error(`Unknown field path: ${path}`);
  const ownerData = { ...ff[p.owner] };
  const prev = isObj(ownerData[p.section.id]) ? (ownerData[p.section.id] as Row) : {};
  const next: Row = { ...prev };
  if (value === null) delete next[p.field.key];
  else next[p.field.key] = value;
  ownerData[p.section.id] = next;
  return { ...ff, [p.owner]: ownerData };
}

export function setList(ff: FactFind, path: string, rows: Row[]): FactFind {
  const p = parsePath(path);
  if (!p || p.field || p.section.kind !== 'list') throw new Error(`Unknown list path: ${path}`);
  return { ...ff, [p.owner]: { ...ff[p.owner], [p.section.id]: rows } };
}

/** Coerce and validate every field of a list row. */
export function coerceRow(section: SectionDef, raw: Record<string, unknown>): { row: Row; errors: Record<string, string> } {
  const row: Row = {};
  const errors: Record<string, string> = {};
  for (const f of section.fields) {
    const r = coerceValue(f, raw[f.key]);
    if (!r.ok) errors[f.key] = r.error;
    else if (r.value !== null) row[f.key] = r.value;
  }
  for (const f of section.fields) if (f.required && row[f.key] === undefined && !errors[f.key]) errors[f.key] = 'Required';
  return { row, errors };
}

export function owners(ff: FactFind): Owner[] {
  return ff.numApplicants === 2 ? ['a1', 'a2', 'case'] : ['a1', 'case'];
}

export interface SectionProgress {
  owner: Owner;
  section: SectionDef;
  filled: number;
  total: number;
  requiredMissing: FieldDef[];
  complete: boolean;
}

export function sectionProgress(ff: FactFind, owner: Owner, section: SectionDef): SectionProgress {
  if (section.kind === 'list') {
    const rows = getList(ff, `${owner}.${section.id}`);
    // A list section counts as "complete" once the broker has visited it (rows or explicit "none").
    const none = ff[owner][`${section.id}__none`] as unknown;
    const complete = rows.length > 0 || none === true;
    return { owner, section, filled: rows.length, total: rows.length, requiredMissing: [], complete };
  }
  const data = (isObj(ff[owner][section.id]) ? ff[owner][section.id] : {}) as Row;
  const filled = section.fields.filter((f) => data[f.key] !== undefined && data[f.key] !== null && data[f.key] !== '').length;
  const requiredMissing = section.fields.filter((f) => f.required && (data[f.key] === undefined || data[f.key] === null || data[f.key] === ''));
  const complete = requiredMissing.length === 0 && filled > 0;
  return { owner, section, filled, total: section.fields.length, requiredMissing, complete };
}

export function overallProgress(ff: FactFind): { complete: number; total: number; percent: number; sections: SectionProgress[] } {
  const sections: SectionProgress[] = [];
  for (const o of owners(ff)) {
    for (const s of SECTIONS) {
      if ((o === 'case') !== (s.scope === 'case')) continue;
      sections.push(sectionProgress(ff, o, s));
    }
  }
  const complete = sections.filter((s) => s.complete).length;
  return { complete, total: sections.length, percent: Math.round((complete / sections.length) * 100), sections };
}

/** Mark a list section as explicitly "none" (e.g. no credit commitments). */
export function setListNone(ff: FactFind, path: string, none: boolean): FactFind {
  const p = parsePath(path);
  if (!p || p.field || p.section.kind !== 'list') throw new Error(`Unknown list path: ${path}`);
  const ownerData: any = { ...ff[p.owner] };
  if (none) ownerData[`${p.section.id}__none`] = true;
  else delete ownerData[`${p.section.id}__none`];
  return { ...ff, [p.owner]: ownerData };
}

export function isListNone(ff: FactFind, path: string): boolean {
  const p = parsePath(path);
  if (!p) return false;
  return (ff[p.owner] as any)[`${p.section.id}__none`] === true;
}

// ───────────────────────────── Indicative metrics ─────────────────────────────

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

export interface Metrics {
  grossAnnualIncome: number;
  otherIncomeMonthly: number;
  monthlyExpenditure: number;
  monthlyCreditCommitments: number;
  creditCommitmentsAfterCompletion: number;
  totalDebtBalance: number;
  loanAmount: number | null;
  propertyValue: number | null;
  ltvPercent: number | null;
  loanToIncome: number | null;
  depositPercent: number | null;
}

/** Gross annual employment income used for an indicative loan-to-income ratio. */
export function applicantGrossIncome(ff: FactFind, owner: 'a1' | 'a2'): number {
  const e = (isObj(ff[owner].employment) ? ff[owner].employment : {}) as Row;
  const status = String(e.status ?? '');
  const selfEmployed = /Self-employed|director|Contractor/i.test(status);
  if (selfEmployed && num(e.netProfitLatest) > 0) {
    const latest = num(e.netProfitLatest);
    const prev = num(e.netProfitPrevious);
    // Many lenders use the lower or the average of the last two years — use the lower, conservatively.
    return prev > 0 ? Math.min(latest, prev) : latest;
  }
  return num(e.basicSalary) + num(e.guaranteedOvertime) + num(e.regularOvertime) + num(e.bonus) + num(e.commission);
}

export function computeMetrics(ff: FactFind): Metrics {
  const appOwners: ('a1' | 'a2')[] = ff.numApplicants === 2 ? ['a1', 'a2'] : ['a1'];
  let gross = 0;
  let otherMonthly = 0;
  let commitments = 0;
  let commitmentsAfter = 0;
  let balance = 0;
  for (const o of appOwners) {
    gross += applicantGrossIncome(ff, o);
    for (const r of getList(ff, `${o}.otherIncome`)) otherMonthly += num(r.amountMonthly);
    for (const r of getList(ff, `${o}.liabilities`)) {
      commitments += num(r.monthlyPayment);
      balance += num(r.balance);
      if (r.repayBeforeCompletion !== 'yes') commitmentsAfter += num(r.monthlyPayment);
    }
  }
  const exp = (isObj(ff.case.expenditure) ? ff.case.expenditure : {}) as Row;
  let expenditure = 0;
  for (const [k, v] of Object.entries(exp)) if (k !== 'notes') expenditure += num(v);

  const mort = (isObj(ff.case.mortgage) ? ff.case.mortgage : {}) as Row;
  const prop = (isObj(ff.case.property) ? ff.case.property : {}) as Row;
  const dep = (isObj(ff.case.deposit) ? ff.case.deposit : {}) as Row;
  const loan = num(mort.loanAmount) || null;
  const value = num(prop.purchasePrice) || num(prop.estimatedValue) || null;
  const round1 = (n: number) => Math.round(n * 10) / 10;
  const round2 = (n: number) => Math.round(n * 100) / 100;
  return {
    grossAnnualIncome: gross,
    otherIncomeMonthly: otherMonthly,
    monthlyExpenditure: expenditure,
    monthlyCreditCommitments: commitments,
    creditCommitmentsAfterCompletion: commitmentsAfter,
    totalDebtBalance: balance,
    loanAmount: loan,
    propertyValue: value,
    ltvPercent: loan && value ? round1((loan / value) * 100) : null,
    loanToIncome: loan && gross > 0 ? round2(loan / gross) : null,
    depositPercent: value && num(dep.amount) > 0 ? round1((num(dep.amount) / value) * 100) : null,
  };
}

/** Name used across the app for applicant 1 (falls back gracefully). */
export function applicantName(ff: FactFind, owner: 'a1' | 'a2'): string {
  const p = (isObj(ff[owner].personal) ? ff[owner].personal : {}) as Row;
  return [p.firstName, p.lastName].filter(Boolean).join(' ');
}
