import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coerceValue, formatGBP, normalisePostcode, parseDate, parseMoney } from '../src/factfind/values.ts';
import { getField } from '../src/factfind/schema.ts';

test('parseMoney handles UK formats', () => {
  assert.equal(parseMoney('£45,000'), 45000);
  assert.equal(parseMoney('45k'), 45000);
  assert.equal(parseMoney('1.2m'), 1_200_000);
  assert.equal(parseMoney('42,500 a year'), 42500);
  assert.equal(parseMoney('£950pcm'), 950);
  assert.equal(parseMoney('2,500 per month'), 2500);
  assert.equal(parseMoney(1234.567), 1234.567);
  assert.equal(parseMoney('abc'), null);
  assert.equal(parseMoney('12 apples'), null);
});

test('parseDate reads UK day-first dates and rejects impossible dates', () => {
  assert.equal(parseDate('14/03/1991'), '1991-03-14');
  assert.equal(parseDate('1991-03-14'), '1991-03-14');
  assert.equal(parseDate('14th March 1991'), '1991-03-14');
  assert.equal(parseDate('March 14, 1991'), '1991-03-14');
  assert.equal(parseDate('03/04/05'), '2005-04-03');
  assert.equal(parseDate('31/02/2020'), null);
  assert.equal(parseDate('29/02/2024'), '2024-02-29');
  assert.equal(parseDate('29/02/2023'), null);
  assert.equal(parseDate('yesterday'), null);
});

test('postcodes are normalised', () => {
  assert.equal(normalisePostcode('sw1a1aa'), 'SW1A 1AA');
  assert.equal(normalisePostcode('ZZ99 3ZZ'), 'ZZ99 3ZZ');
  assert.equal(normalisePostcode('12345'), null);
});

test('coerceValue validates by field type', () => {
  const salary = getField('employment', 'basicSalary')!;
  assert.deepEqual(coerceValue(salary, '£42,500'), { ok: true, value: 42500 });
  assert.equal(coerceValue(salary, '-5').ok, false);
  assert.deepEqual(coerceValue(salary, ''), { ok: true, value: null });

  const status = getField('employment', 'status')!;
  assert.deepEqual(coerceValue(status, 'employed'), { ok: true, value: 'Employed' });
  assert.deepEqual(coerceValue(status, 'Self-employed'), { ok: true, value: 'Self-employed (sole trader)' });
  assert.equal(coerceValue(status, 'astronaut').ok, false);

  const yn = getField('creditHistory', 'ccjs')!;
  assert.deepEqual(coerceValue(yn, 'No'), { ok: true, value: 'no' });
  assert.equal(coerceValue(yn, 'maybe').ok, false);

  const email = getField('contact', 'email')!;
  assert.deepEqual(coerceValue(email, ' Jordan@Example.com '), { ok: true, value: 'jordan@example.com' });
  assert.equal(coerceValue(email, 'not-an-email').ok, false);

  const phone = getField('contact', 'mobile')!;
  assert.deepEqual(coerceValue(phone, '07700 900 123'), { ok: true, value: '07700900123' });
  assert.equal(coerceValue(phone, '123').ok, false);

  const name = getField('personal', 'firstName')!;
  assert.equal(coerceValue(name, 'x'.repeat(501)).ok, false);
});

test('formatGBP', () => {
  assert.equal(formatGBP(285000), '£285,000');
  assert.equal(formatGBP(1234.5), '£1,234.50');
});
