import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, sanitizeSettings } from './settings';

test('sanitizeSettings returns defaults for null or empty input', () => {
  assert.deepEqual(sanitizeSettings(null), DEFAULT_SETTINGS);
  assert.deepEqual(sanitizeSettings({}), DEFAULT_SETTINGS);
});

test('sanitizeSettings clamps out-of-range numeric values and falls back invalid enums', () => {
  const sanitized = sanitizeSettings({
    playerFanSpread: 999,
    playerFanAngle: -5,
    cardScale: 4,
    tableTheme: 'invalid' as never,
    cardBackTheme: 'unknown' as never,
    showBottomIndex: true,
    showRoundResultModal: false,
    botsEnabled: true,
    botAutoPlay: true,
  });

  assert.equal(sanitized.playerFanSpread, 78);
  assert.equal(sanitized.playerFanAngle, 0);
  assert.equal(sanitized.cardScale, 1.25);
  assert.equal(sanitized.tableTheme, DEFAULT_SETTINGS.tableTheme);
  assert.equal(sanitized.cardBackTheme, DEFAULT_SETTINGS.cardBackTheme);
  assert.equal(sanitized.showBottomIndex, true);
  assert.equal(sanitized.showRoundResultModal, false);
  assert.equal(sanitized.botsEnabled, true);
  assert.equal(sanitized.botAutoPlay, true);
  assert.equal(DEFAULT_SETTINGS.botsEnabled, false);
  assert.equal(DEFAULT_SETTINGS.botAutoPlay, false);
  assert.equal(sanitizeSettings({ botsEnabled: false, botAutoPlay: true }).botAutoPlay, false);
});
