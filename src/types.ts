
export enum Suit {
  HEARTS = 'HEARTS',
  DIAMONDS = 'DIAMONDS',
  CLUBS = 'CLUBS',
  SPADES = 'SPADES',
}

export enum Rank {
  NINE = '9',
  TEN = '10',
  JACK = 'J',
  QUEEN = 'Q',
  KING = 'K',
  ACE = 'A',
}

export enum TrumpType {
  HEARTS = 'HEARTS',
  DIAMONDS = 'DIAMONDS',
  CLUBS = 'CLUBS',
  SPADES = 'SPADES',
  NO_TRUMP = 'NO_TRUMP',
}

export interface Card {
  id: string;
  suit: Suit;
  rank: Rank;
}

export interface Bid {
  value: number; // 70, 80, ..., 150, 160 (Capot)
  type: TrumpType;
  player: 'player' | 'ai';
}

export type GamePhase = 'OFFERING_TRUMP' | 'SUIT_SELECTION' | 'PLAYING' | 'RESULT' | 'GAME_OVER';

export interface Combination {
  type: 'Terz' | 'Fifty' | 'Hundred' | 'Carre';
  points: number;
  rankOrder: number; // For comparing same length combos
  suit?: Suit;
  highRank?: Rank;
  strength: number; // length * 100 + rankValue
  cardIds?: string[];
}

export interface RoundBreakdown {
  tricks: number;
  combos: { type: string; points: number; highRank?: Rank }[];
  total: number;
  finalPaper: number;
  originalTricks: number;
  originalCombos: { type: string; points: number; highRank?: Rank }[];
}

export interface GameState {
  playerHand: Card[];
  aiHand: Card[];
  deck: Card[];
  offeredCard: Card | null;
  playedCards: { player: Card; ai: Card; winner: 'player' | 'ai' }[];
  currentTrick: { player?: Card; ai?: Card };
  trump: TrumpType | null;
  bidder: 'player' | 'ai' | null;
  playerScore: number;
  aiScore: number;
  playerRoundScore: number;
  aiRoundScore: number;
  roundBreakdown: {
    player: RoundBreakdown;
    ai: RoundBreakdown;
    isBait: boolean;
    bidder: 'player' | 'ai';
  } | null;
  dealer: 'player' | 'ai';
  turn: 'player' | 'ai';
  phase: GamePhase;
  lastWinner: 'player' | 'ai' | null;
  combos: { player: Combination[]; ai: Combination[] };
  announcedCombos: { player: Combination[]; ai: Combination[] };
  declaredCombos: { player: Combination[]; ai: Combination[] };
  hasShownCombos: { player: boolean; ai: boolean };
  hasConfirmedGrowth: { player: boolean; ai: boolean };
  canDeclare: { player: boolean; ai: boolean };
  canShow: { player: boolean; ai: boolean };
  isShowingCombo: boolean;
  isFirstDeal: boolean;
  blotDeclared: { player: boolean; ai: boolean };
  allowHighCombos: boolean;
  allCombinationsDisabled: boolean;
  gameLimit: number;
  betAmount: number;
  roundNumber: number;
  timeLeft: number;
  turnTimeLimit: number;
  playerTimeBank: number;
  aiTimeBank: number;
  tableId: number;
}

export type TableTheme = 'slate' | 'emerald' | 'navy' | 'burgundy';
export type CardBackTheme = 'slate' | 'crimson' | 'emerald' | 'navy';
export type TrickLayout = 'overlap' | 'sideBySide';
export type ScoreAnchor = 'bottomRight' | 'topRight' | 'bottomLeft' | 'hidden';
export type AiSpeed = 'fast' | 'normal' | 'slow';

export interface TableSettings {
  playerFanSpread: number;
  playerFanAngle: number;
  playerFanArc: number;
  playerHandOffsetX: number;
  playerHandOffsetY: number;
  aiFanSpread: number;
  aiHandOffsetY: number;
  cardScale: number;
  cardBackTheme: CardBackTheme;
  showBottomIndex: boolean;
  tableTheme: TableTheme;
  trickLayout: TrickLayout;
  trickOffset: number;
  deckOffsetX: number;
  deckOffsetY: number;
  scorePanelAnchor: ScoreAnchor;
  showToasts: boolean;
  highlightPlayable: boolean;
  showTimers: boolean;
  showRoundResultModal: boolean;
  botsEnabled: boolean;
  botAutoPlay: boolean;
  aiSpeed: AiSpeed;
}
