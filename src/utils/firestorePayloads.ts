import { Card, Combination, GamePhase, TrumpType } from '../types';

export type AvatarTheme = 'classic' | 'emerald' | 'crimson' | 'gold';

export interface UserProfile {
  uid: string;
  nickname: string;
  shortId: string;
  avatarId: AvatarTheme;
  balance: number;
  gamesPlayed: number;
  wins: number;
  registrationComplete: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface OnlineRoomDoc {
  roomCode: string;
  hostUid: string;
  hostName: string;
  hostShortId: string;
  guestUid: string;
  guestName: string;
  guestShortId: string;
  status: 'waiting' | 'playing' | 'finished';
  tableId: number;
  gameLimit: number;
  betAmount: number;
  allowHighCombos: boolean;
  allCombinationsDisabled: boolean;
  turnTimeLimit: number;
  roundNumber: number;
  dealerRole: 'host' | 'guest';
  turnRole: 'host' | 'guest';
  phase: GamePhase;
  trump: '' | TrumpType;
  bidderRole: '' | 'host' | 'guest';
  lastWinnerRole: '' | 'host' | 'guest';
  pendingExtraDrawRole: '' | 'host' | 'guest';
  winnerUid: string;
  hostScore: number;
  guestScore: number;
  hostRoundScore: number;
  guestRoundScore: number;
  hostCardCount: number;
  guestCardCount: number;
  offeredCard: Card | null;
  deck: Card[];
  trickHostCard: Card | null;
  trickGuestCard: Card | null;
  playedCards: { host: Card; guest: Card; winnerRole: 'host' | 'guest' }[];
  hostAnnouncedCombos: Combination[];
  guestAnnouncedCombos: Combination[];
  hostDeclaredCombos: Combination[];
  guestDeclaredCombos: Combination[];
  hostHasShownCombos: boolean;
  guestHasShownCombos: boolean;
  hostCanDeclare: boolean;
  guestCanDeclare: boolean;
  hostCanShow: boolean;
  guestCanShow: boolean;
  hostBlotDeclared: boolean;
  guestBlotDeclared: boolean;
  roundBreakdown: {
    host: {
      tricks: number;
      combos: { type: string; points: number; highRank?: string }[];
      total: number;
      finalPaper: number;
      originalTricks: number;
      originalCombos: { type: string; points: number; highRank?: string }[];
    };
    guest: {
      tricks: number;
      combos: { type: string; points: number; highRank?: string }[];
      total: number;
      finalPaper: number;
      originalTricks: number;
      originalCombos: { type: string; points: number; highRank?: string }[];
    };
    isBait: boolean;
    bidderRole: 'host' | 'guest';
  } | null;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export const ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
export const SHORT_ID_PATTERN = /^[0-9]{7}$/;
export const ROOM_CODE_PATTERN = /^[a-zA-Z0-9_-]{4,16}$/;
export const AVATAR_IDS: AvatarTheme[] = ['classic', 'emerald', 'crimson', 'gold'];
export const WAITING_ROOM_HEARTBEAT_MS = 12_000;
export const WAITING_ROOM_TTL_MS = 45_000;

export function getTimestampMillis(ts: unknown): number | null {
  if (ts == null) return null;
  if (typeof ts === 'number' && Number.isFinite(ts)) return ts;
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts === 'object') {
    const maybe = ts as {
      toMillis?: () => number;
      seconds?: number;
      nanoseconds?: number;
    };
    if (typeof maybe.toMillis === 'function') {
      const val = maybe.toMillis();
      return Number.isFinite(val) ? val : null;
    }
    if (typeof maybe.seconds === 'number' && Number.isFinite(maybe.seconds)) {
      const nanos = typeof maybe.nanoseconds === 'number' ? maybe.nanoseconds : 0;
      return maybe.seconds * 1000 + Math.floor(nanos / 1_000_000);
    }
  }
  return null;
}

export function isWaitingRoomActive(
  room: Pick<OnlineRoomDoc, 'status' | 'updatedAt' | 'createdAt'>,
  nowMs = Date.now(),
  ttlMs = WAITING_ROOM_TTL_MS
): boolean {
  if (room.status !== 'waiting') return false;
  const tsMs = getTimestampMillis(room.updatedAt) ?? getTimestampMillis(room.createdAt);
  if (tsMs === null) return true;
  return nowMs - tsMs <= ttlMs;
}

export function sanitizeNickname(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').slice(0, 24);
}

export function isValidNickname(raw: string): boolean {
  const cleaned = sanitizeNickname(raw);
  return cleaned.length >= 2 && cleaned.length <= 24;
}

export function deriveShortIdFromUid(uid: string): string {
  let hash = 0;
  for (let i = 0; i < uid.length; i += 1) {
    hash = (hash * 31 + uid.charCodeAt(i)) % 9000000;
  }
  return String(1000000 + Math.abs(hash)).slice(0, 7);
}

export function generateRoomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

export function sanitizeRoomCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 16);
}

export function sanitizeCard(card: Card): Card {
  return {
    id: String(card.id).slice(0, 24),
    suit: card.suit,
    rank: card.rank,
  };
}

export function sanitizeComboList(list: Combination[]): Combination[] {
  return list.slice(0, 4).map((c) => ({
    type: c.type,
    points: c.points,
    rankOrder: c.rankOrder,
    ...(c.suit ? { suit: c.suit } : {}),
    ...(c.highRank ? { highRank: c.highRank } : {}),
    strength: c.strength,
    ...(c.cardIds ? { cardIds: c.cardIds.slice(0, 8) } : {}),
  }));
}

const USER_KEYS = new Set([
  'uid',
  'nickname',
  'shortId',
  'avatarId',
  'balance',
  'gamesPlayed',
  'wins',
  'registrationComplete',
  'createdAt',
  'updatedAt',
]);

export function validateUserProfilePayload(
  payload: Record<string, unknown>,
  authUid: string
): boolean {
  const keys = Object.keys(payload);
  if (keys.length !== USER_KEYS.size || keys.some((k) => !USER_KEYS.has(k))) return false;
  if (typeof payload.uid !== 'string' || !ID_PATTERN.test(payload.uid) || payload.uid !== authUid) return false;
  if (typeof payload.nickname !== 'string' || payload.nickname.length < 2 || payload.nickname.length > 24) return false;
  if (typeof payload.shortId !== 'string' || !SHORT_ID_PATTERN.test(payload.shortId)) return false;
  if (typeof payload.avatarId !== 'string' || !AVATAR_IDS.includes(payload.avatarId as AvatarTheme)) return false;
  if (typeof payload.balance !== 'number' || payload.balance < 0 || payload.balance > 1000000000) return false;
  if (typeof payload.gamesPlayed !== 'number' || payload.gamesPlayed < 0 || payload.gamesPlayed > 1000000) return false;
  if (typeof payload.wins !== 'number' || payload.wins < 0 || payload.wins > payload.gamesPlayed) return false;
  if (typeof payload.registrationComplete !== 'boolean') return false;
  if (!payload.createdAt || !payload.updatedAt) return false;
  return true;
}

export function validateHandPayload(
  payload: Record<string, unknown>,
  playerId: string,
  roomId: string
): boolean {
  const allowed = ['uid', 'roomId', 'cards', 'updatedAt'];
  const keys = Object.keys(payload);
  if (keys.length !== allowed.length || keys.some((k) => !allowed.includes(k))) return false;
  if (typeof payload.uid !== 'string' || !ID_PATTERN.test(payload.uid) || payload.uid !== playerId) return false;
  if (typeof payload.roomId !== 'string' || !ROOM_CODE_PATTERN.test(payload.roomId) || payload.roomId !== roomId) return false;
  if (!Array.isArray(payload.cards) || payload.cards.length > 8) return false;
  if (!payload.updatedAt) return false;
  return true;
}
