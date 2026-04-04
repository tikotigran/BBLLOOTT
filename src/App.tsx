import React, { useState, useEffect, useCallback } from 'react';
import { Card as CardType, GameState, TrumpType, Bid, GamePhase, Suit, Rank, Combination } from './types';
import { createDeck, detectCombos, calculateRoundScore, canPlayCard, resolveTrick } from './logic/gameLogic';
import { compareCards, getCardValue } from './constants';
import Card from './components/Card';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, RotateCcw, Lock, Layers, Slash, ZapOff, ChevronUp, ArrowRight, X } from 'lucide-react';

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
  roundNumber: 1,
  timeLeft: 30,
  turnTimeLimit: 30,
  playerTimeBank: 180,
  aiTimeBank: 180,
  tableId: Math.floor(Math.random() * 10000),
};

const CircularTimer = ({ timeLeft, isActive, maxTime, timeBank, isTimeBankActive }: { timeLeft: number; isActive: boolean; maxTime: number; timeBank: number; isTimeBankActive: boolean }) => {
  const [showLimit, setShowLimit] = useState(true);
  
  useEffect(() => {
    if (isActive && !isTimeBankActive) {
      setShowLimit(true);
      const timer = setTimeout(() => setShowLimit(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [isActive, isTimeBankActive]);

  const percentage = isTimeBankActive ? (timeBank / 180) * 100 : (timeLeft / maxTime) * 100;
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;
  const color = isTimeBankActive ? '#ef4444' : '#22c55e';

  if (!isActive) return null;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="absolute -inset-2 z-10 pointer-events-none flex items-center justify-center group">
      <AnimatePresence>
        {showLimit && !isTimeBankActive && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.5 }}
            className="absolute inset-0 flex items-center justify-center z-20"
          >
            <span className="text-white/80 font-black text-2xl drop-shadow-[0_0_10px_rgba(0,0,0,0.8)]">{maxTime}</span>
          </motion.div>
        )}
        {isTimeBankActive && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute inset-0 flex items-center justify-center z-20"
          >
            <div className="bg-red-500/90 px-2 py-1 rounded-md shadow-lg border border-white/20">
              <span className="text-white font-black text-xs tabular-nums">{formatTime(timeBank)}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <svg className="w-24 h-24 transform -rotate-90">
        <circle
          cx="48"
          cy="48"
          r={radius}
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="3"
          fill="transparent"
        />
        <motion.circle
          cx="48"
          cy="48"
          r={radius}
          stroke={color}
          strokeWidth="3"
          fill="transparent"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1, ease: "linear" }}
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
};

const SUIT_ORDER = {
  [Suit.HEARTS]: 0,
  [Suit.DIAMONDS]: 1,
  [Suit.CLUBS]: 2,
  [Suit.SPADES]: 3,
};

const COMBO_HIERARCHY = {
  'Terz': 1,
  'Fifty': 2,
  'Hundred': 3,
  'Carre': 4
};

const RANK_ORDER = {
  [Rank.NINE]: 0,
  [Rank.TEN]: 1,
  [Rank.JACK]: 2,
  [Rank.QUEEN]: 3,
  [Rank.KING]: 4,
  [Rank.ACE]: 5,
};

const sortHand = (hand: CardType[]) => {
  return [...hand].sort((a, b) => {
    if (SUIT_ORDER[a.suit] !== SUIT_ORDER[b.suit]) {
      return SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit];
    }
    return RANK_ORDER[a.rank] - RANK_ORDER[b.rank];
  });
};

const isInitialized = { current: false };

const getPaperScore = (points: number) => {
  const base = Math.floor(points / 10);
  const remainder = points % 10;
  return remainder >= 6 ? base + 1 : base;
};

const translateRank = (rank: Rank | string) => {
  switch (rank) {
    case Rank.NINE: return '9';
    case Rank.TEN: return '10';
    case Rank.JACK: return 'Валет';
    case Rank.QUEEN: return 'Дама';
    case Rank.KING: return 'Король';
    case Rank.ACE: return 'Туз';
    default: return rank;
  }
};

const translateCombo = (type: string, highRank?: Rank, isConfirmed?: boolean) => {
  const prefix = type.startsWith('Твое ') ? 'Твое ' : type.startsWith('AI ') ? 'AI ' : '';
  const baseType = type.replace(prefix, '');
  const translated = 
    baseType === 'Terz' ? 'Терц' :
    baseType === 'Fifty' ? '50' :
    baseType === 'Hundred' ? '100' :
    baseType === 'Carre' ? 'Каре' :
    baseType === 'Blot' ? 'Блот' : baseType;
  
  const growth = (highRank && isConfirmed) ? ` (${translateRank(highRank)})` : '';
  return prefix + translated + growth;
};

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<'LOBBY' | 'GAME'>('LOBBY');
  const [state, setState] = useState<GameState>(INITIAL_STATE);
  const [notifications, setNotifications] = useState<{ id: number; text: string; color: string }[]>([]);
  const [isComboMenuOpen, setIsComboMenuOpen] = useState(false);
  const [selectedComboType, setSelectedComboType] = useState<Combination['type'] | null>(null);
  const [conflictType, setConflictType] = useState<Combination['type'] | null>(null);
  const [visibleCombos, setVisibleCombos] = useState<{ player: boolean; ai: boolean }>({ player: false, ai: false });
  const [showingCombos, setShowingCombos] = useState<{ player: boolean; ai: boolean }>({ player: false, ai: false });

  // Lobby Mock Data
  const lobbyGames = [
    { id: '1095638599', name: 'Блот', status: 'в ожидании', statusColor: 'bg-green-500', p1: '-67***307', score: '0:0', p2: 'ИГРАТЬ', sum: '100 C', target: '51', time: '30с / 3м', type: 'lock' },
    { id: '1095638605', name: 'Блот', status: 'в ожидании', statusColor: 'bg-green-500', p1: '-29***682', score: '0:0', p2: 'ИГРАТЬ', sum: '12.5 C', target: '51', time: '15с / 2м', type: '' },
    { id: '1095638616', name: 'Блот', status: 'в ожидании', statusColor: 'bg-green-500', p1: '-13***630', score: '0:0', p2: 'ИГРАТЬ', sum: '14.53 C', target: '101', time: '15с / 2м', type: 'cards' },
    { id: '1095638621', name: 'Блот', status: 'в ожидании', statusColor: 'bg-green-500', p1: '-21***443', score: '0:0', p2: 'ИГРАТЬ', sum: '1.06 C', target: '101', time: '30с / 3м', type: '' },
    { id: '1095638523', name: 'Блот', status: 'началось', statusColor: 'bg-red-500', p1: '313***629', score: '80:83', p2: '-77***246', sum: '2.65 C', target: '101', time: '30с / 2м', type: 'cards' },
    { id: '1095638548', name: 'Блот', status: 'началось', statusColor: 'bg-red-500', p1: '210***753', score: '67:93', p2: '240***851', sum: '26.52 C', target: '101', time: '20с / 2м', type: '' },
    { id: '1095638558', name: 'Блот', status: 'началось', statusColor: 'bg-red-500', p1: '-17***674', score: '41:95', p2: '261***716', sum: '1.47 C', target: '101', time: '15с / 2м', type: 'cards' },
    { id: '1095638564', name: 'Блот', status: 'началось', statusColor: 'bg-red-500', p1: '-65***855', score: '27:63', p2: '-45***931', sum: '0.53 C', target: '101', time: '15с / 2м', type: '' },
  ];

  const notify = (text: string, color: string = 'gold') => {
    // Silenced for Clean UI
    /*
    const id = Date.now() + Math.random();
    setNotifications(prev => [...prev, { id, text, color }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 3000);
    */
  };

  const startNewRound = useCallback(() => {
    setVisibleCombos({ player: false, ai: false });
    setIsComboMenuOpen(false);
    setSelectedComboType(null);
    setConflictType(null);
    setShowingCombos({ player: false, ai: false });
    
    setState(prev => {
      const isNewGame = prev.phase === 'GAME_OVER';
      const deck = createDeck();
      const playerHand = deck.slice(0, 5);
      const aiHand = deck.slice(5, 10);
      const offeredCard = deck[10];
      const remaining = deck.slice(11);

      const nextDealer = prev.dealer === 'player' ? 'ai' : 'player';

      return {
        ...prev,
        playerHand: sortHand(playerHand),
        aiHand: sortHand(aiHand),
        offeredCard,
        deck: remaining,
        playedCards: [],
        currentTrick: {},
        trump: null,
        bidder: null,
        playerScore: isNewGame ? 0 : prev.playerScore,
        aiScore: isNewGame ? 0 : prev.aiScore,
        playerRoundScore: 0,
        aiRoundScore: 0,
        playerTimeBank: isNewGame ? 180 : prev.playerTimeBank,
        aiTimeBank: isNewGame ? 180 : prev.aiTimeBank,
        phase: 'OFFERING_TRUMP',
        turn: nextDealer === 'player' ? 'ai' : 'player', // Non-dealer starts bidding
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
        roundNumber: isNewGame ? 1 : prev.roundNumber + 1,
      };
    });
  }, []);

  useEffect(() => {
    if (!isInitialized.current) {
      isInitialized.current = true;
      startNewRound();
    }
  }, [startNewRound]);

  const handleAutoPlay = useCallback(() => {
    const isPlayer = state.turn === 'player';
    const hand = isPlayer ? state.playerHand : state.aiHand;
    if (hand.length === 0 || state.phase !== 'PLAYING' || state.isShowingCombo) return;

    const leadCard = isPlayer ? state.currentTrick.ai : state.currentTrick.player;
    const validCards = hand.filter(c => canPlayCard(c, hand, leadCard, state.trump!).valid);
    const cardToPlay = validCards.length > 0 
      ? validCards[Math.floor(Math.random() * validCards.length)] 
      : hand[Math.floor(Math.random() * hand.length)];

    if (isPlayer) {
      playCard(cardToPlay);
    } else {
      // For AI, we can just force the play logic
      // The existing AI useEffect will handle it if we just let it run, 
      // but for auto-play we want it NOW.
      // However, AI usually plays in 1s, so this is mostly for the player.
      // If AI somehow hangs, this will force a play.
      
      // We'll just reuse the AI play logic but triggered immediately.
      // To keep it simple, I'll just let the AI play its first valid card.
      setState(prev => {
        const aiCard = cardToPlay;
        const trickIndex = prev.playedCards.length;
        let newAnnouncedAI = prev.announcedCombos.ai;
        let newCanDeclare = prev.canDeclare;
        let newCanShow = prev.canShow;

        if (trickIndex === 0) newCanDeclare = { ...prev.canDeclare, ai: false };
        if (trickIndex === 1 && !prev.hasShownCombos.ai) {
          newAnnouncedAI = [];
          newCanShow = { ...prev.canShow, ai: false };
        }

        return {
          ...prev,
          aiHand: prev.aiHand.filter(c => c.id !== aiCard.id),
          currentTrick: { ...prev.currentTrick, ai: aiCard },
          turn: prev.currentTrick.player ? 'ai' : 'player',
          isFirstDeal: false,
          announcedCombos: { ...prev.announcedCombos, ai: newAnnouncedAI },
          canDeclare: newCanDeclare,
          canShow: newCanShow,
          timeLeft: prev.turnTimeLimit
        };
      });
    }
    notify(`${isPlayer ? 'You' : 'AI'} ran out of time! Auto-playing...`, 'red');
  }, [state.turn, state.playerHand, state.aiHand, state.phase, state.isShowingCombo, state.currentTrick, state.trump]);

  // Timer Effect
  useEffect(() => {
    if (state.phase === 'RESULT' || state.phase === 'GAME_OVER' || state.isShowingCombo) return;
    
    // Stop timer if current player has already played a card in this trick
    const isPlayerTurn = state.turn === 'player';
    if (isPlayerTurn && state.currentTrick.player) return;
    if (!isPlayerTurn && state.currentTrick.ai) return;

    const interval = setInterval(() => {
      setState(prev => {
        if (prev.timeLeft > 0) {
          return { ...prev, timeLeft: prev.timeLeft - 1 };
        } else {
          // Time Bank logic
          const isPlayer = prev.turn === 'player';
          const currentBank = isPlayer ? prev.playerTimeBank : prev.aiTimeBank;
          
          if (currentBank <= 0) {
            return { ...prev, phase: 'GAME_OVER' };
          }

          return {
            ...prev,
            [isPlayer ? 'playerTimeBank' : 'aiTimeBank']: currentBank - 1
          };
        }
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [state.phase, state.isShowingCombo, state.turn, state.currentTrick]);

  // Auto-play trigger (only if time bank is exhausted)
  useEffect(() => {
    const isPlayer = state.turn === 'player';
    const currentBank = isPlayer ? state.playerTimeBank : state.aiTimeBank;
    if (state.timeLeft === 0 && currentBank === 0 && state.phase === 'PLAYING' && !state.isShowingCombo) {
      handleAutoPlay();
    }
  }, [state.timeLeft, state.playerTimeBank, state.aiTimeBank, state.turn, state.phase, state.isShowingCombo, handleAutoPlay]);

  // Reset timer on turn change
  useEffect(() => {
    setState(prev => ({ ...prev, timeLeft: prev.turnTimeLimit }));
  }, [state.turn, state.phase, state.turnTimeLimit]);

  const handleTakeTrump = useCallback((player: 'player' | 'ai', trump: TrumpType) => {
    setState(prev => {
      if (!prev.offeredCard) return prev;
      const isPlayer = player === 'player';
      const takerHand = isPlayer ? [...prev.playerHand, prev.offeredCard] : [...prev.aiHand, prev.offeredCard];
      const otherHand = isPlayer ? [...prev.aiHand] : [...prev.playerHand];
      
      const deck = [...prev.deck];
      const takerExtra = deck.splice(0, 2);
      const otherExtra = deck.splice(0, 3);

      const finalPlayerHand = sortHand(isPlayer ? [...takerHand, ...takerExtra] : [...otherHand, ...otherExtra]);
      const finalAiHand = sortHand(isPlayer ? [...otherHand, ...otherExtra] : [...takerHand, ...takerExtra]);

      return {
        ...prev,
        playerHand: finalPlayerHand,
        aiHand: finalAiHand,
        deck,
        trump,
        bidder: player,
        phase: 'PLAYING',
        offeredCard: null,
        turn: prev.dealer === 'player' ? 'ai' : 'player', // Non-dealer starts first trick
        timeLeft: 30,
        combos: {
          player: detectCombos(finalPlayerHand, trump, prev.allowHighCombos, prev.allCombinationsDisabled),
          ai: detectCombos(finalAiHand, trump, prev.allowHighCombos, prev.allCombinationsDisabled)
        }
      };
    });
    notify(`${player === 'player' ? 'You' : 'AI'} took ${trump}`, '#e91e63');
    notify('Dealing remaining cards...', 'gold');
  }, []);

  // AI Decision for Bidding
  useEffect(() => {
    if (state.turn === 'ai' && state.offeredCard) {
      const timer = setTimeout(() => {
        if (state.phase === 'OFFERING_TRUMP') {
          const aiHasGoodCards = state.aiHand.some(c => c.suit === state.offeredCard?.suit && (c.rank === Rank.JACK || c.rank === Rank.NINE));
          const isJack = state.offeredCard?.rank === Rank.JACK;
          const isDealer = state.dealer === 'ai';
          
          // Dealer's Jack Obligation: if it's a Jack and AI is dealer, it MUST take.
          // If AI is non-dealer, it takes if it has good cards, otherwise it can pass.
          if (isJack && isDealer) {
            handleTakeTrump('ai', state.offeredCard!.suit as unknown as TrumpType);
          } else if (aiHasGoodCards || (isJack && !isDealer)) {
            // AI takes Jack even if non-dealer because it's a Jack (good play),
            // but we could make it more selective if needed.
            handleTakeTrump('ai', state.offeredCard!.suit as unknown as TrumpType);
          } else {
            if (state.dealer === 'ai') {
              // AI is dealer, passed offering. Now Round 2. Non-dealer (player) starts.
              setState(prev => ({ ...prev, turn: 'player', phase: 'SUIT_SELECTION' }));
              notify('AI passed offering', 'white');
            } else {
              // AI is non-dealer, passed. Now Dealer (player) decides on offering.
              setState(prev => ({ ...prev, turn: 'player' }));
              notify('AI passed offering', 'white');
            }
          }
        } else if (state.phase === 'SUIT_SELECTION') {
          // AI simplified suit selection logic
          const possibleSuits = [Suit.HEARTS, Suit.DIAMONDS, Suit.CLUBS, Suit.SPADES].filter(s => s !== state.offeredCard?.suit);
          let bestSuit: Suit | null = null;
          let maxStrength = -1;

          possibleSuits.forEach(s => {
            const strength = state.aiHand.filter(c => c.suit === s).length;
            if (strength > maxStrength) {
              maxStrength = strength;
              bestSuit = s;
            }
          });

          const isLastPlayer = state.dealer === 'ai';

          if (bestSuit && (maxStrength >= 3 || isLastPlayer)) {
            handleTakeTrump('ai', bestSuit as unknown as TrumpType);
          } else {
            if (isLastPlayer) {
              // AI is dealer, last to act. Must pick something.
              // Pick best suit even if weak.
              if (bestSuit) {
                handleTakeTrump('ai', bestSuit as unknown as TrumpType);
              } else {
                // Fallback to Hearts if something is wrong
                handleTakeTrump('ai', Suit.HEARTS as unknown as TrumpType);
              }
            } else {
              // AI is non-dealer, passed. Now Dealer (player) decides on suit selection.
              setState(prev => ({ ...prev, turn: 'player' }));
              notify('AI passed suit selection', 'white');
            }
          }
        }
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [state.phase, state.turn, state.offeredCard, state.aiHand, state.dealer, handleTakeTrump, startNewRound]);

  const handlePassTrump = useCallback(() => {
    setState(prev => {
      if (prev.turn !== 'player') return prev;
      
      if (prev.phase === 'OFFERING_TRUMP') {
        if (prev.dealer === 'player') {
          // Dealer's Jack Obligation: dealer cannot pass if it's a Jack
          if (prev.offeredCard?.rank === Rank.JACK) {
            return prev;
          }
          return { ...prev, turn: 'ai', phase: 'SUIT_SELECTION' };
        } else {
          return { ...prev, turn: 'ai' };
        }
      } else if (prev.phase === 'SUIT_SELECTION') {
        if (prev.dealer === 'player') {
          // Player is dealer, last to act in Round 2. Cannot pass.
          notify('Вы обязаны выбрать масть', 'gold');
          return prev;
        } else {
          return { ...prev, turn: 'ai' };
        }
      }
      return prev;
    });
    notify('You passed', 'white');
  }, [startNewRound]);

  const handleSelectSuit = useCallback((trump: TrumpType) => {
    setState(prev => {
      if (prev.phase !== 'SUIT_SELECTION' || prev.turn !== 'player') return prev;
      if (trump.toString() === prev.offeredCard?.suit.toString()) {
        notify('Cannot select the same suit as offered card', 'red');
        return prev;
      }
      return prev;
    });

    if (state.phase === 'SUIT_SELECTION' && state.turn === 'player') {
      if (trump.toString() !== state.offeredCard?.suit.toString()) {
        handleTakeTrump('player', trump);
      }
    }
  }, [state.phase, state.turn, state.offeredCard, handleTakeTrump]);

  const handleAnnounceType = (type: Combination['type']) => {
    if (state.turn !== 'player' || state.playedCards.length > 0 || !state.canDeclare.player) return;

    const playerCombosOfType = state.combos.player.filter(c => c.type === type);
    if (playerCombosOfType.length === 0) return;

    const aiCombos = state.announcedCombos.ai;
    const aiStrongest = aiCombos.length > 0 ? aiCombos[0] : null;

    // Hierarchy check: if AI already declared something higher, we can't declare lower
    if (aiStrongest && COMBO_HIERARCHY[type] < COMBO_HIERARCHY[aiStrongest.type]) {
      notify(`Твой ${translateCombo(type)} младше, чем ${translateCombo(aiStrongest.type)} AI`, 'red');
      return;
    }

    const hasConflict = aiStrongest && aiStrongest.type === type;

    setState(prev => {
      const newAnnouncedCombos = {
        ...prev.announcedCombos,
        player: [playerCombosOfType.reduce((a, b) => a.strength > b.strength ? a : b)],
        // If player's type is higher than AI's, AI's combo is annulled
        ai: (aiStrongest && COMBO_HIERARCHY[type] > COMBO_HIERARCHY[aiStrongest.type]) ? [] : prev.announcedCombos.ai
      };

      return {
        ...prev,
        announcedCombos: newAnnouncedCombos,
        hasConfirmedGrowth: {
          ...prev.hasConfirmedGrowth,
          player: !hasConflict,
          ai: !hasConflict
        }
      };
    });

    if (hasConflict) {
      setTimeout(() => setConflictType(type), 1000);
      notify(`Конфликт! Оба объявили ${translateCombo(type)}.`, 'gold');
    } else if (aiStrongest && COMBO_HIERARCHY[type] > COMBO_HIERARCHY[aiStrongest.type]) {
      notify(`Твой ${translateCombo(type)} перебил ${translateCombo(aiStrongest.type)} AI!`, 'green');
    } else {
      notify(`Объявлено: ${translateCombo(type)}`, 'gold');
    }
    setIsComboMenuOpen(false);
  };

  const handleSelectGrowth = (rank: Rank) => {
    if (!conflictType) return;
    
    // Find the combo with this high rank
    const pCombo = state.combos.player.find(c => c.type === conflictType && c.highRank === rank);
    const aCombo = state.announcedCombos.ai[0];

    if (!pCombo || !aCombo) {
      setConflictType(null);
      return;
    }

    notify(`Ты выбрал рост: ${translateRank(rank)}`, 'gold');

    // Instant comparison
    if (pCombo.strength > aCombo.strength) {
      setState(prev => ({
        ...prev,
        announcedCombos: { 
          player: [pCombo], // Update player announced combo with the selected one
          ai: [] 
        },
        hasConfirmedGrowth: { player: true, ai: true }
      }));
      notify(`Твой ${translateCombo(conflictType)} выше!`, 'green');
    } else if (aCombo.strength > pCombo.strength) {
      setState(prev => ({
        ...prev,
        announcedCombos: { 
          player: [], 
          ai: [aCombo] 
        },
        hasConfirmedGrowth: { player: true, ai: true }
      }));
      notify(`AI ${translateCombo(conflictType)} выше!`, 'red');
    } else {
      setState(prev => ({
        ...prev,
        announcedCombos: { player: [], ai: [] },
        hasConfirmedGrowth: { player: true, ai: true }
      }));
      notify(`Ничья по росту! Обе аннулированы.`, 'white');
    }

    setConflictType(null);
  };

  // Conflict Resolution (when both confirmed)
  // Removed as it is now handled instantly in handleSelectGrowth

  const handleShowCombos = () => {
    if (state.turn !== 'player' || state.playedCards.length !== 1 || !state.canShow.player) return;

    const pCombos = state.announcedCombos.player;
    const aCombos = state.announcedCombos.ai;

    // Superiority check
    const pStrongest = pCombos.length > 0 ? pCombos.reduce((a, b) => a.strength > b.strength ? a : b) : null;
    const aStrongest = aCombos.length > 0 ? aCombos.reduce((a, b) => a.strength > b.strength ? a : b) : null;

    let canShow = false;
    if (pStrongest && !aStrongest) canShow = true;
    else if (pStrongest && aStrongest) {
      if (pStrongest.strength > aStrongest.strength) canShow = true;
    }

    if (!canShow) {
      if (pStrongest && aStrongest && pStrongest.strength === aStrongest.strength) {
        notify("Ничья по комбинациям: очки не присуждаются", "white");
      } else {
        notify("Твоя комбинация слабее и аннулирована", "red");
      }
      setState(prev => ({
        ...prev,
        announcedCombos: { ...prev.announcedCombos, player: [] }
      }));
      return;
    }

    // Visual effect
    setShowingCombos(prev => ({ ...prev, player: true }));
    setState(prev => ({ ...prev, isShowingCombo: true }));
    
    setTimeout(() => {
      setShowingCombos(prev => ({ ...prev, player: false }));
      setState(prev => ({ ...prev, isShowingCombo: false }));
    }, 3000);

    const totalPoints = pCombos.reduce((sum, c) => sum + c.points, 0);

    setState(prev => ({
      ...prev,
      declaredCombos: {
        ...prev.declaredCombos,
        player: pCombos
      },
      hasShownCombos: { ...prev.hasShownCombos, player: true },
      playerRoundScore: prev.playerRoundScore + totalPoints,
      announcedCombos: { ...prev.announcedCombos, ai: [] } // Annul AI combo
    }));

    setVisibleCombos({ player: true, ai: false });
    setTimeout(() => setVisibleCombos({ player: false, ai: false }), 4000);
    
    notify(`Ты подтвердил комбинацию! (+${totalPoints})`, "gold");
  };

  // AI Combo Announcement Logic
  useEffect(() => {
    if (state.phase === 'PLAYING' && state.turn === 'ai' && state.playedCards.length === 0 && state.announcedCombos.ai.length === 0 && state.canDeclare.ai) {
      const aiCombos = state.combos.ai;
      if (aiCombos.length > 0) {
        const bestAi = aiCombos.reduce((a, b) => a.strength > b.strength ? a : b);
        
        const playerCombos = state.announcedCombos.player;
        const playerStrongest = playerCombos.length > 0 ? playerCombos[0] : null;

        // AI hierarchy check
        if (playerStrongest && COMBO_HIERARCHY[bestAi.type] < COMBO_HIERARCHY[playerStrongest.type]) {
          // AI can't declare lower
          return;
        }

        const hasConflict = playerStrongest && playerStrongest.type === bestAi.type;
        
        setState(prev => ({
          ...prev,
          announcedCombos: { 
            ...prev.announcedCombos, 
            ai: [bestAi],
            player: (playerStrongest && COMBO_HIERARCHY[bestAi.type] > COMBO_HIERARCHY[playerStrongest.type]) ? [] : prev.announcedCombos.player
          },
          hasConfirmedGrowth: { ...prev.hasConfirmedGrowth, ai: !hasConflict }
        }));

        if (hasConflict) {
          setTimeout(() => setConflictType(bestAi.type), 1000);
          notify(`Конфликт! Оба объявили ${translateCombo(bestAi.type)}.`, 'gold');
        } else if (playerStrongest && COMBO_HIERARCHY[bestAi.type] > COMBO_HIERARCHY[playerStrongest.type]) {
          notify(`AI ${translateCombo(bestAi.type)} перебил твой ${translateCombo(playerStrongest.type)}!`, 'red');
        } else {
          notify(`AI Объявил: ${translateCombo(bestAi.type)}`, "silver");
        }
      }
    }
  }, [state.phase, state.turn, state.playedCards.length, state.combos.ai, state.announcedCombos.player, state.canDeclare.ai]);

  // Combination Comparison & Immediate Annulment
  useEffect(() => {
    if (state.phase === 'PLAYING' && state.playedCards.length === 0) {
      const pCombos = state.announcedCombos.player;
      const aCombos = state.announcedCombos.ai;

      if (pCombos.length > 0 && aCombos.length > 0) {
        const pStrongest = pCombos[0];
        const aStrongest = aCombos[0];

        // If types are different, the higher type wins automatically
        if (pStrongest.type !== aStrongest.type) {
          const typeOrder = { 'Terz': 1, 'Fifty': 2, 'Hundred': 3, 'Carre': 4 };
          if (typeOrder[pStrongest.type] > typeOrder[aStrongest.type]) {
            setState(prev => ({
              ...prev,
              announcedCombos: { ...prev.announcedCombos, ai: [] },
              hasConfirmedGrowth: { ...prev.hasConfirmedGrowth, player: true }
            }));
            notify(`Твой ${translateCombo(pStrongest.type)} выше!`, "green");
          } else {
            setState(prev => ({
              ...prev,
              announcedCombos: { ...prev.announcedCombos, player: [] },
              hasConfirmedGrowth: { ...prev.hasConfirmedGrowth, ai: true }
            }));
            notify(`AI ${translateCombo(aStrongest.type)} выше!`, "red");
          }
        }
      }
    }
  }, [state.announcedCombos, state.phase, state.playedCards.length]);

  // AI Conflict Growth Confirmation
  useEffect(() => {
    if (state.phase === 'PLAYING' && state.turn === 'ai' && conflictType && !state.hasConfirmedGrowth.ai) {
      // Instant AI growth confirmation
      setState(prev => ({
        ...prev,
        hasConfirmedGrowth: { ...prev.hasConfirmedGrowth, ai: true }
      }));
      notify(`AI выбрал рост для ${translateCombo(conflictType)}`, 'silver');
    }
  }, [state.phase, state.turn, conflictType, state.hasConfirmedGrowth.ai]);

  // AI Show Logic (at start of 2nd trick)
  useEffect(() => {
    if (state.playedCards.length === 1 && state.phase === 'PLAYING' && state.turn === 'ai' && state.canShow.ai) {
      const aCombos = state.announcedCombos.ai;
      if (aCombos.length === 0 || !state.hasConfirmedGrowth.ai) return;

      const aStrongest = aCombos[0];
      
      // AI shows its combo automatically if it survived the comparison
      setShowingCombos(prev => ({ ...prev, ai: true }));
      setState(prev => ({ ...prev, isShowingCombo: true }));
      
      setTimeout(() => {
        setShowingCombos(prev => ({ ...prev, ai: false }));
        setState(prev => ({ ...prev, isShowingCombo: false }));
        
        // After showing, AI plays its card
        // This is handled by the AI play logic which checks isShowingCombo
      }, 3000);
      
      const totalPoints = aCombos.reduce((sum, c) => sum + c.points, 0);

      setState(prev => ({
        ...prev,
        declaredCombos: { ...prev.declaredCombos, ai: aCombos },
        hasShownCombos: { ...prev.hasShownCombos, ai: true },
        aiRoundScore: prev.aiRoundScore + totalPoints
      }));

      setVisibleCombos({ player: false, ai: true });
      setTimeout(() => setVisibleCombos({ player: false, ai: false }), 4000);

      notify(`AI показал комбинацию: ${translateCombo(aStrongest.type, aStrongest.highRank, true)}! (+${totalPoints})`, "silver");
    }
  }, [state.playedCards.length, state.phase, state.turn, state.announcedCombos.ai, state.hasConfirmedGrowth.ai, state.canShow.ai]);

  const playCard = (card: CardType) => {
    if (state.phase !== 'PLAYING' || state.turn !== 'player' || state.currentTrick.player || state.isShowingCombo) return;
    
    const leadCard = state.currentTrick.ai;
    const validation = canPlayCard(card, state.playerHand, leadCard, state.trump!);
    
    if (!validation.valid) {
      notify(validation.reason || 'Invalid move', 'red');
      return;
    }

    // Check for Blot (K+Q of trump)
    let newBlotDeclared = state.blotDeclared.player;
    if (!state.allCombinationsDisabled && !newBlotDeclared && (card.rank === Rank.KING || card.rank === Rank.QUEEN) && card.suit.toString() === state.trump?.toString()) {
      const otherPart = card.rank === Rank.KING ? Rank.QUEEN : Rank.KING;
      if (state.playerHand.some(c => c.rank === otherPart && c.suit.toString() === state.trump?.toString())) {
        newBlotDeclared = true;
        notify('BLOT!', '#ffd700');
      }
    }

    // Annulment and Right-to-Declare/Show check
    let newAnnouncedPlayer = state.announcedCombos.player;
    let newCanDeclare = state.canDeclare;
    let newCanShow = state.canShow;

    const trickIndex = state.playedCards.length;

    if (trickIndex === 0) {
      // If playing 1st trick card without declaring, lose right to declare
      newCanDeclare = { ...state.canDeclare, player: false };
    }

    if (trickIndex === 1) {
      // If playing 2nd trick card without showing, lose right to show and annul combo
      if (!state.hasShownCombos.player) {
        newAnnouncedPlayer = [];
        newCanShow = { ...state.canShow, player: false };
        if (state.announcedCombos.player.length > 0) {
          notify("Ты не показал комбинацию! Она аннулирована.", "red");
        }
      }
    }

    setState(prev => ({
      ...prev,
      playerHand: prev.playerHand.filter(c => c.id !== card.id),
      currentTrick: { ...prev.currentTrick, player: card },
      turn: prev.currentTrick.ai ? 'player' : 'ai',
      isFirstDeal: false,
      blotDeclared: { ...prev.blotDeclared, player: newBlotDeclared },
      announcedCombos: { ...prev.announcedCombos, player: newAnnouncedPlayer },
      canDeclare: newCanDeclare,
      canShow: newCanShow
    }));
  };

  // AI Play Logic
  useEffect(() => {
    const needsToShow = state.playedCards.length === 1 && state.announcedCombos.ai.length > 0 && !state.hasShownCombos.ai;
    
    if (state.phase === 'PLAYING' && state.turn === 'ai' && !state.currentTrick.ai && !state.isShowingCombo && !needsToShow) {
      const timer = setTimeout(() => {
        const leadCard = state.currentTrick.player;
        
        // AI simplified logic using canPlayCard
        const validCards = state.aiHand.filter(c => canPlayCard(c, state.aiHand, leadCard, state.trump!).valid);
        const aiCard = validCards.length > 0 ? validCards[0] : state.aiHand[0];

        // AI Blot check
        let newBlotDeclared = state.blotDeclared.ai;
        if (!state.allCombinationsDisabled && !newBlotDeclared && (aiCard.rank === Rank.KING || aiCard.rank === Rank.QUEEN) && aiCard.suit.toString() === state.trump?.toString()) {
          const otherPart = aiCard.rank === Rank.KING ? Rank.QUEEN : Rank.KING;
          if (state.aiHand.some(c => c.rank === otherPart && c.suit.toString() === state.trump?.toString())) {
            newBlotDeclared = true;
            notify('AI: BLOT!', '#ffd700');
          }
        }

        setState(prev => {
          const trickIndex = prev.playedCards.length;
          
          let newAnnouncedAI = prev.announcedCombos.ai;
          let newCanDeclare = prev.canDeclare;
          let newCanShow = prev.canShow;

          if (trickIndex === 0) {
            // If playing 1st trick card without declaring, lose right to declare
            newCanDeclare = { ...prev.canDeclare, ai: false };
          }

          if (trickIndex === 1) {
            // If playing 2nd trick card without showing, lose right to show and annul combo
            if (!prev.hasShownCombos.ai) {
              newAnnouncedAI = [];
              newCanShow = { ...prev.canShow, ai: false };
            }
          }

          return {
            ...prev,
            aiHand: prev.aiHand.filter(c => c.id !== aiCard.id),
            currentTrick: { ...prev.currentTrick, ai: aiCard },
            turn: prev.currentTrick.player ? 'ai' : 'player',
            isFirstDeal: false,
            blotDeclared: { ...prev.blotDeclared, ai: newBlotDeclared },
            announcedCombos: { ...prev.announcedCombos, ai: newAnnouncedAI },
            canDeclare: newCanDeclare,
            canShow: newCanShow
          };
        });
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [state.phase, state.turn, state.aiHand, state.currentTrick, state.trump, state.isShowingCombo]);

  // AI Show Combos Logic
  useEffect(() => {
    if (state.phase === 'PLAYING' && state.turn === 'ai' && state.playedCards.length === 1 && state.announcedCombos.ai.length > 0 && !state.hasShownCombos.ai && !state.isShowingCombo) {
      const timer = setTimeout(() => {
        const aiCombos = state.announcedCombos.ai;
        const playerCombos = state.announcedCombos.player;

        // Superiority check
        const aiStrongest = aiCombos.length > 0 ? aiCombos.reduce((a, b) => a.strength > b.strength ? a : b) : null;
        const playerStrongest = playerCombos.length > 0 ? playerCombos.reduce((a, b) => a.strength > b.strength ? a : b) : null;

        let canShow = false;
        if (aiStrongest && !playerStrongest) canShow = true;
        else if (aiStrongest && playerStrongest) {
          if (aiStrongest.strength > playerStrongest.strength) canShow = true;
        }

        if (!canShow) {
          setState(prev => ({
            ...prev,
            announcedCombos: { ...prev.announcedCombos, ai: [] },
            hasShownCombos: { ...prev.hasShownCombos, ai: true }
          }));
          return;
        }

        // Visual effect
        setShowingCombos(prev => ({ ...prev, ai: true }));
        setState(prev => ({ ...prev, isShowingCombo: true }));
        setVisibleCombos({ player: false, ai: true });

        setTimeout(() => {
          setShowingCombos(prev => ({ ...prev, ai: false }));
          setState(prev => ({ 
            ...prev, 
            isShowingCombo: false,
            declaredCombos: { ...prev.declaredCombos, ai: aiCombos },
            hasShownCombos: { ...prev.hasShownCombos, ai: true },
            aiRoundScore: prev.aiRoundScore + aiCombos.reduce((sum, c) => sum + c.points, 0),
            announcedCombos: { ...prev.announcedCombos, player: [] } // Annul player combo if AI is stronger
          }));
          setTimeout(() => setVisibleCombos({ player: false, ai: false }), 1000);
        }, 3000);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [state.phase, state.turn, state.playedCards.length, state.announcedCombos, state.hasShownCombos, state.isShowingCombo]);

  // Trick Resolution
  useEffect(() => {
    if (state.currentTrick.player && state.currentTrick.ai) {
      const timer = setTimeout(() => {
        const { player, ai } = state.currentTrick;
        if (!player || !ai) return;

        const firstPlayer = state.lastWinner || (state.dealer === 'player' ? 'ai' : 'player');
        const leadCard = firstPlayer === 'player' ? player : ai;
        
        const winner = resolveTrick(player, ai, state.trump!, leadCard.suit);
        const newPlayedCards = [...state.playedCards, { player, ai, winner }];
        const isLastTrick = state.playerHand.length === 0 && state.aiHand.length === 0;
        const trickPoints = getCardValue(player.rank, player.suit, state.trump!) + 
                           getCardValue(ai.rank, ai.suit, state.trump!) + 
                           (isLastTrick ? 10 : 0);
        
        setState(prev => ({
          ...prev,
          playedCards: newPlayedCards,
          currentTrick: {},
          turn: winner,
          lastWinner: winner,
          playerRoundScore: prev.playerRoundScore + (winner === 'player' ? trickPoints : 0),
          aiRoundScore: prev.aiRoundScore + (winner === 'ai' ? trickPoints : 0)
        }));

        // Check if round is over (8 tricks in 24-card deck with 8 cards each)
        if (state.playerHand.length === 0 && state.aiHand.length === 0) {
          resolveRound(newPlayedCards, winner);
        }
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [state.currentTrick, state.trump, state.lastWinner, state.dealer, state.playerHand.length, state.aiHand.length]);

  const resolveRound = (finalPlayedCards: { player: CardType; ai: CardType; winner: 'player' | 'ai' }[], finalWinner: 'player' | 'ai') => {
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

    setState(prev => {
      const isBait = result.isBait;
      let pRoundPaper = 0;
      let aRoundPaper = 0;

      if (isBait) {
        // In case of bait, winner gets all points (tricks sum + combos sum)
        const totalTricks = result.player.tricks + result.ai.tricks;
        const totalCombosPoints = result.player.combos.reduce((sum, c) => sum + c.points, 0) + 
                                  result.ai.combos.reduce((sum, c) => sum + c.points, 0);
        
        const totalPaper = getPaperScore(totalTricks) + totalCombosPoints / 10;
        
        if (result.player.total > 0) {
          pRoundPaper = totalPaper;
          aRoundPaper = 0;
        } else {
          aRoundPaper = totalPaper;
          pRoundPaper = 0;
        }
      } else {
        pRoundPaper = getPaperScore(result.player.tricks) + result.player.combos.reduce((sum, c) => sum + c.points / 10, 0);
        aRoundPaper = getPaperScore(result.ai.tricks) + result.ai.combos.reduce((sum, c) => sum + c.points / 10, 0);
      }
      
      const pBreakdown = { ...result.player, finalPaper: pRoundPaper };
      const aBreakdown = { ...result.ai, finalPaper: aRoundPaper };
      
      const newPScore = prev.playerScore + pRoundPaper;
      const newAScore = prev.aiScore + aRoundPaper;
      
      if (newPScore >= prev.gameLimit || newAScore >= prev.gameLimit) {
        return {
          ...prev,
          playerScore: newPScore,
          aiScore: newAScore,
          phase: 'GAME_OVER',
          roundBreakdown: {
            player: pBreakdown,
            ai: aBreakdown,
            isBait: result.isBait,
            bidder: result.bidder
          }
        };
      }

      return {
        ...prev,
        playerScore: newPScore,
        aiScore: newAScore,
        phase: 'RESULT',
        playerRoundScore: pRoundPaper,
        aiRoundScore: aRoundPaper,
        roundBreakdown: {
          player: pBreakdown,
          ai: aBreakdown,
          isBait: result.isBait,
          bidder: result.bidder
        }
      };
    });
  };

  if (currentScreen === 'LOBBY') {
    return (
      <div className="relative w-full h-[100dvh] flex flex-col items-center bg-[#0f111a] text-white overflow-hidden font-sans">
        {/* Lobby Header */}
        <div className="w-full h-14 flex items-center justify-between px-6 bg-[#1a1c24] border-b border-white/5">
          <div className="flex items-center gap-4">
            <div className="w-8 h-8 bg-vivaro-pink rounded-md flex items-center justify-center font-black italic text-lg">V</div>
            <h1 className="text-lg font-black italic uppercase tracking-tighter">Vivaro Blot</h1>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex flex-col items-end">
              <span className="text-[9px] text-white/40 uppercase">Balance</span>
              <span className="text-xs font-bold text-yellow-500">1,250,000 AMD</span>
            </div>
            <div className="w-8 h-8 rounded-full bg-zinc-800 border border-white/10 overflow-hidden">
              <img src="https://picsum.photos/seed/player/40/40" alt="Avatar" referrerPolicy="no-referrer" />
            </div>
          </div>
        </div>

        <div className="flex-1 w-full max-w-[1600px] mx-auto flex gap-0 overflow-hidden">
          {/* Active Games Table */}
          <div className="flex-[4] flex flex-col overflow-hidden border-r border-white/5">
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-[#0f111a] z-10">
                  <tr className="text-[11px] text-white/40 border-b border-white/5">
                    <th className="p-3 font-normal text-center">Номер</th>
                    <th className="p-3 font-normal">Имя</th>
                    <th className="p-3 font-normal">Статус</th>
                    <th className="p-3 font-normal">Игрок 1</th>
                    <th className="p-3 font-normal text-center">Счет</th>
                    <th className="p-3 font-normal text-center">Игрок 2</th>
                    <th className="p-3 font-normal text-center">Сумма</th>
                    <th className="p-3 font-normal text-center">До</th>
                    <th className="p-3 font-normal text-center">Время</th>
                    <th className="p-3 font-normal text-center">Тип</th>
                  </tr>
                </thead>
                <tbody className="text-[13px]">
                  {lobbyGames.map((game) => (
                    <tr key={game.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors h-14">
                      <td className="p-3 text-white/60 text-center">{game.id}</td>
                      <td className="p-3">{game.name}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className={`w-1.5 h-1.5 ${game.statusColor} rounded-full`} />
                          <span className="text-white/60">{game.status}</span>
                        </div>
                      </td>
                      <td className="p-3 text-white/80">{game.p1}</td>
                      <td className="p-3 text-center text-white/80">{game.score}</td>
                      <td className="p-3 text-center">
                        {game.p2 === 'ИГРАТЬ' ? (
                          <button 
                            onClick={() => {
                              setCurrentScreen('GAME');
                              startNewRound();
                            }}
                            className="px-4 py-1 border border-[#2d5a4c] text-[#4ade80] rounded hover:bg-[#4ade80]/10 transition-all text-xs font-medium uppercase tracking-wider"
                          >
                            ИГРАТЬ
                          </button>
                        ) : (
                          <span className="text-white/60">{game.p2}</span>
                        )}
                      </td>
                      <td className="p-3 text-center font-bold text-yellow-500">{game.sum}</td>
                      <td className="p-3 text-center text-white/80">{game.target}</td>
                      <td className="p-3 text-center text-white/60">{game.time}</td>
                      <td className="p-3 text-center">
                        <div className="flex justify-center items-center gap-1 opacity-40">
                          {game.type === 'lock' && <Lock size={14} />}
                          {game.type === 'cards' && <Layers size={14} />}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {/* Bottom Expand Button */}
            <div className="h-6 flex items-center justify-center bg-[#0f111a] border-t border-white/5 relative">
              <button className="absolute -top-6 w-10 h-6 bg-[#1a1c24] rounded-t-lg flex items-center justify-center hover:bg-white/5 transition-colors border-t border-x border-white/5">
                <ChevronUp size={14} className="text-white/40" />
              </button>
            </div>
          </div>

          {/* Settings Panel */}
          <div className="w-[320px] bg-[#1a1c24] flex flex-col p-4 gap-4 overflow-y-auto custom-scrollbar">
            {/* Tabs */}
            <div className="flex bg-black/40 p-1 rounded-lg">
              <button className="flex-1 py-1.5 bg-[#2c2f3a] rounded-md text-xs font-bold">1</button>
              <button className="flex-1 py-1.5 text-white/40 text-xs font-bold">C</button>
            </div>

            {/* Dropdowns */}
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] text-white/40">Время Игры</span>
                  <select className="bg-black/40 border border-white/10 rounded-md p-2 text-xs outline-none appearance-none">
                    <option>3 м</option>
                    <option>5 м</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] text-white/40">Время Хода</span>
                  <select 
                    className="bg-black/40 border border-white/10 rounded-md p-2 text-xs outline-none appearance-none"
                    value={`${state.turnTimeLimit} с`}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      setState(prev => ({ ...prev, turnTimeLimit: val, timeLeft: val }));
                    }}
                  >
                    <option value="30 с">30 с</option>
                    <option value="15 с">15 с</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] text-white/40">Очки</span>
                <select 
                  className="bg-black/40 border border-white/10 rounded-md p-2 text-xs outline-none appearance-none"
                  value={state.gameLimit}
                  onChange={(e) => setState(prev => ({ ...prev, gameLimit: parseInt(e.target.value) }))}
                >
                  <option value="51">51</option>
                  <option value="101">101</option>
                  <option value="151">151</option>
                </select>
              </div>
            </div>

            {/* Checkboxes */}
            <div className="flex flex-col gap-3 mt-2">
              <label className="flex items-center gap-3 cursor-pointer group">
                <input 
                  type="checkbox" 
                  className="hidden" 
                  checked={state.allowHighCombos && !state.allCombinationsDisabled} 
                  onChange={() => setState(prev => ({ ...prev, allowHighCombos: true, allCombinationsDisabled: false }))} 
                />
                <div className={`w-4 h-4 rounded border ${state.allowHighCombos && !state.allCombinationsDisabled ? 'border-vivaro-pink bg-vivaro-pink' : 'border-white/20'} flex items-center justify-center transition-colors`}>
                  {state.allowHighCombos && !state.allCombinationsDisabled && <div className="w-2 h-2 bg-white rounded-sm" />}
                </div>
                <span className="text-xs text-white/80">Со всеми комбинациями</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer group">
                <input 
                  type="checkbox" 
                  className="hidden" 
                  checked={!state.allowHighCombos && !state.allCombinationsDisabled} 
                  onChange={() => setState(prev => ({ ...prev, allowHighCombos: false, allCombinationsDisabled: false }))} 
                />
                <div className={`w-4 h-4 rounded border ${!state.allowHighCombos && !state.allCombinationsDisabled ? 'border-vivaro-pink bg-vivaro-pink' : 'border-white/20'} flex items-center justify-center transition-colors`}>
                  {!state.allowHighCombos && !state.allCombinationsDisabled && <div className="w-2 h-2 bg-white rounded-sm" />}
                </div>
                <span className="text-xs text-white/80">Без Каре и 100</span>
                <Layers size={12} className="ml-auto" />
              </label>
              <label className="flex items-center gap-3 cursor-pointer group">
                <input 
                  type="checkbox" 
                  className="hidden" 
                  checked={state.allCombinationsDisabled} 
                  onChange={() => setState(prev => ({ ...prev, allCombinationsDisabled: true }))} 
                />
                <div className={`w-4 h-4 rounded border ${state.allCombinationsDisabled ? 'border-vivaro-pink bg-vivaro-pink' : 'border-white/20'} flex items-center justify-center transition-colors`}>
                  {state.allCombinationsDisabled && <div className="w-2 h-2 bg-white rounded-sm" />}
                </div>
                <span className="text-xs text-white/80">Без комбинаций</span>
                <Slash size={12} className="ml-auto" />
              </label>
            </div>

            <div className="h-[1px] bg-white/5 my-2" />

            <div className="flex flex-col gap-3">
              <label className="flex items-center gap-3 cursor-pointer group opacity-40">
                <div className="w-4 h-4 rounded border border-white/20 flex items-center justify-center" />
                <span className="text-xs text-white/80">Без козыря</span>
                <ZapOff size={12} className="ml-auto" />
              </label>
              <label className="flex items-center gap-3 cursor-pointer group opacity-40">
                <div className="w-4 h-4 rounded border border-white/20 flex items-center justify-center" />
                <span className="text-xs text-white/80">Частная игра</span>
                <Lock size={12} className="ml-auto" />
              </label>
            </div>

            <div className="mt-auto pt-4">
              <button 
                onClick={() => {
                  setCurrentScreen('GAME');
                  startNewRound();
                }}
                className="w-full py-3 bg-[#2d5a4c] hover:bg-[#3d7a66] text-[#4ade80] rounded-md font-bold uppercase tracking-[0.1em] transition-all"
              >
                СОЗДАТЬ
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-[100dvh] overflow-hidden bg-[#1a1c23] text-white font-sans">
      {/* Full Screen Game Table */}
      <div className="relative w-full h-full flex flex-col items-center justify-center overflow-hidden">
        {/* Background Gradient */}
        <div className="absolute inset-0 bg-[#1a1c23]" />
        
        {/* Scoreboard (Bottom Right) */}
        <div className="absolute bottom-6 right-6 z-50 flex flex-col gap-0 min-w-[220px] bg-[#242936] border border-white/5 rounded-xl shadow-2xl overflow-hidden">
          {/* Table Info Header */}
          <div className="px-4 py-2 bg-black/20 border-b border-white/5 flex justify-between items-center">
            <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">Table ID: {state.tableId}</span>
            <span className="text-[10px] font-black text-yellow-500/80 uppercase tracking-widest">Limit: {state.gameLimit}</span>
          </div>
          
          {/* Scores Table */}
          <div className="grid grid-cols-2 text-center border-b border-white/5">
            <div className="py-2 border-r border-white/5">
              <div className="text-[10px] font-black text-white/40 uppercase mb-1">ME</div>
              <div className="text-2xl font-black text-green-400 tabular-nums">{state.playerScore}</div>
            </div>
            <div className="py-2">
              <div className="text-[10px] font-black text-white/40 uppercase mb-1">YOU</div>
              <div className="text-2xl font-black text-vivaro-pink tabular-nums">{state.aiScore}</div>
            </div>
          </div>
          
          {/* Round Info Footer Removed for Clean UI */}
        </div>

        {/* Exit Button (Top Right) */}
        <div className="absolute top-6 right-6 z-50">
          <button 
            onClick={() => setCurrentScreen('LOBBY')} 
            className="px-4 py-2 bg-[#242936] hover:bg-white/5 rounded-lg text-[10px] uppercase tracking-widest transition-all border border-white/10 font-black text-white/60 hover:text-white"
          >
            Exit
          </button>
        </div>
        
        {/* Notifications removed for Clean UI */}


        {/* AI Avatar (Left Top) */}
        <div className="absolute top-8 left-8 z-20 flex items-center gap-4">
          <div className="flex flex-col items-center gap-2">
            <div className="relative">
              <CircularTimer 
                timeLeft={state.timeLeft} 
                isActive={state.turn === 'ai' && (state.phase === 'PLAYING' || state.phase === 'OFFERING_TRUMP' || state.phase === 'SUIT_SELECTION') && !state.currentTrick.ai} 
                maxTime={state.turnTimeLimit} 
                timeBank={state.aiTimeBank}
                isTimeBankActive={state.timeLeft === 0}
              />
              <div className="w-20 h-20 rounded-full bg-zinc-800 flex items-center justify-center overflow-hidden shadow-2xl">
                <img src="https://picsum.photos/seed/ai/100/100" alt="AI" referrerPolicy="no-referrer" className="opacity-80 grayscale w-full h-full object-cover" />
              </div>
              {state.dealer === 'ai' && (
                <div className="absolute -bottom-1 -left-1 w-6 h-6 bg-yellow-500 rounded-full flex items-center justify-center border border-black text-[10px] font-black text-black shadow-lg z-30">
                  D
                </div>
              )}
              {state.trump && state.bidder === 'ai' && (
                <div className="absolute -top-1 -right-1 w-6 h-6 bg-white rounded-full flex items-center justify-center border-[0.5px] border-[#ccc] shadow-lg z-30">
                  <span className={`text-sm leading-none font-bold ${state.trump === TrumpType.HEARTS || state.trump === TrumpType.DIAMONDS ? 'text-red-500' : 'text-black'}`}>
                    {state.trump === TrumpType.HEARTS ? '♥' : 
                     state.trump === TrumpType.DIAMONDS ? '♦' : 
                     state.trump === TrumpType.CLUBS ? '♣' : 
                     state.trump === TrumpType.SPADES ? '♠' : 
                     state.trump === TrumpType.NO_TRUMP ? 'A' : ''}
                  </span>
                </div>
              )}
            </div>
            <div className="bg-[#242936] px-3 py-1.5 rounded-lg border border-white/5 shadow-lg min-w-[100px] text-center">
              <span className="text-[9px] font-bold uppercase tracking-widest text-white/40">ID: 88294</span>
            </div>
          </div>
        </div>

        {/* Player Avatar (Left Bottom) */}
        <div className="absolute bottom-8 left-8 z-20 flex flex-col items-center gap-2">
          <div className="relative">
            <CircularTimer 
              timeLeft={state.timeLeft} 
              isActive={state.turn === 'player' && (state.phase === 'PLAYING' || state.phase === 'OFFERING_TRUMP' || state.phase === 'SUIT_SELECTION') && !state.currentTrick.player} 
              maxTime={state.turnTimeLimit} 
              timeBank={state.playerTimeBank}
              isTimeBankActive={state.timeLeft === 0}
            />
            <div className="w-20 h-20 rounded-full bg-zinc-800 flex items-center justify-center overflow-hidden shadow-2xl">
              <img src="https://picsum.photos/seed/player/100/100" alt="Player" referrerPolicy="no-referrer" className="opacity-80 grayscale w-full h-full object-cover" />
            </div>
            {state.dealer === 'player' && (
              <div className="absolute -bottom-1 -left-1 w-6 h-6 bg-yellow-500 rounded-full flex items-center justify-center border border-black text-[10px] font-black text-black shadow-lg z-30">
                D
              </div>
            )}
            {state.trump && state.bidder === 'player' && (
              <div className="absolute -top-1 -right-1 w-6 h-6 bg-white rounded-full flex items-center justify-center border-[0.5px] border-[#ccc] shadow-lg z-30">
                <span className={`text-sm leading-none font-bold ${state.trump === TrumpType.HEARTS || state.trump === TrumpType.DIAMONDS ? 'text-red-500' : 'text-black'}`}>
                  {state.trump === TrumpType.HEARTS ? '♥' : 
                   state.trump === TrumpType.DIAMONDS ? '♦' : 
                   state.trump === TrumpType.CLUBS ? '♣' : 
                   state.trump === TrumpType.SPADES ? '♠' : 
                   state.trump === TrumpType.NO_TRUMP ? 'A' : ''}
                </span>
              </div>
            )}
          </div>
          <div className="bg-[#242936] px-3 py-1.5 rounded-lg border border-white/5 shadow-lg min-w-[100px] text-center">
            <span className="text-[9px] font-bold uppercase tracking-widest text-white/40">ID: 2458007</span>
          </div>
        </div>

        {/* Deck & Trump Card (Right Center) */}
        <div className="absolute right-8 top-1/2 -translate-y-1/2 z-20 flex flex-col items-center gap-4">
          {/* Closed Deck Stack */}
          <div className="relative w-20 h-28">
            {Array.from({ length: Math.min(5, state.deck.length) }).map((_, i) => (
              <div
                key={`deck-card-${i}`}
                className="absolute w-20 h-28 bg-[#242936] border-2 border-white/10 rounded-lg shadow-xl"
                style={{
                  top: -i * 2,
                  left: i * 0.5,
                  zIndex: 10 - i,
                  backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(255,255,255,0.02) 10px, rgba(255,255,255,0.02) 20px)'
                }}
              />
            ))}
            {state.deck.length > 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="text-white/20 font-black text-xl">{state.deck.length}</span>
              </div>
            )}
          </div>
          
          {/* Open Trump Card */}
          {state.trumpCard && (
            <div className="w-20 h-28 transform rotate-3 shadow-2xl">
              <Card card={state.trumpCard} />
            </div>
          )}
        </div>

        {/* AI Hand Area (Top) */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-5xl h-48 flex justify-center items-start z-10">
          <div className="relative w-full flex justify-center">
            {state.aiHand.map((card, index) => {
              const total = state.aiHand.length;
              const centerIndex = (total - 1) / 2;
              const distanceFromCenter = index - centerIndex;
              const angle = distanceFromCenter * -4; 
              const xOffset = distanceFromCenter * 35; 
              const yOffset = -Math.pow(Math.abs(distanceFromCenter), 1.5) * 4;
              
              const isShowing = showingCombos.ai && state.announcedCombos.ai.some(combo => combo.cardIds?.includes(card.id));
              
              return (
                <div
                  key={card.id}
                  className="absolute transition-all duration-500"
                  style={{
                    transform: `translateX(${xOffset}px) translateY(${yOffset}px) rotate(${angle + 180}deg)`,
                    zIndex: isShowing ? 100 : index,
                  }}
                >
                  <Card 
                    card={card} 
                    hidden={!isShowing} 
                    isShowingCombo={isShowing}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* Trick Area (Center) */}
        <div className="relative w-full h-full flex items-center justify-center z-10">
          <AnimatePresence mode="wait">
            {/* AI Played Card */}
            {state.currentTrick.ai && (
              <motion.div
                key={`trick-ai-${state.currentTrick.ai.id}`}
                initial={{ y: -300, x: 0, opacity: 0, rotate: -20 }}
                animate={{ y: -40, x: 20, opacity: 1, rotate: 5 }}
                exit={{ scale: 0, opacity: 0 }}
                className="absolute z-10"
              >
                <Card card={state.currentTrick.ai} />
              </motion.div>
            )}

            {/* Player Played Card */}
            {state.currentTrick.player && (
              <motion.div
                key={`trick-player-${state.currentTrick.player.id}`}
                initial={{ y: 300, x: 0, opacity: 0, rotate: 20 }}
                animate={{ y: 40, x: -20, opacity: 1, rotate: -5 }}
                exit={{ scale: 0, opacity: 0 }}
                className="absolute z-20"
              >
                <Card card={state.currentTrick.player} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Player Hand Area (Bottom) */}
        <div className="absolute bottom-25 left-1/2 -translate-x-1/2 w-full max-w-5xl h-48 flex justify-center items-end z-40">
          {(() => {
            const isShowButtonVisible = state.phase === 'PLAYING' && state.playedCards.length === 1 && state.announcedCombos.player.length > 0 && !state.hasShownCombos.player && state.turn === 'player' && state.canShow.player;
            return (
              <div className={`relative w-full flex justify-center ${isShowButtonVisible ? 'pointer-events-none' : ''}`}>
                {/* Combo Declaration Menu */}
                <AnimatePresence>
                  {isComboMenuOpen && state.playedCards.length === 0 && (
                    <motion.div 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 20 }}
                      className="absolute -top-32 left-1/2 -translate-x-1/2 flex flex-col gap-3 bg-black/90 p-4 rounded-2xl border border-white/20 backdrop-blur-xl z-50 min-w-[300px]"
                    >
                      <div className="flex gap-2 justify-center">
                        {['Terz', 'Fifty', 'Hundred', 'Carre']
                          .filter(type => state.allowHighCombos || (type !== 'Hundred' && type !== 'Carre'))
                          .map((type) => {
                          const hasType = state.combos.player.some(c => c.type === type);
                          const isDeclared = state.announcedCombos.player.some(ac => ac.type === type);
                          return (
                            <button
                              key={type}
                              disabled={!hasType || isDeclared}
                              onClick={() => hasType && handleAnnounceType(type as Combination['type'])}
                              className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                                isDeclared ? 'bg-zinc-700 text-zinc-500 border-transparent cursor-not-allowed' :
                                hasType 
                                  ? 'bg-vivaro-pink/20 text-vivaro-pink border border-vivaro-pink/50 hover:bg-vivaro-pink/40' 
                                  : 'bg-zinc-800/50 text-zinc-600 border border-white/5 cursor-not-allowed'
                              }`}
                            >
                              {translateCombo(type)}
                            </button>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

          {/* Conflict Growth Selection Menu */}
          <AnimatePresence>
            {conflictType && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col gap-4 bg-red-900/90 p-6 rounded-3xl border-2 border-white/30 backdrop-blur-2xl z-[100] shadow-[0_0_50px_rgba(127,29,29,0.6)] w-full max-w-[400px]"
              >
                <div className="text-center space-y-1">
                </div>
                
                <div className="flex flex-wrap gap-2 justify-center">
                  {(() => {
                    const validCombos = state.combos.player.filter(c => c.type === conflictType);
                    
                    // 24-card deck logic for growth options
                    let allowedRanks: Rank[] = [];
                    if (conflictType === 'Terz') {
                      allowedRanks = [Rank.JACK, Rank.QUEEN, Rank.KING, Rank.ACE];
                    } else if (conflictType === 'Fifty') {
                      allowedRanks = [Rank.QUEEN, Rank.KING, Rank.ACE];
                    } else if (conflictType === 'Hundred') {
                      allowedRanks = [Rank.KING, Rank.ACE];
                    } else if (conflictType === 'Carre') {
                      // Carre can be any rank in 24-card deck (9, 10, J, Q, K, A)
                      allowedRanks = [Rank.NINE, Rank.TEN, Rank.JACK, Rank.QUEEN, Rank.KING, Rank.ACE];
                    }

                    return allowedRanks.map(rank => {
                      const combo = validCombos.find(c => c.highRank === rank);
                      return (
                        <button
                          key={rank}
                          disabled={!combo}
                          onClick={() => combo && handleSelectGrowth(rank)}
                          className={`min-w-[60px] h-12 rounded-xl flex items-center justify-center font-black text-sm transition-all ${
                            combo 
                              ? 'bg-white text-red-900 hover:bg-red-100 hover:scale-105 active:scale-95 shadow-lg' 
                              : 'bg-black/20 text-white/20 cursor-not-allowed border border-white/5'
                          }`}
                        >
                          {translateRank(rank)}
                        </button>
                      );
                    });
                  })()}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Show Combos Button */}
          {state.phase === 'PLAYING' && state.playedCards.length === 1 && state.announcedCombos.player.length > 0 && !state.hasShownCombos.player && state.turn === 'player' && state.canShow.player && (
            <motion.button
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: [1, 1.1, 1], opacity: 1 }}
              transition={{ repeat: Infinity, duration: 1.5 }}
              onClick={(e) => {
                e.stopPropagation();
                handleShowCombos();
              }}
              className="absolute -top-24 left-1/2 -translate-x-1/2 bg-yellow-500 text-black px-8 py-4 rounded-full font-black uppercase tracking-tighter italic shadow-[0_0_30px_rgba(234,179,8,0.6)] z-[110] pointer-events-auto border-4 border-black/10"
            >
              ПОКАЗАТЬ {state.announcedCombos.player[0] ? translateCombo(state.announcedCombos.player[0].type).toUpperCase() : 'КОМБИНАЦИЮ'}
            </motion.button>
          )}

          {/* Declare Button */}
          {state.phase === 'PLAYING' && !state.allCombinationsDisabled && state.playedCards.length === 0 && state.turn === 'player' && state.canDeclare.player && (
            <button
              onClick={() => {
                setIsComboMenuOpen(!isComboMenuOpen);
                if (isComboMenuOpen) setSelectedComboType(null);
              }}
              className="absolute -top-12 left-1/2 -translate-x-1/2 bg-zinc-800/80 hover:bg-zinc-700 text-white border border-white/10 px-4 py-1 rounded-full text-xs font-bold transition-all z-40"
            >
              {isComboMenuOpen ? 'Закрыть' : 'Комбинация'}
            </button>
          )}

          {state.playerHand.map((card, index) => {
            const total = state.playerHand.length;
            const angle = (index - (total - 1) / 2) * 4;
            const xOffset = (index - (total - 1) / 2) * 40;
            const yOffset = Math.pow(Math.abs(index - (total - 1) / 2), 1.5) * 2;
            
            const leadCard = state.currentTrick.ai;
            const isPlayable = state.turn === 'player' && state.phase === 'PLAYING' && !state.currentTrick.player && !state.isShowingCombo && !isShowButtonVisible && canPlayCard(card, state.playerHand, leadCard, state.trump!).valid;
            
            const isShowing = showingCombos.player && state.announcedCombos.player.some(combo => combo.cardIds?.includes(card.id));
            const isDimmed = state.isShowingCombo && !isShowing;

            return (
              <div
                key={card.id}
                className="absolute transition-all duration-300"
                style={{
                  transform: `translateX(${xOffset}px) translateY(${yOffset}px) rotate(${angle}deg)`,
                  zIndex: isShowing ? 100 : index,
                }}
              >
                <Card 
                  card={card} 
                  isPlayable={isPlayable}
                  isShowingCombo={isShowing}
                  isDimmed={isDimmed}
                  onClick={() => isPlayable && playCard(card)} 
                />
              </div>
            );
          })}
            </div>
          );
        })()}
      </div>

      {/* Offering Trump Overlay */}
      <AnimatePresence>
        {state.phase === 'OFFERING_TRUMP' && state.offeredCard && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[150] flex flex-col items-center gap-4 pointer-events-auto"
          >
            <div className="bg-black/60 backdrop-blur-xl p-6 rounded-[2.5rem] border border-white/20 flex flex-col items-center gap-4 shadow-[0_0_50px_rgba(0,0,0,0.8)] pointer-events-auto">
              <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40">Trump Offer</p>
              
              <div className="scale-[0.85] -my-4 drop-shadow-2xl">
                <Card card={state.offeredCard} />
              </div>
              
              <div className="flex flex-col items-center gap-4 w-full">
                {state.turn === 'player' ? (
                  <div className="flex gap-4 w-full">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTakeTrump('player', state.offeredCard!.suit as unknown as TrumpType);
                      }} 
                      className="flex-1 px-8 py-3 bg-vivaro-pink text-white rounded-2xl font-black text-xs shadow-[0_0_30px_rgba(233,30,99,0.4)] hover:bg-vivaro-pink/80 transition-all uppercase tracking-widest cursor-pointer active:scale-95 pointer-events-auto"
                    >
                      TAKE
                    </button>
                    {!(state.offeredCard?.rank === Rank.JACK && state.dealer === 'player') && (
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePassTrump();
                        }} 
                        className="flex-1 px-8 py-3 bg-white/10 hover:bg-white/20 text-white rounded-2xl font-black text-xs border border-white/20 transition-all uppercase tracking-widest cursor-pointer active:scale-95 pointer-events-auto"
                      >
                        PASS
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center py-2">
                    <div className="w-6 h-6 border-2 border-vivaro-pink border-t-transparent rounded-full animate-spin mb-3" />
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Suit Selection Overlay */}
      <AnimatePresence>
        {state.phase === 'SUIT_SELECTION' && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[150] flex flex-col items-center gap-3 pointer-events-auto"
          >
            <div className="bg-black/60 backdrop-blur-xl p-6 rounded-[2.5rem] border border-white/20 shadow-[0_0_50px_rgba(0,0,0,0.8)] pointer-events-auto">
              <div className="flex gap-2 justify-center">
                {[Suit.HEARTS, Suit.DIAMONDS, Suit.CLUBS, Suit.SPADES].map(s => {
                  const isOfferedSuit = s === state.offeredCard?.suit;
                  if (isOfferedSuit) return null;
                  return (
                    <button 
                      key={s} 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectSuit(s as unknown as TrumpType);
                      }}
                      className="w-14 h-14 bg-white/5 hover:bg-vivaro-pink/20 border border-white/10 rounded-2xl flex items-center justify-center text-3xl transition-all hover:scale-110 active:scale-95 cursor-pointer pointer-events-auto"
                    >
                      <span className={s === Suit.HEARTS || s === Suit.DIAMONDS ? 'text-red-500' : 'text-white'}>
                        {s === Suit.HEARTS ? '♥' : s === Suit.DIAMONDS ? '♦' : s === Suit.CLUBS ? '♣' : '♠'}
                      </span>
                    </button>
                  );
                })}
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectSuit(TrumpType.NO_TRUMP);
                  }}
                  className="w-14 h-14 bg-white/5 hover:bg-vivaro-pink/20 border border-white/10 rounded-2xl flex items-center justify-center text-2xl font-bold uppercase transition-all hover:scale-110 active:scale-95 cursor-pointer pointer-events-auto"
                >
                  <span className="text-white">A</span>
                </button>
              </div>
              {state.turn === 'ai' && (
                <div className="mt-6 flex flex-col items-center">
                   <div className="w-6 h-6 border-2 border-vivaro-pink border-t-transparent rounded-full animate-spin mb-2" />
                </div>
              )}
              {state.turn === 'player' && (
                <>
                  {state.dealer === 'player' ? (
                    <div className="mt-6 h-10" />
                  ) : (
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePassTrump();
                      }}
                      className="w-full mt-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-black text-[10px] border border-white/20 transition-all uppercase tracking-widest cursor-pointer active:scale-95 pointer-events-auto"
                    >
                      Pass
                    </button>
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

        </div>

      {/* Result & Game Over Overlays (Simplified) */}
      {/* ... existing overlays can be kept or slightly adjusted ... */}

      {/* Result Overlay */}
      {state.phase === 'RESULT' && state.roundBreakdown && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[200] flex items-center justify-center">
          <motion.div 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-[#0d3d26] p-10 rounded-[40px] border-2 border-white/10 shadow-2xl text-center max-w-md w-full"
          >
            <h2 className="text-4xl font-black text-white mb-8 tracking-tighter italic uppercase flex items-center justify-center gap-3">
              Round Results
              {state.trump && (
                <span className="text-2xl font-bold drop-shadow-md">
                  {state.trump === TrumpType.HEARTS ? '♥' : 
                   state.trump === TrumpType.DIAMONDS ? '♦' : 
                   state.trump === TrumpType.CLUBS ? '♣' : 
                   state.trump === TrumpType.SPADES ? '♠' : 'A'}
                </span>
              )}
            </h2>

            {state.roundBreakdown.isBait && (
              <div className="mb-6 bg-red-500/20 border border-red-500/50 p-4 rounded-2xl">
                <p className="text-red-500 font-black text-sm uppercase tracking-widest">
                  БАЙТ: ВСЕ ОЧКИ ПЕРЕДАНЫ СОПЕРНИКУ
                </p>
              </div>
            )}
            
            <div className="space-y-6 mb-10">
              {/* Player Score Block */}
              {(() => {
                const isBait = state.roundBreakdown.isBait;
                const isLoser = isBait && state.roundBreakdown.bidder === 'player';
                const isWinner = isBait && state.roundBreakdown.bidder === 'ai';
                const bgColor = isLoser ? 'bg-red-900/40 border-red-500/50' : (isWinner ? 'bg-green-900/30 border-green-500/30' : 'bg-black/20 border-white/5');
                const textColor = isLoser ? 'text-red-400' : 'text-green-400';

                return (
                  <div className={`${bgColor} p-6 rounded-3xl border text-left transition-colors`}>
                    <div className="flex justify-between items-end mb-4">
                      <p className={`${textColor} text-sm font-black uppercase tracking-widest`}>YOU</p>
                      <div className="flex items-baseline gap-2">
                        {isLoser && <span className="text-red-500 font-black text-xl italic mr-2">БАЙТ</span>}
                        <p className={`text-5xl font-black leading-none ${textColor}`}>
                          {state.playerRoundScore}
                        </p>
                      </div>
                    </div>
                    
                    <div className="space-y-2 border-t border-white/5 pt-4">
                      <div className="flex justify-between text-white/60 text-sm">
                        <span>Карты</span>
                        <div className="flex items-center gap-2">
                          <span className={`font-mono ${isLoser ? 'line-through opacity-50' : ''}`}>
                            {state.roundBreakdown.player.originalTricks}
                          </span>
                          {isLoser && <ArrowRight size={14} className="text-red-400" />}
                        </div>
                      </div>
                      {state.roundBreakdown.player.originalCombos.map((c, i) => (
                        <div key={i} className="flex justify-between text-white/60 text-sm">
                          <span>{translateCombo(c.type, c.highRank, true)}</span>
                          <div className="flex items-center gap-2">
                            <span className={`font-mono ${isLoser ? 'line-through opacity-50' : ''}`}>{c.points / 10}</span>
                            {isLoser && <ArrowRight size={14} className="text-red-400" />}
                          </div>
                        </div>
                      ))}
                      
                      {isWinner && (
                        <div className="flex justify-between text-green-400 font-bold text-sm pt-2 border-t border-white/5">
                          <span>Бонус за Байт</span>
                          <span className="font-mono">
                            +{getPaperScore(state.roundBreakdown.ai.originalTricks) + state.roundBreakdown.ai.originalCombos.reduce((s, c) => s + c.points/10, 0)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* AI Score Block */}
              {(() => {
                const isBait = state.roundBreakdown.isBait;
                const isLoser = isBait && state.roundBreakdown.bidder === 'ai';
                const isWinner = isBait && state.roundBreakdown.bidder === 'player';
                const bgColor = isLoser ? 'bg-red-900/40 border-red-500/50' : (isWinner ? 'bg-green-900/30 border-green-500/30' : 'bg-black/20 border-white/5');
                const textColor = isLoser ? 'text-red-400' : 'text-vivaro-pink';

                return (
                  <div className={`${bgColor} p-6 rounded-3xl border text-left transition-colors`}>
                    <div className="flex justify-between items-end mb-4">
                      <p className={`${textColor} text-sm font-black uppercase tracking-widest`}>AI</p>
                      <div className="flex items-baseline gap-2">
                        {isLoser && <span className="text-red-500 font-black text-xl italic mr-2">БАЙТ</span>}
                        <p className={`text-5xl font-black leading-none ${textColor}`}>
                          {state.aiRoundScore}
                        </p>
                      </div>
                    </div>
                    
                    <div className="space-y-2 border-t border-white/5 pt-4">
                      <div className="flex justify-between text-white/60 text-sm">
                        <span>Карты</span>
                        <div className="flex items-center gap-2">
                          <span className={`font-mono ${isLoser ? 'line-through opacity-50' : ''}`}>
                            {state.roundBreakdown.ai.originalTricks}
                          </span>
                          {isLoser && <ArrowRight size={14} className="text-red-400" />}
                        </div>
                      </div>
                      {state.roundBreakdown.ai.originalCombos.map((c, i) => (
                        <div key={i} className="flex justify-between text-white/60 text-sm">
                          <span>{translateCombo(c.type, c.highRank, true)}</span>
                          <div className="flex items-center gap-2">
                            <span className={`font-mono ${isLoser ? 'line-through opacity-50' : ''}`}>{c.points / 10}</span>
                            {isLoser && <ArrowRight size={14} className="text-red-400" />}
                          </div>
                        </div>
                      ))}
                      
                      {isWinner && (
                        <div className="flex justify-between text-green-400 font-bold text-sm pt-2 border-t border-white/5">
                          <span>Бонус за Байт</span>
                          <span className="font-mono">
                            +{getPaperScore(state.roundBreakdown.player.originalTricks) + state.roundBreakdown.player.originalCombos.reduce((s, c) => s + c.points/10, 0)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>

            <button onClick={startNewRound} className="btn-vivaro w-full py-5 text-2xl font-black uppercase tracking-tighter italic">
              Next Round
            </button>
          </motion.div>
        </div>
      )}

      {/* Game Over Overlay */}
      {state.phase === 'GAME_OVER' && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-xl z-[300] flex items-center justify-center">
          <motion.div 
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="text-center"
          >
            <Trophy size={120} className="text-yellow-500 mx-auto mb-8 drop-shadow-[0_0_30px_rgba(234,179,8,0.4)]" />
            <h1 className="text-8xl font-black mb-4 tracking-tighter italic uppercase">
              {state.playerTimeBank === 0 ? 'Defeat' : 
               state.aiTimeBank === 0 ? 'Victory!' :
               state.playerScore > state.aiScore ? 'Victory!' : 'Defeat'}
            </h1>
            
            {(state.playerTimeBank === 0 || state.aiTimeBank === 0) && (
              <div className="mb-8 bg-red-500/20 border border-red-500/50 p-4 rounded-2xl max-w-md mx-auto">
                <p className="text-red-500 font-black text-sm uppercase tracking-widest">
                  Время вышло! Техническое поражение
                </p>
              </div>
            )}

            {state.roundBreakdown?.isBait && (
              <div className="mb-8 bg-red-500/20 border border-red-500/50 p-4 rounded-2xl max-w-md mx-auto">
                <p className="text-red-500 font-black text-sm uppercase tracking-widest">
                  БАЙТ: ВСЕ ОЧКИ ПЕРЕДАНЫ СОПЕРНИКУ
                </p>
              </div>
            )}

            <p className="text-2xl text-white/40 mb-12 uppercase tracking-widest">Final Score: {state.playerScore} - {state.aiScore}</p>
            <button 
              onClick={() => {
                startNewRound();
              }} 
              className="btn-vivaro px-16 py-6 text-3xl font-black uppercase tracking-tighter italic"
            >
              Play Again
            </button>
          </motion.div>
        </div>
      )}
    </div>
  );
}
