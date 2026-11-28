import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { Copy, Check, Menu, Users } from 'lucide-react';
import {
  Card as CardType,
  GameState,
  TrumpType,
  Suit,
  Rank,
  Combination,
  TableSettings,
} from './types';
import {
  createDeck,
  detectCombos,
  calculateRoundScore,
  canPlayCard,
  resolveTrick,
} from './logic/gameLogic';
import {
  decideBotBid,
  pickBotCard,
  pickBotComboToAnnounce,
} from './logic/botDecision';
import { getCardValue } from './constants';
import { auth } from './firebase';
import { subscribeUserProfile, recordUserMatchResult } from './services/userService';
import {
  createOnlineRoom,
  joinOnlineRoom,
  cancelWaitingOnlineRoom,
  touchWaitingRoomHeartbeat,
  subscribeWaitingOnlineRooms,
  subscribeOnlineRoom,
  subscribeMyOnlineHand,
  dealOnlineRound,
  onlineTakeTrump,
  onlineDrawExtraCards,
  onlinePassTrump,
  onlineAnnounceCombo,
  onlineShowCombos,
  onlinePlayCard,
  onlineResolveTrick,
  onlineForfeitRoom,
  RoomRole,
} from './services/roomService';
import {
  OnlineRoomDoc,
  UserProfile,
  WAITING_ROOM_HEARTBEAT_MS,
  extractRoomDebugSummary,
  getRoomErrorMessage,
  isWaitingRoomActive,
  sanitizeRoomCode,
} from './utils/firestorePayloads';
import Card from './components/Card';
import TopBar from './components/TopBar';
import MobileTopBar from './components/MobileTopBar';
import MobileLeftSidebar from './components/MobileLeftSidebar';
import SegmentedAvatar from './components/SegmentedAvatar';
import ScorePanel from './components/ScorePanel';
import LobbyView from './components/LobbyView';
import SettingsDrawer from './components/SettingsDrawer';
import AuthModal from './components/AuthModal';
import { RoundResultModal, GameOverModal, RulesModal } from './components/Modals';
import { playCardSound, playChimeSound, setSoundMuted } from './utils/sound';
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  TABLE_THEME_BACKGROUNDS,
  AI_SPEED_MS,
} from './utils/settings';
import { motion, AnimatePresence } from 'motion/react';

const INITIAL_STATE: GameState = {
  playerHand: [],
  aiHand: [],
  deck: [],
  offeredCard: null,
  playedCards: [],
  currentTrick: {},
  trump: null,
  bidder: null,
  playerScore: 0,
  aiScore: 0,
  playerRoundScore: 0,
  aiRoundScore: 0,
  roundBreakdown: null,
  dealer: 'ai',
  turn: 'player',
  phase: 'OFFERING_TRUMP',
  lastWinner: null,
  combos: { player: [], ai: [] },
  announcedCombos: { player: [], ai: [] },
  declaredCombos: { player: [], ai: [] },
  hasShownCombos: { player: false, ai: false },
  hasConfirmedGrowth: { player: false, ai: false },
  canDeclare: { player: true, ai: true },
  canShow: { player: true, ai: true },
  isShowingCombo: false,
  isFirstDeal: true,
  blotDeclared: { player: false, ai: false },
  allowHighCombos: true,
  allCombinationsDisabled: false,
  gameLimit: 101,
  betAmount: 40000,
  roundNumber: 1,
  timeLeft: 30,
  turnTimeLimit: 30,
  playerTimeBank: 180,
  aiTimeBank: 180,
  tableId: 1042528388,
};

const SUIT_ORDER: Record<Suit, number> = {
  [Suit.HEARTS]: 0,
  [Suit.DIAMONDS]: 1,
  [Suit.CLUBS]: 2,
  [Suit.SPADES]: 3,
};

const COMBO_HIERARCHY: Record<Combination['type'], number> = {
  Terz: 1,
  Fifty: 2,
  Hundred: 3,
  Carre: 4,
};

const RANK_ORDER: Record<Rank, number> = {
  [Rank.NINE]: 0,
  [Rank.TEN]: 1,
  [Rank.JACK]: 2,
  [Rank.QUEEN]: 3,
  [Rank.KING]: 4,
  [Rank.ACE]: 5,
};

const sortHand = (hand: CardType[]) =>
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

const translateRank = (rank: Rank | string) => {
  switch (rank) {
    case Rank.NINE:
      return '9';
    case Rank.TEN:
      return '10';
    case Rank.JACK:
      return 'Валет';
    case Rank.QUEEN:
      return 'Дама';
    case Rank.KING:
      return 'Король';
    case Rank.ACE:
      return 'Туз';
    default:
      return rank;
  }
};

const translateCombo = (type: string, highRank?: Rank, isConfirmed?: boolean) => {
  const prefix = type.startsWith('Твое ')
    ? 'Твое '
    : type.startsWith('AI ')
    ? 'AI '
    : '';
  const baseType = type.replace(prefix, '');
  const translated =
    baseType === 'Terz'
      ? 'Терц'
      : baseType === 'Fifty'
      ? '50'
      : baseType === 'Hundred'
      ? '100'
      : baseType === 'Carre'
      ? 'Каре'
      : baseType === 'Blot'
      ? 'Блот'
      : baseType;

  const growth = highRank && isConfirmed ? ` (${translateRank(highRank)})` : '';
  return prefix + translated + growth;
};

const suitGlyph = (suit: Suit | TrumpType) => {
  switch (suit) {
    case Suit.HEARTS:
    case TrumpType.HEARTS:
      return '♥';
    case Suit.DIAMONDS:
    case TrumpType.DIAMONDS:
      return '♦';
    case Suit.CLUBS:
    case TrumpType.CLUBS:
      return '♣';
    case Suit.SPADES:
    case TrumpType.SPADES:
      return '♠';
    default:
      return 'A';
  }
};

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<'LOBBY' | 'GAME'>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('autostart') === '1') return 'GAME';
    }
    return 'LOBBY';
  });

  const [state, setState] = useState<GameState>(INITIAL_STATE);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const [isComboMenuOpen, setIsComboMenuOpen] = useState(false);
  const [conflictType, setConflictType] = useState<Combination['type'] | null>(null);
  const [showingCombos, setShowingCombos] = useState<{ player: boolean; ai: boolean }>({
    player: false,
    ai: false,
  });
  const [isMuted, setIsMuted] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [settings, setSettings] = useState<TableSettings>(() => loadSettings());
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 768 || (window.innerHeight <= 500 && window.innerWidth < 980);
  });
  const [isNarrowPortrait, setIsNarrowPortrait] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 520;
  });
  const [mobileTopBarVisible, setMobileTopBarVisible] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [waitingRooms, setWaitingRooms] = useState<OnlineRoomDoc[]>([]);
  const [presenceNowMs, setPresenceNowMs] = useState<number>(() => Date.now());
  const [roomListError, setRoomListError] = useState<string | null>(null);
  const [roomActionError, setRoomActionError] = useState<string | null>(null);
  const [roomActionDebug, setRoomActionDebug] = useState<string | null>(null);
  const [roomListVersion, setRoomListVersion] = useState(0);
  const [roomAction, setRoomAction] = useState<'creating' | 'joining' | null>(null);
  const [onlineRoomCode, setOnlineRoomCode] = useState<string | null>(null);
  const [onlineRoom, setOnlineRoom] = useState<OnlineRoomDoc | null>(null);
  const [onlineHand, setOnlineHand] = useState<CardType[]>([]);
  const [pendingInviteCode, setPendingInviteCode] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const code = new URLSearchParams(window.location.search).get('room');
      return code ? sanitizeRoomCode(code) : '';
    }
    return '';
  });
  const [copiedInvite, setCopiedInvite] = useState(false);
  const initializedRef = useRef(false);
  const recordedMatchRef = useRef<string | null>(null);
  const dealingRoomRef = useRef<string | null>(null);
  const extraDrawRoomRef = useRef<string | null>(null);
  const cleanedAbandonedRoomsRef = useRef<Set<string>>(new Set());
  const showToastsRef = useRef(settings.showToasts);

  useEffect(() => {
    showToastsRef.current = settings.showToasts;
    saveSettings(settings);
    if (!settings.showToasts) {
      setToast(null);
    }
  }, [settings]);

  const showToast = useCallback((text: string) => {
    if (!showToastsRef.current) return;
    const id = Date.now();
    setToast({ id, text });
    setTimeout(() => {
      setToast((curr) => (curr?.id === id ? null : curr));
    }, 5000);
  }, []);

  const enterGameImmersiveMode = useCallback(() => {
    setMobileTopBarVisible(false);
    if (!isMobile) return;

    const isInstalledApp =
      window.matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const orientation = (window.screen as Screen & {
      orientation?: ScreenOrientation & {
        lock?: (orientation: 'landscape') => Promise<void>;
      };
    }).orientation;
    const lockLandscape = () =>
      orientation?.lock?.('landscape').catch(() => undefined);

    if (!isInstalledApp && !document.fullscreenElement) {
      void document.documentElement
        .requestFullscreen({ navigationUI: 'hide' })
        .catch(() => undefined)
        .then(lockLandscape);
      return;
    }

    void lockLandscape();
  }, [isMobile]);

  const exitGameImmersiveMode = useCallback(() => {
    setMobileTopBarVisible(true);
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    }
    const orientation = (window.screen as Screen & {
      orientation?: ScreenOrientation & { unlock?: () => void };
    }).orientation;
    orientation?.unlock?.();
  }, []);

  useEffect(() => {
    if (!isMobile || currentScreen !== 'GAME' || !mobileTopBarVisible) return;
    const timeoutId = window.setTimeout(() => setMobileTopBarVisible(false), 10000);
    return () => window.clearTimeout(timeoutId);
  }, [currentScreen, isMobile, mobileTopBarVisible]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!authReady || !firebaseUser) {
      setUserProfile(null);
      return;
    }
    const unsub = subscribeUserProfile(firebaseUser.uid, (profile) => {
      setUserProfile(profile);
    });
    return () => unsub();
  }, [authReady, firebaseUser]);

  useEffect(() => {
    if (!authReady || !firebaseUser) {
      setWaitingRooms([]);
      setRoomListError(null);
      return;
    }
    const unsub = subscribeWaitingOnlineRooms(
      (rooms) => {
        setWaitingRooms(rooms);
        setRoomListError(null);
      },
      (error) => {
        setRoomListError(
          getRoomErrorMessage(error, 'Не удалось загрузить список столов. Попробуйте ещё раз.')
        );
      }
    );
    return () => unsub();
  }, [authReady, firebaseUser, roomListVersion]);

  useEffect(() => {
    if (!authReady || !firebaseUser || !onlineRoomCode) {
      setOnlineRoom(null);
      setOnlineHand([]);
      return;
    }
    const reportRoomError = (error: unknown) => {
      showToast(getRoomErrorMessage(error, 'Не удалось загрузить игровой стол.'));
    };
    const unsubRoom = subscribeOnlineRoom(
      onlineRoomCode,
      (room) => {
        setOnlineRoom(room);
      },
      reportRoomError
    );
    const unsubHand = subscribeMyOnlineHand(
      onlineRoomCode,
      firebaseUser.uid,
      (cards) => setOnlineHand(cards),
      reportRoomError
    );
    return () => {
      unsubRoom();
      unsubHand();
    };
  }, [authReady, firebaseUser, onlineRoomCode, showToast]);

  const isOnline = Boolean(onlineRoomCode && onlineRoom);
  const myRole: RoomRole =
    onlineRoom && firebaseUser && onlineRoom.guestUid === firebaseUser.uid ? 'guest' : 'host';

  // Periodically refresh presence clock in Lobby so offline/abandoned tables auto-hide after TTL
  useEffect(() => {
    if (currentScreen !== 'LOBBY' || waitingRooms.length === 0) return;
    setPresenceNowMs(Date.now());
    const id = window.setInterval(() => setPresenceNowMs(Date.now()), 5000);
    return () => window.clearInterval(id);
  }, [currentScreen, waitingRooms]);

  const activeWaitingRooms = useMemo(
    () => waitingRooms.filter((r) => isWaitingRoomActive(r, presenceNowMs)),
    [waitingRooms, presenceNowMs]
  );

  // Clean up any leftover waiting rooms owned by current user once they are back in the lobby
  useEffect(() => {
    if (currentScreen !== 'LOBBY' || !authReady || !firebaseUser || onlineRoomCode) return;
    for (const room of waitingRooms) {
      if (room.hostUid === firebaseUser.uid && !cleanedAbandonedRoomsRef.current.has(room.roomCode)) {
        cleanedAbandonedRoomsRef.current.add(room.roomCode);
        void cancelWaitingOnlineRoom(room.roomCode, firebaseUser.uid).catch(() => undefined);
      }
    }
  }, [currentScreen, authReady, firebaseUser, onlineRoomCode, waitingRooms]);

  // Broadcast host online heartbeat while waiting at table, and best-effort cancel on tab unload
  useEffect(() => {
    if (
      currentScreen !== 'GAME' ||
      !onlineRoomCode ||
      onlineRoom?.status !== 'waiting' ||
      myRole !== 'host' ||
      !firebaseUser
    ) {
      return;
    }

    const sendHeartbeat = () => {
      void touchWaitingRoomHeartbeat(onlineRoomCode, firebaseUser.uid);
    };

    sendHeartbeat();
    const intervalId = window.setInterval(sendHeartbeat, WAITING_ROOM_HEARTBEAT_MS);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        sendHeartbeat();
      }
    };

    const handlePageHide = () => {
      void cancelWaitingOnlineRoom(onlineRoomCode, firebaseUser.uid).catch(() => undefined);
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('online', sendHeartbeat);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('online', sendHeartbeat);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [currentScreen, onlineRoomCode, onlineRoom?.status, myRole, firebaseUser]);

  // Auto-join invited room from ?room=CODE once authenticated and registered
  useEffect(() => {
    if (!pendingInviteCode || !authReady) return;
    if (!firebaseUser || !userProfile?.registrationComplete) {
      setAuthModalOpen(true);
      showToast(`Войдите и зарегистрируйтесь, чтобы войти в стол ${pendingInviteCode}`);
      return;
    }
    const code = pendingInviteCode;
    setPendingInviteCode('');
    setRoomAction('joining');
    joinOnlineRoom(code, userProfile)
      .then((joinedCode) => {
        setOnlineRoomCode(joinedCode);
        setCurrentScreen('GAME');
        setAuthModalOpen(false);
        if (typeof window !== 'undefined') {
          const url = new URL(window.location.href);
          url.searchParams.delete('room');
          window.history.replaceState({}, '', url.toString());
        }
        showToast(`Вы подключились к столу ${joinedCode}`);
      })
      .catch((err) => {
        showToast(getRoomErrorMessage(err, 'Не удалось войти в стол. Проверьте код и попробуйте снова.'));
      })
      .finally(() => setRoomAction(null));
  }, [pendingInviteCode, authReady, firebaseUser, userProfile, showToast]);

  // Host deals Round 1 as soon as Guest joins
  useEffect(() => {
    if (
      isOnline &&
      onlineRoom &&
      onlineRoom.status === 'playing' &&
      onlineRoom.round.roundNumber === 0 &&
      myRole === 'host'
    ) {
      const key = `${onlineRoom.roomCode}-0`;
      if (dealingRoomRef.current === key) return;
      dealingRoomRef.current = key;
      void dealOnlineRound(onlineRoom, true).catch((err) => {
        dealingRoomRef.current = null;
        showToast(getRoomErrorMessage(err, 'Не удалось раздать карты.'));
      });
    } else if (!onlineRoom || onlineRoom.round.roundNumber > 0) {
      dealingRoomRef.current = null;
    }
  }, [isOnline, onlineRoom, myRole, showToast]);

  // Non-taker automatically draws 3 extra cards after opponent takes trump
  useEffect(() => {
    if (
      isOnline &&
      onlineRoom &&
      firebaseUser &&
      onlineRoom.round.pendingExtraDrawRole === myRole
    ) {
      const key = `${onlineRoom.roomCode}-${onlineRoom.round.roundNumber}-${myRole}`;
      if (extraDrawRoomRef.current === key) return;
      extraDrawRoomRef.current = key;
      void onlineDrawExtraCards(onlineRoom, myRole, firebaseUser.uid, onlineHand).catch((err) => {
        extraDrawRoomRef.current = null;
        showToast(getRoomErrorMessage(err, 'Не удалось добрать карты.'));
      });
    } else if (!onlineRoom?.round.pendingExtraDrawRole) {
      extraDrawRoomRef.current = null;
    }
  }, [isOnline, onlineRoom, firebaseUser, myRole, onlineHand, showToast]);

  // Host resolves completed online trick
  useEffect(() => {
    if (
      isOnline &&
      onlineRoom &&
      myRole === 'host' &&
      onlineRoom.board.trickHostCard &&
      onlineRoom.board.trickGuestCard
    ) {
      const timer = setTimeout(() => {
        void onlineResolveTrick(onlineRoom).catch((err) => {
          showToast(getRoomErrorMessage(err, 'Не удалось завершить взятку.'));
        });
      }, 1100);
      return () => clearTimeout(timer);
    }
  }, [isOnline, onlineRoom, myRole, showToast]);

  const activeState: GameState = useMemo(() => {
    if (!isOnline || !onlineRoom) return state;

    const otherRole: RoomRole = myRole === 'host' ? 'guest' : 'host';
    const oppCount =
      myRole === 'host' ? onlineRoom.scores.guestCardCount : onlineRoom.scores.hostCardCount;
    const oppPlaceholders: CardType[] = Array.from({ length: oppCount }, (_, i) => ({
      id: `opp-${i}`,
      suit: Suit.SPADES,
      rank: Rank.NINE,
    }));

    const trumpVal = (onlineRoom.round.trump || null) as TrumpType | null;
    const myCombos = trumpVal
      ? detectCombos(
          onlineHand,
          trumpVal,
          onlineRoom.config.allowHighCombos,
          onlineRoom.config.allCombinationsDisabled
        )
      : [];

    const breakdown = onlineRoom.board.roundBreakdown;
    const mappedBreakdown = breakdown
      ? {
          player: (myRole === 'host'
            ? breakdown.host
            : breakdown.guest) as GameState['roundBreakdown'] extends infer T
            ? T extends { player: infer P }
              ? P
              : never
            : never,
          ai: (myRole === 'host'
            ? breakdown.guest
            : breakdown.host) as GameState['roundBreakdown'] extends infer T
            ? T extends { ai: infer A }
              ? A
              : never
            : never,
          isBait: breakdown.isBait,
          bidder: (breakdown.bidderRole === myRole ? 'player' : 'ai') as
            | 'player'
            | 'ai',
        }
      : null;

    return {
      playerHand: onlineHand,
      aiHand: oppPlaceholders,
      deck: onlineRoom.board.deck,
      offeredCard: onlineRoom.board.offeredCard,
      playedCards: onlineRoom.board.playedCards.map((t) => ({
        player: myRole === 'host' ? t.host : t.guest,
        ai: myRole === 'host' ? t.guest : t.host,
        winner: t.winnerRole === myRole ? 'player' : 'ai',
      })),
      currentTrick: {
        player:
          myRole === 'host'
            ? onlineRoom.board.trickHostCard || undefined
            : onlineRoom.board.trickGuestCard || undefined,
        ai:
          myRole === 'host'
            ? onlineRoom.board.trickGuestCard || undefined
            : onlineRoom.board.trickHostCard || undefined,
      },
      trump: trumpVal,
      bidder: onlineRoom.round.bidderRole
        ? onlineRoom.round.bidderRole === myRole
          ? 'player'
          : 'ai'
        : null,
      playerScore: myRole === 'host' ? onlineRoom.scores.hostScore : onlineRoom.scores.guestScore,
      aiScore: myRole === 'host' ? onlineRoom.scores.guestScore : onlineRoom.scores.hostScore,
      playerRoundScore:
        myRole === 'host' ? onlineRoom.scores.hostRoundScore : onlineRoom.scores.guestRoundScore,
      aiRoundScore:
        myRole === 'host' ? onlineRoom.scores.guestRoundScore : onlineRoom.scores.hostRoundScore,
      roundBreakdown: mappedBreakdown,
      dealer: onlineRoom.round.dealerRole === myRole ? 'player' : 'ai',
      turn: onlineRoom.round.turnRole === myRole ? 'player' : 'ai',
      phase: onlineRoom.round.phase,
      lastWinner: onlineRoom.round.lastWinnerRole
        ? onlineRoom.round.lastWinnerRole === myRole
          ? 'player'
          : 'ai'
        : null,
      combos: { player: myCombos, ai: [] },
      announcedCombos: {
        player:
          myRole === 'host'
            ? onlineRoom.combos.hostAnnounced
            : onlineRoom.combos.guestAnnounced,
        ai:
          otherRole === 'host'
            ? onlineRoom.combos.hostAnnounced
            : onlineRoom.combos.guestAnnounced,
      },
      declaredCombos: {
        player:
          myRole === 'host'
            ? onlineRoom.combos.hostDeclared
            : onlineRoom.combos.guestDeclared,
        ai:
          otherRole === 'host'
            ? onlineRoom.combos.hostDeclared
            : onlineRoom.combos.guestDeclared,
      },
      hasShownCombos: {
        player:
          myRole === 'host'
            ? onlineRoom.flags.hostHasShown
            : onlineRoom.flags.guestHasShown,
        ai:
          otherRole === 'host'
            ? onlineRoom.flags.hostHasShown
            : onlineRoom.flags.guestHasShown,
      },
      hasConfirmedGrowth: { player: true, ai: true },
      canDeclare: {
        player:
          myRole === 'host' ? onlineRoom.flags.hostCanDeclare : onlineRoom.flags.guestCanDeclare,
        ai: otherRole === 'host' ? onlineRoom.flags.hostCanDeclare : onlineRoom.flags.guestCanDeclare,
      },
      canShow: {
        player: myRole === 'host' ? onlineRoom.flags.hostCanShow : onlineRoom.flags.guestCanShow,
        ai: otherRole === 'host' ? onlineRoom.flags.hostCanShow : onlineRoom.flags.guestCanShow,
      },
      isShowingCombo: false,
      isFirstDeal: onlineRoom.board.playedCards.length === 0,
      blotDeclared: {
        player:
          myRole === 'host' ? onlineRoom.flags.hostBlot : onlineRoom.flags.guestBlot,
        ai:
          otherRole === 'host'
            ? onlineRoom.flags.hostBlot
            : onlineRoom.flags.guestBlot,
      },
      allowHighCombos: onlineRoom.config.allowHighCombos,
      allCombinationsDisabled: onlineRoom.config.allCombinationsDisabled,
      gameLimit: onlineRoom.config.gameLimit,
      betAmount: onlineRoom.config.betAmount,
      roundNumber: Math.max(1, onlineRoom.round.roundNumber),
      timeLeft: state.timeLeft,
      turnTimeLimit: onlineRoom.config.turnTimeLimit,
      playerTimeBank: 180,
      aiTimeBank: 180,
      tableId: onlineRoom.config.tableId,
    };
  }, [isOnline, onlineRoom, myRole, onlineHand, state]);

  const playerLabel =
    isOnline && userProfile?.nickname ? userProfile.nickname : 'Вы';
  const playerShortLabel =
    isOnline && userProfile?.nickname ? userProfile.nickname.slice(0, 5) : 'Я';
  const opponentLabel = isOnline
    ? myRole === 'host'
      ? onlineRoom?.guestName || 'Друг'
      : onlineRoom?.hostName || 'Друг'
    : 'AI';
  const playerDisplayId = userProfile?.shortId || '2458007';
  const opponentDisplayId = isOnline
    ? myRole === 'host'
      ? onlineRoom?.guestShortId || '0000000'
      : onlineRoom?.hostShortId || '0000000'
    : '3520297';

  // Record finished match into user profile stats & balance
  useEffect(() => {
    if (
      currentScreen !== 'GAME' ||
      activeState.phase !== 'GAME_OVER' ||
      !firebaseUser ||
      !userProfile?.registrationComplete
    ) {
      return;
    }
    const matchKey = isOnline
      ? `online-${onlineRoom?.roomCode}`
      : `local-${activeState.tableId}-${activeState.roundNumber}`;
    if (recordedMatchRef.current === matchKey) return;
    recordedMatchRef.current = matchKey;

    const didWin = isOnline
      ? onlineRoom?.winnerUid === firebaseUser.uid ||
        activeState.playerScore >= activeState.aiScore
      : activeState.aiTimeBank === 0 ||
        (activeState.playerTimeBank > 0 &&
          activeState.playerScore >= activeState.aiScore);

    void recordUserMatchResult(
      firebaseUser.uid,
      userProfile,
      didWin,
      activeState.betAmount
    );
  }, [
    currentScreen,
    activeState.phase,
    activeState.tableId,
    activeState.roundNumber,
    activeState.playerScore,
    activeState.aiScore,
    activeState.aiTimeBank,
    activeState.playerTimeBank,
    activeState.betAmount,
    firebaseUser,
    userProfile,
    isOnline,
    onlineRoom,
  ]);

  useEffect(() => {
    const checkMobile = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const mobile = w < 768 || (h <= 500 && w < 980);
      setIsMobile(mobile);
      setIsNarrowPortrait(mobile && w < 520);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Mirror state machine onto document.body.dataset.state
  useEffect(() => {
    if (currentScreen === 'LOBBY') {
      document.body.dataset.state = 'title';
    } else if (activeState.phase === 'GAME_OVER') {
      document.body.dataset.state = 'gameover';
    } else {
      document.body.dataset.state = 'playing';
    }
  }, [currentScreen, activeState.phase]);

  const startNewRound = useCallback(
    (override?: Partial<GameState>) => {
      setIsComboMenuOpen(false);
      setConflictType(null);
      setShowingCombos({ player: false, ai: false });

      if (!override && isOnline && onlineRoom) {
        if (myRole === 'host') {
          void dealOnlineRound(onlineRoom, onlineRoom.round.phase === 'GAME_OVER').catch((err) => {
            showToast(getRoomErrorMessage(err, 'Не удалось начать следующий раунд.'));
          });
        }
        return;
      }

    setState((prev) => {
      const merged = { ...prev, ...override };
      const isNewGame = merged.phase === 'GAME_OVER' || Boolean(override);
      const deck = createDeck();
      const playerHand = deck.slice(0, 5);
      const aiHand = deck.slice(5, 10);
      const offeredCard = deck[10];
      const remaining = deck.slice(11);
      const nextDealer = merged.dealer === 'player' ? 'ai' : 'player';

      return {
        ...merged,
        playerHand: sortHand(playerHand),
        aiHand: sortHand(aiHand),
        offeredCard,
        deck: remaining,
        playedCards: [],
        currentTrick: {},
        trump: null,
        bidder: null,
        playerScore: isNewGame ? 0 : merged.playerScore,
        aiScore: isNewGame ? 0 : merged.aiScore,
        playerRoundScore: 0,
        aiRoundScore: 0,
        playerTimeBank: isNewGame ? 180 : merged.playerTimeBank,
        aiTimeBank: isNewGame ? 180 : merged.aiTimeBank,
        timeLeft: merged.turnTimeLimit,
        phase: 'OFFERING_TRUMP',
        turn: nextDealer === 'player' ? 'ai' : 'player',
        dealer: nextDealer,
        isFirstDeal: true,
        combos: { player: [], ai: [] },
        announcedCombos: { player: [], ai: [] },
        declaredCombos: { player: [], ai: [] },
        hasShownCombos: { player: false, ai: false },
        hasConfirmedGrowth: { player: false, ai: false },
        canDeclare: { player: true, ai: true },
        canShow: { player: true, ai: true },
        isShowingCombo: false,
        blotDeclared: { player: false, ai: false },
        lastWinner: null,
        roundBreakdown: null,
        roundNumber: isNewGame ? 1 : merged.roundNumber + 1,
      };
    });
  }, [isOnline, onlineRoom, myRole, showToast]);

  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      startNewRound();
    }
  }, [startNewRound]);

  // Auto-start next round when round-end score popup is disabled
  useEffect(() => {
    if (
      currentScreen === 'GAME' &&
      activeState.phase === 'RESULT' &&
      !settings.showRoundResultModal
    ) {
      if (isOnline && myRole !== 'host') return;
      showToast(
        `Раунд ${activeState.roundNumber} завершён: ${playerShortLabel} +${activeState.playerRoundScore} · ${opponentLabel} +${activeState.aiRoundScore}`
      );
      const timer = setTimeout(() => {
        startNewRound();
      }, 750);
      return () => clearTimeout(timer);
    }
  }, [
    currentScreen,
    activeState.phase,
    activeState.roundNumber,
    activeState.playerRoundScore,
    activeState.aiRoundScore,
    settings.showRoundResultModal,
    isOnline,
    myRole,
    playerShortLabel,
    opponentLabel,
    showToast,
    startNewRound,
  ]);

  const handleToggleMute = () => {
    setIsMuted((m) => {
      const next = !m;
      setSoundMuted(next);
      return next;
    });
  };

  const handleTakeTrump = useCallback(
    (player: 'player' | 'ai', trump: TrumpType) => {
      playChimeSound(true);
      if (isOnline && onlineRoom && firebaseUser) {
        if (player === 'player') {
          void onlineTakeTrump(onlineRoom, myRole, firebaseUser.uid, onlineHand, trump)
            .then(() => showToast(`Вы взяли козырь ${suitGlyph(trump)}`))
            .catch((err) => showToast(getRoomErrorMessage(err, 'Не удалось выбрать козырь.')));
        }
        return;
      }
      setState((prev) => {
        if (!prev.offeredCard) return prev;
        const isPlayer = player === 'player';
        const takerHand = isPlayer
          ? [...prev.playerHand, prev.offeredCard]
          : [...prev.aiHand, prev.offeredCard];
        const otherHand = isPlayer ? [...prev.aiHand] : [...prev.playerHand];

        const deck = [...prev.deck];
        const takerExtra = deck.splice(0, 2);
        const otherExtra = deck.splice(0, 3);

        const finalPlayerHand = sortHand(
          isPlayer ? [...takerHand, ...takerExtra] : [...otherHand, ...otherExtra]
        );
        const finalAiHand = sortHand(
          isPlayer ? [...otherHand, ...otherExtra] : [...takerHand, ...takerExtra]
        );

        return {
          ...prev,
          playerHand: finalPlayerHand,
          aiHand: finalAiHand,
          deck,
          trump,
          bidder: player,
          phase: 'PLAYING',
          offeredCard: null,
          turn: prev.dealer === 'player' ? 'ai' : 'player',
          timeLeft: prev.turnTimeLimit,
          combos: {
            player: detectCombos(
              finalPlayerHand,
              trump,
              prev.allowHighCombos,
              prev.allCombinationsDisabled
            ),
            ai: detectCombos(
              finalAiHand,
              trump,
              prev.allowHighCombos,
              prev.allCombinationsDisabled
            ),
          },
        };
      });
      showToast(
        `${player === 'player' ? 'Вы взяли' : 'AI взял'} козырь ${suitGlyph(trump)}`
      );
    },
    [isOnline, onlineRoom, firebaseUser, myRole, onlineHand, showToast]
  );

  // Timer Effect
  useEffect(() => {
    if (
      isOnline ||
      currentScreen !== 'GAME' ||
      activeState.phase === 'RESULT' ||
      activeState.phase === 'GAME_OVER' ||
      activeState.isShowingCombo
    ) {
      return;
    }

    const isPlayerTurn = activeState.turn === 'player';
    if (isPlayerTurn && activeState.currentTrick.player) return;
    if (!isPlayerTurn && activeState.currentTrick.ai) return;

    const interval = setInterval(() => {
      setState((prev) => {
        if (prev.timeLeft > 0) {
          return { ...prev, timeLeft: prev.timeLeft - 1 };
        }
        const isPlayer = prev.turn === 'player';
        const currentBank = isPlayer ? prev.playerTimeBank : prev.aiTimeBank;
        if (currentBank <= 0) {
          return { ...prev, phase: 'GAME_OVER' };
        }
        return {
          ...prev,
          [isPlayer ? 'playerTimeBank' : 'aiTimeBank']: currentBank - 1,
        };
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [
    isOnline,
    currentScreen,
    activeState.phase,
    activeState.isShowingCombo,
    activeState.turn,
    activeState.currentTrick,
  ]);

  // Reset turn timer on turn/phase change
  useEffect(() => {
    setState((prev) => ({ ...prev, timeLeft: prev.turnTimeLimit }));
  }, [activeState.turn, activeState.phase, activeState.turnTimeLimit]);

  const playCard = useCallback(
    (card: CardType) => {
      if (
        activeState.phase !== 'PLAYING' ||
        activeState.turn !== 'player' ||
        activeState.currentTrick.player ||
        activeState.isShowingCombo ||
        (isOnline && onlineRoom?.pendingExtraDrawRole)
      ) {
        return;
      }

      const leadCard = activeState.currentTrick.ai;
      const validation = canPlayCard(
        card,
        activeState.playerHand,
        leadCard,
        activeState.trump!
      );
      if (!validation.valid) {
        showToast(
          validation.reason === 'Must follow suit'
            ? 'Нужно ходить в масть'
            : validation.reason === 'Must overtrump'
            ? 'Нужно перебить старшим козырем'
            : 'Нужно положить козырь'
        );
        return;
      }

      playCardSound();

      let newBlotDeclared = activeState.blotDeclared.player;
      if (
        !activeState.allCombinationsDisabled &&
        !newBlotDeclared &&
        (card.rank === Rank.KING || card.rank === Rank.QUEEN) &&
        card.suit.toString() === activeState.trump?.toString()
      ) {
        const otherPart = card.rank === Rank.KING ? Rank.QUEEN : Rank.KING;
        if (
          activeState.playerHand.some(
            (c) => c.rank === otherPart && c.suit.toString() === activeState.trump?.toString()
          )
        ) {
          newBlotDeclared = true;
          playChimeSound(true);
          showToast('БЛОТ! +20');
        }
      }

      if (isOnline && onlineRoom && firebaseUser) {
        const remaining = activeState.playerHand.filter((c) => c.id !== card.id);
        void onlinePlayCard(
          onlineRoom,
          myRole,
          firebaseUser.uid,
          remaining,
          card,
          newBlotDeclared
        ).catch((err) => {
          showToast(getRoomErrorMessage(err, 'Не удалось сыграть карту.'));
        });
        return;
      }

      const trickIndex = state.playedCards.length;
      let newAnnouncedPlayer = state.announcedCombos.player;
      let newCanDeclare = state.canDeclare;
      let newCanShow = state.canShow;

      if (trickIndex === 0) {
        newCanDeclare = { ...state.canDeclare, player: false };
      }
      if (trickIndex === 1 && !state.hasShownCombos.player) {
        newAnnouncedPlayer = [];
        newCanShow = { ...state.canShow, player: false };
      }

      setState((prev) => ({
        ...prev,
        playerHand: prev.playerHand.filter((c) => c.id !== card.id),
        currentTrick: { ...prev.currentTrick, player: card },
        turn: prev.currentTrick.ai ? 'player' : 'ai',
        isFirstDeal: false,
        blotDeclared: { ...prev.blotDeclared, player: newBlotDeclared },
        announcedCombos: { ...prev.announcedCombos, player: newAnnouncedPlayer },
        canDeclare: newCanDeclare,
        canShow: newCanShow,
      }));
    },
    [activeState, isOnline, onlineRoom, firebaseUser, myRole, state, showToast]
  );

  // Auto-play if time bank exhausted (local AI match)
  useEffect(() => {
    if (isOnline || !settings.botsEnabled) return;
    const isPlayer = state.turn === 'player';
    const currentBank = isPlayer ? state.playerTimeBank : state.aiTimeBank;
    if (
      currentScreen === 'GAME' &&
      state.timeLeft === 0 &&
      currentBank === 0 &&
      state.phase === 'PLAYING' &&
      !state.isShowingCombo
    ) {
      const hand = isPlayer ? state.playerHand : state.aiHand;
      if (hand.length === 0) return;
      const leadCard = isPlayer ? state.currentTrick.ai : state.currentTrick.player;
      const validCards = hand.filter(
        (c) => canPlayCard(c, hand, leadCard, state.trump!).valid
      );
      const cardToPlay = validCards.length > 0 ? validCards[0] : hand[0];
      if (isPlayer) {
        playCard(cardToPlay);
      }
    }
  }, [
    isOnline,
    settings.botsEnabled,
    currentScreen,
    state.timeLeft,
    state.playerTimeBank,
    state.aiTimeBank,
    state.turn,
    state.phase,
    state.isShowingCombo,
    state.playerHand,
    state.aiHand,
    state.currentTrick,
    state.trump,
    playCard,
  ]);

  // AI Bidding Decision (local match only)
  useEffect(() => {
    if (isOnline || !settings.botsEnabled || currentScreen !== 'GAME') return;
    if (state.turn === 'ai' && state.offeredCard) {
      const timer = setTimeout(() => {
        if (state.phase === 'OFFERING_TRUMP') {
          const decision = decideBotBid(
            'OFFERING_TRUMP',
            state.aiHand,
            state.offeredCard,
            state.dealer === 'ai'
          );
          if (decision.action === 'take') {
            handleTakeTrump('ai', decision.trump);
          } else {
            showToast('AI пасует');
            if (state.dealer === 'ai') {
              setState((prev) => ({ ...prev, turn: 'player', phase: 'SUIT_SELECTION' }));
            } else {
              setState((prev) => ({ ...prev, turn: 'player' }));
            }
          }
        } else if (state.phase === 'SUIT_SELECTION') {
          const decision = decideBotBid(
            'SUIT_SELECTION',
            state.aiHand,
            state.offeredCard,
            state.dealer === 'ai'
          );
          if (decision.action === 'take') {
            handleTakeTrump('ai', decision.trump);
          } else {
            showToast('AI пасует');
            setState((prev) => ({ ...prev, turn: 'player' }));
          }
        }
      }, AI_SPEED_MS[settings.aiSpeed] + 250);
      return () => clearTimeout(timer);
    }
  }, [
    isOnline,
    settings.botsEnabled,
    currentScreen,
    state.phase,
    state.turn,
    state.offeredCard,
    state.aiHand,
    state.dealer,
    settings.aiSpeed,
    handleTakeTrump,
    showToast,
  ]);

  const handlePassTrump = useCallback(() => {
    if (isOnline && onlineRoom) {
      void onlinePassTrump(onlineRoom, myRole)
        .then(() => showToast('Вы спасовали'))
        .catch((err) => showToast(getRoomErrorMessage(err, 'Не удалось спасовать.')));
      return;
    }
    setState((prev) => {
      if (prev.turn !== 'player') return prev;
      if (prev.phase === 'OFFERING_TRUMP') {
        if (prev.dealer === 'player') {
          if (prev.offeredCard?.rank === Rank.JACK) return prev;
          return { ...prev, turn: 'ai', phase: 'SUIT_SELECTION' };
        }
        return { ...prev, turn: 'ai' };
      }
      if (prev.phase === 'SUIT_SELECTION') {
        if (prev.dealer === 'player') {
          return prev;
        }
        return { ...prev, turn: 'ai' };
      }
      return prev;
    });
    showToast('Вы спасовали');
  }, [isOnline, onlineRoom, myRole, showToast]);

  const handleSelectSuit = useCallback(
    (trump: TrumpType) => {
      if (activeState.phase !== 'SUIT_SELECTION' || activeState.turn !== 'player') return;
      if (trump.toString() === activeState.offeredCard?.suit.toString()) return;
      handleTakeTrump('player', trump);
    },
    [activeState.phase, activeState.turn, activeState.offeredCard, handleTakeTrump]
  );

  // Combo Announcement
  const handleAnnounceType = useCallback(
    (type: Combination['type']) => {
      if (
        activeState.turn !== 'player' ||
        activeState.playedCards.length > 0 ||
        !activeState.canDeclare.player
      ) {
        return;
      }

      const playerCombosOfType = activeState.combos.player.filter((c) => c.type === type);
      if (playerCombosOfType.length === 0) return;

      const aiCombos = activeState.announcedCombos.ai;
      const aiStrongest = aiCombos.length > 0 ? aiCombos[0] : null;

      if (aiStrongest && COMBO_HIERARCHY[type] < COMBO_HIERARCHY[aiStrongest.type]) {
        showToast(`Ваш ${translateCombo(type)} младше комбинации соперника`);
        return;
      }

      const bestOfType = playerCombosOfType.reduce((a, b) =>
        a.strength > b.strength ? a : b
      );

      if (isOnline && onlineRoom) {
        void onlineAnnounceCombo(onlineRoom, myRole, bestOfType)
          .then(() => showToast(`Объявлено: ${translateCombo(type)}`))
          .catch((err) => showToast(getRoomErrorMessage(err, 'Не удалось объявить комбинацию.')));
        setIsComboMenuOpen(false);
        return;
      }

      const hasConflict = Boolean(aiStrongest && aiStrongest.type === type);

      setState((prev) => ({
        ...prev,
        announcedCombos: {
          ...prev.announcedCombos,
          player: [bestOfType],
          ai:
            aiStrongest && COMBO_HIERARCHY[type] > COMBO_HIERARCHY[aiStrongest.type]
              ? []
              : prev.announcedCombos.ai,
        },
        hasConfirmedGrowth: {
          ...prev.hasConfirmedGrowth,
          player: !hasConflict,
          ai: !hasConflict,
        },
      }));

      if (hasConflict) {
        setTimeout(() => setConflictType(type), 600);
        showToast(`Спорный рост: ${translateCombo(type)}`);
      } else {
        showToast(`Объявлено: ${translateCombo(type)}`);
      }
      setIsComboMenuOpen(false);
    },
    [activeState, isOnline, onlineRoom, myRole, showToast]
  );

  const handleSelectGrowth = (rank: Rank) => {
    if (!conflictType) return;
    const pCombo = state.combos.player.find(
      (c) => c.type === conflictType && c.highRank === rank
    );
    const aCombo = state.announcedCombos.ai[0];
    if (!pCombo || !aCombo) {
      setConflictType(null);
      return;
    }

    if (pCombo.strength > aCombo.strength) {
      setState((prev) => ({
        ...prev,
        announcedCombos: { player: [pCombo], ai: [] },
        hasConfirmedGrowth: { player: true, ai: true },
      }));
      showToast(`Ваш ${translateCombo(conflictType)} старше!`);
    } else if (aCombo.strength > pCombo.strength) {
      setState((prev) => ({
        ...prev,
        announcedCombos: { player: [], ai: [aCombo] },
        hasConfirmedGrowth: { player: true, ai: true },
      }));
      showToast(`${translateCombo(conflictType)} AI старше`);
    } else {
      setState((prev) => ({
        ...prev,
        announcedCombos: { player: [], ai: [] },
        hasConfirmedGrowth: { player: true, ai: true },
      }));
      showToast('Ничья по росту: комбинации сгорают');
    }
    setConflictType(null);
  };

  const handleShowCombos = useCallback(() => {
    if (
      activeState.turn !== 'player' ||
      activeState.playedCards.length !== 1 ||
      !activeState.canShow.player
    ) {
      return;
    }

    const pCombos = activeState.announcedCombos.player;
    const aCombos = activeState.announcedCombos.ai;
    const pStrongest =
      pCombos.length > 0
        ? pCombos.reduce((a, b) => (a.strength > b.strength ? a : b))
        : null;
    const aStrongest =
      aCombos.length > 0
        ? aCombos.reduce((a, b) => (a.strength > b.strength ? a : b))
        : null;

    const canShow = Boolean(
      pStrongest && (!aStrongest || pStrongest.strength > aStrongest.strength)
    );

    if (!canShow) {
      showToast('Ваша комбинация слабее и аннулирована');
      if (!isOnline) {
        setState((prev) => ({
          ...prev,
          announcedCombos: { ...prev.announcedCombos, player: [] },
        }));
      }
      return;
    }

    const totalPoints = pCombos.reduce((sum, c) => sum + c.points, 0);
    playChimeSound(true);

    if (isOnline && onlineRoom) {
      void onlineShowCombos(onlineRoom, myRole, pCombos)
        .then(() => showToast(`Показано: +${totalPoints} очков`))
        .catch((err) => showToast(getRoomErrorMessage(err, 'Не удалось показать комбинацию.')));
      return;
    }

    setShowingCombos((prev) => ({ ...prev, player: true }));
    setState((prev) => ({ ...prev, isShowingCombo: true }));

    setTimeout(() => {
      setShowingCombos((prev) => ({ ...prev, player: false }));
      setState((prev) => ({ ...prev, isShowingCombo: false }));
    }, 2200);

    setState((prev) => ({
      ...prev,
      declaredCombos: { ...prev.declaredCombos, player: pCombos },
      hasShownCombos: { ...prev.hasShownCombos, player: true },
      playerRoundScore: prev.playerRoundScore + totalPoints,
      announcedCombos: { ...prev.announcedCombos, ai: [] },
    }));

    showToast(`Показано: +${totalPoints} очков`);
  }, [activeState, isOnline, onlineRoom, myRole, showToast]);

  // AI Combo Announcement (local match only)
  useEffect(() => {
    if (isOnline || !settings.botsEnabled) return;
    if (
      currentScreen === 'GAME' &&
      state.phase === 'PLAYING' &&
      state.turn === 'ai' &&
      state.playedCards.length === 0 &&
      state.announcedCombos.ai.length === 0 &&
      state.canDeclare.ai &&
      state.combos.ai.length > 0
    ) {
      const bestAi = state.combos.ai.reduce((a, b) =>
        a.strength > b.strength ? a : b
      );
      const playerStrongest =
        state.announcedCombos.player.length > 0 ? state.announcedCombos.player[0] : null;

      if (playerStrongest && COMBO_HIERARCHY[bestAi.type] < COMBO_HIERARCHY[playerStrongest.type]) {
        return;
      }

      const hasConflict = Boolean(playerStrongest && playerStrongest.type === bestAi.type);
      setState((prev) => ({
        ...prev,
        announcedCombos: {
          ...prev.announcedCombos,
          ai: [bestAi],
          player:
            playerStrongest && COMBO_HIERARCHY[bestAi.type] > COMBO_HIERARCHY[playerStrongest.type]
              ? []
              : prev.announcedCombos.player,
        },
        hasConfirmedGrowth: { ...prev.hasConfirmedGrowth, ai: !hasConflict },
      }));

      if (hasConflict) {
        setTimeout(() => setConflictType(bestAi.type), 600);
      } else {
        showToast(`AI объявил: ${translateCombo(bestAi.type)}`);
      }
    }
  }, [
    isOnline,
    settings.botsEnabled,
    currentScreen,
    state.phase,
    state.turn,
    state.playedCards.length,
    state.combos.ai,
    state.announcedCombos.ai.length,
    state.announcedCombos.player,
    state.canDeclare.ai,
    showToast,
  ]);

  // AI Show Combos (local match only)
  useEffect(() => {
    if (isOnline || !settings.botsEnabled) return;
    if (
      currentScreen === 'GAME' &&
      state.phase === 'PLAYING' &&
      state.turn === 'ai' &&
      state.playedCards.length === 1 &&
      state.announcedCombos.ai.length > 0 &&
      !state.hasShownCombos.ai &&
      !state.isShowingCombo &&
      state.hasConfirmedGrowth.ai &&
      state.canShow.ai
    ) {
      const timer = setTimeout(() => {
        const aiCombos = state.announcedCombos.ai;
        const playerCombos = state.announcedCombos.player;
        const aiStrongest = aiCombos.reduce((a, b) =>
          a.strength > b.strength ? a : b
        );
        const playerStrongest =
          playerCombos.length > 0
            ? playerCombos.reduce((a, b) => (a.strength > b.strength ? a : b))
            : null;

        const canShow = !playerStrongest || aiStrongest.strength > playerStrongest.strength;
        if (!canShow) {
          setState((prev) => ({
            ...prev,
            announcedCombos: { ...prev.announcedCombos, ai: [] },
            hasShownCombos: { ...prev.hasShownCombos, ai: true },
          }));
          return;
        }

        setShowingCombos((prev) => ({ ...prev, ai: true }));
        setState((prev) => ({ ...prev, isShowingCombo: true }));
        showToast(
          `AI показал ${translateCombo(aiStrongest.type, aiStrongest.highRank, true)} (+${aiStrongest.points})`
        );

        setTimeout(() => {
          setShowingCombos((prev) => ({ ...prev, ai: false }));
          setState((prev) => ({
            ...prev,
            isShowingCombo: false,
            declaredCombos: { ...prev.declaredCombos, ai: aiCombos },
            hasShownCombos: { ...prev.hasShownCombos, ai: true },
            aiRoundScore:
              prev.aiRoundScore + aiCombos.reduce((sum, c) => sum + c.points, 0),
            announcedCombos: { ...prev.announcedCombos, player: [] },
          }));
        }, 2200);
      }, 450);

      return () => clearTimeout(timer);
    }
  }, [
    isOnline,
    settings.botsEnabled,
    currentScreen,
    state.phase,
    state.turn,
    state.playedCards.length,
    state.announcedCombos,
    state.hasShownCombos.ai,
    state.isShowingCombo,
    state.hasConfirmedGrowth.ai,
    state.canShow.ai,
    showToast,
  ]);

  // AI Card Play Logic (local match only)
  useEffect(() => {
    if (isOnline || !settings.botsEnabled) return;
    const needsToShow =
      state.playedCards.length === 1 &&
      state.announcedCombos.ai.length > 0 &&
      !state.hasShownCombos.ai;

    if (
      currentScreen === 'GAME' &&
      state.phase === 'PLAYING' &&
      state.turn === 'ai' &&
      !state.currentTrick.ai &&
      !state.isShowingCombo &&
      !needsToShow &&
      state.aiHand.length > 0
    ) {
      const timer = setTimeout(() => {
        const leadCard = state.currentTrick.player;
        const validCards = state.aiHand.filter(
          (c) => canPlayCard(c, state.aiHand, leadCard, state.trump!).valid
        );
        const aiCard = validCards.length > 0 ? validCards[0] : state.aiHand[0];
        if (!aiCard) return;

        playCardSound();

        let newBlotDeclared = state.blotDeclared.ai;
        if (
          !state.allCombinationsDisabled &&
          !newBlotDeclared &&
          (aiCard.rank === Rank.KING || aiCard.rank === Rank.QUEEN) &&
          aiCard.suit.toString() === state.trump?.toString()
        ) {
          const otherPart = aiCard.rank === Rank.KING ? Rank.QUEEN : Rank.KING;
          if (
            state.aiHand.some(
              (c) => c.rank === otherPart && c.suit.toString() === state.trump?.toString()
            )
          ) {
            newBlotDeclared = true;
            showToast('AI: БЛОТ! +20');
          }
        }

        setState((prev) => {
          const trickIndex = prev.playedCards.length;
          let newAnnouncedAI = prev.announcedCombos.ai;
          let newCanDeclare = prev.canDeclare;
          let newCanShow = prev.canShow;

          if (trickIndex === 0) {
            newCanDeclare = { ...prev.canDeclare, ai: false };
          }
          if (trickIndex === 1 && !prev.hasShownCombos.ai) {
            newAnnouncedAI = [];
            newCanShow = { ...prev.canShow, ai: false };
          }

          return {
            ...prev,
            aiHand: prev.aiHand.filter((c) => c.id !== aiCard.id),
            currentTrick: { ...prev.currentTrick, ai: aiCard },
            turn: prev.currentTrick.player ? 'ai' : 'player',
            isFirstDeal: false,
            blotDeclared: { ...prev.blotDeclared, ai: newBlotDeclared },
            announcedCombos: { ...prev.announcedCombos, ai: newAnnouncedAI },
            canDeclare: newCanDeclare,
            canShow: newCanShow,
          };
        });
      }, AI_SPEED_MS[settings.aiSpeed]);

      return () => clearTimeout(timer);
    }
  }, [
    currentScreen,
    state.phase,
    state.turn,
    state.aiHand,
    state.currentTrick,
    state.trump,
    state.isShowingCombo,
    state.playedCards.length,
    state.announcedCombos.ai.length,
    state.hasShownCombos.ai,
    state.blotDeclared.ai,
    state.allCombinationsDisabled,
    settings.aiSpeed,
    settings.botsEnabled,
    isOnline,
    showToast,
  ]);

  // Player Bot Auto-Play Mode (controlled from SettingsDrawer)
  useEffect(() => {
    if (!settings.botsEnabled || !settings.botAutoPlay || currentScreen !== 'GAME') return;
    if (isOnline && onlineRoom?.status !== 'playing') return;
    if (isOnline && onlineRoom?.pendingExtraDrawRole) return;
    if (activeState.turn !== 'player' || activeState.isShowingCombo) return;

    if (
      (activeState.phase === 'OFFERING_TRUMP' ||
        activeState.phase === 'SUIT_SELECTION') &&
      activeState.offeredCard
    ) {
      const timer = setTimeout(() => {
        const decision = decideBotBid(
          activeState.phase,
          activeState.playerHand,
          activeState.offeredCard,
          activeState.dealer === 'player'
        );
        if (decision.action === 'take') {
          handleTakeTrump('player', decision.trump);
        } else {
          handlePassTrump();
        }
      }, AI_SPEED_MS[settings.aiSpeed]);
      return () => clearTimeout(timer);
    }

    if (activeState.phase === 'PLAYING' && !activeState.currentTrick.player) {
      if (
        !activeState.allCombinationsDisabled &&
        activeState.playedCards.length === 0 &&
        activeState.canDeclare.player &&
        activeState.announcedCombos.player.length === 0 &&
        activeState.combos.player.length > 0
      ) {
        const best = pickBotComboToAnnounce(
          activeState.combos.player,
          activeState.announcedCombos.ai
        );
        if (best) {
          handleAnnounceType(best.type);
          return;
        }
      }

      if (
        activeState.playedCards.length === 1 &&
        activeState.announcedCombos.player.length > 0 &&
        !activeState.hasShownCombos.player &&
        activeState.canShow.player
      ) {
        const timer = setTimeout(() => {
          handleShowCombos();
        }, 350);
        return () => clearTimeout(timer);
      }

      if (activeState.playerHand.length > 0 && activeState.trump) {
        const timer = setTimeout(() => {
          const picked = pickBotCard(
            activeState.playerHand,
            activeState.currentTrick.ai,
            activeState.trump!
          );
          if (picked) playCard(picked);
        }, AI_SPEED_MS[settings.aiSpeed]);
        return () => clearTimeout(timer);
      }
    }
  }, [
    settings.botsEnabled,
    settings.botAutoPlay,
    settings.aiSpeed,
    currentScreen,
    isOnline,
    onlineRoom,
    activeState,
    handleTakeTrump,
    handlePassTrump,
    handleAnnounceType,
    handleShowCombos,
    playCard,
  ]);

  // Round Resolution
  const resolveRound = useCallback(
    (
      finalPlayedCards: { player: CardType; ai: CardType; winner: 'player' | 'ai' }[],
      finalWinner: 'player' | 'ai'
    ) => {
      const result = calculateRoundScore(
        finalPlayedCards,
        state.trump!,
        state.bidder || 'player',
        state.declaredCombos.player,
        state.declaredCombos.ai,
        finalWinner,
        state.blotDeclared,
        state.allCombinationsDisabled
      );

      setState((prev) => {
        let pRoundPaper = 0;
        let aRoundPaper = 0;

        if (result.isBait) {
          const totalTricks = result.player.tricks + result.ai.tricks;
          const totalCombosPoints =
            result.player.combos.reduce((sum, c) => sum + c.points, 0) +
            result.ai.combos.reduce((sum, c) => sum + c.points, 0);
          const totalPaper = getPaperScore(totalTricks) + totalCombosPoints / 10;

          if (result.player.total > 0) {
            pRoundPaper = totalPaper;
          } else {
            aRoundPaper = totalPaper;
          }
        } else {
          pRoundPaper =
            getPaperScore(result.player.tricks) +
            result.player.combos.reduce((sum, c) => sum + c.points / 10, 0);
          aRoundPaper =
            getPaperScore(result.ai.tricks) +
            result.ai.combos.reduce((sum, c) => sum + c.points / 10, 0);
        }

        const pBreakdown = { ...result.player, finalPaper: pRoundPaper };
        const aBreakdown = { ...result.ai, finalPaper: aRoundPaper };
        const newPScore = prev.playerScore + pRoundPaper;
        const newAScore = prev.aiScore + aRoundPaper;
        const nextPhase =
          newPScore >= prev.gameLimit || newAScore >= prev.gameLimit
            ? 'GAME_OVER'
            : 'RESULT';

        return {
          ...prev,
          playerScore: newPScore,
          aiScore: newAScore,
          phase: nextPhase,
          playerRoundScore: pRoundPaper,
          aiRoundScore: aRoundPaper,
          roundBreakdown: {
            player: pBreakdown,
            ai: aBreakdown,
            isBait: result.isBait,
            bidder: result.bidder,
          },
        };
      });
    },
    [state.trump, state.bidder, state.declaredCombos, state.blotDeclared, state.allCombinationsDisabled]
  );

  // Trick Resolution (local match only)
  useEffect(() => {
    if (isOnline || currentScreen !== 'GAME') return;
    if (state.currentTrick.player && state.currentTrick.ai) {
      const timer = setTimeout(() => {
        const { player, ai } = state.currentTrick;
        if (!player || !ai) return;

        const firstPlayer =
          state.lastWinner || (state.dealer === 'player' ? 'ai' : 'player');
        const leadCard = firstPlayer === 'player' ? player : ai;
        const winner = resolveTrick(player, ai, state.trump!, leadCard.suit);
        const newPlayedCards = [...state.playedCards, { player, ai, winner }];
        const isLastTrick =
          state.playerHand.length === 0 && state.aiHand.length === 0;
        const trickPoints =
          getCardValue(player.rank, player.suit, state.trump!) +
          getCardValue(ai.rank, ai.suit, state.trump!) +
          (isLastTrick ? 10 : 0);

        playChimeSound(winner === 'player');

        setState((prev) => ({
          ...prev,
          playedCards: newPlayedCards,
          currentTrick: {},
          turn: winner,
          lastWinner: winner,
          playerRoundScore:
            prev.playerRoundScore + (winner === 'player' ? trickPoints : 0),
          aiRoundScore: prev.aiRoundScore + (winner === 'ai' ? trickPoints : 0),
        }));

        if (isLastTrick) {
          resolveRound(newPlayedCards, winner);
        }
      }, 1150);

      return () => clearTimeout(timer);
    }
  }, [
    currentScreen,
    state.currentTrick,
    state.trump,
    state.lastWinner,
    state.dealer,
    state.playerHand.length,
    state.aiHand.length,
    state.playedCards,
    resolveRound,
  ]);

  const playerTricksWon = activeState.playedCards.filter(
    (t) => t.winner === 'player'
  ).length;
  const aiTricksWon = activeState.playedCards.filter((t) => t.winner === 'ai').length;
  const isShowButtonVisible =
    activeState.phase === 'PLAYING' &&
    activeState.playedCards.length === 1 &&
    activeState.announcedCombos.player.length > 0 &&
    !activeState.hasShownCombos.player &&
    activeState.turn === 'player' &&
    activeState.canShow.player;

  const handleGoLobby = useCallback(() => {
    exitGameImmersiveMode();
    if (isOnline && onlineRoom) {
      if (onlineRoom.status === 'waiting' && myRole === 'host') {
        void cancelWaitingOnlineRoom(onlineRoom.roomCode, firebaseUser?.uid).catch((err) =>
          showToast(getRoomErrorMessage(err, 'Не удалось закрыть стол.'))
        );
      } else if (onlineRoom.status === 'playing') {
        void onlineForfeitRoom(onlineRoom, myRole).catch((err) =>
          showToast(getRoomErrorMessage(err, 'Не удалось завершить партию.'))
        );
      }
      setOnlineRoomCode(null);
      setOnlineRoom(null);
      setOnlineHand([]);
    } else if (onlineRoomCode) {
      void cancelWaitingOnlineRoom(onlineRoomCode, firebaseUser?.uid).catch((err) =>
        showToast(getRoomErrorMessage(err, 'Не удалось закрыть стол.'))
      );
      setOnlineRoomCode(null);
      setOnlineRoom(null);
      setOnlineHand([]);
    }
    setCurrentScreen('LOBBY');
  }, [isOnline, onlineRoom, onlineRoomCode, myRole, firebaseUser?.uid, exitGameImmersiveMode, showToast]);

  const handleCreateGame = () => {
    if (!settings.botsEnabled) {
      showToast('Боты отключены в настройках');
      return;
    }
    enterGameImmersiveMode();
    setOnlineRoomCode(null);
    setCurrentScreen('GAME');
    startNewRound({
      tableId: Math.floor(1000000000 + Math.random() * 900000000),
    });
  };

  const handleOpenOwnRoom = (code: string) => {
    enterGameImmersiveMode();
    setOnlineRoomCode(code);
    setCurrentScreen('GAME');
    setCopiedInvite(false);
  };

  const handleCancelOwnRoom = async (code: string) => {
    try {
      await cancelWaitingOnlineRoom(code, firebaseUser?.uid);
      if (onlineRoomCode === code) {
        setOnlineRoomCode(null);
        setOnlineRoom(null);
        setOnlineHand([]);
      }
      showToast('Стол удалён');
    } catch (err) {
      showToast(getRoomErrorMessage(err, 'Ошибка удаления стола'));
    }
  };

  const handleCreateOnlineGame = async () => {
    if (roomAction) return;
    setRoomActionError(null);
    setRoomActionDebug(null);
    if (!authReady && typeof auth.authStateReady === 'function') {
      await auth.authStateReady();
    }
    const activeAuthUser = auth.currentUser || firebaseUser;
    if (!activeAuthUser) {
      setAuthModalOpen(true);
      const msg = 'Вы не вошли в аккаунт Google (auth.currentUser == null). Войдите, чтобы создать стол.';
      setRoomActionError(msg);
      showToast(msg);
      return;
    }
    if (!userProfile?.registrationComplete) {
      setAuthModalOpen(true);
      const msg = 'Завершите регистрацию игрового профиля перед созданием стола.';
      setRoomActionError(msg);
      showToast(msg);
      return;
    }
    setRoomAction('creating');
    try {
      const code = await createOnlineRoom(userProfile, {
        gameLimit: state.gameLimit,
        betAmount: state.betAmount,
        allowHighCombos: state.allowHighCombos,
        allCombinationsDisabled: state.allCombinationsDisabled,
        turnTimeLimit: state.turnTimeLimit,
      });
      enterGameImmersiveMode();
      setOnlineRoomCode(code);
      setCurrentScreen('GAME');
      setCopiedInvite(false);
      setRoomListError(null);
      setRoomActionError(null);
      setRoomActionDebug(null);
    } catch (err) {
      const detailedMsg = getRoomErrorMessage(
        err,
        'Не удалось создать стол. Проверьте авторизацию Google, правила Firestore и подключение.'
      );
      const debugSummary = extractRoomDebugSummary(err);
      setRoomActionError(detailedMsg);
      setRoomActionDebug(debugSummary ? JSON.stringify(debugSummary, null, 2) : null);
      showToast(detailedMsg);
    } finally {
      setRoomAction(null);
    }
  };

  const handleJoinOnlineByCode = async (rawCode: string) => {
    if (roomAction) return;
    setRoomActionError(null);
    setRoomActionDebug(null);
    const clean = sanitizeRoomCode(rawCode);
    if (clean.length < 4) {
      showToast('Введите код стола друга (минимум 4 символа).');
      return;
    }
    if (!authReady && typeof auth.authStateReady === 'function') {
      await auth.authStateReady();
    }
    const activeAuthUser = auth.currentUser || firebaseUser;
    if (!activeAuthUser || !userProfile?.registrationComplete) {
      setPendingInviteCode(clean);
      setAuthModalOpen(true);
      const msg = 'Войдите через Google и завершите регистрацию, чтобы присоединиться';
      setRoomActionError(msg);
      showToast(msg);
      return;
    }
    const matchedOwn = activeWaitingRooms.find(
      (r) => r.roomCode === clean && r.hostUid === activeAuthUser.uid
    );
    if (matchedOwn) {
      handleOpenOwnRoom(clean);
      return;
    }
    setRoomAction('joining');
    try {
      const code = await joinOnlineRoom(clean, userProfile);
      enterGameImmersiveMode();
      setOnlineRoomCode(code);
      setCurrentScreen('GAME');
      setRoomActionError(null);
      showToast(`Подключено к столу ${code}`);
    } catch (err) {
      const detailedMsg = getRoomErrorMessage(
        err,
        'Не удалось войти в стол. Проверьте код и попробуйте снова.'
      );
      setRoomActionError(detailedMsg);
      showToast(detailedMsg);
    } finally {
      setRoomAction(null);
    }
  };

  const handleCopyInvite = async () => {
    if (!onlineRoom) return;
    const url = `${window.location.origin}/?room=${onlineRoom.roomCode}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedInvite(true);
      setTimeout(() => setCopiedInvite(false), 2000);
      showToast('Ссылка приглашения скопирована');
    } catch {
      showToast(`Код стола: ${onlineRoom.roomCode}`);
    }
  };

  return (
    <div className="w-screen h-[100dvh] flex flex-col overflow-hidden bg-[#181b24] text-slate-100 font-sans">
      {isMobile && currentScreen === 'GAME' ? (
        mobileTopBarVisible ? (
          <MobileTopBar
            tableId={activeState.tableId}
            gameLimit={activeState.gameLimit}
            betAmount={activeState.betAmount}
            roundNumber={activeState.roundNumber}
            playerTricksWon={playerTricksWon}
            aiTricksWon={aiTricksWon}
            playerLabel={playerShortLabel}
            opponentLabel={opponentLabel}
            accountBalance={userProfile?.balance ?? null}
            isMuted={isMuted}
            onToggleMute={handleToggleMute}
            onGoLobby={handleGoLobby}
            onNewRound={() => startNewRound()}
            onOpenRules={() => setRulesOpen(true)}
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenAuth={() => setAuthModalOpen(true)}
          />
        ) : (
          <button
            type="button"
            aria-label="Показать меню игры"
            onClick={() => setMobileTopBarVisible(true)}
            className="fixed top-2 left-2 z-[60] rounded-full border border-white/20 bg-[#151821]/85 p-2 text-slate-200 shadow-lg backdrop-blur-sm"
          >
            <Menu size={18} />
          </button>
        )
      ) : (
        <TopBar
          currentScreen={currentScreen}
          tableId={activeState.tableId}
          isMuted={isMuted}
          userProfile={userProfile}
          isSignedIn={Boolean(firebaseUser)}
          onToggleMute={handleToggleMute}
          onGoLobby={handleGoLobby}
          onEnterGame={() => {
            enterGameImmersiveMode();
            setCurrentScreen('GAME');
          }}
          onNewRound={() => startNewRound()}
          onOpenRules={() => setRulesOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenAuth={() => setAuthModalOpen(true)}
        />
      )}

      {currentScreen === 'LOBBY' ? (
        <LobbyView
          state={state}
          userProfile={userProfile}
          isSignedIn={Boolean(firebaseUser)}
          waitingRooms={activeWaitingRooms}
          roomsError={roomListError}
          roomActionError={roomActionError}
          roomActionDebug={roomActionDebug}
          onRetryRooms={() => setRoomListVersion((version) => version + 1)}
          onDismissRoomActionError={() => {
            setRoomActionError(null);
            setRoomActionDebug(null);
          }}
          roomAction={roomAction}
          botsEnabled={settings.botsEnabled}
          initialJoinCode={pendingInviteCode}
          onUpdateSettings={(patch) => setState((prev) => ({ ...prev, ...patch }))}
          onCreateBotGame={handleCreateGame}
          onCreateOnlineGame={() => void handleCreateOnlineGame()}
          onJoinOnlineByCode={(code) => void handleJoinOnlineByCode(code)}
          onOpenOwnRoom={handleOpenOwnRoom}
          onCancelOwnRoom={(code) => void handleCancelOwnRoom(code)}
          onOpenAuth={() => setAuthModalOpen(true)}
        />
      ) : isMobile ? (
        <main
          className="flex-1 relative vivaro-table-bg overflow-hidden flex transition-[background] duration-300"
          style={{ background: TABLE_THEME_BACKGROUNDS[settings.tableTheme] }}
          data-testid="mobile-game-table"
        >
          <MobileLeftSidebar
            tableId={activeState.tableId}
            playerScore={activeState.playerScore}
            aiScore={activeState.aiScore}
            playerRoundScore={activeState.playerRoundScore}
            aiRoundScore={activeState.aiRoundScore}
            dealer={activeState.dealer}
            bidder={activeState.bidder}
            trump={activeState.trump}
            turn={activeState.turn}
            isPlayingOrBidding={
              activeState.phase !== 'RESULT' && activeState.phase !== 'GAME_OVER'
            }
            playerHasCardInTrick={Boolean(activeState.currentTrick.player)}
            aiHasCardInTrick={Boolean(activeState.currentTrick.ai)}
            timeLeft={activeState.timeLeft}
            maxTime={activeState.turnTimeLimit}
            playerTimeBank={activeState.playerTimeBank}
            aiTimeBank={activeState.aiTimeBank}
            showTimers={settings.showTimers}
            hideScores={settings.scorePanelAnchor === 'hidden'}
            playerLabel={playerShortLabel}
            opponentLabel={opponentLabel}
            aiComboLabel={
              activeState.declaredCombos.ai.length > 0
                ? activeState.declaredCombos.ai.map((c) => translateCombo(c.type)).join(' + ')
                : activeState.announcedCombos.ai.length > 0
                ? activeState.announcedCombos.ai.map((c) => translateCombo(c.type)).join(' + ')
                : null
            }
            playerComboLabel={
              activeState.declaredCombos.player.length > 0
                ? activeState.declaredCombos.player
                    .map((c) => translateCombo(c.type))
                    .join(' + ')
                : activeState.announcedCombos.player.length > 0
                ? activeState.announcedCombos.player
                    .map((c) => translateCombo(c.type))
                    .join(' + ')
                : null
            }
          />

          {/* Open Mobile Felt Area (right of sidebar) */}
          <div className="flex-1 relative h-full overflow-hidden">
            {/* Subtle Captured-Tricks Mini Cards Top-Left */}
            <div className="absolute top-2.5 left-3 z-10 pointer-events-none opacity-80 flex items-center gap-1">
              <div className="relative w-5 h-6">
                <div className="w-3.5 h-5 rounded-[2px] bg-[#2c3242] border border-white/25 -rotate-6" />
                <div className="w-3.5 h-5 rounded-[2px] bg-white border border-slate-300 rotate-6 absolute top-0.5 left-1.5 flex items-center justify-center text-[7px] font-bold text-slate-900">
                  ♠
                </div>
              </div>
              {aiTricksWon + playerTricksWon > 0 && (
                <span className="text-[10px] font-mono font-bold text-slate-200 tabular-nums">
                  {aiTricksWon + playerTricksWon}
                </span>
              )}
            </div>

            {/* AI Fanned Hand (tucked at top edge like mobile reference) */}
            <div
              className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-24 flex justify-center items-start z-10 pointer-events-none"
              data-testid="ai-hand"
            >
              <div className="relative w-full flex justify-center">
                {activeState.aiHand.map((card, index) => {
                  const total = activeState.aiHand.length;
                  const center = (total - 1) / 2;
                  const dist = index - center;
                  const angle = dist * -3.6;
                  const aiSpread = isNarrowPortrait
                    ? Math.min(24, Math.round(settings.aiFanSpread * 0.56))
                    : Math.round(settings.aiFanSpread * 0.72);
                  const xOffset = dist * aiSpread;
                  const baseY = -22 + Math.round((settings.aiHandOffsetY + 16) * 0.5);
                  const yOffset = -Math.pow(Math.abs(dist), 1.3) * 1.1 + baseY;
                  const isShowing =
                    showingCombos.ai &&
                    activeState.announcedCombos.ai.some((c) => c.cardIds?.includes(card.id));

                  return (
                    <div
                      key={card.id}
                      className="absolute transition-transform duration-300"
                      style={{
                        transform: `translateX(${xOffset}px) translateY(${yOffset}px) rotate(${angle}deg) scale(${settings.cardScale})`,
                        transformOrigin: 'top center',
                        zIndex: isShowing ? 100 : index,
                      }}
                    >
                      <Card
                        card={card}
                        compact
                        hidden={!isShowing}
                        isShowingCombo={isShowing}
                        cardBackTheme={settings.cardBackTheme}
                        showBottomIndex={settings.showBottomIndex}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right-Edge Docked Deck & Offered Card */}
            <div
              className={`absolute right-0 z-20 flex items-center pointer-events-none transition-transform duration-200 ${
                isNarrowPortrait ? 'top-[22%]' : 'top-[46%]'
              }`}
              style={{
                transform: `translate(${settings.deckOffsetX + 14}px, calc(-50% + ${settings.deckOffsetY}px)) scale(${settings.cardScale})`,
              }}
              data-testid="deck-area"
            >
              {activeState.offeredCard && (
                <div className="-mr-5 drop-shadow-[0_10px_18px_rgba(0,0,0,0.45)] z-10">
                  <Card
                    card={activeState.offeredCard}
                    compact
                    showBottomIndex={settings.showBottomIndex}
                  />
                </div>
              )}

              {activeState.deck.length > 0 && (
                <div className="relative w-[58px] h-[84px]">
                  {Array.from({ length: Math.min(4, activeState.deck.length) }).map((_, i) => (
                    <div
                      key={i}
                      className="absolute inset-0"
                      style={{
                        transform: `translate(${i * 1.2}px, ${-i * 2}px)`,
                        zIndex: 10 + i,
                      }}
                    >
                      <Card
                        card={{ id: `deck-${i}`, suit: Suit.SPADES, rank: Rank.NINE }}
                        compact
                        hidden
                        cardBackTheme={settings.cardBackTheme}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Center Play Zone: Bidding OR Trick Cards */}
            <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none">
              <AnimatePresence>
                {activeState.phase === 'OFFERING_TRUMP' && activeState.offeredCard && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.16 }}
                    className="pointer-events-auto bg-[#222632]/95 border border-white/15 rounded-2xl px-4 py-3 shadow-2xl flex flex-col items-center gap-2.5 max-w-[260px]"
                  >
                    <div className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                      <span>Предложен козырь:</span>
                      <span
                        className={`text-sm font-bold ${
                          activeState.offeredCard.suit === Suit.HEARTS ||
                          activeState.offeredCard.suit === Suit.DIAMONDS
                            ? 'text-[#ef233c]'
                            : 'text-white'
                        }`}
                      >
                        {activeState.offeredCard.rank} {suitGlyph(activeState.offeredCard.suit)}
                      </span>
                    </div>

                    {activeState.turn === 'player' ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            handleTakeTrump(
                              'player',
                              activeState.offeredCard!.suit as unknown as TrumpType
                            )
                          }
                          className="btn-vivaro px-4 py-2 text-xs uppercase tracking-wider cursor-pointer whitespace-nowrap"
                        >
                          Взять {suitGlyph(activeState.offeredCard.suit)}
                        </button>

                        {!(
                          activeState.offeredCard.rank === Rank.JACK &&
                          activeState.dealer === 'player'
                        ) && (
                          <button
                            type="button"
                            onClick={handlePassTrump}
                            className="px-4 py-2 bg-[#2e3445] hover:bg-[#3a4156] border border-white/10 rounded-lg text-xs font-bold uppercase tracking-wider text-slate-200 cursor-pointer whitespace-nowrap"
                          >
                            Пас
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-xs text-slate-400 py-0.5">
                        <span className="w-3.5 h-3.5 border-2 border-[#e91e63] border-t-transparent rounded-full animate-spin" />
                        <span>{opponentLabel} думает...</span>
                      </div>
                    )}
                  </motion.div>
                )}

                {activeState.phase === 'SUIT_SELECTION' && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.16 }}
                    className="pointer-events-auto bg-[#222632]/95 border border-white/15 rounded-2xl px-4 py-3 shadow-2xl flex flex-col items-center gap-2.5 max-w-[270px]"
                  >
                    <div className="text-xs font-semibold text-slate-300">
                      {activeState.turn === 'player'
                        ? 'Выберите козырь'
                        : `${opponentLabel} выбирает масть...`}
                    </div>

                    {activeState.turn === 'player' ? (
                      <div className="flex flex-col items-center gap-2">
                        <div className="flex items-center gap-1.5">
                          {[Suit.HEARTS, Suit.DIAMONDS, Suit.CLUBS, Suit.SPADES].map((s) => {
                            if (s === activeState.offeredCard?.suit) return null;
                            const isRed = s === Suit.HEARTS || s === Suit.DIAMONDS;
                            return (
                              <button
                                key={s}
                                type="button"
                                onClick={() =>
                                  handleSelectSuit(s as unknown as TrumpType)
                                }
                                aria-label={`Выбрать козырь ${s}`}
                                className="w-10 h-10 rounded-xl bg-[#181b24] hover:bg-[#2c3142] border border-white/15 flex items-center justify-center text-xl cursor-pointer"
                              >
                                <span className={isRed ? 'text-[#ef233c]' : 'text-white'}>
                                  {suitGlyph(s)}
                                </span>
                              </button>
                            );
                          })}
                          <button
                            type="button"
                            onClick={() => handleSelectSuit(TrumpType.NO_TRUMP)}
                            aria-label="Без козыря"
                            className="w-10 h-10 rounded-xl bg-[#181b24] hover:bg-[#2c3142] border border-white/15 flex items-center justify-center text-base font-extrabold text-white cursor-pointer"
                          >
                            A
                          </button>
                        </div>

                        {activeState.dealer !== 'player' && (
                          <button
                            type="button"
                            onClick={handlePassTrump}
                            className="w-full py-1.5 bg-[#2e3445] hover:bg-[#3a4156] border border-white/10 rounded-lg text-xs font-bold uppercase tracking-wider text-slate-200 cursor-pointer"
                          >
                            Пас
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="w-4 h-4 border-2 border-[#e91e63] border-t-transparent rounded-full animate-spin" />
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Current Trick Cards */}
              <div
                className="absolute inset-0 flex items-center justify-center -mt-4 pointer-events-none"
                data-testid="trick-area"
                data-layout={settings.trickLayout}
              >
                {(() => {
                  const trickLeader =
                    activeState.lastWinner ||
                    (activeState.dealer === 'player' ? 'ai' : 'player');
                  const aiIsFirst = trickLeader === 'ai';

                  let aiX = 0;
                  let aiY = 0;
                  let playerX = 0;
                  let playerY = 0;

                  if (settings.trickLayout === 'sideBySide') {
                    const sideGap = 36;
                    aiX = -sideGap;
                    playerX = sideGap;
                  } else {
                    const dx = Math.round(settings.trickOffset * 0.72);
                    const dy = Math.round(settings.trickOffset * 0.95);
                    aiX = aiIsFirst ? -dx : dx;
                    aiY = aiIsFirst ? -dy : dy;
                    playerX = aiIsFirst ? dx : -dx;
                    playerY = aiIsFirst ? dy : -dy;
                  }

                  const aiZ = aiIsFirst ? 10 : 20;
                  const playerZ = aiIsFirst ? 20 : 10;

                  return (
                    <AnimatePresence>
                      {activeState.currentTrick.ai && (
                        <motion.div
                          key={`trick-ai-${activeState.currentTrick.ai.id}`}
                          initial={{
                            x: aiX,
                            y: aiY - 60,
                            opacity: 0,
                            scale: settings.cardScale * 0.92,
                          }}
                          animate={{
                            x: aiX,
                            y: aiY,
                            opacity: 1,
                            scale: settings.cardScale,
                          }}
                          exit={{ scale: settings.cardScale * 0.75, opacity: 0 }}
                          transition={{ duration: 0.18 }}
                          className="absolute"
                          style={{ zIndex: aiZ }}
                        >
                          <Card
                            card={activeState.currentTrick.ai}
                            compact
                            showBottomIndex={settings.showBottomIndex}
                          />
                        </motion.div>
                      )}

                      {activeState.currentTrick.player && (
                        <motion.div
                          key={`trick-player-${activeState.currentTrick.player.id}`}
                          initial={{
                            x: playerX,
                            y: playerY + 60,
                            opacity: 0,
                            scale: settings.cardScale * 0.92,
                          }}
                          animate={{
                            x: playerX,
                            y: playerY,
                            opacity: 1,
                            scale: settings.cardScale,
                          }}
                          exit={{ scale: settings.cardScale * 0.75, opacity: 0 }}
                          transition={{ duration: 0.18 }}
                          className="absolute"
                          style={{ zIndex: playerZ }}
                        >
                          <Card
                            card={activeState.currentTrick.player}
                            compact
                            showBottomIndex={settings.showBottomIndex}
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  );
                })()}
              </div>
            </div>

            {/* Conflict Growth Selection */}
            <AnimatePresence>
              {conflictType && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.94 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.94 }}
                  className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#222632] border border-white/20 rounded-2xl p-4 shadow-2xl z-[180] w-72 text-center"
                >
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-3">
                    Выберите старшую карту ({translateCombo(conflictType)})
                  </p>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {(
                      conflictType === 'Terz'
                        ? [Rank.JACK, Rank.QUEEN, Rank.KING, Rank.ACE]
                        : conflictType === 'Fifty'
                        ? [Rank.QUEEN, Rank.KING, Rank.ACE]
                        : conflictType === 'Hundred'
                        ? [Rank.KING, Rank.ACE]
                        : [Rank.NINE, Rank.TEN, Rank.JACK, Rank.QUEEN, Rank.KING, Rank.ACE]
                    ).map((rank) => {
                      const combo = activeState.combos.player.find(
                        (c) => c.type === conflictType && c.highRank === rank
                      );
                      return (
                        <button
                          key={rank}
                          type="button"
                          disabled={!combo}
                          onClick={() => combo && handleSelectGrowth(rank)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                            combo
                              ? 'bg-[#e91e63] text-white hover:bg-[#d81b60] cursor-pointer'
                              : 'bg-[#181b24] text-slate-600 cursor-not-allowed'
                          }`}
                        >
                          {translateRank(rank)}
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Bottom Center: Mobile Player Hand & Combo Controls */}
            <div
              className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full h-36 flex flex-col items-center justify-end z-40 pointer-events-none"
              data-testid="player-hand"
            >
              <div className="relative mb-2 pointer-events-auto flex items-center gap-2">
                {activeState.phase === 'PLAYING' &&
                  !activeState.allCombinationsDisabled &&
                  activeState.playedCards.length === 0 &&
                  activeState.turn === 'player' &&
                  activeState.canDeclare.player &&
                  activeState.combos.player.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setIsComboMenuOpen((v) => !v)}
                      className="px-3.5 py-1 rounded-full bg-[#222632] hover:bg-[#2d3344] border border-white/15 text-[11px] font-bold text-slate-100 shadow-lg cursor-pointer"
                    >
                      {isComboMenuOpen ? 'Закрыть' : 'Комбинация'}
                    </button>
                  )}

                {isShowButtonVisible && (
                  <button
                    type="button"
                    onClick={handleShowCombos}
                    className="px-4 py-1 rounded-full bg-amber-400 hover:bg-amber-300 text-slate-950 text-[11px] font-extrabold uppercase tracking-wider shadow-lg cursor-pointer"
                  >
                    Показать {translateCombo(activeState.announcedCombos.player[0].type)}
                  </button>
                )}

                {isComboMenuOpen && activeState.playedCards.length === 0 && (
                  <div className="absolute bottom-9 left-1/2 -translate-x-1/2 bg-[#222632] border border-white/15 rounded-xl p-2 shadow-2xl flex gap-1.5 z-50">
                    {(['Terz', 'Fifty', 'Hundred', 'Carre'] as const)
                      .filter(
                        (type) =>
                          activeState.allowHighCombos ||
                          (type !== 'Hundred' && type !== 'Carre')
                      )
                      .map((type) => {
                        const hasType = activeState.combos.player.some(
                          (c) => c.type === type
                        );
                        const isDeclared = activeState.announcedCombos.player.some(
                          (ac) => ac.type === type
                        );
                        return (
                          <button
                            key={type}
                            type="button"
                            disabled={!hasType || isDeclared}
                            onClick={() => handleAnnounceType(type)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap ${
                              isDeclared
                                ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                                : hasType
                                ? 'bg-[#e91e63] text-white hover:bg-[#d81b60] cursor-pointer'
                                : 'bg-[#181b24] text-slate-600 cursor-not-allowed'
                            }`}
                          >
                            {translateCombo(type)}
                          </button>
                        );
                      })}
                  </div>
                )}
              </div>

              <div className="relative w-full h-[92px] flex justify-center items-end">
                {activeState.playerHand.map((card, index) => {
                  const total = activeState.playerHand.length;
                  const center = (total - 1) / 2;
                  const dist = index - center;
                  const angle = dist * (settings.playerFanAngle * 0.9);
                  const spread = isNarrowPortrait
                    ? Math.min(34, Math.round(settings.playerFanSpread * 0.56))
                    : Math.round(settings.playerFanSpread * 0.76);
                  const handShiftX = Math.round(settings.playerHandOffsetX * 0.45);
                  const handBaseY = isNarrowPortrait
                    ? 2 + Math.round((settings.playerHandOffsetY - 14) * 0.35)
                    : -4 + Math.round((settings.playerHandOffsetY - 14) * 0.45);
                  const xOffset = dist * spread + handShiftX;
                  const yOffset =
                    Math.pow(Math.abs(dist), 1.55) * (settings.playerFanArc * 0.75) + handBaseY;

                  const leadCard = activeState.currentTrick.ai;
                  const canMove =
                    activeState.turn === 'player' &&
                    activeState.phase === 'PLAYING' &&
                    !activeState.currentTrick.player &&
                    !activeState.isShowingCombo &&
                    !isShowButtonVisible;
                  const isCardValid =
                    canMove &&
                    canPlayCard(
                      card,
                      activeState.playerHand,
                      leadCard,
                      activeState.trump!
                    ).valid;

                  const isShowing =
                    showingCombos.player &&
                    activeState.announcedCombos.player.some((c) =>
                      c.cardIds?.includes(card.id)
                    );

                  const isDimmed =
                    (activeState.isShowingCombo && !isShowing) ||
                    (settings.highlightPlayable && canMove && !isCardValid);

                  return (
                    <div
                      key={card.id}
                      className="absolute pointer-events-auto transition-transform duration-200"
                      style={{
                        transform: `translateX(${xOffset}px) translateY(${yOffset}px) rotate(${angle}deg) scale(${settings.cardScale})`,
                        transformOrigin: 'bottom center',
                        zIndex: isShowing ? 100 : 10 + index,
                      }}
                    >
                      <Card
                        card={card}
                        compact
                        isPlayable={isCardValid}
                        isDimmed={isDimmed}
                        isShowingCombo={isShowing}
                        showBottomIndex={settings.showBottomIndex}
                        onClick={isCardValid ? () => playCard(card) : undefined}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </main>
      ) : (
        <main
          className="flex-1 relative vivaro-table-bg overflow-hidden transition-[background] duration-300"
          style={{ background: TABLE_THEME_BACKGROUNDS[settings.tableTheme] }}
        >
          {/* Left Column: AI & Player Avatars (Positioned safely outside hands on mobile) */}
          <div className="absolute left-2 sm:left-6 top-[106px] sm:top-6 bottom-[126px] sm:bottom-6 flex flex-col justify-between z-20 pointer-events-none">
            <SegmentedAvatar
              label={opponentLabel}
              playerId={opponentDisplayId}
              position="top"
              isActive={
                activeState.turn === 'ai' &&
                activeState.phase !== 'RESULT' &&
                activeState.phase !== 'GAME_OVER' &&
                !activeState.currentTrick.ai
              }
              showTimer={settings.showTimers}
              timeLeft={activeState.timeLeft}
              maxTime={activeState.turnTimeLimit}
              timeBank={activeState.aiTimeBank}
              isDealer={activeState.dealer === 'ai'}
              isBidder={activeState.bidder === 'ai'}
              trump={activeState.trump}
              tricksWon={aiTricksWon}
              announcedComboLabel={
                activeState.announcedCombos.ai.length > 0
                  ? activeState.announcedCombos.ai
                      .map((c) => translateCombo(c.type))
                      .join(' + ')
                  : null
              }
            />

            <SegmentedAvatar
              label={playerLabel}
              playerId={playerDisplayId}
              position="bottom"
              isActive={
                activeState.turn === 'player' &&
                activeState.phase !== 'RESULT' &&
                activeState.phase !== 'GAME_OVER' &&
                !activeState.currentTrick.player
              }
              showTimer={settings.showTimers}
              timeLeft={activeState.timeLeft}
              maxTime={activeState.turnTimeLimit}
              timeBank={activeState.playerTimeBank}
              isDealer={activeState.dealer === 'player'}
              isBidder={activeState.bidder === 'player'}
              trump={activeState.trump}
              tricksWon={playerTricksWon}
              announcedComboLabel={
                activeState.announcedCombos.player.length > 0
                  ? activeState.announcedCombos.player
                      .map((c) => translateCombo(c.type))
                      .join(' + ')
                  : null
              }
            />
          </div>

          {/* Top Center: AI Fanned Hand */}
          <div
            className="absolute top-1 sm:top-2 left-1/2 -translate-x-1/2 w-full max-w-3xl h-32 flex justify-center items-start z-10 pointer-events-none"
            data-testid="ai-hand"
          >
            <div className="relative w-full flex justify-center">
              {activeState.aiHand.map((card, index) => {
                const total = activeState.aiHand.length;
                const center = (total - 1) / 2;
                const dist = index - center;
                const angle = dist * (isMobile ? -5 : -3.8);
                const aiSpread = isMobile
                  ? Math.round(settings.aiFanSpread * 0.63)
                  : settings.aiFanSpread;
                const xOffset = dist * aiSpread;
                const aiBaseY = isMobile
                  ? Math.round(settings.aiHandOffsetY * 0.65)
                  : settings.aiHandOffsetY;
                const yOffset = -Math.pow(Math.abs(dist), 1.4) * 1.4 + aiBaseY;
                const isShowing =
                  showingCombos.ai &&
                  activeState.announcedCombos.ai.some((c) => c.cardIds?.includes(card.id));

                return (
                  <div
                    key={card.id}
                    className="absolute transition-transform duration-300"
                    style={{
                      transform: `translateX(${xOffset}px) translateY(${yOffset}px) rotate(${angle}deg) scale(${settings.cardScale})`,
                      transformOrigin: 'top center',
                      zIndex: isShowing ? 100 : index,
                    }}
                  >
                    <Card
                      card={card}
                      hidden={!isShowing}
                      isShowingCombo={isShowing}
                      cardBackTheme={settings.cardBackTheme}
                      showBottomIndex={settings.showBottomIndex}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Center: Offered Card + Closed Deck Stack */}
          <div
            className="absolute right-3 sm:right-8 top-[45%] z-20 flex items-center gap-3 sm:gap-5 pointer-events-none transition-transform duration-200"
            style={{
              transform: `translate(${settings.deckOffsetX}px, calc(-50% + ${settings.deckOffsetY}px)) scale(${settings.cardScale})`,
            }}
            data-testid="deck-area"
          >
            {/* Offered Card sits directly left of deck during bidding */}
            {activeState.offeredCard && (
              <div className="drop-shadow-[0_12px_20px_rgba(0,0,0,0.45)]">
                <Card
                  card={activeState.offeredCard}
                  showBottomIndex={settings.showBottomIndex}
                />
              </div>
            )}

            {/* Closed Deck Stack */}
            {activeState.deck.length > 0 && (
              <div className="relative w-[66px] h-[96px] sm:w-[96px] sm:h-[138px]">
                {Array.from({ length: Math.min(5, activeState.deck.length) }).map((_, i) => (
                  <div
                    key={i}
                    className="absolute inset-0"
                    style={{
                      transform: `translate(${i * 1.5}px, ${-i * 2.5}px)`,
                      zIndex: 10 + i,
                    }}
                  >
                    <Card
                      card={{ id: `deck-${i}`, suit: Suit.SPADES, rank: Rank.NINE }}
                      hidden
                      cardBackTheme={settings.cardBackTheme}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Center Play Zone: Bidding Controls OR Active Trick */}
          <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none">
            {/* Bidding Phase Controls */}
            <AnimatePresence>
              {activeState.phase === 'OFFERING_TRUMP' && activeState.offeredCard && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.16 }}
                  className="pointer-events-auto bg-[#222632]/95 border border-white/15 rounded-2xl px-6 py-4 shadow-2xl flex flex-col items-center gap-3"
                >
                  <div className="text-xs font-semibold text-slate-300 flex items-center gap-2">
                    <span>Предложен козырь:</span>
                    <span
                      className={`text-base font-bold ${
                        activeState.offeredCard.suit === Suit.HEARTS ||
                        activeState.offeredCard.suit === Suit.DIAMONDS
                          ? 'text-[#ef233c]'
                          : 'text-white'
                      }`}
                    >
                      {activeState.offeredCard.rank} {suitGlyph(activeState.offeredCard.suit)}
                    </span>
                  </div>

                  {activeState.turn === 'player' ? (
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() =>
                          handleTakeTrump(
                            'player',
                            activeState.offeredCard!.suit as unknown as TrumpType
                          )
                        }
                        className="btn-vivaro px-6 py-2.5 text-xs uppercase tracking-wider cursor-pointer whitespace-nowrap"
                      >
                        Взять {suitGlyph(activeState.offeredCard.suit)}
                      </button>

                      {!(
                        activeState.offeredCard.rank === Rank.JACK &&
                        activeState.dealer === 'player'
                      ) && (
                        <button
                          type="button"
                          onClick={handlePassTrump}
                          className="px-6 py-2.5 bg-[#2e3445] hover:bg-[#3a4156] border border-white/10 rounded-lg text-xs font-bold uppercase tracking-wider text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
                        >
                          Пас
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-xs text-slate-400 py-1">
                      <span className="w-4 h-4 border-2 border-[#e91e63] border-t-transparent rounded-full animate-spin" />
                      <span>{opponentLabel} думает...</span>
                    </div>
                  )}
                </motion.div>
              )}

              {activeState.phase === 'SUIT_SELECTION' && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.16 }}
                  className="pointer-events-auto bg-[#222632]/95 border border-white/15 rounded-2xl px-6 py-4 shadow-2xl flex flex-col items-center gap-3"
                >
                  <div className="text-xs font-semibold text-slate-300">
                    {activeState.turn === 'player'
                      ? 'Выберите козырь'
                      : `${opponentLabel} выбирает масть...`}
                  </div>

                  {activeState.turn === 'player' ? (
                    <div className="flex flex-col items-center gap-3">
                      <div className="flex items-center gap-2">
                        {[Suit.HEARTS, Suit.DIAMONDS, Suit.CLUBS, Suit.SPADES].map((s) => {
                          if (s === activeState.offeredCard?.suit) return null;
                          const isRed = s === Suit.HEARTS || s === Suit.DIAMONDS;
                          return (
                            <button
                              key={s}
                              type="button"
                              onClick={() =>
                                handleSelectSuit(s as unknown as TrumpType)
                              }
                              aria-label={`Выбрать козырь ${s}`}
                              className="w-12 h-12 rounded-xl bg-[#181b24] hover:bg-[#2c3142] border border-white/15 flex items-center justify-center text-2xl transition-transform hover:scale-105 cursor-pointer"
                            >
                              <span className={isRed ? 'text-[#ef233c]' : 'text-white'}>
                                {suitGlyph(s)}
                              </span>
                            </button>
                          );
                        })}
                        <button
                          type="button"
                          onClick={() => handleSelectSuit(TrumpType.NO_TRUMP)}
                          aria-label="Без козыря"
                          className="w-12 h-12 rounded-xl bg-[#181b24] hover:bg-[#2c3142] border border-white/15 flex items-center justify-center text-lg font-extrabold text-white transition-transform hover:scale-105 cursor-pointer"
                        >
                          A
                        </button>
                      </div>

                      {activeState.dealer !== 'player' && (
                        <button
                          type="button"
                          onClick={handlePassTrump}
                          className="w-full py-2 bg-[#2e3445] hover:bg-[#3a4156] border border-white/10 rounded-lg text-xs font-bold uppercase tracking-wider text-slate-200 cursor-pointer"
                        >
                          Пас
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="w-5 h-5 border-2 border-[#e91e63] border-t-transparent rounded-full animate-spin" />
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Current Trick Cards (Diagonal Overlap Stack or Side by Side) */}
            <div
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
              data-testid="trick-area"
              data-layout={settings.trickLayout}
            >
              {(() => {
                const trickLeader =
                  activeState.lastWinner ||
                  (activeState.dealer === 'player' ? 'ai' : 'player');
                const aiIsFirst = trickLeader === 'ai';

                let aiX = 0;
                let aiY = 0;
                let playerX = 0;
                let playerY = 0;

                if (settings.trickLayout === 'sideBySide') {
                  const sideGap = isMobile ? 42 : 58;
                  aiX = -sideGap;
                  aiY = 0;
                  playerX = sideGap;
                  playerY = 0;
                } else {
                  const dx = isMobile
                    ? Math.round(settings.trickOffset * 0.78)
                    : settings.trickOffset;
                  const dy = isMobile
                    ? settings.trickOffset
                    : Math.round(settings.trickOffset * 1.22);
                  aiX = aiIsFirst ? -dx : dx;
                  aiY = aiIsFirst ? -dy : dy;
                  playerX = aiIsFirst ? dx : -dx;
                  playerY = aiIsFirst ? dy : -dy;
                }

                const aiZ = aiIsFirst ? 10 : 20;
                const playerZ = aiIsFirst ? 20 : 10;

                return (
                  <AnimatePresence>
                    {activeState.currentTrick.ai && (
                      <motion.div
                        key={`trick-ai-${activeState.currentTrick.ai.id}`}
                        initial={{
                          x: aiX,
                          y: aiY - 80,
                          opacity: 0,
                          scale: settings.cardScale * 0.92,
                        }}
                        animate={{
                          x: aiX,
                          y: aiY,
                          opacity: 1,
                          scale: settings.cardScale,
                        }}
                        exit={{ scale: settings.cardScale * 0.75, opacity: 0 }}
                        transition={{ duration: 0.18 }}
                        className="absolute"
                        style={{ zIndex: aiZ }}
                      >
                        <Card
                          card={activeState.currentTrick.ai}
                          showBottomIndex={settings.showBottomIndex}
                        />
                      </motion.div>
                    )}

                    {activeState.currentTrick.player && (
                      <motion.div
                        key={`trick-player-${activeState.currentTrick.player.id}`}
                        initial={{
                          x: playerX,
                          y: playerY + 80,
                          opacity: 0,
                          scale: settings.cardScale * 0.92,
                        }}
                        animate={{
                          x: playerX,
                          y: playerY,
                          opacity: 1,
                          scale: settings.cardScale,
                        }}
                        exit={{ scale: settings.cardScale * 0.75, opacity: 0 }}
                        transition={{ duration: 0.18 }}
                        className="absolute"
                        style={{ zIndex: playerZ }}
                      >
                        <Card
                          card={activeState.currentTrick.player}
                          showBottomIndex={settings.showBottomIndex}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                );
              })()}
            </div>
          </div>

          {/* Conflict Growth Selection */}
          <AnimatePresence>
            {conflictType && (
              <motion.div
                initial={{ opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.94 }}
                className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#222632] border border-white/20 rounded-2xl p-5 shadow-2xl z-[180] w-80 text-center"
              >
                <p className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-3">
                  Выберите старшую карту ({translateCombo(conflictType)})
                </p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {(
                    conflictType === 'Terz'
                      ? [Rank.JACK, Rank.QUEEN, Rank.KING, Rank.ACE]
                      : conflictType === 'Fifty'
                      ? [Rank.QUEEN, Rank.KING, Rank.ACE]
                      : conflictType === 'Hundred'
                      ? [Rank.KING, Rank.ACE]
                      : [Rank.NINE, Rank.TEN, Rank.JACK, Rank.QUEEN, Rank.KING, Rank.ACE]
                  ).map((rank) => {
                    const combo = activeState.combos.player.find(
                      (c) => c.type === conflictType && c.highRank === rank
                    );
                    return (
                      <button
                        key={rank}
                        type="button"
                        disabled={!combo}
                        onClick={() => combo && handleSelectGrowth(rank)}
                        className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-colors ${
                          combo
                            ? 'bg-[#e91e63] text-white hover:bg-[#d81b60] cursor-pointer'
                            : 'bg-[#181b24] text-slate-600 cursor-not-allowed'
                        }`}
                      >
                        {translateRank(rank)}
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Bottom Center: Player Fanned Hand & Combo Controls */}
          <div
            className="absolute bottom-2 sm:bottom-3 left-1/2 -translate-x-1/2 w-full max-w-4xl h-44 flex flex-col items-center justify-end z-40 pointer-events-none"
            data-testid="player-hand"
          >
            {/* Combo Declare / Show Buttons */}
            <div className="relative mb-3 pointer-events-auto flex items-center gap-2">
              {activeState.phase === 'PLAYING' &&
                !activeState.allCombinationsDisabled &&
                activeState.playedCards.length === 0 &&
                activeState.turn === 'player' &&
                activeState.canDeclare.player &&
                activeState.combos.player.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setIsComboMenuOpen((v) => !v)}
                    className="px-4 py-1.5 rounded-full bg-[#222632] hover:bg-[#2d3344] border border-white/15 text-xs font-bold text-slate-100 shadow-lg cursor-pointer"
                  >
                    {isComboMenuOpen ? 'Закрыть' : 'Комбинация'}
                  </button>
                )}

              {isShowButtonVisible && (
                <button
                  type="button"
                  onClick={handleShowCombos}
                  className="px-5 py-1.5 rounded-full bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-extrabold uppercase tracking-wider shadow-lg cursor-pointer"
                >
                  Показать {translateCombo(activeState.announcedCombos.player[0].type)}
                </button>
              )}

              {isComboMenuOpen && activeState.playedCards.length === 0 && (
                <div className="absolute bottom-10 left-1/2 -translate-x-1/2 bg-[#222632] border border-white/15 rounded-xl p-2.5 shadow-2xl flex gap-2 z-50">
                  {(['Terz', 'Fifty', 'Hundred', 'Carre'] as const)
                    .filter(
                      (type) =>
                        activeState.allowHighCombos ||
                        (type !== 'Hundred' && type !== 'Carre')
                    )
                    .map((type) => {
                      const hasType = activeState.combos.player.some((c) => c.type === type);
                      const isDeclared = activeState.announcedCombos.player.some(
                        (ac) => ac.type === type
                      );
                      return (
                        <button
                          key={type}
                          type="button"
                          disabled={!hasType || isDeclared}
                          onClick={() => handleAnnounceType(type)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap ${
                            isDeclared
                              ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                              : hasType
                              ? 'bg-[#e91e63] text-white hover:bg-[#d81b60] cursor-pointer'
                              : 'bg-[#181b24] text-slate-600 cursor-not-allowed'
                          }`}
                        >
                          {translateCombo(type)}
                        </button>
                      );
                    })}
                </div>
              )}
            </div>

            {/* Fanned Player Cards */}
            <div className="relative w-full h-[110px] sm:h-[144px] flex justify-center items-end">
              {activeState.playerHand.map((card, index) => {
                const total = activeState.playerHand.length;
                const center = (total - 1) / 2;
                const dist = index - center;
                const angleStep = isMobile
                  ? settings.playerFanAngle * 1.15
                  : settings.playerFanAngle;
                const angle = dist * angleStep;
                const spread = isMobile
                  ? Math.round(settings.playerFanSpread * 0.6)
                  : settings.playerFanSpread;
                const handShiftX = isMobile
                  ? Math.round(settings.playerHandOffsetX * 0.45)
                  : settings.playerHandOffsetX;
                const handBaseY = isMobile
                  ? Math.round(settings.playerHandOffsetY * 0.3)
                  : settings.playerHandOffsetY;
                const xOffset = dist * spread + handShiftX;
                const yOffset =
                  Math.pow(Math.abs(dist), 1.6) * settings.playerFanArc + handBaseY;

                const leadCard = activeState.currentTrick.ai;
                const canMove =
                  activeState.turn === 'player' &&
                  activeState.phase === 'PLAYING' &&
                  !activeState.currentTrick.player &&
                  !activeState.isShowingCombo &&
                  !isShowButtonVisible;
                const isCardValid =
                  canMove &&
                  canPlayCard(
                    card,
                    activeState.playerHand,
                    leadCard,
                    activeState.trump!
                  ).valid;

                const isShowing =
                  showingCombos.player &&
                  activeState.announcedCombos.player.some((c) =>
                    c.cardIds?.includes(card.id)
                  );

                const isDimmed =
                  (activeState.isShowingCombo && !isShowing) ||
                  (settings.highlightPlayable && canMove && !isCardValid);

                return (
                  <div
                    key={card.id}
                    className="absolute pointer-events-auto transition-transform duration-200"
                    style={{
                      transform: `translateX(${xOffset}px) translateY(${yOffset}px) rotate(${angle}deg) scale(${settings.cardScale})`,
                      transformOrigin: 'bottom center',
                      zIndex: isShowing ? 100 : 10 + index,
                    }}
                  >
                    <Card
                      card={card}
                      isPlayable={isCardValid}
                      isDimmed={isDimmed}
                      isShowingCombo={isShowing}
                      showBottomIndex={settings.showBottomIndex}
                      onClick={isCardValid ? () => playCard(card) : undefined}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Score Panel (configurable anchor) */}
          {settings.scorePanelAnchor !== 'hidden' && (
            <div
              className={`absolute z-40 ${
                settings.scorePanelAnchor === 'topRight'
                  ? 'top-[106px] sm:top-4 right-2 sm:right-6'
                  : settings.scorePanelAnchor === 'bottomLeft'
                  ? 'top-[106px] sm:top-auto sm:bottom-0 right-2 sm:right-auto sm:left-[184px]'
                  : 'top-[106px] sm:top-auto sm:bottom-0 right-2 sm:right-6'
              }`}
            >
              <ScorePanel
                tableId={activeState.tableId}
                gameLimit={activeState.gameLimit}
                betAmount={activeState.betAmount}
                playerScore={activeState.playerScore}
                aiScore={activeState.aiScore}
                playerRoundScore={activeState.playerRoundScore}
                aiRoundScore={activeState.aiRoundScore}
                dockedBottom={settings.scorePanelAnchor !== 'topRight'}
                playerLabel={playerShortLabel}
                opponentLabel={opponentLabel}
              />
            </div>
          )}
        </main>
      )}

      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.16 }}
            role="status"
            aria-live="polite"
            className="fixed top-3 sm:top-4 left-1/2 -translate-x-1/2 z-[260] max-w-[calc(100vw-2rem)] bg-[#1b1f2a]/95 border border-white/15 px-4 py-2 rounded-xl text-xs font-semibold text-slate-100 text-center shadow-lg pointer-events-none whitespace-normal"
          >
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Online Room Loading / Waiting Overlay */}
      {currentScreen === 'GAME' &&
        onlineRoomCode &&
        (!onlineRoom || onlineRoom.status === 'waiting') && (
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-sm z-[190] flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Ожидание игрока"
          >
            <div className="bg-[#222632] border border-white/15 rounded-2xl shadow-2xl w-full max-w-md p-6 text-slate-100 text-center">
              <div className="w-12 h-12 rounded-2xl bg-[#e91e63]/15 border border-[#e91e63]/40 flex items-center justify-center mx-auto mb-3 text-[#e91e63]">
                <Users size={24} />
              </div>
              <h2 className="text-xl font-bold mb-1">Ожидание игрока</h2>
              {onlineRoom ? (
                <>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[11px] font-semibold text-emerald-300 mb-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span>Вы онлайн • стол активен в лобби</span>
                  </div>
                  <p className="text-xs text-slate-400 mb-4">
                    Пока вы на этом экране, стол открыт для любого игрока. Если выйти или закрыть вкладку, стол деактивируется.
                  </p>
                  <div className="bg-[#181b24] border border-white/10 rounded-xl px-4 py-3 mb-3">
                    <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-1">
                      Код стола
                    </div>
                    <div className="text-2xl font-mono font-extrabold tracking-[0.25em] text-amber-400 select-all">
                      {onlineRoom.roomCode}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mb-5">
                    <input
                      type="text"
                      readOnly
                      aria-label="Ссылка приглашения"
                      value={
                        typeof window !== 'undefined'
                          ? `${window.location.origin}/?room=${onlineRoom.roomCode}`
                          : ''
                      }
                      className="flex-1 bg-[#181b24] border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-300 font-mono truncate"
                    />
                    <button
                      type="button"
                      onClick={() => void handleCopyInvite()}
                      className="btn-vivaro px-3.5 py-2 text-xs flex items-center gap-1.5 cursor-pointer shrink-0"
                    >
                      {copiedInvite ? <Check size={14} /> : <Copy size={14} />}
                      <span>{copiedInvite ? 'Готово' : 'Копировать'}</span>
                    </button>
                  </div>
                </>
              ) : (
                <p className="text-xs text-slate-400 mb-5 flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-[#e91e63] border-t-transparent rounded-full animate-spin" />
                  <span>Подключение к столу...</span>
                </p>
              )}

              <button
                type="button"
                onClick={handleGoLobby}
                className="w-full py-2.5 bg-[#2e3445] hover:bg-[#3a4156] border border-white/10 rounded-lg text-xs font-bold uppercase tracking-wider text-slate-200 cursor-pointer"
              >
                Выйти и аннулировать стол
              </button>
            </div>
          </div>
        )}

      {/* Modals */}
      {currentScreen === 'GAME' &&
        activeState.phase === 'RESULT' &&
        settings.showRoundResultModal && (
          <RoundResultModal
            state={activeState}
            getPaperScore={getPaperScore}
            translateCombo={translateCombo}
            playerLabel={playerLabel}
            opponentLabel={opponentLabel}
            canAdvanceRound={!isOnline || myRole === 'host'}
            onNextRound={() => startNewRound()}
          />
        )}

      {currentScreen === 'GAME' && activeState.phase === 'GAME_OVER' && (
        <GameOverModal
          state={activeState}
          playerLabel={playerLabel}
          opponentLabel={opponentLabel}
          isOnline={isOnline}
          onPlayAgain={isOnline ? handleGoLobby : () => startNewRound()}
          onExitLobby={handleGoLobby}
        />
      )}

      {rulesOpen && <RulesModal onClose={() => setRulesOpen(false)} />}

      {settingsOpen && (
        <SettingsDrawer
          settings={settings}
          isMuted={isMuted}
          onToggleMute={handleToggleMute}
          onChange={(patch) => setSettings((prev) => ({ ...prev, ...patch }))}
          onReset={() => setSettings({ ...DEFAULT_SETTINGS })}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {authModalOpen && (
        <AuthModal
          firebaseUser={firebaseUser}
          profile={userProfile}
          onClose={() => setAuthModalOpen(false)}
        />
      )}
    </div>
  );
}
