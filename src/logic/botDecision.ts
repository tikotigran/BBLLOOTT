import { Card, Combination, GamePhase, Rank, Suit, TrumpType } from '../types';
import { canPlayCard, resolveTrick } from './gameLogic';
import { getCardValue } from '../constants';

export type BotBidDecision =
  | { action: 'take'; trump: TrumpType }
  | { action: 'pass' };

export const decideBotBid = (
  phase: GamePhase,
  hand: Card[],
  offeredCard: Card | null,
  isDealer: boolean
): BotBidDecision => {
  if (!offeredCard) return { action: 'pass' };

  if (phase === 'OFFERING_TRUMP') {
    const suitCount = hand.filter((c) => c.suit === offeredCard.suit).length;
    const hasJackOrNine = hand.some(
      (c) =>
        c.suit === offeredCard.suit &&
        (c.rank === Rank.JACK || c.rank === Rank.NINE)
    );
    const isJack = offeredCard.rank === Rank.JACK;

    if (isJack || hasJackOrNine || suitCount >= 2) {
      return {
        action: 'take',
        trump: offeredCard.suit as unknown as TrumpType,
      };
    }
    return { action: 'pass' };
  }

  if (phase === 'SUIT_SELECTION') {
    const possibleSuits = [
      Suit.HEARTS,
      Suit.DIAMONDS,
      Suit.CLUBS,
      Suit.SPADES,
    ].filter((s) => s !== offeredCard.suit);

    let bestSuit = possibleSuits[0];
    let bestScore = -1;

    for (const s of possibleSuits) {
      const suitCards = hand.filter((c) => c.suit === s);
      const hasJack = suitCards.some((c) => c.rank === Rank.JACK) ? 2 : 0;
      const hasNine = suitCards.some((c) => c.rank === Rank.NINE) ? 1.5 : 0;
      const score = suitCards.length + hasJack + hasNine;
      if (score > bestScore) {
        bestScore = score;
        bestSuit = s;
      }
    }

    const bestCount = hand.filter((c) => c.suit === bestSuit).length;
    if (bestCount >= 3 || bestScore >= 4.5 || isDealer) {
      return {
        action: 'take',
        trump: bestSuit as unknown as TrumpType,
      };
    }
    return { action: 'pass' };
  }

  return { action: 'pass' };
};

export const pickBotCard = (
  hand: Card[],
  leadCard: Card | undefined,
  trump: TrumpType
): Card | null => {
  if (hand.length === 0) return null;
  const validCards = hand.filter((c) => canPlayCard(c, hand, leadCard, trump).valid);
  const candidates = validCards.length > 0 ? validCards : hand;

  if (candidates.length === 1) return candidates[0];

  // If responding to a lead card, prefer the cheapest winning card; otherwise cheapest card
  if (leadCard) {
    const winningCards = candidates.filter(
      (c) => resolveTrick(c, leadCard, trump, leadCard.suit) === 'player'
    );
    if (winningCards.length > 0) {
      return [...winningCards].sort(
        (a, b) => getCardValue(a.rank, a.suit, trump) - getCardValue(b.rank, b.suit, trump)
      )[0];
    }
    return [...candidates].sort(
      (a, b) => getCardValue(a.rank, a.suit, trump) - getCardValue(b.rank, b.suit, trump)
    )[0];
  }

  // If leading: prioritize Ace / strong trump or safe high card
  const sortedLead = [...candidates].sort((a, b) => {
    const valDiff = getCardValue(b.rank, b.suit, trump) - getCardValue(a.rank, a.suit, trump);
    return valDiff;
  });
  return sortedLead[0];
};

const COMBO_RANK: Record<Combination['type'], number> = {
  Terz: 1,
  Fifty: 2,
  Hundred: 3,
  Carre: 4,
};

export const pickBotComboToAnnounce = (
  myCombos: Combination[],
  opponentAnnounced: Combination[]
): Combination | null => {
  if (myCombos.length === 0) return null;
  const best = myCombos.reduce((a, b) => (a.strength > b.strength ? a : b));
  const oppBest = opponentAnnounced.length > 0 ? opponentAnnounced[0] : null;
  if (oppBest && COMBO_RANK[best.type] < COMBO_RANK[oppBest.type]) {
    return null;
  }
  return best;
};
