import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildInitialOnlineRoomPayload,
  validateCreateRoomPayload,
  extractRoomDebugSummary,
  validateUserProfilePayload,
  validateHandPayload,
  isWaitingRoomActive,
  getRoomErrorMessage,
  WAITING_ROOM_TTL_MS,
  ROOM_CODE_PATTERN,
} from './src/utils/firestorePayloads';

const SERVER_TOKEN = { serverTimestamp: true };

test('Dirty Dozen security invariants & Firestore rule structure', () => {
  const rulesText = fs.readFileSync('firestore.rules', 'utf8');
  const roomServiceText = fs.readFileSync('src/services/roomService.ts', 'utf8');

  // Verify default deny catch-all, email_verified gate, terminal lock, and Master Gate exist
  assert.ok(rulesText.includes('allow read, write: if false;'));
  assert.ok(rulesText.includes('request.auth.token.email_verified == true'));
  assert.ok(rulesText.includes("existing().status != 'finished'"));
  assert.ok(rulesText.includes("existing().status == 'waiting'\n            && existing().guestUid == ''\n            && isRecentServerTime(existing().updatedAt)"));
  assert.ok(rulesText.includes("existing().status == 'waiting'\n            && request.auth.uid == existing().hostUid\n            && incoming().status == 'finished'"));
  assert.ok(rulesText.includes("existing().status == 'waiting'\n            && request.auth.uid == existing().hostUid\n            && incoming().status == 'waiting'"));
  assert.ok(rulesText.includes("incoming().diff(existing()).affectedKeys().hasOnly([\n              'status', 'updatedAt'\n            ])"));
  assert.ok(rulesText.includes("allow delete: if isSignedIn() && isVerified() && isValidRoomCode(roomId)\n        && existing().status == 'waiting'\n        && existing().hostUid == request.auth.uid;"));
  assert.ok(roomServiceText.includes("if (live.hostUid !== activeUid) return;\n        tx.delete(ref);"));
  assert.ok(rulesText.includes('isIncomingServerTime(getAfter(/databases/$(database)/documents/rooms/$(roomId)).data.updatedAt)'));
  assert.ok(rulesText.includes('isIncomingServerTime(incoming().createdAt)'));
  assert.ok(rulesText.includes('isIncomingServerTime(incoming().updatedAt)'));
  assert.ok(rulesText.includes('isRecentServerTime(existing().updatedAt)'));
  assert.ok(rulesText.includes('function isTimestampOrServerTime(ts) {\n      return ts == request.time || ts is timestamp;\n    }'));
  assert.ok(rulesText.includes('function isIncomingServerTime(ts) {\n      return ts == request.time\n        || ('));
  assert.ok(rulesText.includes("!incoming().diff(existing()).affectedKeys().hasAny(['createdAt'])"));
  assert.ok(rulesText.includes('function isValidRoomConfig(cfg)'));
  assert.ok(rulesText.includes('function isValidRoomRound(rnd)'));
  assert.ok(rulesText.includes('function isValidRoomScores(sc)'));
  assert.ok(rulesText.includes('function isValidRoomBoard(brd)'));
  assert.ok(rulesText.includes('function isValidRoomCombos(cmb)'));
  assert.ok(rulesText.includes('function isValidRoomFlags(flg)'));
  assert.ok(rulesText.includes('incoming().config == existing().config'));
  assert.ok(!rulesText.includes('allow read: if isSignedIn();'));

  // 1 & 2: Valid user profile vs Cross-user / Ghost field injection
  const validUser = {
    uid: 'user_A',
    nickname: 'Tigran',
    shortId: '2458007',
    avatarId: 'classic',
    balance: 220755,
    gamesPlayed: 5,
    wins: 3,
    registrationComplete: true,
    createdAt: SERVER_TOKEN,
    updatedAt: SERVER_TOKEN,
  };
  assert.equal(validateUserProfilePayload(validUser, 'user_A'), true);
  assert.equal(validateUserProfilePayload(validUser, 'user_B'), false); // Spoofed owner
  assert.equal(validateUserProfilePayload({ ...validUser, isAdmin: true }, 'user_A'), false); // Ghost field
  assert.equal(validateUserProfilePayload({ ...validUser, nickname: 'A' }, 'user_A'), false); // Too short
  assert.equal(validateUserProfilePayload({ ...validUser, wins: 99 }, 'user_A'), false); // Wins > gamesPlayed

  // 5 & 11: Room ID poisoning & Oversized hand array exhaustion
  assert.equal(ROOM_CODE_PATTERN.test('AB12CD'), true);
  assert.equal(ROOM_CODE_PATTERN.test('A'.repeat(200)), false);

  const validHand = {
    uid: 'user_A',
    roomId: 'AB12CD',
    cards: [{ id: 'HEARTS-9', suit: 'HEARTS', rank: '9' }],
    updatedAt: SERVER_TOKEN,
  };
  assert.equal(validateHandPayload(validHand, 'user_A', 'AB12CD'), true);
  assert.equal(validateHandPayload(validHand, 'user_B', 'AB12CD'), false); // Cross-player hand
  assert.equal(
    validateHandPayload(
      { ...validHand, cards: new Array(20).fill({ id: 'HEARTS-9', suit: 'HEARTS', rank: '9' }) },
      'user_A',
      'AB12CD'
    ),
    false
  ); // Array > 8
});

test('isWaitingRoomActive hides stale offline rooms and keeps active heartbeat rooms live', () => {
  const now = 1_700_000_000_000;
  assert.equal(
    isWaitingRoomActive(
      { status: 'waiting', updatedAt: { toMillis: () => now - 10_000 }, createdAt: now - 120_000 },
      now
    ),
    true
  );
  assert.equal(
    isWaitingRoomActive(
      { status: 'waiting', updatedAt: { toMillis: () => now - WAITING_ROOM_TTL_MS - 1_000 }, createdAt: now - 120_000 },
      now
    ),
    false
  );
  assert.equal(
    isWaitingRoomActive({ status: 'waiting', updatedAt: null, createdAt: null }, now),
    true
  );
  assert.equal(
    isWaitingRoomActive({ status: 'playing', updatedAt: now, createdAt: now }, now),
    false
  );
});

test('getRoomErrorMessage distinguishes create, delete, list, auth, and join permission errors with err.code', () => {
  const createErr = new Error(
    JSON.stringify({
      error: '[permission-denied] Missing or insufficient permissions.',
      operationType: 'create',
      path: 'rooms/7W66E6',
      authInfo: { userId: 'user_A', emailVerified: true },
    })
  );
  const createMsg = getRoomErrorMessage(createErr, 'fallback');
  assert.match(createMsg, /Не удалось создать стол/);
  assert.match(createMsg, /\[permission-denied\]/);
  assert.doesNotMatch(createMsg, /стол ещё открыт/);

  const updateErr = new Error(
    JSON.stringify({
      error: 'Missing or insufficient permissions.',
      operationType: 'update',
      path: 'rooms/VVGK8S',
      authInfo: { userId: 'user_A', emailVerified: true },
    })
  );
  assert.match(getRoomErrorMessage(updateErr, 'fallback'), /стол ещё открыт/);

  const deleteErr = new Error(
    JSON.stringify({
      error: 'Missing or insufficient permissions.',
      operationType: 'delete',
      path: 'rooms/V3GHJ4',
      authInfo: { userId: 'user_A', emailVerified: true },
    })
  );
  assert.match(getRoomErrorMessage(deleteErr, 'fallback'), /Не удалось удалить стол/);

  const unverifiedErr = new Error(
    JSON.stringify({
      error: 'Missing or insufficient permissions.',
      operationType: 'create',
      path: 'rooms/ABC123',
      authInfo: { userId: 'user_A', emailVerified: false },
    })
  );
  assert.match(getRoomErrorMessage(unverifiedErr, 'fallback'), /Аккаунт Google не подтверждён/);

  const unauthErr = new Error(
    JSON.stringify({
      error: '[permission-denied] Missing or insufficient permissions.',
      operationType: 'create',
      path: 'rooms/NOAUTH',
      authInfo: { userId: null, emailVerified: null },
    })
  );
  assert.match(getRoomErrorMessage(unauthErr, 'fallback'), /Нет активной авторизации Firebase Auth/);
});

test('buildInitialOnlineRoomPayload produces valid GameRoom payload matching firestore.rules constraints', () => {
  const payload = buildInitialOnlineRoomPayload({
    roomCode: 'AB12CD',
    hostUid: 'pED43O8bk4TwBemazS4zwunJqFi1',
    hostNickname: 'TikJan',
    hostShortId: 'invalid-short-id',
    tableId: 42, // below 100000 -> clamped to 100000
    gameLimit: 101,
    betAmount: 40000,
    allowHighCombos: true,
    allCombinationsDisabled: false,
    turnTimeLimit: 30,
    createdAt: SERVER_TOKEN,
    updatedAt: SERVER_TOKEN,
  });

  assert.equal(validateCreateRoomPayload(payload, 'AB12CD', 'pED43O8bk4TwBemazS4zwunJqFi1').length, 0);
  assert.match(payload.hostShortId, /^[0-9]{7}$/);
  assert.ok(payload.config.tableId >= 100000 && payload.config.tableId <= 2147483647);
  assert.equal(payload.round.phase, 'OFFERING_TRUMP');
  assert.equal(payload.round.trump, '');

  const invalidPayload = {
    ...payload,
    hostShortId: '123',
    config: { ...payload.config, tableId: 99 },
    round: { ...payload.round, phase: 'BAD_PHASE' as never, trump: 'BAD_TRUMP' as never },
    createdAt: null,
  };
  const violations = validateCreateRoomPayload(invalidPayload, 'AB12CD', 'pED43O8bk4TwBemazS4zwunJqFi1');
  assert.ok(violations.includes('hostShortId does not match ^[0-9]{7}$'));
  assert.ok(violations.includes('config.tableId out of range'));
  assert.ok(violations.includes('round.phase invalid'));
  assert.ok(violations.includes('round.trump invalid'));
  assert.ok(violations.includes('createdAt/updatedAt missing'));

  const wrapped = Object.assign(new Error('err'), {
    roomDebug: {
      roomCode: 'AB12CD',
      authUid: 'pED43O8bk4TwBemazS4zwunJqFi1',
      emailVerified: true,
      hostUid: payload.hostUid,
      hostShortId: payload.hostShortId,
      hostName: payload.hostName,
      config: payload.config,
      round: payload.round,
      scores: payload.scores,
      board: payload.board,
      combos: payload.combos,
      flags: payload.flags,
      ruleViolations: [],
    },
  });
  assert.equal(extractRoomDebugSummary(wrapped)?.hostShortId, payload.hostShortId);
});

