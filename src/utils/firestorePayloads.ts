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

export interface RoomRoundBreakdown {
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
  winnerUid: string;
  config: {
    tableId: number;
    gameLimit: number;
    betAmount: number;
    allowHighCombos: boolean;
    allCombinationsDisabled: boolean;
    turnTimeLimit: number;
  };
  round: {
    roundNumber: number;
    dealerRole: 'host' | 'guest';
    turnRole: 'host' | 'guest';
    phase: GamePhase;
    trump: '' | TrumpType;
    bidderRole: '' | 'host' | 'guest';
    lastWinnerRole: '' | 'host' | 'guest';
    pendingExtraDrawRole: '' | 'host' | 'guest';
  };
  scores: {
    hostScore: number;
    guestScore: number;
    hostRoundScore: number;
    guestRoundScore: number;
    hostCardCount: number;
    guestCardCount: number;
  };
  board: {
    offeredCard: Card | null;
    deck: Card[];
    trickHostCard: Card | null;
    trickGuestCard: Card | null;
    playedCards: { host: Card; guest: Card; winnerRole: 'host' | 'guest' }[];
    roundBreakdown: RoomRoundBreakdown | null;
  };
  combos: {
    hostAnnounced: Combination[];
    guestAnnounced: Combination[];
    hostDeclared: Combination[];
    guestDeclared: Combination[];
  };
  flags: {
    hostHasShown: boolean;
    guestHasShown: boolean;
    hostCanDeclare: boolean;
    guestCanDeclare: boolean;
    hostCanShow: boolean;
    guestCanShow: boolean;
    hostBlot: boolean;
    guestBlot: boolean;
  };
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

export function isValidOnlineRoomShape(doc: unknown): doc is OnlineRoomDoc {
  if (!doc || typeof doc !== 'object') return false;
  const r = doc as Partial<OnlineRoomDoc>;
  return Boolean(
    typeof r.roomCode === 'string' &&
      typeof r.hostUid === 'string' &&
      r.config &&
      typeof r.config.betAmount === 'number' &&
      r.round &&
      r.scores &&
      r.board &&
      r.combos &&
      r.flags
  );
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

export function getRoomErrorMessage(error: unknown, fallback: string): string {
  const errorRecord =
    typeof error === 'object' && error !== null
      ? (error as { code?: unknown; message?: unknown })
      : null;
  let code = typeof errorRecord?.code === 'string' ? errorRecord.code : '';
  let message =
    typeof errorRecord?.message === 'string'
      ? errorRecord.message
      : typeof error === 'string'
        ? error
        : '';

  let parsedOp = '';
  let parsedPath = '';
  let emailVerified: boolean | null = null;
  let userId: string | null = null;
  try {
    const parsed = JSON.parse(message) as {
      error?: unknown;
      operationType?: unknown;
      path?: unknown;
      authInfo?: { emailVerified?: unknown; userId?: unknown };
    };
    if (typeof parsed.error === 'string') message = parsed.error;
    if (typeof parsed.operationType === 'string') parsedOp = parsed.operationType;
    if (typeof parsed.path === 'string') parsedPath = parsed.path;
    if (typeof parsed.authInfo?.emailVerified === 'boolean') {
      emailVerified = parsed.authInfo.emailVerified;
    }
    if (typeof parsed.authInfo?.userId === 'string') {
      userId = parsed.authInfo.userId;
    }
  } catch {
    // Firebase errors can also arrive as plain messages.
  }

  const codePrefixMatch = message.match(/^\[([a-z0-9/_-]+)\]\s*(.*)$/i);
  if (codePrefixMatch) {
    if (!code) code = codePrefixMatch[1];
    message = codePrefixMatch[2];
  }

  const details = `${code} ${message}`.toLowerCase();
  const displayCode =
    code ||
    (details.includes('permission-denied') || details.includes('missing or insufficient permissions')
      ? 'permission-denied'
      : details.includes('unauthenticated')
        ? 'unauthenticated'
        : details.includes('invalid-argument')
          ? 'invalid-argument'
          : '');
  const codeSuffix = displayCode ? ` [${displayCode}]` : '';
  const opTag = parsedOp && parsedPath ? ` (${parsedOp}: ${parsedPath})` : '';
  const rawSnippet = message ? ` — ${message.slice(0, 140)}` : '';

  if (details.includes('unauthenticated') || code.startsWith('auth/') || (!userId && parsedOp)) {
    if (parsedOp && !userId) {
      return `Нет активной авторизации Firebase Auth${opTag}${codeSuffix}. Войдите через Google и повторите попытку${rawSnippet}.`;
    }
    return `Ошибка авторизации${opTag}${codeSuffix}: войдите через Google заново${rawSnippet}.`;
  }

  if (details.includes('permission-denied') || details.includes('missing or insufficient permissions')) {
    if (emailVerified === false) {
      return `Аккаунт Google не подтверждён${opTag}${codeSuffix}. Подтвердите email и войдите снова${rawSnippet}.`;
    }
    if (parsedOp === 'create') {
      return `Не удалось создать стол${opTag}${codeSuffix}. Запись отклонена правилами Firestore (или устарели опубликованные правила)${rawSnippet}.`;
    }
    if (parsedOp === 'delete') {
      return `Не удалось удалить стол${opTag}${codeSuffix}. Убедитесь, что стол создали вы и игра ещё не началась${rawSnippet}.`;
    }
    if (parsedOp === 'list') {
      return `Не удалось загрузить список столов${opTag}${codeSuffix}. Проверьте вход через Google и правила Firestore${rawSnippet}.`;
    }
    return `Нет доступа к столу${opTag}${codeSuffix}. Проверьте правила Firestore, авторизацию Google и что стол ещё открыт${rawSnippet}.`;
  }

  if (details.includes('invalid-argument') || details.includes('failed-precondition')) {
    return `Ошибка структуры данных стола${opTag}${codeSuffix}${rawSnippet}.`;
  }

  if (details.includes('unavailable') || details.includes('offline') || details.includes('network')) {
    return `Не удалось связаться с сервером${codeSuffix}. Проверьте интернет и попробуйте ещё раз${rawSnippet}.`;
  }

  return message && message.length < 220
    ? `${displayCode ? `[${displayCode}] ` : ''}${message}`
    : fallback;
}

export interface CreateRoomPayloadOptions {
  roomCode: string;
  hostUid: string;
  hostNickname?: string;
  hostShortId?: string;
  tableId?: number;
  gameLimit: number;
  betAmount: number;
  allowHighCombos: boolean;
  allCombinationsDisabled: boolean;
  turnTimeLimit: number;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface CreateRoomDebugFields {
  roomCode: string;
  authUid: string;
  emailVerified: boolean;
  hostUid: string;
  hostShortId: string;
  hostName: string;
  config: OnlineRoomDoc['config'];
  round: OnlineRoomDoc['round'];
  scores: OnlineRoomDoc['scores'];
  board: OnlineRoomDoc['board'];
  combos: OnlineRoomDoc['combos'];
  flags: OnlineRoomDoc['flags'];
  ruleViolations: string[];
}

export function buildInitialOnlineRoomPayload(
  opts: CreateRoomPayloadOptions
): OnlineRoomDoc {
  const safeUid = typeof opts.hostUid === 'string' ? opts.hostUid.trim() : '';
  const safeRoomCode = sanitizeRoomCode(opts.roomCode);
  const rawShortId = typeof opts.hostShortId === 'string' ? opts.hostShortId.trim() : '';
  const safeShortId = SHORT_ID_PATTERN.test(rawShortId)
    ? rawShortId
    : deriveShortIdFromUid(safeUid);
  const safeHostName =
    sanitizeNickname(typeof opts.hostNickname === 'string' ? opts.hostNickname : '') || 'Игрок 1';
  const rawTableId =
    typeof opts.tableId === 'number' && Number.isFinite(opts.tableId)
      ? Math.floor(opts.tableId)
      : Math.floor(100000000 + Math.random() * 900000000);
  const safeTableId = Math.min(2147483647, Math.max(100000, rawTableId));

  return {
    roomCode: safeRoomCode,
    hostUid: safeUid,
    hostName: safeHostName,
    hostShortId: safeShortId,
    guestUid: '',
    guestName: '',
    guestShortId: '',
    status: 'waiting',
    winnerUid: '',
    config: {
      tableId: safeTableId,
      gameLimit: [51, 101, 151].includes(opts.gameLimit) ? opts.gameLimit : 101,
      betAmount: Number.isFinite(opts.betAmount)
        ? Math.min(100000, Math.max(1000, Math.round(opts.betAmount)))
        : 1000,
      allowHighCombos: Boolean(opts.allowHighCombos),
      allCombinationsDisabled: Boolean(opts.allCombinationsDisabled),
      turnTimeLimit: [15, 20, 30].includes(opts.turnTimeLimit) ? opts.turnTimeLimit : 30,
    },
    round: {
      roundNumber: 0,
      dealerRole: 'guest',
      turnRole: 'host',
      phase: 'OFFERING_TRUMP',
      trump: '',
      bidderRole: '',
      lastWinnerRole: '',
      pendingExtraDrawRole: '',
    },
    scores: {
      hostScore: 0,
      guestScore: 0,
      hostRoundScore: 0,
      guestRoundScore: 0,
      hostCardCount: 0,
      guestCardCount: 0,
    },
    board: {
      offeredCard: null,
      deck: [],
      trickHostCard: null,
      trickGuestCard: null,
      playedCards: [],
      roundBreakdown: null,
    },
    combos: {
      hostAnnounced: [],
      guestAnnounced: [],
      hostDeclared: [],
      guestDeclared: [],
    },
    flags: {
      hostHasShown: false,
      guestHasShown: false,
      hostCanDeclare: true,
      guestCanDeclare: true,
      hostCanShow: true,
      guestCanShow: true,
      hostBlot: false,
      guestBlot: false,
    },
    createdAt: opts.createdAt,
    updatedAt: opts.updatedAt,
  };
}

export function validateCreateRoomPayload(
  payload: OnlineRoomDoc,
  roomId: string,
  authUid: string
): string[] {
  const errors: string[] = [];
  if (!ROOM_CODE_PATTERN.test(roomId)) errors.push('roomId invalid');
  if (payload.roomCode !== roomId) errors.push('roomCode !== roomId');
  if (!ID_PATTERN.test(payload.hostUid) || payload.hostUid !== authUid) {
    errors.push('hostUid !== authUid');
  }
  if (typeof payload.hostName !== 'string' || payload.hostName.length < 1 || payload.hostName.length > 24) {
    errors.push('hostName length invalid');
  }
  if (!SHORT_ID_PATTERN.test(payload.hostShortId)) {
    errors.push('hostShortId does not match ^[0-9]{7}$');
  }
  if (payload.guestUid !== '' || payload.guestName !== '' || payload.guestShortId !== '') {
    errors.push('guest fields must be empty on create');
  }
  if (payload.status !== 'waiting') errors.push('status must be waiting');
  if (payload.winnerUid !== '') errors.push('winnerUid must be empty');

  const { config, round, scores, board, combos, flags } = payload;
  if (typeof config.tableId !== 'number' || config.tableId < 100000 || config.tableId > 2147483647) {
    errors.push('config.tableId out of range');
  }
  if (![51, 101, 151].includes(config.gameLimit)) errors.push('config.gameLimit invalid');
  if (typeof config.betAmount !== 'number' || config.betAmount < 1000 || config.betAmount > 100000) {
    errors.push('config.betAmount invalid');
  }
  if (![15, 20, 30].includes(config.turnTimeLimit)) errors.push('config.turnTimeLimit invalid');
  if (typeof config.allowHighCombos !== 'boolean' || typeof config.allCombinationsDisabled !== 'boolean') {
    errors.push('config boolean flags invalid');
  }

  if (typeof round.roundNumber !== 'number' || round.roundNumber < 0 || round.roundNumber > 100) {
    errors.push('round.roundNumber invalid');
  }
  if (!['host', 'guest'].includes(round.dealerRole) || !['host', 'guest'].includes(round.turnRole)) {
    errors.push('round role invalid');
  }
  if (!['OFFERING_TRUMP', 'SUIT_SELECTION', 'PLAYING', 'RESULT', 'GAME_OVER'].includes(round.phase)) {
    errors.push('round.phase invalid');
  }
  if (!['', 'HEARTS', 'DIAMONDS', 'CLUBS', 'SPADES', 'NO_TRUMP'].includes(round.trump)) {
    errors.push('round.trump invalid');
  }
  if (!['', 'host', 'guest'].includes(round.bidderRole) || !['', 'host', 'guest'].includes(round.lastWinnerRole) || !['', 'host', 'guest'].includes(round.pendingExtraDrawRole)) {
    errors.push('round optional role invalid');
  }

  if (
    scores.hostScore !== 0 ||
    scores.guestScore !== 0 ||
    scores.hostRoundScore !== 0 ||
    scores.guestRoundScore !== 0 ||
    scores.hostCardCount !== 0 ||
    scores.guestCardCount !== 0
  ) {
    errors.push('scores must initialize to 0');
  }

  if (!Array.isArray(board.deck) || !Array.isArray(board.playedCards)) {
    errors.push('board arrays invalid');
  }
  if (
    !Array.isArray(combos.hostAnnounced) ||
    !Array.isArray(combos.guestAnnounced) ||
    !Array.isArray(combos.hostDeclared) ||
    !Array.isArray(combos.guestDeclared)
  ) {
    errors.push('combos arrays invalid');
  }
  if (Object.values(flags).some((v) => typeof v !== 'boolean')) {
    errors.push('flags must all be boolean');
  }
  if (!payload.createdAt || !payload.updatedAt) {
    errors.push('createdAt/updatedAt missing');
  }

  return errors;
}

export function extractRoomDebugSummary(error: unknown): CreateRoomDebugFields | null {
  if (typeof error === 'object' && error !== null && 'roomDebug' in error) {
    const debug = (error as { roomDebug?: unknown }).roomDebug;
    if (debug && typeof debug === 'object') {
      return debug as CreateRoomDebugFields;
    }
  }
  return null;
}

