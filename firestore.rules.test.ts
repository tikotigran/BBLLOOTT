import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  validateUserProfilePayload,
  validateHandPayload,
  ROOM_CODE_PATTERN,
  PASSWORD_HASH_PATTERN,
  isValidRoomPassword,
  hashRoomPassword,
} from './src/utils/firestorePayloads';

const SERVER_TOKEN = { serverTimestamp: true };

test('Dirty Dozen security invariants & Firestore rule structure', () => {
  const rulesText = fs.readFileSync('firestore.rules', 'utf8');
  const roomServiceText = fs.readFileSync('src/services/roomService.ts', 'utf8');

  // Verify default deny catch-all, email_verified gate, terminal lock, and Master Gate exist
  assert.ok(rulesText.includes('allow read, write: if false;'));
  assert.ok(rulesText.includes('request.auth.token.email_verified == true'));
  assert.ok(rulesText.includes("existing().status != 'finished'"));
  assert.ok(rulesText.includes("existing().status == 'waiting'\n            && request.auth.uid == existing().hostUid\n            && incoming().status == 'finished'"));
  assert.ok(rulesText.includes("incoming().diff(existing()).affectedKeys().hasOnly([\n              'status', 'updatedAt'\n            ])"));
  assert.ok(rulesText.includes("allow delete: if isSignedIn() && isVerified() && isValidRoomCode(roomId)\n        && existing().status == 'waiting'\n        && existing().hostUid == request.auth.uid;"));
  assert.ok(roomServiceText.includes("if (live.hostUid !== callerUid) return;\n        tx.delete(ref);"));
  assert.ok(rulesText.includes('isRecentServerTime(getAfter(/databases/$(database)/documents/rooms/$(roomId)).data.updatedAt)'));
  assert.ok(rulesText.includes('isRecentServerTime(incoming().updatedAt)'));
  assert.ok(rulesText.includes("!incoming().diff(existing()).affectedKeys().hasAny(['createdAt', 'passwordHash'])"));
  assert.ok(rulesText.includes("'joinPasswordHash' in incoming() && incoming().joinPasswordHash == existing().passwordHash"));
  assert.ok(!rulesText.includes('allow read: if isSignedIn();'));

  // Room password validation & deterministic SHA-256 hashing
  assert.equal(isValidRoomPassword(''), false);
  assert.equal(isValidRoomPassword('1'), false);
  assert.equal(isValidRoomPassword('12'), true);
  assert.equal(isValidRoomPassword('  1234  '), true);
  assert.equal(isValidRoomPassword('a'.repeat(25)), true); // truncated to 20 chars

  const hashA = hashRoomPassword('ab12cd', ' 1234 ');
  const hashB = hashRoomPassword('AB12CD', '1234');
  const hashOtherPw = hashRoomPassword('AB12CD', '5678');
  const hashOtherRoom = hashRoomPassword('XY98ZW', '1234');
  assert.equal(PASSWORD_HASH_PATTERN.test(hashA), true);
  assert.equal(hashA, hashB);
  assert.notEqual(hashA, hashOtherPw);
  assert.notEqual(hashA, hashOtherRoom);

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
