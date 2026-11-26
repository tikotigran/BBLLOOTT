import { Card, Rank, Suit, TrumpType, Combination, RoundBreakdown } from '../types';
import { getCardValue, compareCards, NORMAL_POWER, TRUMP_POWER } from '../constants';

export const createDeck = (): Card[] => {
  const suits = [Suit.HEARTS, Suit.DIAMONDS, Suit.CLUBS, Suit.SPADES];
  const ranks = [Rank.NINE, Rank.TEN, Rank.JACK, Rank.QUEEN, Rank.KING, Rank.ACE];
  const deck: Card[] = [];

  suits.forEach((suit) => {
    ranks.forEach((rank) => {
      deck.push({ id: `${suit}-${rank}`, suit, rank });
    });
  });

  return deck.sort(() => Math.random() - 0.5);
};

export const canPlayCard = (card: Card, hand: Card[], leadCard: Card | undefined, trump: TrumpType): { valid: boolean; reason?: string } => {
  if (!leadCard) return { valid: true };

  const leadSuit = leadCard.suit;
  const isTrumpGame = trump !== TrumpType.NO_TRUMP;
  const trumpSuit = trump as unknown as Suit;

  const hasSuit = hand.some(c => c.suit === leadSuit);
  const isLeadTrump = leadSuit === trumpSuit;
  
  // 1. Must follow suit
  if (hasSuit) {
    if (card.suit !== leadSuit) return { valid: false, reason: 'Must follow suit' };
    
    // If following trump suit, must overtrump if possible
    if (isLeadTrump) {
      const higherTrumps = hand.filter(c => c.suit === leadSuit && TRUMP_POWER[c.rank] > TRUMP_POWER[leadCard.rank]);
      if (higherTrumps.length > 0 && TRUMP_POWER[card.rank] < TRUMP_POWER[leadCard.rank]) {
        // Check if there is any higher trump in hand than the lead card
        // Actually, if we have higher trumps, we must play one of them.
        // But if we don't have a higher one than leadCard, any trump is fine.
        return { valid: false, reason: 'Must overtrump' };
      }
    }
    return { valid: true };
  }

  // 2. If no suit, must play trump
  const hasTrump = hand.some(c => c.suit === trumpSuit);
  if (hasTrump) {
    const isCardTrump = card.suit === trumpSuit;
    if (!isCardTrump) return { valid: false, reason: 'Must play trump' };
    
    // Must overtrump if possible
    // In 2-player game, if opponent played trump, we must overtrump if we can.
    // If opponent played non-trump and we are trumping, any trump is fine? 
    // Usually: if you trump, you must overtrump the current highest trump on table.
    const currentHighestTrump = leadCard.suit === trumpSuit ? leadCard : null; // In 2-player, only lead card can be trump if we are response
    if (currentHighestTrump) {
      const higherTrumps = hand.filter(c => c.suit === trumpSuit && TRUMP_POWER[c.rank] > TRUMP_POWER[currentHighestTrump.rank]);
      if (higherTrumps.length > 0 && TRUMP_POWER[card.rank] < TRUMP_POWER[currentHighestTrump.rank]) {
        return { valid: false, reason: 'Must overtrump' };
      }
    }

    return { valid: true };
  }

  // 3. If no suit and no trump, any card
  return { valid: true };
};

export const detectCombos = (hand: Card[], trump: TrumpType | null, allowHighCombos: boolean = true, allCombinationsDisabled: boolean = false): Combination[] => {
  if (allCombinationsDisabled) return [];
  const combos: Combination[] = [];
  const rankOrder = [Rank.NINE, Rank.TEN, Rank.JACK, Rank.QUEEN, Rank.KING, Rank.ACE];
  
  // 1. Carre (4 of a kind)
  if (allowHighCombos) {
    const rankCounts: Record<string, Card[]> = {};
    hand.forEach(c => {
      rankCounts[c.rank] = rankCounts[c.rank] || [];
      rankCounts[c.rank].push(c);
    });

    Object.entries(rankCounts).forEach(([rank, cards]) => {
      if (cards.length === 4) {
        let points = 100;
        const isNoTrump = trump === TrumpType.NO_TRUMP;
        
        if (isNoTrump) {
          if (rank === Rank.ACE) points = 190;
          else if (rank === Rank.NINE) points = 0;
          else points = 100;
        } else {
          if (rank === Rank.JACK) points = 200;
          else if (rank === Rank.NINE) points = 150;
          else points = 100;
        }
        
        combos.push({
          type: 'Carre',
          points,
          rankOrder: rankOrder.indexOf(rank as Rank),
          highRank: rank as Rank,
          strength: 10000 + points + rankOrder.indexOf(rank as Rank),
          cardIds: cards.map(c => c.id)
        });
      }
    });
  }

  // 2. Sequences (Terz, Fifty, Hundred)
  const suitGroups: Record<Suit, Card[]> = {
    [Suit.HEARTS]: [],
    [Suit.DIAMONDS]: [],
    [Suit.CLUBS]: [],
    [Suit.SPADES]: [],
  };
  hand.forEach(c => suitGroups[c.suit].push(c));

  Object.entries(suitGroups).forEach(([suit, cards]) => {
    const sorted = cards.sort((a, b) => rankOrder.indexOf(a.rank) - rankOrder.indexOf(b.rank));
    let currentSeq: Card[] = [];
    
    for (let i = 0; i < sorted.length; i++) {
      if (currentSeq.length > 0 && rankOrder.indexOf(sorted[i].rank) === rankOrder.indexOf(currentSeq[currentSeq.length - 1].rank) + 1) {
        currentSeq.push(sorted[i]);
      } else {
        if (currentSeq.length >= 3) {
          const combo = createSeqCombo(currentSeq, suit as Suit, rankOrder, trump);
          if (allowHighCombos || combo.type !== 'Hundred') {
            combos.push(combo);
          }
        }
        currentSeq = [sorted[i]];
      }
    }
    if (currentSeq.length >= 3) {
      const combo = createSeqCombo(currentSeq, suit as Suit, rankOrder, trump);
      if (allowHighCombos || combo.type !== 'Hundred') {
        combos.push(combo);
      }
    }
  });

  return combos;
};

const createSeqCombo = (seq: Card[], suit: Suit, rankOrder: Rank[], trump: TrumpType | null): Combination => {
  const len = seq.length;
  const highRank = seq[len - 1].rank;
  const rankIdx = rankOrder.indexOf(highRank);
  
  let type: 'Terz' | 'Fifty' | 'Hundred' = 'Terz';
  let points = 20;
  if (len === 4) { type = 'Fifty'; points = 50; }
  if (len >= 5) { type = 'Hundred'; points = 100; }

  // Strength calculation: 
  // Length is most important (len * 1000)
  // Rank is second (rankIdx * 10)
  // Trump suit gives a small bonus (+5)
  const isTrump = trump !== null && suit.toString() === trump.toString();
  const strength = (len * 1000) + (rankIdx * 10) + (isTrump ? 5 : 0);

  return {
    type,
    points,
    rankOrder: rankIdx,
    suit,
    highRank,
    strength,
    cardIds: seq.map(c => c.id)
  };
};

export const resolveTrick = (playerCard: Card, aiCard: Card, trump: TrumpType, leadSuit: Suit): 'player' | 'ai' => {
  const result = compareCards(playerCard, aiCard, trump, leadSuit);
  return result === 1 ? 'player' : 'ai';
};

export const calculateRoundScore = (
  playedTricks: { player: Card; ai: Card; winner: 'player' | 'ai' }[],
  trump: TrumpType,
  bidder: 'player' | 'ai',
  playerCombos: Combination[],
  aiCombos: Combination[],
  lastWinner: 'player' | 'ai',
  blotDeclared: { player: boolean; ai: boolean },
  allCombinationsDisabled: boolean = false
) => {
  if (allCombinationsDisabled) {
    blotDeclared = { player: false, ai: false };
    playerCombos = [];
    aiCombos = [];
  }
  let pPoints = 0;
  let aPoints = 0;

  const pTricks = playedTricks.filter(t => t.winner === 'player').length;
  const aTricks = playedTricks.filter(t => t.winner === 'ai').length;

  playedTricks.forEach(t => {
    const val = getCardValue(t.player.rank, t.player.suit, trump) + getCardValue(t.ai.rank, t.ai.suit, trump);
    if (t.winner === 'player') pPoints += val;
    else aPoints += val;
  });

  // Last trick bonus
  if (lastWinner === 'player') pPoints += 10;
  else aPoints += 10;

  // Remainder Logic (Total 162 in both modes)
  const isNoTrump = trump === TrumpType.NO_TRUMP;
  const totalPoints = 162;
  const currentTotal = pPoints + aPoints;
  const remainder = totalPoints - currentTotal;
  
  if (remainder > 0) {
    if (pPoints > aPoints) pPoints += remainder;
    else if (aPoints > pPoints) aPoints += remainder;
    else {
      if (lastWinner === 'player') pPoints += remainder;
      else aPoints += remainder;
    }
  }

  // Capot: If a player didn't get any points, the opponent gets +21 bonus
  if (pPoints === 0 && aPoints > 0) aPoints += 21;
  if (aPoints === 0 && pPoints > 0) pPoints += 21;

  // Combinations: only strongest counts
  let pComboPoints = 0;
  let aComboPoints = 0;
  let pAwardedCombos: { type: string; points: number; highRank?: Rank }[] = [];
  let aAwardedCombos: { type: string; points: number; highRank?: Rank }[] = [];

  const allCombos = [
    ...playerCombos.map(c => ({ ...c, owner: 'player' as const })),
    ...aiCombos.map(c => ({ ...c, owner: 'ai' as const }))
  ];

  if (allCombos.length > 0) {
    const sorted = allCombos.sort((a, b) => b.strength - a.strength);
    const strongest = sorted[0];
    const secondStrongest = sorted.length > 1 ? sorted[1] : null;

    if (!secondStrongest || strongest.strength > secondStrongest.strength) {
      if (strongest.owner === 'player') {
        pComboPoints = playerCombos.reduce((sum, c) => sum + c.points, 0);
        pAwardedCombos = playerCombos.map(c => ({ type: c.type, points: c.points, highRank: c.highRank }));
      } else {
        aComboPoints = aiCombos.reduce((sum, c) => sum + c.points, 0);
        aAwardedCombos = aiCombos.map(c => ({ type: c.type, points: c.points, highRank: c.highRank }));
      }
    } else if (strongest.strength === secondStrongest.strength) {
      if (strongest.owner === secondStrongest.owner) {
        if (strongest.owner === 'player') {
          pComboPoints = playerCombos.reduce((sum, c) => sum + c.points, 0);
          pAwardedCombos = playerCombos.map(c => ({ type: c.type, points: c.points, highRank: c.highRank }));
        } else {
          aComboPoints = aiCombos.reduce((sum, c) => sum + c.points, 0);
          aAwardedCombos = aiCombos.map(c => ({ type: c.type, points: c.points, highRank: c.highRank }));
        }
      }
    }
  }

  // Blot is separate (only in Trump mode)
  if (!isNoTrump) {
    if (blotDeclared.player) {
      pComboPoints += 20;
      pAwardedCombos.push({ type: 'Blot', points: 20 });
    }
    if (blotDeclared.ai) {
      aComboPoints += 20;
      aAwardedCombos.push({ type: 'Blot', points: 20 });
    }
  }

  const pTotal = pPoints + pComboPoints;
  const aTotal = aPoints + aComboPoints;

  const pBreakdown: RoundBreakdown = {
    tricks: pPoints,
    combos: pAwardedCombos,
    total: pTotal,
    finalPaper: 0, // Will be set in resolveRound
    originalTricks: pPoints,
    originalCombos: pAwardedCombos
  };

  const aBreakdown: RoundBreakdown = {
    tricks: aPoints,
    combos: aAwardedCombos,
    total: aTotal,
    finalPaper: 0, // Will be set in resolveRound
    originalTricks: aPoints,
    originalCombos: aAwardedCombos
  };

  // Bait logic
  if (bidder === 'player' && pTotal <= aTotal) {
    return {
      player: { ...pBreakdown, tricks: 0, combos: [], total: 0 },
      ai: { 
        ...aBreakdown,
        tricks: pPoints + aPoints, 
        combos: [...aAwardedCombos, ...pAwardedCombos.map(c => ({ ...c, type: `Твое ${c.type}` }))], 
        total: pTotal + aTotal
      },
      isBait: true,
      bidder
    };
  } else if (bidder === 'ai' && aTotal <= pTotal) {
    return {
      player: { 
        ...pBreakdown,
        tricks: pPoints + aPoints, 
        combos: [...pAwardedCombos, ...aAwardedCombos.map(c => ({ ...c, type: `AI ${c.type}` }))], 
        total: pTotal + aTotal
      },
      ai: { ...aBreakdown, tricks: 0, combos: [], total: 0 },
      isBait: true,
      bidder
    };
  }

  return {
    player: pBreakdown,
    ai: aBreakdown,
    isBait: false,
    bidder
  };
};
