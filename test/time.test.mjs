import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatLocalTime } from '../app/time.js';

const OPENED = '2026-11-12T03:03:00.000Z';

test('Berlin viewer sees day before month in Berlin time', () => {
  assert.equal(formatLocalTime(OPENED, 'de-DE', 'Europe/Berlin'), '12/11 04:03');
});

test('Auckland viewer sees day before month in Auckland time', () => {
  assert.equal(formatLocalTime(OPENED, 'en-NZ', 'Pacific/Auckland'), '12/11 4:03 pm');
});

test('US viewer sees month before day', () => {
  assert.equal(formatLocalTime(OPENED, 'en-US', 'America/New_York'), '11/11 10:03 PM');
});
