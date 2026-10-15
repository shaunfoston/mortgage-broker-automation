/**
 * UK residential / buy-to-let mortgage fact-find definition.
 *
 * One schema drives: the app's forms, validation, completeness tracking,
 * the AI extraction contract (which paths Claude may propose), and the PDF.
 *
 * Paths:
 *   a1.<section>.<field>   applicant 1 scalar field
 *   a2.<section>.<field>   applicant 2 scalar field
 *   case.<section>.<field> case-level scalar field
 *   a1.<listSection>       applicant list (e.g. a1.liabilities)
 *   case.<listSection>     case list (e.g. case.dependants)
 */

export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'currency'
  | 'percent'
  | 'date'
  | 'select'
  | 'yesno'
  | 'email'
  | 'phone'
  | 'postcode';

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  options?: readonly string[];
  required?: boolean;
  help?: string;
  /** Unit hint shown next to currency fields ("per year", "per month"). */
  period?: 'annual' | 'monthly' | 'one-off';
  /** false = never auto-proposed by AI (sensitive / judgement fields). */
  aiExtract?: boolean;
}

export type SectionScope = 'applicant' | 'case';
export type SectionKind = 'fields' | 'list';

export interface SectionDef {
  id: string;
  title: string;
  scope: SectionScope;
  kind: SectionKind;
  description?: string;
  /** For list sections: the noun for one row ("Liability"). */
  itemLabel?: string;
  fields: readonly FieldDef[];
}

export const TITLES = ['Mr', 'Mrs', 'Miss', 'Ms', 'Mx', 'Dr', 'Other'] as const;

export const SECTIONS: readonly SectionDef[] = [
  // ───────────────────────────── Applicant ─────────────────────────────
  {
    id: 'personal',
    title: 'Personal details',
    scope: 'applicant',
    kind: 'fields',
    fields: [
      { key: 'title', label: 'Title', type: 'select', options: TITLES },
      { key: 'firstName', label: 'First name', type: 'text', required: true },
      { key: 'middleNames', label: 'Middle name(s)', type: 'text' },
      { key: 'lastName', label: 'Surname', type: 'text', required: true },
      { key: 'previousNames', label: 'Previous names (last 6 years)', type: 'text' },
      { key: 'dateOfBirth', label: 'Date of birth', type: 'date', required: true },
      {
        key: 'maritalStatus',
        label: 'Marital status',
        type: 'select',
        options: ['Single', 'Married', 'Civil partnership', 'Cohabiting', 'Separated', 'Divorced', 'Widowed'],
      },
      { key: 'nationality', label: 'Nationality', type: 'text' },
      {
        key: 'residencyStatus',
        label: 'UK residency',
        type: 'select',
        options: ['UK/Irish citizen', 'Settled status', 'Pre-settled status', 'Visa holder', 'Other'],
        help: 'Lenders apply different criteria. Record only what the client confirms.',
      },
      { key: 'yearsInUk', label: 'Years living in UK (if not since birth)', type: 'number' },
      { key: 'smoker', label: 'Smoker / vaper (last 12 months)', type: 'yesno', help: 'Relevant to protection quotes.' },
      { key: 'intendedRetirementAge', label: 'Intended retirement age', type: 'number' },
    ],
  },
  {
    id: 'contact',
    title: 'Contact & address',
    scope: 'applicant',
    kind: 'fields',
    fields: [
      { key: 'email', label: 'Email', type: 'email' },
      { key: 'mobile', label: 'Mobile phone', type: 'phone', required: true },
      { key: 'homePhone', label: 'Home phone', type: 'phone' },
      { key: 'preferredContact', label: 'Preferred contact method', type: 'select', options: ['Phone', 'Email', 'Text', 'Post'] },
      { key: 'currentAddress', label: 'Current address', type: 'textarea', required: true },
      { key: 'postcode', label: 'Postcode', type: 'postcode', required: true },
      { key: 'movedInDate', label: 'Moved in (date)', type: 'date' },
      {
        key: 'residentialStatus',
        label: 'Residential status',
        type: 'select',
        options: ['Homeowner with mortgage', 'Homeowner outright', 'Renting privately', 'Renting council/HA', 'Living with family', 'Other'],
      },
      { key: 'currentRentMonthly', label: 'Current rent', type: 'currency', period: 'monthly' },
    ],
  },
  {
    id: 'addressHistory',
    title: 'Previous addresses (3 years)',
    scope: 'applicant',
    kind: 'list',
    itemLabel: 'Previous address',
    description: 'Lenders typically require a full 3-year address history.',
    fields: [
      { key: 'address', label: 'Address', type: 'textarea', required: true },
      { key: 'postcode', label: 'Postcode', type: 'postcode' },
      { key: 'from', label: 'From', type: 'date' },
      { key: 'to', label: 'To', type: 'date' },
    ],
  },
  {
    id: 'employment',
    title: 'Employment & income',
    scope: 'applicant',
    kind: 'fields',
    fields: [
      {
        key: 'status',
        label: 'Employment status',
        type: 'select',
        required: true,
        options: ['Employed', 'Self-employed (sole trader)', 'Company director', 'Contractor', 'Retired', 'Not working', 'Homemaker', 'Student'],
      },
      { key: 'occupation', label: 'Occupation / job title', type: 'text' },
      { key: 'employerName', label: 'Employer / business name', type: 'text' },
      { key: 'startDate', label: 'Start date', type: 'date' },
      { key: 'contractType', label: 'Contract type', type: 'select', options: ['Permanent', 'Fixed-term', 'Zero hours', 'Agency', 'Day-rate contract', 'N/A'] },
      { key: 'onProbation', label: 'Currently on probation', type: 'yesno' },
      { key: 'basicSalary', label: 'Basic salary (gross)', type: 'currency', period: 'annual' },
      { key: 'guaranteedOvertime', label: 'Guaranteed overtime / allowances', type: 'currency', period: 'annual' },
      { key: 'regularOvertime', label: 'Regular non-guaranteed overtime', type: 'currency', period: 'annual' },
      { key: 'bonus', label: 'Bonus', type: 'currency', period: 'annual' },
      { key: 'commission', label: 'Commission', type: 'currency', period: 'annual' },
      { key: 'netMonthlyPay', label: 'Net monthly take-home pay', type: 'currency', period: 'monthly' },
      { key: 'yearsTrading', label: 'Years trading (self-employed)', type: 'number' },
      { key: 'netProfitLatest', label: 'Net profit / salary+dividends — latest year', type: 'currency', period: 'annual' },
      { key: 'netProfitPrevious', label: 'Net profit / salary+dividends — previous year', type: 'currency', period: 'annual' },
      { key: 'shareholdingPercent', label: 'Shareholding (directors)', type: 'percent' },
      { key: 'accountantDetails', label: 'Accountant (name/firm)', type: 'text' },
      { key: 'previousEmployment', label: 'Previous employment (if current < 12 months)', type: 'textarea' },
    ],
  },
  {
    id: 'otherIncome',
    title: 'Other income',
    scope: 'applicant',
    kind: 'list',
    itemLabel: 'Income source',
    fields: [
      {
        key: 'type',
        label: 'Type',
        type: 'select',
        required: true,
        options: ['Child benefit', 'Universal Credit', 'Other benefit', 'Pension income', 'Rental income', 'Maintenance received', 'Investment income', 'Second job', 'Other'],
      },
      { key: 'amountMonthly', label: 'Amount', type: 'currency', period: 'monthly', required: true },
      { key: 'notes', label: 'Notes', type: 'text' },
    ],
  },
  {
    id: 'liabilities',
    title: 'Credit commitments',
    scope: 'applicant',
    kind: 'list',
    itemLabel: 'Commitment',
    fields: [
      {
        key: 'type',
        label: 'Type',
        type: 'select',
        required: true,
        options: ['Credit card', 'Personal loan', 'Car finance (PCP/HP)', 'Student loan', 'Overdraft', 'Store card', 'Buy now pay later', 'Secured loan', 'Other mortgage', 'Other'],
      },
      { key: 'lender', label: 'Lender', type: 'text' },
      { key: 'balance', label: 'Outstanding balance', type: 'currency', period: 'one-off' },
      { key: 'monthlyPayment', label: 'Monthly payment', type: 'currency', period: 'monthly' },
      { key: 'repayBeforeCompletion', label: 'To be repaid before/at completion', type: 'yesno' },
      { key: 'endDate', label: 'End date', type: 'date' },
    ],
  },
  {
    id: 'creditHistory',
    title: 'Credit history',
    scope: 'applicant',
    kind: 'fields',
    description: 'Ask about the last 6 years.',
    fields: [
      { key: 'missedPayments', label: 'Missed / late payments', type: 'yesno' },
      { key: 'defaults', label: 'Defaults', type: 'yesno' },
      { key: 'ccjs', label: 'County Court Judgments (CCJs)', type: 'yesno' },
      { key: 'debtManagement', label: 'Debt management plan', type: 'yesno' },
      { key: 'iva', label: 'IVA', type: 'yesno' },
      { key: 'bankruptcy', label: 'Bankruptcy', type: 'yesno' },
      { key: 'repossession', label: 'Repossession', type: 'yesno' },
      { key: 'paydayLoans', label: 'Payday loans', type: 'yesno' },
      { key: 'details', label: 'Details (dates, amounts, satisfied?)', type: 'textarea' },
    ],
  },

  // ─────────────────────────────── Case ───────────────────────────────
  {
    id: 'dependants',
    title: 'Dependants',
    scope: 'case',
    kind: 'list',
    itemLabel: 'Dependant',
    fields: [
      { key: 'relationship', label: 'Relationship', type: 'select', options: ['Child', 'Stepchild', 'Adult dependant', 'Other'], required: true },
      { key: 'dateOfBirth', label: 'Date of birth', type: 'date' },
      { key: 'age', label: 'Age', type: 'number' },
      { key: 'financiallyDependentUntil', label: 'Dependent until (age)', type: 'number' },
    ],
  },
  {
    id: 'expenditure',
    title: 'Monthly expenditure',
    scope: 'case',
    kind: 'fields',
    description: 'Household figures per month, excluding the mortgage being applied for and credit commitments.',
    fields: [
      { key: 'councilTax', label: 'Council tax', type: 'currency', period: 'monthly' },
      { key: 'energy', label: 'Gas & electricity', type: 'currency', period: 'monthly' },
      { key: 'water', label: 'Water', type: 'currency', period: 'monthly' },
      { key: 'telecoms', label: 'Phone, broadband & TV', type: 'currency', period: 'monthly' },
      { key: 'food', label: 'Food & housekeeping', type: 'currency', period: 'monthly' },
      { key: 'transport', label: 'Fuel, car running & travel', type: 'currency', period: 'monthly' },
      { key: 'insurance', label: 'Insurance premiums', type: 'currency', period: 'monthly' },
      { key: 'childcare', label: 'Childcare', type: 'currency', period: 'monthly' },
      { key: 'schoolFees', label: 'School fees', type: 'currency', period: 'monthly' },
      { key: 'maintenancePaid', label: 'Maintenance paid', type: 'currency', period: 'monthly' },
      { key: 'groundRentService', label: 'Ground rent & service charge', type: 'currency', period: 'monthly' },
      { key: 'leisure', label: 'Leisure, subscriptions & clothing', type: 'currency', period: 'monthly' },
      { key: 'pensionContributions', label: 'Personal pension contributions', type: 'currency', period: 'monthly' },
      { key: 'other', label: 'Other committed spending', type: 'currency', period: 'monthly' },
      { key: 'notes', label: 'Notes on expected changes', type: 'textarea' },
    ],
  },
  {
    id: 'assets',
    title: 'Assets & savings',
    scope: 'case',
    kind: 'fields',
    fields: [
      { key: 'cashSavings', label: 'Cash savings', type: 'currency', period: 'one-off' },
      { key: 'investments', label: 'Investments / ISAs', type: 'currency', period: 'one-off' },
      { key: 'pensions', label: 'Pension pots (approx.)', type: 'currency', period: 'one-off' },
      { key: 'otherAssets', label: 'Other assets', type: 'textarea' },
    ],
  },
  {
    id: 'otherProperties',
    title: 'Other properties owned',
    scope: 'case',
    kind: 'list',
    itemLabel: 'Property',
    fields: [
      { key: 'address', label: 'Address', type: 'textarea', required: true },
      { key: 'use', label: 'Use', type: 'select', options: ['Residential (being sold)', 'Residential (kept)', 'Buy-to-let', 'Holiday let', 'Second home'] },
      { key: 'value', label: 'Estimated value', type: 'currency', period: 'one-off' },
      { key: 'mortgageBalance', label: 'Mortgage balance', type: 'currency', period: 'one-off' },
      { key: 'monthlyPayment', label: 'Monthly mortgage payment', type: 'currency', period: 'monthly' },
      { key: 'rentalIncome', label: 'Rental income', type: 'currency', period: 'monthly' },
      { key: 'lender', label: 'Lender', type: 'text' },
    ],
  },
  {
    id: 'deposit',
    title: 'Deposit',
    scope: 'case',
    kind: 'fields',
    fields: [
      { key: 'amount', label: 'Deposit amount', type: 'currency', period: 'one-off' },
      {
        key: 'source',
        label: 'Main source',
        type: 'select',
        options: ['Savings', 'Gift from family', 'Equity from sale', 'Lifetime ISA', 'Inheritance', 'Loan (declared)', 'Other'],
      },
      { key: 'giftAmount', label: 'Gifted amount', type: 'currency', period: 'one-off' },
      { key: 'giftorRelationship', label: 'Giftor relationship', type: 'text' },
      { key: 'notes', label: 'Source-of-funds notes', type: 'textarea' },
    ],
  },
  {
    id: 'property',
    title: 'Property',
    scope: 'case',
    kind: 'fields',
    fields: [
      { key: 'found', label: 'Property found', type: 'yesno' },
      { key: 'address', label: 'Property address', type: 'textarea' },
      { key: 'postcode', label: 'Postcode', type: 'postcode' },
      {
        key: 'propertyType',
        label: 'Property type',
        type: 'select',
        options: ['Detached house', 'Semi-detached house', 'Terraced house', 'Bungalow', 'Flat', 'Maisonette', 'Other'],
      },
      { key: 'tenure', label: 'Tenure', type: 'select', options: ['Freehold', 'Leasehold', 'Share of freehold', 'Commonhold'] },
      { key: 'leaseYearsRemaining', label: 'Lease years remaining', type: 'number' },
      { key: 'bedrooms', label: 'Bedrooms', type: 'number' },
      { key: 'yearBuilt', label: 'Year built', type: 'number' },
      { key: 'newBuild', label: 'New build', type: 'yesno' },
      { key: 'nonStandardConstruction', label: 'Non-standard construction', type: 'yesno' },
      { key: 'purchasePrice', label: 'Purchase price', type: 'currency', period: 'one-off' },
      { key: 'estimatedValue', label: 'Estimated value', type: 'currency', period: 'one-off' },
      { key: 'use', label: 'Intended use', type: 'select', options: ['Main residence', 'Buy-to-let', 'Second home', 'Holiday let'] },
      { key: 'expectedRentMonthly', label: 'Expected rent (BTL)', type: 'currency', period: 'monthly' },
    ],
  },
  {
    id: 'mortgage',
    title: 'Mortgage requirements',
    scope: 'case',
    kind: 'fields',
    fields: [
      {
        key: 'purpose',
        label: 'Purpose',
        type: 'select',
        required: true,
        options: [
          'First-time purchase',
          'House move',
          'Remortgage',
          'Remortgage with capital raising',
          'Product transfer',
          'Further advance',
          'Buy-to-let purchase',
          'Buy-to-let remortgage',
          'Shared ownership',
          'Right to buy',
        ],
      },
      { key: 'loanAmount', label: 'Loan amount required', type: 'currency', period: 'one-off', required: true },
      { key: 'termYears', label: 'Term (years)', type: 'number', required: true },
      { key: 'repaymentMethod', label: 'Repayment method', type: 'select', options: ['Capital & interest', 'Interest only', 'Part & part'] },
      { key: 'ratePreference', label: 'Rate preference', type: 'select', options: ['Fixed', 'Tracker', 'Discount / variable', 'Offset', 'No preference'] },
      { key: 'initialPeriodYears', label: 'Preferred initial period (years)', type: 'number' },
      { key: 'maxMonthlyPayment', label: 'Comfortable monthly payment (max)', type: 'currency', period: 'monthly' },
      { key: 'feesPreference', label: 'Product fees', type: 'select', options: ['Add to loan', 'Pay upfront', 'Prefer no fee', 'No preference'] },
      { key: 'overpaymentsImportant', label: 'Overpayment flexibility important', type: 'yesno' },
      { key: 'portabilityImportant', label: 'Portability important', type: 'yesno' },
      { key: 'ercConcern', label: 'May need to repay early (ERC sensitivity)', type: 'yesno' },
      { key: 'currentLender', label: 'Current lender (remortgage)', type: 'text' },
      { key: 'currentBalance', label: 'Current mortgage balance', type: 'currency', period: 'one-off' },
      { key: 'currentRatePercent', label: 'Current rate', type: 'percent' },
      { key: 'currentDealEnds', label: 'Current deal ends', type: 'date' },
      { key: 'capitalRaisingReason', label: 'Reason for capital raising', type: 'textarea' },
      { key: 'timescale', label: 'Timescale / key dates', type: 'textarea' },
    ],
  },
  {
    id: 'protection',
    title: 'Protection & insurance',
    scope: 'case',
    kind: 'fields',
    fields: [
      { key: 'lifeCover', label: 'Existing life cover', type: 'yesno' },
      { key: 'criticalIllness', label: 'Existing critical illness cover', type: 'yesno' },
      { key: 'incomeProtection', label: 'Existing income protection', type: 'yesno' },
      { key: 'employerBenefits', label: 'Employer sick pay / death-in-service', type: 'textarea' },
      { key: 'buildingsContents', label: 'Buildings & contents to be arranged', type: 'yesno' },
      { key: 'wantsReview', label: 'Client wants a protection review', type: 'yesno' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  {
    id: 'objectives',
    title: 'Objectives & future plans',
    scope: 'case',
    kind: 'fields',
    fields: [
      { key: 'objectives', label: "Client's objectives in their words", type: 'textarea', required: true },
      { key: 'priorities', label: 'Priorities (e.g. lowest cost, certainty, flexibility)', type: 'textarea' },
      { key: 'futureChanges', label: 'Expected changes to income or outgoings', type: 'textarea' },
      { key: 'plansToMove', label: 'Plans to move within the product period', type: 'yesno' },
      { key: 'retirementNotes', label: 'Lending into retirement — notes', type: 'textarea' },
    ],
  },
  {
    id: 'vulnerability',
    title: 'Customer circumstances (Consumer Duty)',
    scope: 'case',
    kind: 'fields',
    description:
      'Broker judgement only — never auto-filled by AI. Record the minimum needed to support the client, with the client’s agreement.',
    fields: [
      { key: 'potentialVulnerability', label: 'Potential vulnerability identified', type: 'yesno', aiExtract: false },
      {
        key: 'drivers',
        label: 'Driver (FCA FG21/1 category)',
        type: 'select',
        options: ['Health', 'Life event', 'Resilience', 'Capability', 'None identified'],
        aiExtract: false,
      },
      { key: 'adjustments', label: 'Support / adjustments agreed', type: 'textarea', aiExtract: false },
      { key: 'clientAgreedToRecord', label: 'Client agreed to this being recorded', type: 'yesno', aiExtract: false },
    ],
  },
];

export const APPLICANT_SECTIONS = SECTIONS.filter((s) => s.scope === 'applicant');
export const CASE_SECTIONS = SECTIONS.filter((s) => s.scope === 'case');

export function getSection(id: string): SectionDef | undefined {
  return SECTIONS.find((s) => s.id === id);
}

export function getField(sectionId: string, key: string): FieldDef | undefined {
  return getSection(sectionId)?.fields.find((f) => f.key === key);
}

export type Owner = 'a1' | 'a2' | 'case';

/** Every scalar path that exists for a case with `numApplicants` applicants. */
export function scalarPaths(numApplicants: 1 | 2): { path: string; owner: Owner; section: SectionDef; field: FieldDef }[] {
  const out: { path: string; owner: Owner; section: SectionDef; field: FieldDef }[] = [];
  const owners: Owner[] = numApplicants === 2 ? ['a1', 'a2'] : ['a1'];
  for (const s of SECTIONS) {
    if (s.kind !== 'fields') continue;
    const os: Owner[] = s.scope === 'applicant' ? owners : ['case'];
    for (const o of os) for (const f of s.fields) out.push({ path: `${o}.${s.id}.${f.key}`, owner: o, section: s, field: f });
  }
  return out;
}

/** Every list path that exists for a case with `numApplicants` applicants. */
export function listPaths(numApplicants: 1 | 2): { path: string; owner: Owner; section: SectionDef }[] {
  const owners: Owner[] = numApplicants === 2 ? ['a1', 'a2'] : ['a1'];
  const out: { path: string; owner: Owner; section: SectionDef }[] = [];
  for (const s of SECTIONS) {
    if (s.kind !== 'list') continue;
    const os: Owner[] = s.scope === 'applicant' ? owners : ['case'];
    for (const o of os) out.push({ path: `${o}.${s.id}`, owner: o, section: s });
  }
  return out;
}

export interface ParsedPath {
  owner: Owner;
  section: SectionDef;
  field?: FieldDef;
}

export function parsePath(path: string): ParsedPath | null {
  const parts = path.split('.');
  if (parts.length < 2 || parts.length > 3) return null;
  const [owner, sectionId, key] = parts;
  if (owner !== 'a1' && owner !== 'a2' && owner !== 'case') return null;
  const section = getSection(sectionId);
  if (!section) return null;
  if ((owner === 'case') !== (section.scope === 'case')) return null;
  if (parts.length === 2) return section.kind === 'list' ? { owner, section } : null;
  if (section.kind !== 'fields') return null;
  const field = section.fields.find((f) => f.key === key);
  if (!field) return null;
  return { owner, section, field };
}

export function ownerLabel(owner: Owner): string {
  return owner === 'a1' ? 'Applicant 1' : owner === 'a2' ? 'Applicant 2' : 'Case';
}

export function pathLabel(path: string): string {
  const p = parsePath(path);
  if (!p) return path;
  const base = p.field ? `${p.section.title} › ${p.field.label}` : p.section.title;
  return p.owner === 'case' ? base : `${ownerLabel(p.owner)} › ${base}`;
}
