import assert from 'node:assert/strict';
import test from 'node:test';
import { previousWorkday, scannerWorkday, workdayBounds } from '../../server/workday.mjs';

test('Amsterdam workdays use exact half-open 16:00 boundaries', () => {
  assert.equal(scannerWorkday('2026-08-18T13:59:59.999Z'), '2026-08-18');
  assert.equal(scannerWorkday('2026-08-18T14:00:00.000Z'), '2026-08-19');
  assert.equal(previousWorkday('2026-03-01'), '2026-02-28');
  const summer = workdayBounds('2026-08-18');
  assert.equal(summer.start.toISOString(), '2026-08-17T14:00:00.000Z');
  assert.equal(summer.end.toISOString(), '2026-08-18T14:00:00.000Z');
});

test('Amsterdam workday bounds follow daylight saving changes', () => {
  const spring = workdayBounds('2026-03-30');
  assert.equal(spring.start.toISOString(), '2026-03-29T14:00:00.000Z');
  assert.equal(spring.end.toISOString(), '2026-03-30T14:00:00.000Z');
  const winter = workdayBounds('2026-11-02');
  assert.equal(winter.start.toISOString(), '2026-11-01T15:00:00.000Z');
  assert.equal(winter.end.toISOString(), '2026-11-02T15:00:00.000Z');
  assert.throws(() => workdayBounds('2026-02-30'), RangeError);
});
