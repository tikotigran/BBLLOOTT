import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDeck,
  canPlayCard,
  detectCombos,
  resolveTrick,
  calculateRoundScore,
} from './gameLogic';
import { Rank, Suit, TrumpType, Card } from '../types';

const card = (suit: Suit, rank: Rank): Card => ({
  id: `${suit}-${rank}`,
  suit,
  rank,
});

test('createDeck produces 24 unique cards', () => {
  const deck = createDeck();
  assert.equal(deck.length, 24);
  const uniqueIds = new Set(deck.map((c) => c.id));
  assert.equal(uniqueIds.size, 24);
});

test('canPlayCard enforces following suit and overtrumping', () => {
  const hand = [
    card(Suit.HEARTS, Rank.QUEEN),
    card(Suit.HEARTS, Rank.JACK),
    card(Suit.SPADES, Rank.ACE),
  ];
  const leadTrump = card(Suit.HEARTS, Rank.NINE);

  // Must follow suit
  assert.equal(
    canPlayCard(hand[2], hand, leadTrump, TrumpType.HEARTS).valid,
    false
  );
  // Must overtrump (Jack > Nine in trump)
  assert.equal(
    canPlayCard(hand[0], hand, leadTrump, TrumpType.HEARTS).valid,
    false
  );
  assert.equal(
    canPlayCard(hand[1], hand, leadTrump, TrumpType.HEARTS).valid,
    true
  );
});

test('canPlayCard enforces playing trump when void in lead suit', () => {
  const hand = [card(Suit.HEARTS, Rank.TEN), card(Suit.CLUBS, Rank.ACE)];
  const leadSpade = card(Suit.SPADES, Rank.KING);

  assert.equal(
    canPlayCard(hand[1], hand, leadSpade, TrumpType.HEARTS).valid,
    false
  );
  assert.equal(
    canPlayCard(hand[0], hand, leadSpade, TrumpType.HEARTS).valid,
    true
  );
});

test('detectCombos detects Terz, Fifty, Hundred, and Carre according to flags', () => {
  const hand = [
    card(Suit.HEARTS, Rank.NINE),
    card(Suit.HEARTS, Rank.TEN),
    card(Suit.HEARTS, Rank.JACK),
    card(Suit.HEARTS, Rank.QUEEN),
    card(Suit.HEARTS, Rank.KING),
    card(Suit.SPADES, Rank.JACK),
    card(Suit.CLUBS, Rank.JACK),
    card(Suit.DIAMONDS, Rank.JACK),
  ];

  const allCombos = detectCombos(hand, TrumpType.SPADES, true, false);
  assert.ok(allCombos.some((c) => c.type === 'Hundred' && c.points === 100));
  assert.ok(allCombos.some((c) => c.type === 'Carre' && c.points === 200));

  const noHigh = detectCombos(hand, TrumpType.SPADES, false, false);
  assert.equal(noHigh.length, 0);

  const disabled = detectCombos(hand, TrumpType.SPADES, true, true);
  assert.equal(disabled.length, 0);
});

test('resolveTrick gives trump priority and higher trump rank priority', () => {
  const trumpLead = card(Suit.HEARTS, Rank.ACE);
  const trumpJack = card(Suit.HEARTS, Rank.JACK);
  assert.equal(
    resolveTrick(trumpLead, trumpJack, TrumpType.HEARTS, Suit.HEARTS),
    'ai'
  );
});

test('calculateRoundScore enforces 162 points, Blot +20, and Bait transfer', () => {
  // Construct 8 simple tricks where AI wins all 8 tricks
  const tricks = [
    { player: card(Suit.CLUBS, Rank.NINE), ai: card(Suit.HEARTS, Rank.JACK), winner: 'ai' as const },
    { player: card(Suit.CLUBS, Rank.JACK), ai: card(Suit.HEARTS, Rank.NINE), winner: 'ai' as const },
    { player: card(Suit.CLUBS, Rank.QUEEN), ai: card(Suit.HEARTS, Rank.ACE), winner: 'ai' as const },
    { player: card(Suit.CLUBS, Rank.KING), ai: card(Suit.HEARTS, Rank.TEN), winner: 'ai' as const },
    { player: card(Suit.DIAMONDS, Rank.NINE), ai: card(Suit.HEARTS, Rank.KING), winner: 'ai' as const },
    { player: card(Suit.DIAMONDS, Rank.JACK), ai: card(Suit.HEARTS, Rank.QUEEN), winner: 'ai' as const },
    { player: card(Suit.DIAMONDS, Rank.QUEEN), ai: card(Suit.SPADES, Rank.ACE), winner: 'ai' as const },
    { player: card(Suit.DIAMONDS, Rank.KING), ai: card(Suit.SPADES, Rank.TEN), winner: 'ai' as const },
  ];

  // Player was bidder and won 0 tricks -> Bait!
  const result = calculateRoundScore(
    tricks,
    TrumpType.HEARTS,
    'player',
    [],
    [],
    'ai',
    { player: false, ai: true },
    false
  );

  assert.equal(result.isBait, true);
  assert.equal(result.player.total, 0);
  // 162 (including remainder + 10 last trick) + 21 (Capot) + 20 (Blot)
  assert.equal(result.ai.total, 162 + 21 + 20);
});
