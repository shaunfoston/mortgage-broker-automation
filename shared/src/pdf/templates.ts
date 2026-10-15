/**
 * Branded HTML for PDF generation. The app renders these with expo-print;
 * the tests render them with Chromium. All dynamic text is HTML-escaped.
 */
import { BRAND, logoSvg } from '../brand.ts';
import { AUDIT_LABELS, type AuditEntry } from '../audit.ts';
import { CONSENT_INTRO, CONSENT_ITEMS, FIRM_PLACEHOLDER } from '../consent.ts';
import { computeMetrics, getList, owners, type Row } from '../factfind/model.ts';
import { SECTIONS, ownerLabel, pathLabel, type Owner } from '../factfind/schema.ts';
import { formatGBP, formatUkDate, formatValue } from '../factfind/values.ts';
import { msToClock } from '../extraction.ts';
import type { CaseRecord, Client, ConsentRecord, Extraction, Recording } from '../db/repo.ts';

export function escapeHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const e = escapeHtml;

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return e(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

const CSS = `
@page { size: A4; margin: 16mm 14mm 18mm 14mm; }
* { box-sizing: border-box; }
body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: ${BRAND.graphite}; font-size: 10.5pt; line-height: 1.4; margin: 0; }
.header { display: flex; align-items: center; gap: 12px; border-bottom: 3px solid ${BRAND.royal}; padding-bottom: 10px; margin-bottom: 14px; }
.header .brand { font-size: 17pt; font-weight: 800; letter-spacing: -0.2px; }
.header .brand span { color: ${BRAND.royal}; }
.header .doc { margin-left: auto; text-align: right; color: ${BRAND.slate}; font-size: 9pt; }
.header .doc b { display: block; color: ${BRAND.graphite}; font-size: 12pt; }
h2 { font-size: 12pt; color: #fff; background: ${BRAND.graphite2}; padding: 5px 9px; border-radius: 4px; margin: 16px 0 6px; page-break-after: avoid; }
h3 { font-size: 10.5pt; color: ${BRAND.royal}; margin: 12px 0 4px; page-break-after: avoid; }
table { width: 100%; border-collapse: collapse; margin-bottom: 6px; page-break-inside: auto; }
tr { page-break-inside: avoid; }
th, td { text-align: left; vertical-align: top; padding: 4px 6px; border-bottom: 1px solid ${BRAND.line}; }
th { width: 42%; font-weight: 600; color: ${BRAND.slate}; }
table.grid th { width: auto; background: ${BRAND.surface}; color: ${BRAND.graphite}; }
.empty { color: #9AA3AE; font-style: italic; }
.meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px 14px; background: ${BRAND.surface}; border-radius: 6px; padding: 10px 12px; }
.meta div small { display: block; color: ${BRAND.slate}; font-size: 8pt; text-transform: uppercase; letter-spacing: .4px; }
.ai { display: inline-block; font-size: 7pt; font-weight: 700; color: ${BRAND.royal}; border: 1px solid ${BRAND.royal}; border-radius: 3px; padding: 0 3px; margin-left: 4px; vertical-align: middle; }
.note { font-size: 8.5pt; color: ${BRAND.slate}; }
.banner { border-radius: 6px; padding: 8px 10px; font-size: 9pt; margin: 8px 0; }
.banner.warn { background: ${BRAND.warningTint}; color: ${BRAND.warning}; border: 1px solid #F0D28A; }
.banner.ok { background: ${BRAND.successTint}; color: ${BRAND.success}; border: 1px solid #A8DDBC; }
.banner.bad { background: ${BRAND.dangerTint}; color: ${BRAND.danger}; border: 1px solid #F3B3AD; }
ul { margin: 4px 0 8px 18px; padding: 0; }
.tick { font-weight: 700; color: ${BRAND.success}; }
.cross { font-weight: 700; color: ${BRAND.slate}; }
.sig { border: 1px solid ${BRAND.line}; border-radius: 6px; padding: 6px; display: inline-block; background: #fff; }
.sig img { height: 110px; }
.mono { font-family: Menlo, Consolas, monospace; font-size: 8pt; word-break: break-all; }
.transcript p { margin: 0 0 5px; }
.transcript .t { color: ${BRAND.slate}; font-size: 8pt; margin-right: 4px; }
.transcript .s { font-weight: 700; color: ${BRAND.royal}; }
.footer { position: fixed; bottom: -12mm; left: 0; right: 0; font-size: 7.5pt; color: ${BRAND.slate}; display: flex; justify-content: space-between; border-top: 1px solid ${BRAND.line}; padding-top: 3px; }
.pill { display: inline-block; padding: 1px 6px; border-radius: 10px; font-size: 8pt; font-weight: 700; }
.pill.high { background: ${BRAND.successTint}; color: ${BRAND.success}; }
.pill.medium { background: ${BRAND.warningTint}; color: ${BRAND.warning}; }
.pill.low { background: ${BRAND.dangerTint}; color: ${BRAND.danger}; }
`;

interface DocMeta {
  title: string;
  client: Client | null;
  caseRec: CaseRecord;
  generatedAt: string;
  generatedBy: string;
  confidentiality?: string;
}

function shell(meta: DocMeta, body: string): string {
  const clientName = meta.client ? `${meta.client.firstName} ${meta.client.lastName}` : '';
  return `<!DOCTYPE html><html lang="en-GB"><head><meta charset="utf-8"><title>${e(meta.title)} — ${e(meta.caseRec.reference)}</title><style>${CSS}</style></head><body>
<div class="header">${logoSvg(42)}<div class="brand">Mortgage <span>Options</span></div>
<div class="doc"><b>${e(meta.title)}</b>${e(meta.caseRec.reference)} · ${e(clientName)}</div></div>
${body}
<div class="footer"><span>${e(BRAND.footer)} · ${e(meta.confidentiality ?? 'Confidential — contains personal data')}</span><span>Generated ${e(fmtDateTime(meta.generatedAt))} by ${e(meta.generatedBy)}</span></div>
</body></html>`;
}

function rowsTable(rows: [string, string, boolean?][]): string {
  return `<table>${rows
    .map(([k, v, ai]) => `<tr><th>${e(k)}</th><td>${v ? e(v) : '<span class="empty">Not recorded</span>'}${ai ? '<span class="ai">AI</span>' : ''}</td></tr>`)
    .join('')}</table>`;
}

function listTable(section: (typeof SECTIONS)[number], rows: Row[], none: boolean): string {
  if (!rows.length) return `<p class="${none ? 'note' : 'empty'}">${none ? 'None declared.' : 'Not recorded'}</p>`;
  const head = section.fields.map((f) => `<th>${e(f.label)}</th>`).join('');
  const body = rows.map((r) => `<tr>${section.fields.map((f) => `<td>${e(formatValue(f, r[f.key]))}</td>`).join('')}</tr>`).join('');
  return `<table class="grid"><tr>${head}</tr>${body}</table>`;
}

export function factFindHtml(p: { client: Client | null; caseRec: CaseRecord; generatedAt: string; generatedBy: string }): string {
  const { caseRec } = p;
  const ff = caseRec.factFind;
  const prov = caseRec.provenance;
  const m = computeMetrics(ff);
  const parts: string[] = [];
  parts.push(`<div class="meta">
    <div><small>Case reference</small>${e(caseRec.reference)}</div>
    <div><small>Status</small>${e(caseRec.status)}</div>
    <div><small>Applicants</small>${caseRec.numApplicants}</div>
    <div><small>Created</small>${e(fmtDateTime(caseRec.createdAt))}</div>
    <div><small>Last updated</small>${e(fmtDateTime(caseRec.updatedAt))}</div>
    <div><small>Purpose</small>${e(caseRec.purpose ?? '')}</div>
  </div>`);
  parts.push(`<h2>Indicative figures</h2>`);
  parts.push(
    rowsTable([
      ['Gross annual income (employment)', m.grossAnnualIncome ? formatGBP(m.grossAnnualIncome) : ''],
      ['Other income (monthly)', m.otherIncomeMonthly ? formatGBP(m.otherIncomeMonthly) : ''],
      ['Monthly household expenditure', m.monthlyExpenditure ? formatGBP(m.monthlyExpenditure) : ''],
      ['Monthly credit commitments (continuing after completion)', m.creditCommitmentsAfterCompletion ? formatGBP(m.creditCommitmentsAfterCompletion) : ''],
      ['Loan amount', m.loanAmount ? formatGBP(m.loanAmount) : ''],
      ['Loan-to-value', m.ltvPercent !== null ? `${m.ltvPercent}%` : ''],
      ['Loan-to-income', m.loanToIncome !== null ? `${m.loanToIncome}×` : ''],
      ['Deposit', m.depositPercent !== null ? `${m.depositPercent}%` : ''],
    ]),
  );
  parts.push(`<p class="note">Calculated from the fact-find only. Not a lender affordability assessment or a recommendation.</p>`);

  for (const owner of owners(ff) as Owner[]) {
    const title = owner === 'case' ? 'Household, property & requirements' : ownerLabel(owner);
    parts.push(`<h2>${e(title)}</h2>`);
    for (const s of SECTIONS) {
      if ((owner === 'case') !== (s.scope === 'case')) continue;
      parts.push(`<h3>${e(s.title)}</h3>`);
      if (s.kind === 'list') {
        const path = `${owner}.${s.id}`;
        parts.push(listTable(s, getList(ff, path), (ff[owner] as any)[`${s.id}__none`] === true));
        if (prov[path]?.source === 'ai') parts.push(`<p class="note">Includes rows proposed by AI and accepted by the broker.</p>`);
      } else {
        const data = (ff[owner][s.id] ?? {}) as Row;
        const rows: [string, string, boolean][] = s.fields
          .filter((f) => data[f.key] !== undefined || f.required)
          .map((f) => [f.label, formatValue(f, data[f.key]), prov[`${owner}.${s.id}.${f.key}`]?.source === 'ai']);
        parts.push(rows.length ? rowsTable(rows) : '<p class="empty">Not recorded</p>');
      }
    }
  }
  parts.push(
    `<p class="note"><span class="ai">AI</span> Value proposed from the meeting transcript by AI and reviewed and accepted by the broker. ` +
      `Fields not shown were not recorded.</p>`,
  );
  return shell({ title: 'Mortgage Fact-Find', ...p }, parts.join('\n'));
}

export function meetingSummaryHtml(p: {
  client: Client | null;
  caseRec: CaseRecord;
  recording: Recording;
  extraction: Extraction | null;
  generatedAt: string;
  generatedBy: string;
}): string {
  const { recording: r, extraction: x } = p;
  const parts: string[] = [];
  parts.push(`<div class="meta">
    <div><small>Recorded</small>${e(fmtDateTime(r.createdAt))}</div>
    <div><small>Duration</small>${r.durationMs ? e(msToClock(r.durationMs)) : '—'}</div>
    <div><small>Recording consent confirmed</small>${e(fmtDateTime(r.consentConfirmedAt))}</div>
    <div><small>Transcription</small>${e(r.provider ?? '—')}</div>
    <div><small>AI model</small>${e(x?.model ?? '—')}</div>
    <div><small>Review status</small>${e(x ? (x.status === 'reviewed' ? 'Fully reviewed' : 'Review in progress') : 'Not extracted')}</div>
  </div>`);
  if (r.provider === 'demo' || x?.model === 'demo') {
    parts.push(`<div class="banner warn">DEMO MODE — the transcript and extraction are a fictional sample, not a transcription of this recording.</div>`);
  }
  if (x) {
    const s = x.summary;
    const list = (title: string, items: string[]) => (items?.length ? `<h3>${e(title)}</h3><ul>${items.map((i) => `<li>${e(i)}</li>`).join('')}</ul>` : '');
    parts.push(`<h2>AI-assisted meeting summary</h2>`);
    parts.push(`<div class="banner warn">Drafted by AI from the transcript. It must be checked by the adviser and is not advice.</div>`);
    parts.push(`<p>${e(s.overview)}</p>`);
    parts.push(list('Client objectives', s.client_objectives));
    parts.push(list('Key facts', s.key_facts));
    parts.push(list('Concerns / risks', s.concerns_or_risks));
    parts.push(list('Action items', s.action_items));
    parts.push(list('Possible vulnerability indicators (adviser to assess)', s.possible_vulnerability_indicators));
    parts.push(list('Information still needed', s.missing_information));

    parts.push(`<h2>Proposed values and broker decisions</h2>`);
    const rows = x.items
      .map((it) => {
        const band = it.confidence >= 0.85 ? 'high' : it.confidence >= 0.6 ? 'medium' : 'low';
        const val = it.kind === 'field' ? String(it.decision === 'edited' ? it.finalValue : it.proposed) : Object.entries((it.decision === 'edited' ? it.finalValue : it.proposed) as Row).map(([k, v]) => `${k}: ${v}`).join(', ');
        return `<tr><td>${e(pathLabel(it.path))}</td><td>${e(val)}</td><td><span class="pill ${band}">${Math.round(it.confidence * 100)}%</span></td><td>${e(it.decision)}</td></tr>`;
      })
      .join('');
    parts.push(`<table class="grid"><tr><th>Field</th><th>Value</th><th>Confidence</th><th>Decision</th></tr>${rows}</table>`);
    if (x.rejected.length) {
      parts.push(`<h3>Automatically discarded proposals</h3><table class="grid"><tr><th>Field</th><th>Value</th><th>Reason</th></tr>${x.rejected
        .map((rj) => `<tr><td>${e(pathLabel(rj.path))}</td><td>${e(rj.value)}</td><td>${e(rj.reason)}</td></tr>`)
        .join('')}</table>`);
    }
  }
  parts.push(`<h2>Transcript</h2>`);
  if (r.utterances.length) {
    parts.push(
      `<div class="transcript">${r.utterances
        .map((u) => `<p><span class="t">${e(msToClock(u.start))}</span><span class="s">Speaker ${e(u.speaker)}:</span> ${e(u.text)}</p>`)
        .join('')}</div>`,
    );
  } else if (r.transcript) parts.push(`<p>${e(r.transcript)}</p>`);
  else parts.push(`<p class="empty">No transcript.</p>`);
  return shell({ title: 'Meeting Summary', ...p }, parts.join('\n'));
}

export function consentHtml(p: {
  client: Client | null;
  caseRec: CaseRecord;
  consent: ConsentRecord;
  verified: boolean;
  generatedAt: string;
  generatedBy: string;
}): string {
  const c = p.consent;
  const parts: string[] = [];
  parts.push(`<div class="banner warn">Draft consent wording for software testing — must be approved by the firm’s compliance function before use with real clients.</div>`);
  parts.push(
    p.verified
      ? `<div class="banner ok">Integrity check passed — this record matches its stored hash.</div>`
      : `<div class="banner bad">Integrity check FAILED — this record does not match its stored hash.</div>`,
  );
  if (c.withdrawnAt) parts.push(`<div class="banner bad">Consent withdrawn ${e(fmtDateTime(c.withdrawnAt))}.</div>`);
  parts.push(`<h2>Data protection and consent</h2>`);
  parts.push(`<p>${e(CONSENT_INTRO)}</p><p class="note">Firm: ${e(FIRM_PLACEHOLDER)}</p>`);
  parts.push(
    `<table>${CONSENT_ITEMS.map(
      (i) => `<tr><th>${c.answers[i.key] ? '<span class="tick">✓ Agreed</span>' : '<span class="cross">✗ Not agreed</span>'}</th><td>${e(i.label)}</td></tr>`,
    ).join('')}</table>`,
  );
  parts.push(`<h2>Signature</h2>`);
  parts.push(`<div class="sig"><img src="${e(c.signature)}" alt="Signature"/></div>`);
  parts.push(
    rowsTable([
      ['Signed by', `${c.signerName} (Applicant ${c.applicantIndex})`],
      ['Signed (UTC)', c.signedAtUtc],
      ['Signed (local time)', `${c.signedAtLocal} ${c.timeZone}`],
      ['Witnessed by (adviser)', c.brokerName],
      ['Device', c.device],
      ['Consent wording version', c.consentVersion],
    ]),
  );
  parts.push(`<h3>Integrity</h3>`);
  parts.push(
    `<table><tr><th>Consent text SHA-256</th><td class="mono">${e(c.consentTextHash)}</td></tr><tr><th>Signature SHA-256</th><td class="mono">${e(
      c.signatureSha256,
    )}</td></tr><tr><th>Record SHA-256</th><td class="mono">${e(c.recordHash)}</td></tr></table>`,
  );
  parts.push(
    `<p class="note">This is a simple electronic signature captured on the adviser’s device. Whether it is sufficient for a given purpose (e.g. lender declarations) must be confirmed with the relevant lender or compliance function.</p>`,
  );
  return shell({ title: 'Consent Record', ...p }, parts.join('\n'));
}

export function auditHtml(p: { client: Client | null; caseRec: CaseRecord; entries: AuditEntry[]; chainOk: boolean; generatedAt: string; generatedBy: string }): string {
  const rows = p.entries
    .map(
      (a) =>
        `<tr><td>${a.seq}</td><td>${e(fmtDateTime(a.ts))}</td><td>${e(AUDIT_LABELS[a.action] ?? a.action)}</td><td>${e(a.actor)}</td><td class="mono">${e(
          Object.entries(a.details)
            .map(([k, v]) => `${k}=${v}`)
            .join(' '),
        )}</td></tr>`,
    )
    .join('');
  return shell(
    { title: 'Audit History', ...p },
    `${p.chainOk ? '<div class="banner ok">Audit chain verified — no entries altered or removed.</div>' : '<div class="banner bad">Audit chain verification FAILED.</div>'}
<table class="grid"><tr><th>#</th><th>Time</th><th>Event</th><th>By</th><th>Details</th></tr>${rows}</table>`,
  );
}

export { formatUkDate };
