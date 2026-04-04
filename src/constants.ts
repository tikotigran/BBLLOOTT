import { Rank, Suit, TrumpType, Card } from './types';

export const NORMAL_POWER: Record<Rank, number> = {
  [Rank.NINE]: 0,
  [Rank.JACK]: 1,
  [Rank.QUEEN]: 2,
  [Rank.KING]: 3,
  [Rank.TEN]: 4,
  [Rank.ACE]: 5,
};

export const TRUMP_POWER: Record<Rank, number> = {
  [Rank.QUEEN]: 0,
  [Rank.KING]: 1,
  [Rank.TEN]: 2,
  [Rank.ACE]: 3,
  [Rank.NINE]: 4,
  [Rank.JACK]: 5,
};

export const NORMAL_POINTS: Record<Rank, number> = {
  [Rank.NINE]: 0,
  [Rank.JACK]: 2,
  [Rank.QUEEN]: 3,
  [Rank.KING]: 4,
  [Rank.TEN]: 10,
  [Rank.ACE]: 11,
};

export const NO_TRUMP_POINTS: Record<Rank, number> = {
  [Rank.NINE]: 0,
  [Rank.JACK]: 2,
  [Rank.QUEEN]: 3,
  [Rank.KING]: 4,
  [Rank.TEN]: 10,
  [Rank.ACE]: 19,
};

export const TRUMP_POINTS: Record<Rank, number> = {
  [Rank.QUEEN]: 3,
  [Rank.KING]: 4,
  [Rank.TEN]: 10,
  [Rank.ACE]: 19,
  [Rank.NINE]: 14,
  [Rank.JACK]: 20,
};

export const getCardValue = (rank: Rank, suit: Suit, trump: TrumpType): number => {
  if (trump === TrumpType.NO_TRUMP) return NO_TRUMP_POINTS[rank];
  
  const isTrump = suit.toString() === trump.toString();
  return isTrump ? TRUMP_POINTS[rank] : NORMAL_POINTS[rank];
};

/**
 * Compares two cards in a trick.
 * Returns 1 if cardA is stronger, -1 if cardB is stronger.
 */
export const compareCards = (cardA: Card, cardB: Card, trump: TrumpType, leadSuit: Suit): number => {
  const isTrumpA = cardA.suit.toString() === trump.toString();
  const isTrumpB = cardB.suit.toString() === trump.toString();

  // If one is trump and other is not
  if (isTrumpA && !isTrumpB) return 1;
  if (!isTrumpA && isTrumpB) return -1;

  // If both are trump
  if (isTrumpA && isTrumpB) {
    return TRUMP_POWER[cardA.rank] > TRUMP_POWER[cardB.rank] ? 1 : -1;
  }

  // If neither is trump
  const isLeadA = cardA.suit === leadSuit;
  const isLeadB = cardB.suit === leadSuit;

  if (isLeadA && !isLeadB) return 1;
  if (!isLeadA && isLeadB) return -1;

  if (isLeadA && isLeadB) {
    return NORMAL_POWER[cardA.rank] > NORMAL_POWER[cardB.rank] ? 1 : -1;
  }

  // If neither is lead suit and neither is trump, first card wins (though this shouldn't happen in resolveTrick)
  return 1;
};
