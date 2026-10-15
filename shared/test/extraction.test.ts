import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  confidenceBand,
  extractablePaths,
  extractionJsonSchema,
  extractionSystemPrompt,
  extractionUserPrompt,
  normaliseExtraction,
} from '../src/extraction.ts';
import { DEMO_EXTRACTION_RAW, DEMO_TRANSCRIPT } from '../src/demo.ts';

function walk(node: any, visit: (n: any) => void) {
  if (!node || typeof node !== 'object') return;
  visit(node);
  for (const v of Object.values(node)) walk(v, visit);
}

test('JSON schema satisfies Claude structured-output constraints', () => {
  const schema = extractionJsonSchema(2);
  walk(schema, (n) => {
    if (n.type === 'object') {
      assert.equal(n.additionalProperties, false, 'every object must set additionalProperties:false');
      assert.deepEqual([...n.required].sort(), Object.keys(n.properties).sort(), 'all properties required');
    }
    for (const bad of ['minimum', 'maximum', 'minLength', 'maxLength', 'multipleOf', 'maxItems']) assert.ok(!(bad in n), `unsupported keyword ${bad}`);
  });
  const paths = schema.properties.fields.items.properties.path.enum;
  assert.ok(paths.includes('a2.employment.basicSalary'));
  assert.ok(!paths.includes('case.vulnerability.potentialVulnerability'), 'vulnerability is never AI-extracted');
  assert.ok(!extractionJsonSchema(1).properties.fields.items.properties.path.enum.some((p: string) => p.startsWith('a2.')));
});

test('prompts include safety rules and transcript delimiters', () => {
  const sys = extractionSystemPrompt();
  assert.match(sys, /untrusted data/);
  assert.match(sys, /special-category/);
  const user = extractionUserPrompt(DEMO_TRANSCRIPT, 1);
  assert.match(user, /<transcript>[\s\S]*Speaker A:[\s\S]*<\/transcript>/);
  assert.match(user, /a1\.employment\.basicSalary/);
});

test('normaliseExtraction coerces values and rejects invalid proposals', () => {
  const p = normaliseExtraction(DEMO_EXTRACTION_RAW, 1);
  const byPath = Object.fromEntries(p.fields.map((f) => [f.path, f]));
  assert.equal(byPath['a1.employment.basicSalary'].value, 42500);
  assert.equal(byPath['a1.employment.basicSalary'].band, 'high');
  assert.equal(byPath['a1.employment.bonus'].band, 'medium');
  assert.equal(byPath['case.property.purchasePrice'].value, 285000);
  assert.equal(byPath['a1.employment.contractType'].value, 'Permanent');
  assert.ok(p.rejected.some((r) => r.path === 'a1.employment.contractType' && r.value === 'Full time'));
  assert.equal(p.listItems.length, 4);
  assert.equal(p.listItems[0].item.monthlyPayment, 245);
  assert.ok(p.summary.possible_vulnerability_indicators.length === 1);
});

test('normaliseExtraction blocks unknown, out-of-scope and protected paths', () => {
  const p = normaliseExtraction(
    {
      fields: [
        { path: 'a2.personal.firstName', value: 'Sam', confidence: 0.9, evidence: '' },
        { path: 'case.vulnerability.potentialVulnerability', value: 'yes', confidence: 0.9, evidence: '' },
        { path: 'a1.personal.__proto__', value: 'x', confidence: 0.9, evidence: '' },
        { path: 'case.mortgage.loanAmount', value: '1000000', confidence: 5, evidence: 'joke' },
      ],
      list_items: [{ list: 'a1.liabilities', values: [{ key: 'lender', value: 'X' }], confidence: 0.9, evidence: '' }],
      summary: null,
    },
    1,
  );
  assert.equal(p.fields.length, 1);
  assert.equal(p.fields[0].confidence, 1, 'confidence clamped to 1');
  assert.equal(p.rejected.length, 4);
  assert.match(p.rejected.find((r) => r.path === 'a1.liabilities')!.reason, /Missing required: type/);
  assert.equal(p.summary.overview, '');
});

test('conflicting statements are capped at medium confidence', () => {
  const p = normaliseExtraction(
    {
      fields: [
        { path: 'case.mortgage.termYears', value: '30', confidence: 0.95, evidence: '30 years' },
        { path: 'case.mortgage.termYears', value: '25', confidence: 0.8, evidence: 'maybe 25' },
      ],
      list_items: [],
      summary: {},
    },
    1,
  );
  assert.equal(p.fields.length, 1);
  assert.equal(p.fields[0].value, 30);
  assert.equal(p.fields[0].band, 'medium');
  assert.match(p.fields[0].evidence, /Conflicting/);
});

test('garbage input never throws', () => {
  for (const g of [null, 42, 'x', [], { fields: 'nope', list_items: [null], summary: 3 }]) normaliseExtraction(g, 2);
  assert.equal(confidenceBand(0.59), 'low');
  assert.ok(extractablePaths(1).length > 100);
});
