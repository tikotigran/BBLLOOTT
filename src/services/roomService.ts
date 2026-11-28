import {
  collection,
  doc,
  limit,
  onSnapshot,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  serverTimestamp,
  Unsubscribe,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { Card, Combination, Rank, Suit, TrumpType } from '../types';
import { createDeck, calculateRoundScore, resolveTrick } from '../logic/gameLogic';
import { getCardValue } from '../constants';
import {
  CreateRoomDebugFields,
  OnlineRoomDoc,
  UserProfile,
  SHORT_ID_PATTERN,
  buildInitialOnlineRoomPayload,
  deriveShortIdFromUid,
  generateRoomCode,
  isValidOnlineRoomShape,
  isWaitingRoomActive,
  sanitizeCard,
  sanitizeComboList,
  sanitizeNickname,
  sanitizeRoomCode,
  validateCreateRoomPayload,
} from '../utils/firestorePayloads';

export type RoomRole = 'host' | 'guest';

export class RoomActionError extends Error {}

const SUIT_ORDER: Record<Suit, number> = {
  [Suit.HEARTS]: 0,
  [Suit.DIAMONDS]: 1,
  [Suit.CLUBS]: 2,
  [Suit.SPADES]: 3,
};

const RANK_ORDER: Record<Rank, number> = {
  [Rank.NINE]: 0,
  [Rank.TEN]: 1,
  [Rank.JACK]: 2,
  [Rank.QUEEN]: 3,
  [Rank.KING]: 4,
  [Rank.ACE]: 5,
};

const sortCards = (hand: Card[]) =>
  [...hand].sort((a, b) => {
    if (SUIT_ORDER[a.suit] !== SUIT_ORDER[b.suit]) {
      return SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit];
    }
    return RANK_ORDER[a.rank] - RANK_ORDER[b.rank];
  });

const getPaperScore = (points: number) => {
  const base = Math.floor(points / 10);
  const remainder = points % 10;
  return remainder >= 6 ? base + 1 : base;
};

export interface CreateRoomOptions {
  gameLimit: number;
  betAmount: number;
  allowHighCombos: boolean;
  allCombinationsDisabled: boolean;
  turnTimeLimit: number;
}

const requireAuthenticatedUser = async (actionLabel: string) => {
  if (typeof auth.authStateReady === 'function') {
    await auth.authStateReady();
  }
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new RoomActionError(`Войдите через Google, чтобы ${actionLabel}`);
  }
  if (currentUser.emailVerified === false) {
    throw new RoomActionError(`Подтвердите email в Google-аккаунте, чтобы ${actionLabel}`);
  }
  await currentUser.getIdToken();
  return currentUser;
};

export const createOnlineRoom = async (
  host: UserProfile,
  options: CreateRoomOptions
): Promise<string> => {
  const currentUser = await requireAuthenticatedUser('создать стол');
  const activeUid = currentUser.uid;
  const roomCode = generateRoomCode();
  const path = `rooms/${roomCode}`;
  const ref = doc(db, 'rooms', roomCode);

  const payload: OnlineRoomDoc = buildInitialOnlineRoomPayload({
    roomCode,
    hostUid: activeUid,
    hostNickname: host.nickname,
    hostShortId: host.shortId,
    gameLimit: options.gameLimit,
    betAmount: options.betAmount,
    allowHighCombos: options.allowHighCombos,
    allCombinationsDisabled: options.allCombinationsDisabled,
    turnTimeLimit: options.turnTimeLimit,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const ruleViolations = validateCreateRoomPayload(payload, roomCode, activeUid);
  console.log('[createOnlineRoom] payload:', {
    ...payload,
    authUid: activeUid,
    emailVerified: currentUser.emailVerified,
    ruleViolations,
  });

  try {
    await setDoc(ref, payload);
    return roomCode;
  } catch (error) {
    const debugFields: CreateRoomDebugFields = {
      roomCode,
      authUid: activeUid,
      emailVerified: currentUser.emailVerified,
      hostUid: payload.hostUid,
      hostShortId: payload.hostShortId,
      hostName: payload.hostName,
      config: payload.config,
      round: payload.round,
      scores: payload.scores,
      board: payload.board,
      combos: payload.combos,
      flags: payload.flags,
      ruleViolations,
    };
    console.error('[createOnlineRoom] catch debugFields:', debugFields);
    try {
      handleFirestoreError(error, OperationType.CREATE, path);
    } catch (wrappedErr) {
      if (typeof wrappedErr === 'object' && wrappedErr !== null) {
        (wrappedErr as Error & { roomDebug?: CreateRoomDebugFields }).roomDebug = debugFields;
      }
      throw wrappedErr;
    }
  }
};

export const joinOnlineRoom = async (
  rawCode: string,
  guest: UserProfile
): Promise<string> => {
  const roomCode = sanitizeRoomCode(rawCode);
  if (roomCode.length < 4) {
    throw new RoomActionError('Введите корректный код стола (минимум 4 символа)');
  }
  const path = `rooms/${roomCode}`;
  const ref = doc(db, 'rooms', roomCode);
  const currentUser = await requireAuthenticatedUser('подключиться к столу');
  const activeUid = currentUser.uid;
  const safeShortId = SHORT_ID_PATTERN.test(guest.shortId || '')
    ? guest.shortId
    : deriveShortIdFromUid(activeUid);

  try {
    await runTransaction(db, async (tx) => {
      let snap;
      try {
        snap = await tx.get(ref);
      } catch (readError) {
        handleFirestoreError(readError, OperationType.GET, path);
      }

      if (!snap.exists()) {
        throw new RoomActionError('Стол с таким кодом не найден');
      }

      const raw = snap.data();
      if (!isValidOnlineRoomShape(raw)) {
        throw new RoomActionError('Этот стол устарел и больше недоступен');
      }
      const room = raw;
      if (room.hostUid === activeUid || room.guestUid === activeUid) {
        if (room.status === 'finished') {
          throw new RoomActionError('Эта игра уже завершена');
        }
        return;
      }

      if (room.status === 'finished') {
        throw new RoomActionError('Этот стол уже закрыт');
      }

      if (room.status !== 'waiting' || room.guestUid !== '') {
        throw new RoomActionError('К этому столу уже подключился другой игрок');
      }

      if (!isWaitingRoomActive(room)) {
        throw new RoomActionError('Создатель стола сейчас не в сети — стол деактивирован');
      }

      tx.update(ref, {
        guestUid: activeUid,
        guestName: sanitizeNickname(guest.nickname) || 'Игрок 2',
        guestShortId: safeShortId,
        status: 'playing',
        updatedAt: serverTimestamp(),
      });
    });
    return roomCode;
  } catch (error) {
    if (error instanceof RoomActionError) {
      throw error;
    }
    if (error instanceof Error) {
      try {
        const parsed = JSON.parse(error.message) as { operationType?: string };
        if (parsed.operationType) {
          throw error;
        }
      } catch (parseErr) {
        if (parseErr === error) throw error;
      }
    }
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
};

export const cancelWaitingOnlineRoom = async (
  roomCode: string,
  callerUid?: string
): Promise<void> => {
  const activeUid = auth.currentUser?.uid || callerUid;
  if (!activeUid) return;

  const path = `rooms/${roomCode}`;
  const ref = doc(db, 'rooms', roomCode);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) return;
      const live = snap.data() as OnlineRoomDoc;
      if (live.status === 'finished') return;
      if (live.hostUid !== activeUid && live.guestUid !== activeUid) return;

      if (live.status === 'waiting') {
        if (live.hostUid !== activeUid) return;
        tx.delete(ref);
      } else if (live.status === 'playing' && isValidOnlineRoomShape(live)) {
        const winnerUid =
          activeUid === live.hostUid
            ? live.guestUid || live.hostUid
            : live.hostUid;
        tx.update(ref, {
          status: 'finished',
          winnerUid,
          round: {
            ...live.round,
            phase: 'GAME_OVER',
          },
          updatedAt: serverTimestamp(),
        });
      }
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
};

export const touchWaitingRoomHeartbeat = async (
  roomCode: string,
  hostUid?: string
): Promise<void> => {
  const activeUid = auth.currentUser?.uid || hostUid;
  if (!activeUid || !roomCode) return;
  try {
    await updateDoc(doc(db, 'rooms', roomCode), {
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Ignore transient race if guest just joined (status became playing) or room was deleted.
  }
};

export const subscribeOnlineRoom = (
  roomCode: string,
  onData: (room: OnlineRoomDoc | null) => void,
  onError?: (error: unknown) => void
): Unsubscribe => {
  const path = `rooms/${roomCode}`;
  const ref = doc(db, 'rooms', roomCode);
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      const data = snap.data();
      onData(isValidOnlineRoomShape(data) ? data : null);
    },
    (error) => {
      if (onError) {
        onError(error);
        return;
      }
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
};

export const subscribeWaitingOnlineRooms = (
  onData: (rooms: OnlineRoomDoc[]) => void,
  onError?: (error: unknown) => void
): Unsubscribe => {
  const path = 'rooms';
  const q = query(
    collection(db, 'rooms'),
    where('status', '==', 'waiting'),
    limit(25)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const list = snapshot.docs
        .map((d) => d.data())
        .filter(isValidOnlineRoomShape);
      list.sort((a, b) => {
        const ta = (a.createdAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
        const tb = (b.createdAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
        return tb - ta;
      });
      onData(list);
    },
    (error) => {
      if (onError) {
        onError(error);
        return;
      }
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
};

export const subscribeMyOnlineHand = (
  roomCode: string,
  uid: string,
  onData: (cards: Card[]) => void,
  onError?: (error: unknown) => void
): Unsubscribe => {
  const path = `rooms/${roomCode}/hands/${uid}`;
  const ref = doc(db, 'rooms', roomCode, 'hands', uid);
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        onData([]);
        return;
      }
      const data = snap.data() as { cards?: Card[] };
      onData(sortCards(data.cards || []));
    },
    (error) => {
      if (onError) {
        onError(error);
        return;
      }
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
};

export const dealOnlineRound = async (
  room: OnlineRoomDoc,
  isNewGame: boolean
): Promise<void> => {
  if (!room.guestUid || room.status === 'finished') return;
  const deck = createDeck().map(sanitizeCard);
  const hostHand = sortCards(deck.slice(0, 5));
  const guestHand = sortCards(deck.slice(5, 10));
  const offeredCard = deck[10];
  const remaining = deck.slice(11);

  const nextDealer: RoomRole = room.round.dealerRole === 'host' ? 'guest' : 'host';
  const nextTurn: RoomRole = nextDealer === 'host' ? 'guest' : 'host';

  const batch = writeBatch(db);
  const roomRef = doc(db, 'rooms', room.roomCode);
  const hostHandRef = doc(db, 'rooms', room.roomCode, 'hands', room.hostUid);
  const guestHandRef = doc(db, 'rooms', room.roomCode, 'hands', room.guestUid);

  batch.set(hostHandRef, {
    uid: room.hostUid,
    roomId: room.roomCode,
    cards: hostHand,
    updatedAt: serverTimestamp(),
  });
  batch.set(guestHandRef, {
    uid: room.guestUid,
    roomId: room.roomCode,
    cards: guestHand,
    updatedAt: serverTimestamp(),
  });
  batch.update(roomRef, {
    round: {
      roundNumber: isNewGame ? 1 : room.round.roundNumber + 1,
      dealerRole: nextDealer,
      turnRole: nextTurn,
      phase: 'OFFERING_TRUMP',
      trump: '',
      bidderRole: '',
      lastWinnerRole: '',
      pendingExtraDrawRole: '',
    },
    scores: {
      hostScore: isNewGame ? 0 : room.scores.hostScore,
      guestScore: isNewGame ? 0 : room.scores.guestScore,
      hostRoundScore: 0,
      guestRoundScore: 0,
      hostCardCount: 5,
      guestCardCount: 5,
    },
    board: {
      offeredCard,
      deck: remaining,
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
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `rooms/${room.roomCode}`);
  }
};

export const onlineTakeTrump = async (
  room: OnlineRoomDoc,
  myRole: RoomRole,
  myUid: string,
  myHand: Card[],
  trump: TrumpType
): Promise<void> => {
  if (!room.board.offeredCard) return;
  const deck = [...room.board.deck];
  const extra = deck.splice(0, 2).map(sanitizeCard);
  const newMyHand = sortCards([
    ...myHand.map(sanitizeCard),
    sanitizeCard(room.board.offeredCard),
    ...extra,
  ]).slice(0, 8);
  const otherRole: RoomRole = myRole === 'host' ? 'guest' : 'host';
  const firstTurn: RoomRole = room.round.dealerRole === 'host' ? 'guest' : 'host';

  const batch = writeBatch(db);
  batch.set(doc(db, 'rooms', room.roomCode, 'hands', myUid), {
    uid: myUid,
    roomId: room.roomCode,
    cards: newMyHand,
    updatedAt: serverTimestamp(),
  });
  batch.update(doc(db, 'rooms', room.roomCode), {
    round: {
      ...room.round,
      trump,
      bidderRole: myRole,
      phase: 'PLAYING',
      pendingExtraDrawRole: otherRole,
      turnRole: firstTurn,
    },
    scores: {
      ...room.scores,
      ...(myRole === 'host'
        ? { hostCardCount: newMyHand.length }
        : { guestCardCount: newMyHand.length }),
    },
    board: {
      ...room.board,
      deck: deck.map(sanitizeCard),
      offeredCard: null,
    },
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `rooms/${room.roomCode}`);
  }
};

export const onlineDrawExtraCards = async (
  room: OnlineRoomDoc,
  myRole: RoomRole,
  myUid: string,
  myHand: Card[]
): Promise<void> => {
  if (room.round.pendingExtraDrawRole !== myRole) return;
  const deck = [...room.board.deck];
  const extra = deck.splice(0, 3).map(sanitizeCard);
  const newMyHand = sortCards([...myHand.map(sanitizeCard), ...extra]).slice(0, 8);

  const batch = writeBatch(db);
  batch.set(doc(db, 'rooms', room.roomCode, 'hands', myUid), {
    uid: myUid,
    roomId: room.roomCode,
    cards: newMyHand,
    updatedAt: serverTimestamp(),
  });
  batch.update(doc(db, 'rooms', room.roomCode), {
    round: {
      ...room.round,
      pendingExtraDrawRole: '',
    },
    scores: {
      ...room.scores,
      ...(myRole === 'host'
        ? { hostCardCount: newMyHand.length }
        : { guestCardCount: newMyHand.length }),
    },
    board: {
      ...room.board,
      deck: deck.map(sanitizeCard),
    },
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `rooms/${room.roomCode}`);
  }
};

export const onlinePassTrump = async (
  room: OnlineRoomDoc,
  myRole: RoomRole
): Promise<void> => {
  if (room.status !== 'playing' || room.round.turnRole !== myRole) return;
  const path = `rooms/${room.roomCode}`;
  const ref = doc(db, 'rooms', room.roomCode);

  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) return;
      const live = snap.data() as OnlineRoomDoc;
      if (live.status !== 'playing' || live.round.turnRole !== myRole) return;

      const otherRole: RoomRole = myRole === 'host' ? 'guest' : 'host';
      let nextPhase = live.round.phase;

      if (live.round.phase === 'OFFERING_TRUMP') {
        if (live.round.dealerRole === myRole) {
          if (live.board.offeredCard?.rank === Rank.JACK) return;
          nextPhase = 'SUIT_SELECTION';
        }
      } else if (live.round.phase === 'SUIT_SELECTION') {
        if (live.round.dealerRole === myRole) return;
      } else {
        return;
      }

      tx.update(ref, {
        round: {
          ...live.round,
          turnRole: otherRole,
          phase: nextPhase,
        },
        updatedAt: serverTimestamp(),
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
};

export const onlineAnnounceCombo = async (
  room: OnlineRoomDoc,
  myRole: RoomRole,
  chosen: Combination
): Promise<void> => {
  if (room.status !== 'playing') return;
  const path = `rooms/${room.roomCode}`;
  const ref = doc(db, 'rooms', room.roomCode);
  const hierarchy: Record<Combination['type'], number> = {
    Terz: 1,
    Fifty: 2,
    Hundred: 3,
    Carre: 4,
  };

  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) return;
      const live = snap.data() as OnlineRoomDoc;
      if (
        live.status !== 'playing' ||
        live.round.phase !== 'PLAYING' ||
        live.board.playedCards.length > 0 ||
        live.round.turnRole !== myRole
      ) {
        return;
      }
      const oppList =
        myRole === 'host' ? live.combos.guestAnnounced : live.combos.hostAnnounced;
      const oppStrongest = oppList.length > 0 ? oppList[0] : null;
      const clearOpp = Boolean(
        oppStrongest && hierarchy[chosen.type] > hierarchy[oppStrongest.type]
      );

      tx.update(ref, {
        combos: {
          ...live.combos,
          ...(myRole === 'host'
            ? {
                hostAnnounced: sanitizeComboList([chosen]),
                ...(clearOpp ? { guestAnnounced: [] } : {}),
              }
            : {
                guestAnnounced: sanitizeComboList([chosen]),
                ...(clearOpp ? { hostAnnounced: [] } : {}),
              }),
        },
        updatedAt: serverTimestamp(),
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
};

export const onlineShowCombos = async (
  room: OnlineRoomDoc,
  myRole: RoomRole,
  myAnnounced: Combination[]
): Promise<void> => {
  if (room.status !== 'playing') return;
  const path = `rooms/${room.roomCode}`;
  const ref = doc(db, 'rooms', room.roomCode);
  const sanitized = sanitizeComboList(myAnnounced);
  const totalPoints = sanitized.reduce((s, c) => s + c.points, 0);

  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) return;
      const live = snap.data() as OnlineRoomDoc;
      const alreadyShown =
        myRole === 'host' ? live.flags.hostHasShown : live.flags.guestHasShown;
      if (
        live.status !== 'playing' ||
        live.round.phase !== 'PLAYING' ||
        live.board.playedCards.length !== 1 ||
        live.round.turnRole !== myRole ||
        alreadyShown
      ) {
        return;
      }

      tx.update(ref, {
        scores: {
          ...live.scores,
          ...(myRole === 'host'
            ? { hostRoundScore: live.scores.hostRoundScore + totalPoints }
            : { guestRoundScore: live.scores.guestRoundScore + totalPoints }),
        },
        combos: {
          ...live.combos,
          ...(myRole === 'host'
            ? { hostDeclared: sanitized, guestAnnounced: [] }
            : { guestDeclared: sanitized, hostAnnounced: [] }),
        },
        flags: {
          ...live.flags,
          ...(myRole === 'host'
            ? { hostHasShown: true }
            : { guestHasShown: true }),
        },
        updatedAt: serverTimestamp(),
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
};

export const onlinePlayCard = async (
  room: OnlineRoomDoc,
  myRole: RoomRole,
  myUid: string,
  remainingHand: Card[],
  playedCard: Card,
  newBlotDeclared: boolean
): Promise<void> => {
  const otherRole: RoomRole = myRole === 'host' ? 'guest' : 'host';
  const oppHasCard =
    myRole === 'host'
      ? Boolean(room.board.trickGuestCard)
      : Boolean(room.board.trickHostCard);
  const trickIndex = room.board.playedCards.length;

  const myAnnounced =
    myRole === 'host' ? room.combos.hostAnnounced : room.combos.guestAnnounced;
  const myHasShown =
    myRole === 'host' ? room.flags.hostHasShown : room.flags.guestHasShown;

  const clearUnshown = trickIndex === 1 && !myHasShown;

  const batch = writeBatch(db);
  batch.set(doc(db, 'rooms', room.roomCode, 'hands', myUid), {
    uid: myUid,
    roomId: room.roomCode,
    cards: remainingHand.map(sanitizeCard),
    updatedAt: serverTimestamp(),
  });
  batch.update(doc(db, 'rooms', room.roomCode), {
    round: {
      ...room.round,
      turnRole: oppHasCard ? myRole : otherRole,
    },
    scores: {
      ...room.scores,
      ...(myRole === 'host'
        ? { hostCardCount: remainingHand.length }
        : { guestCardCount: remainingHand.length }),
    },
    board: {
      ...room.board,
      ...(myRole === 'host'
        ? { trickHostCard: sanitizeCard(playedCard) }
        : { trickGuestCard: sanitizeCard(playedCard) }),
    },
    combos: {
      ...room.combos,
      ...(myRole === 'host'
        ? {
            hostAnnounced: clearUnshown ? [] : sanitizeComboList(myAnnounced),
          }
        : {
            guestAnnounced: clearUnshown ? [] : sanitizeComboList(myAnnounced),
          }),
    },
    flags: {
      ...room.flags,
      ...(myRole === 'host'
        ? {
            hostBlot: newBlotDeclared,
            ...(trickIndex === 0 ? { hostCanDeclare: false } : {}),
            ...(clearUnshown ? { hostCanShow: false } : {}),
          }
        : {
            guestBlot: newBlotDeclared,
            ...(trickIndex === 0 ? { guestCanDeclare: false } : {}),
            ...(clearUnshown ? { guestCanShow: false } : {}),
          }),
    },
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `rooms/${room.roomCode}`);
  }
};

export const onlineResolveTrick = async (room: OnlineRoomDoc): Promise<void> => {
  if (
    room.status !== 'playing' ||
    !room.board.trickHostCard ||
    !room.board.trickGuestCard ||
    !room.round.trump
  ) {
    return;
  }
  const path = `rooms/${room.roomCode}`;
  const ref = doc(db, 'rooms', room.roomCode);

  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) return;
      const live = snap.data() as OnlineRoomDoc;
      if (
        live.status !== 'playing' ||
        !live.board.trickHostCard ||
        !live.board.trickGuestCard ||
        !live.round.trump
      ) {
        return;
      }

      const hostCard = live.board.trickHostCard;
      const guestCard = live.board.trickGuestCard;
      const trump = live.round.trump as TrumpType;
      const firstRole: RoomRole =
        live.round.lastWinnerRole || (live.round.dealerRole === 'host' ? 'guest' : 'host');
      const leadCard = firstRole === 'host' ? hostCard : guestCard;
      const rawWinner = resolveTrick(hostCard, guestCard, trump, leadCard.suit);
      const winnerRole: RoomRole = rawWinner === 'player' ? 'host' : 'guest';

      const newPlayedCards = [
        ...live.board.playedCards,
        {
          host: sanitizeCard(hostCard),
          guest: sanitizeCard(guestCard),
          winnerRole,
        },
      ];

      const isLastTrick = live.scores.hostCardCount === 0 && live.scores.guestCardCount === 0;
      const trickPoints =
        getCardValue(hostCard.rank, hostCard.suit, trump) +
        getCardValue(guestCard.rank, guestCard.suit, trump) +
        (isLastTrick ? 10 : 0);

      let hostRoundScore =
        live.scores.hostRoundScore + (winnerRole === 'host' ? trickPoints : 0);
      let guestRoundScore =
        live.scores.guestRoundScore + (winnerRole === 'guest' ? trickPoints : 0);
      let hostScore = live.scores.hostScore;
      let guestScore = live.scores.guestScore;
      let phase = live.round.phase;
      let status: OnlineRoomDoc['status'] = live.status;
      let winnerUid = live.winnerUid;
      let roundBreakdown = live.board.roundBreakdown;

      if (isLastTrick) {
        const mappedTricks = newPlayedCards.map((t) => ({
          player: t.host,
          ai: t.guest,
          winner: (t.winnerRole === 'host' ? 'player' : 'ai') as 'player' | 'ai',
        }));
        const result = calculateRoundScore(
          mappedTricks,
          trump,
          live.round.bidderRole === 'guest' ? 'ai' : 'player',
          live.combos.hostDeclared,
          live.combos.guestDeclared,
          winnerRole === 'host' ? 'player' : 'ai',
          { player: live.flags.hostBlot, ai: live.flags.guestBlot },
          live.config.allCombinationsDisabled
        );

        if (result.isBait) {
          const totalTricks = result.player.tricks + result.ai.tricks;
          const totalCombosPoints =
            result.player.combos.reduce((sum, c) => sum + c.points, 0) +
            result.ai.combos.reduce((sum, c) => sum + c.points, 0);
          const totalPaper = getPaperScore(totalTricks) + totalCombosPoints / 10;
          if (result.player.total > 0) {
            hostRoundScore = totalPaper;
            guestRoundScore = 0;
          } else {
            hostRoundScore = 0;
            guestRoundScore = totalPaper;
          }
        } else {
          hostRoundScore =
            getPaperScore(result.player.tricks) +
            result.player.combos.reduce((sum, c) => sum + c.points / 10, 0);
          guestRoundScore =
            getPaperScore(result.ai.tricks) +
            result.ai.combos.reduce((sum, c) => sum + c.points / 10, 0);
        }

        hostScore += hostRoundScore;
        guestScore += guestRoundScore;
        const isGameOver =
          hostScore >= live.config.gameLimit || guestScore >= live.config.gameLimit;
        phase = isGameOver ? 'GAME_OVER' : 'RESULT';
        status = isGameOver ? 'finished' : 'playing';
        if (isGameOver) {
          winnerUid = hostScore >= guestScore ? live.hostUid : live.guestUid;
        }
        roundBreakdown = {
          host: { ...result.player, finalPaper: hostRoundScore },
          guest: { ...result.ai, finalPaper: guestRoundScore },
          isBait: result.isBait,
          bidderRole: result.bidder === 'player' ? 'host' : 'guest',
        };
      }

      tx.update(ref, {
        status,
        winnerUid,
        round: {
          ...live.round,
          turnRole: winnerRole,
          lastWinnerRole: winnerRole,
          phase,
        },
        scores: {
          ...live.scores,
          hostRoundScore,
          guestRoundScore,
          hostScore,
          guestScore,
        },
        board: {
          ...live.board,
          playedCards: newPlayedCards,
          trickHostCard: null,
          trickGuestCard: null,
          roundBreakdown,
        },
        updatedAt: serverTimestamp(),
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
};

export const onlineForfeitRoom = async (
  room: OnlineRoomDoc,
  myRole: RoomRole
): Promise<void> => {
  if (room.status === 'finished') return;
  const path = `rooms/${room.roomCode}`;
  const ref = doc(db, 'rooms', room.roomCode);

  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) return;
      const live = snap.data() as OnlineRoomDoc;
      if (live.status === 'finished') return;

      if (live.status === 'waiting') {
        if (myRole === 'host') {
          tx.update(ref, {
            status: 'finished',
            updatedAt: serverTimestamp(),
          });
        }
        return;
      }

      const winnerUid = myRole === 'host' ? live.guestUid : live.hostUid;
      tx.update(ref, {
        status: 'finished',
        winnerUid: winnerUid || live.hostUid,
        round: {
          ...live.round,
          phase: 'GAME_OVER',
        },
        updatedAt: serverTimestamp(),
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
};
