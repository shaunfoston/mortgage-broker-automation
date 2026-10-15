import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeMetrics, emptyFactFind, getList, getValue, overallProgress, parseFactFind, setList, setListNone, setValue } from '../src/factfind/model.ts';
import { SECTIONS, listPaths, parsePath, scalarPaths } from '../src/factfind/schema.ts';

test('schema has unique section ids and field keys', () => {
  const ids = new Set<string>();
  for (const s of SECTIONS) {
    assert.ok(!ids.has(s.id), `duplicate section ${s.id}`);
    ids.add(s.id);
    const keys = new Set<string>();
    for (const f of s.fields) {
      assert.ok(!keys.has(f.key), `duplicate field ${s.id}.${f.key}`);
      keys.add(f.key);
      if (f.type === 'select') assert.ok(f.options && f.options.length > 1, `${s.id}.${f.key} needs options`);
    }
  }
  assert.ok(SECTIONS.length >= 15);
  assert.ok(scalarPaths(2).length > 150, 'comprehensive fact-find');
});

test('parsePath enforces owner/scope', () => {
  assert.ok(parsePath('a1.personal.firstName'));
  assert.ok(parsePath('case.mortgage.loanAmount'));
  assert.ok(parsePath('a2.liabilities'));
  assert.equal(parsePath('case.personal.firstName'), null);
  assert.equal(parsePath('a1.mortgage.loanAmount'), null);
  assert.equal(parsePath('a1.personal.nope'), null);
  assert.equal(parsePath('a1.liabilities.type'), null);
  assert.equal(listPaths(1).some((l) => l.path.startsWith('a2')), false);
});

test('set/get values immutably and progress tracks required fields', () => {
  const ff0 = emptyFactFind(1);
  const ff1 = setValue(ff0, 'a1.personal.firstName', 'Jordan');
  assert.equal(getValue(ff0, 'a1.personal.firstName'), null);
  assert.equal(getValue(ff1, 'a1.personal.firstName'), 'Jordan');
  const p = overallProgress(ff1);
  assert.equal(p.complete, 0);
  const ff2 = setValue(setValue(ff1, 'a1.personal.lastName', 'Testwell'), 'a1.personal.dateOfBirth', '1991-03-14');
  const personal = overallProgress(ff2).sections.find((s) => s.section.id === 'personal')!;
  assert.equal(personal.complete, true);
  const ff3 = setListNone(ff2, 'a1.liabilities', true);
  assert.equal(overallProgress(ff3).sections.find((s) => s.section.id === 'liabilities')!.complete, true);
  assert.throws(() => setValue(ff0, 'a1.bogus.x', 1));
});

test('parseFactFind tolerates bad JSON', () => {
  assert.deepEqual(parseFactFind('{not json', 2).numApplicants, 2);
  assert.deepEqual(parseFactFind(null).a1, {});
});

test('computeMetrics: LTV, LTI, commitments after completion', () => {
  let ff = emptyFactFind(1);
  ff = setValue(ff, 'a1.employment.status', 'Employed');
  ff = setValue(ff, 'a1.employment.basicSalary', 42500);
  ff = setValue(ff, 'a1.employment.bonus', 3000);
  ff = setValue(ff, 'case.mortgage.loanAmount', 255000);
  ff = setValue(ff, 'case.property.purchasePrice', 285000);
  ff = setValue(ff, 'case.deposit.amount', 30000);
  ff = setValue(ff, 'case.expenditure.councilTax', 160);
  ff = setValue(ff, 'case.expenditure.notes', 'ignored');
  ff = setList(ff, 'a1.liabilities', [
    { type: 'Car finance (PCP/HP)', monthlyPayment: 245, balance: 6200, repayBeforeCompletion: 'no' },
    { type: 'Credit card', monthlyPayment: 60, balance: 1100, repayBeforeCompletion: 'yes' },
  ]);
  const m = computeMetrics(ff);
  assert.equal(m.grossAnnualIncome, 45500);
  assert.equal(m.ltvPercent, 89.5);
  assert.equal(m.loanToIncome, 5.6);
  assert.equal(m.monthlyCreditCommitments, 305);
  assert.equal(m.creditCommitmentsAfterCompletion, 245);
  assert.equal(m.monthlyExpenditure, 160);
  assert.equal(m.depositPercent, 10.5);
  assert.equal(getList(ff, 'a1.liabilities').length, 2);
});

test('self-employed income uses the lower of the last two years', () => {
  let ff = emptyFactFind(1);
  ff = setValue(ff, 'a1.employment.status', 'Self-employed (sole trader)');
  ff = setValue(ff, 'a1.employment.netProfitLatest', 60000);
  ff = setValue(ff, 'a1.employment.netProfitPrevious', 50000);
  assert.equal(computeMetrics(ff).grossAnnualIncome, 50000);
});
