import {
  collection,
  doc,
  limit,
  onSnapshot,
  query,
  runTransaction,
  setDoc,
  where,
  writeBatch,
  serverTimestamp,
  Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Card, Combination, Rank, Suit, TrumpType } from '../types';
import { createDeck, calculateRoundScore, resolveTrick } from '../logic/gameLogic';
import { getCardValue } from '../constants';
import {
  OnlineRoomDoc,
  UserProfile,
  SHORT_ID_PATTERN,
  deriveShortIdFromUid,
  generateRoomCode,
  sanitizeCard,
  sanitizeComboList,
  sanitizeNickname,
  sanitizeRoomCode,
} from '../utils/firestorePayloads';

export type RoomRole = 'host' | 'guest';

class RoomActionError extends Error {}

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

export const createOnlineRoom = async (
  host: UserProfile,
  options: CreateRoomOptions
): Promise<string> => {
  const roomCode = generateRoomCode();
  const path = `rooms/${roomCode}`;
  const ref = doc(db, 'rooms', roomCode);

  const payload: OnlineRoomDoc = {
    roomCode,
    hostUid: host.uid,
    hostName: sanitizeNickname(host.nickname) || 'Игрок 1',
    hostShortId: host.shortId,
    guestUid: '',
    guestName: '',
    guestShortId: '',
    status: 'waiting',
    tableId: Math.floor(1000000000 + Math.random() * 900000000),
    gameLimit: [51, 101, 151].includes(options.gameLimit) ? options.gameLimit : 101,
    betAmount: Math.min(100000, Math.max(1000, options.betAmount)),
    allowHighCombos: Boolean(options.allowHighCombos),
    allCombinationsDisabled: Boolean(options.allCombinationsDisabled),
    turnTimeLimit: [15, 20, 30].includes(options.turnTimeLimit) ? options.turnTimeLimit : 30,
    roundNumber: 0,
    dealerRole: 'guest',
    turnRole: 'host',
    phase: 'OFFERING_TRUMP',
    trump: '',
    bidderRole: '',
    lastWinnerRole: '',
    pendingExtraDrawRole: '',
    winnerUid: '',
    hostScore: 0,
    guestScore: 0,
    hostRoundScore: 0,
    guestRoundScore: 0,
    hostCardCount: 0,
    guestCardCount: 0,
    offeredCard: null,
    deck: [],
    trickHostCard: null,
    trickGuestCard: null,
    playedCards: [],
    hostAnnouncedCombos: [],
    guestAnnouncedCombos: [],
    hostDeclaredCombos: [],
    guestDeclaredCombos: [],
    hostHasShownCombos: false,
    guestHasShownCombos: false,
    hostCanDeclare: true,
    guestCanDeclare: true,
    hostCanShow: true,
    guestCanShow: true,
    hostBlotDeclared: false,
    guestBlotDeclared: false,
    roundBreakdown: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(ref, payload);
    return roomCode;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
};

export const joinOnlineRoom = async (
  rawCode: string,
  guest: UserProfile
): Promise<string> => {
  const roomCode = sanitizeRoomCode(rawCode);
  if (roomCode.length < 4) {
    throw new Error('Введите корректный код стола (минимум 4 символа)');
  }
  const path = `rooms/${roomCode}`;
  const ref = doc(db, 'rooms', roomCode);
  const safeShortId = SHORT_ID_PATTERN.test(guest.shortId || '')
    ? guest.shortId
    : deriveShortIdFromUid(guest.uid);

  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) {
        throw new RoomActionError('Стол с таким кодом не найден');
      }

      const room = snap.data() as OnlineRoomDoc;
      if (room.hostUid === guest.uid || room.guestUid === guest.uid) {
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

      tx.update(ref, {
        guestUid: guest.uid,
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
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
};

export const cancelWaitingOnlineRoom = async (
  roomCode: string,
  callerUid?: string
): Promise<void> => {
  const path = `rooms/${roomCode}`;
  const ref = doc(db, 'rooms', roomCode);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) return;
      const live = snap.data() as OnlineRoomDoc;
      if (live.status === 'finished') return;
      if (callerUid && live.hostUid !== callerUid && live.guestUid !== callerUid) return;

      if (live.status === 'waiting') {
        if (callerUid && live.hostUid !== callerUid) return;
        tx.update(ref, {
          status: 'finished',
          updatedAt: serverTimestamp(),
        });
      } else if (live.status === 'playing') {
        const winnerUid =
          callerUid && callerUid === live.hostUid
            ? live.guestUid || live.hostUid
            : live.hostUid;
        tx.update(ref, {
          status: 'finished',
          phase: 'GAME_OVER',
          winnerUid,
          updatedAt: serverTimestamp(),
        });
      }
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
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
      onData(snap.exists() ? (snap.data() as OnlineRoomDoc) : null);
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
      const list = snapshot.docs.map((d) => d.data() as OnlineRoomDoc);
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

  const nextDealer: RoomRole = room.dealerRole === 'host' ? 'guest' : 'host';
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
    roundNumber: isNewGame ? 1 : room.roundNumber + 1,
    dealerRole: nextDealer,
    turnRole: nextTurn,
    phase: 'OFFERING_TRUMP',
    trump: '',
    bidderRole: '',
    lastWinnerRole: '',
    pendingExtraDrawRole: '',
    hostScore: isNewGame ? 0 : room.hostScore,
    guestScore: isNewGame ? 0 : room.guestScore,
    hostRoundScore: 0,
    guestRoundScore: 0,
    hostCardCount: 5,
    guestCardCount: 5,
    offeredCard,
    deck: remaining,
    trickHostCard: null,
    trickGuestCard: null,
    playedCards: [],
    hostAnnouncedCombos: [],
    guestAnnouncedCombos: [],
    hostDeclaredCombos: [],
    guestDeclaredCombos: [],
    hostHasShownCombos: false,
    guestHasShownCombos: false,
    hostCanDeclare: true,
    guestCanDeclare: true,
    hostCanShow: true,
    guestCanShow: true,
    hostBlotDeclared: false,
    guestBlotDeclared: false,
    roundBreakdown: null,
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
  if (!room.offeredCard) return;
  const deck = [...room.deck];
  const extra = deck.splice(0, 2).map(sanitizeCard);
  const newMyHand = sortCards([...myHand.map(sanitizeCard), sanitizeCard(room.offeredCard), ...extra]).slice(0, 8);
  const otherRole: RoomRole = myRole === 'host' ? 'guest' : 'host';
  const firstTurn: RoomRole = room.dealerRole === 'host' ? 'guest' : 'host';

  const batch = writeBatch(db);
  batch.set(doc(db, 'rooms', room.roomCode, 'hands', myUid), {
    uid: myUid,
    roomId: room.roomCode,
    cards: newMyHand,
    updatedAt: serverTimestamp(),
  });
  batch.update(doc(db, 'rooms', room.roomCode), {
    deck: deck.map(sanitizeCard),
    offeredCard: null,
    trump,
    bidderRole: myRole,
    phase: 'PLAYING',
    pendingExtraDrawRole: otherRole,
    turnRole: firstTurn,
    ...(myRole === 'host'
      ? { hostCardCount: newMyHand.length }
      : { guestCardCount: newMyHand.length }),
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
  if (room.pendingExtraDrawRole !== myRole) return;
  const deck = [...room.deck];
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
    deck: deck.map(sanitizeCard),
    pendingExtraDrawRole: '',
    ...(myRole === 'host'
      ? { hostCardCount: newMyHand.length }
      : { guestCardCount: newMyHand.length }),
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
  if (room.status !== 'playing' || room.turnRole !== myRole) return;
  const path = `rooms/${room.roomCode}`;
  const ref = doc(db, 'rooms', room.roomCode);

  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) return;
      const live = snap.data() as OnlineRoomDoc;
      if (live.status !== 'playing' || live.turnRole !== myRole) return;

      const otherRole: RoomRole = myRole === 'host' ? 'guest' : 'host';
      let nextPhase = live.phase;

      if (live.phase === 'OFFERING_TRUMP') {
        if (live.dealerRole === myRole) {
          if (live.offeredCard?.rank === Rank.JACK) return;
          nextPhase = 'SUIT_SELECTION';
        }
      } else if (live.phase === 'SUIT_SELECTION') {
        if (live.dealerRole === myRole) return;
      } else {
        return;
      }

      tx.update(ref, {
        turnRole: otherRole,
        phase: nextPhase,
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
  const otherKey = myRole === 'host' ? 'guestAnnouncedCombos' : 'hostAnnouncedCombos';
  const myKey = myRole === 'host' ? 'hostAnnouncedCombos' : 'guestAnnouncedCombos';
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
        live.phase !== 'PLAYING' ||
        live.playedCards.length > 0 ||
        live.turnRole !== myRole
      ) {
        return;
      }
      const oppList = myRole === 'host' ? live.guestAnnouncedCombos : live.hostAnnouncedCombos;
      const oppStrongest = oppList.length > 0 ? oppList[0] : null;
      const clearOpp = oppStrongest && hierarchy[chosen.type] > hierarchy[oppStrongest.type];

      tx.update(ref, {
        [myKey]: sanitizeComboList([chosen]),
        ...(clearOpp ? { [otherKey]: [] } : {}),
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
        myRole === 'host' ? live.hostHasShownCombos : live.guestHasShownCombos;
      if (
        live.status !== 'playing' ||
        live.phase !== 'PLAYING' ||
        live.playedCards.length !== 1 ||
        live.turnRole !== myRole ||
        alreadyShown
      ) {
        return;
      }

      tx.update(ref, {
        ...(myRole === 'host'
          ? {
              hostDeclaredCombos: sanitized,
              hostHasShownCombos: true,
              hostRoundScore: live.hostRoundScore + totalPoints,
              guestAnnouncedCombos: [],
            }
          : {
              guestDeclaredCombos: sanitized,
              guestHasShownCombos: true,
              guestRoundScore: live.guestRoundScore + totalPoints,
              hostAnnouncedCombos: [],
            }),
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
  const oppHasCard = myRole === 'host' ? Boolean(room.trickGuestCard) : Boolean(room.trickHostCard);
  const trickIndex = room.playedCards.length;

  const myAnnounced = myRole === 'host' ? room.hostAnnouncedCombos : room.guestAnnouncedCombos;
  const myHasShown = myRole === 'host' ? room.hostHasShownCombos : room.guestHasShownCombos;

  const clearUnshown = trickIndex === 1 && !myHasShown;

  const batch = writeBatch(db);
  batch.set(doc(db, 'rooms', room.roomCode, 'hands', myUid), {
    uid: myUid,
    roomId: room.roomCode,
    cards: remainingHand.map(sanitizeCard),
    updatedAt: serverTimestamp(),
  });
  batch.update(doc(db, 'rooms', room.roomCode), {
    ...(myRole === 'host'
      ? {
          trickHostCard: sanitizeCard(playedCard),
          hostCardCount: remainingHand.length,
          hostBlotDeclared: newBlotDeclared,
          ...(trickIndex === 0 ? { hostCanDeclare: false } : {}),
          ...(clearUnshown ? { hostAnnouncedCombos: [], hostCanShow: false } : {}),
          ...(!clearUnshown ? { hostAnnouncedCombos: sanitizeComboList(myAnnounced) } : {}),
        }
      : {
          trickGuestCard: sanitizeCard(playedCard),
          guestCardCount: remainingHand.length,
          guestBlotDeclared: newBlotDeclared,
          ...(trickIndex === 0 ? { guestCanDeclare: false } : {}),
          ...(clearUnshown ? { guestAnnouncedCombos: [], guestCanShow: false } : {}),
          ...(!clearUnshown ? { guestAnnouncedCombos: sanitizeComboList(myAnnounced) } : {}),
        }),
    turnRole: oppHasCard ? myRole : otherRole,
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `rooms/${room.roomCode}`);
  }
};

export const onlineResolveTrick = async (room: OnlineRoomDoc): Promise<void> => {
  if (room.status !== 'playing' || !room.trickHostCard || !room.trickGuestCard || !room.trump) {
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
        !live.trickHostCard ||
        !live.trickGuestCard ||
        !live.trump
      ) {
        return;
      }

      const hostCard = live.trickHostCard;
      const guestCard = live.trickGuestCard;
      const trump = live.trump as TrumpType;
      const firstRole: RoomRole =
        live.lastWinnerRole || (live.dealerRole === 'host' ? 'guest' : 'host');
      const leadCard = firstRole === 'host' ? hostCard : guestCard;
      const rawWinner = resolveTrick(hostCard, guestCard, trump, leadCard.suit);
      const winnerRole: RoomRole = rawWinner === 'player' ? 'host' : 'guest';

      const newPlayedCards = [
        ...live.playedCards,
        {
          host: sanitizeCard(hostCard),
          guest: sanitizeCard(guestCard),
          winnerRole,
        },
      ];

      const isLastTrick = live.hostCardCount === 0 && live.guestCardCount === 0;
      const trickPoints =
        getCardValue(hostCard.rank, hostCard.suit, trump) +
        getCardValue(guestCard.rank, guestCard.suit, trump) +
        (isLastTrick ? 10 : 0);

      let hostRoundScore = live.hostRoundScore + (winnerRole === 'host' ? trickPoints : 0);
      let guestRoundScore = live.guestRoundScore + (winnerRole === 'guest' ? trickPoints : 0);
      let hostScore = live.hostScore;
      let guestScore = live.guestScore;
      let phase = live.phase;
      let status: OnlineRoomDoc['status'] = live.status;
      let winnerUid = live.winnerUid;
      let roundBreakdown = live.roundBreakdown;

      if (isLastTrick) {
        const mappedTricks = newPlayedCards.map((t) => ({
          player: t.host,
          ai: t.guest,
          winner: (t.winnerRole === 'host' ? 'player' : 'ai') as 'player' | 'ai',
        }));
        const result = calculateRoundScore(
          mappedTricks,
          trump,
          live.bidderRole === 'guest' ? 'ai' : 'player',
          live.hostDeclaredCombos,
          live.guestDeclaredCombos,
          winnerRole === 'host' ? 'player' : 'ai',
          { player: live.hostBlotDeclared, ai: live.guestBlotDeclared },
          live.allCombinationsDisabled
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
        const isGameOver = hostScore >= live.gameLimit || guestScore >= live.gameLimit;
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
        playedCards: newPlayedCards,
        trickHostCard: null,
        trickGuestCard: null,
        turnRole: winnerRole,
        lastWinnerRole: winnerRole,
        hostRoundScore,
        guestRoundScore,
        hostScore,
        guestScore,
        phase,
        status,
        winnerUid,
        roundBreakdown,
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
        phase: 'GAME_OVER',
        winnerUid: winnerUid || live.hostUid,
        updatedAt: serverTimestamp(),
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
};
