import test from 'node:test';
import assert from 'node:assert/strict';
import { decideBotBid, pickBotCard, pickBotComboToAnnounce } from './botDecision';
import { Card, Rank, Suit, TrumpType } from '../types';

const c = (suit: Suit, rank: Rank): Card => ({ id: `${suit}-${rank}`, suit, rank });

test('decideBotBid takes offered Jack or matching 9/J and passes weak offered hands', () => {
  const hand = [c(Suit.HEARTS, Rank.NINE), c(Suit.SPADES, Rank.TEN), c(Suit.CLUBS, Rank.NINE)];
  assert.deepEqual(
    decideBotBid('OFFERING_TRUMP', hand, c(Suit.HEARTS, Rank.KING), false),
    { action: 'take', trump: TrumpType.HEARTS }
  );

  assert.deepEqual(
    decideBotBid('OFFERING_TRUMP', hand, c(Suit.DIAMONDS, Rank.QUEEN), false),
    { action: 'pass' }
  );

  // Forced selection as dealer during SUIT_SELECTION never passes
  const forced = decideBotBid('SUIT_SELECTION', hand, c(Suit.DIAMONDS, Rank.QUEEN), true);
  assert.equal(forced.action, 'take');
});

test('pickBotCard always chooses a legal follow-suit card and wins trick cheaply when able', () => {
  const hand = [
    c(Suit.HEARTS, Rank.NINE),
    c(Suit.HEARTS, Rank.ACE),
    c(Suit.SPADES, Rank.TEN),
  ];
  const lead = c(Suit.HEARTS, Rank.KING);
  const picked = pickBotCard(hand, lead, TrumpType.CLUBS);
  assert.equal(picked?.suit, Suit.HEARTS);
  assert.equal(picked?.rank, Rank.ACE);
});

test('pickBotComboToAnnounce skips lower-tier combos when opponent announced higher tier', () => {
  const myTerz = [
    { type: 'Terz' as const, points: 20, rankOrder: 2, strength: 3020 },
  ];
  const oppFifty = [
    { type: 'Fifty' as const, points: 50, rankOrder: 3, strength: 4030 },
  ];
  assert.equal(pickBotComboToAnnounce(myTerz, oppFifty), null);
  assert.equal(pickBotComboToAnnounce(myTerz, [])?.type, 'Terz');
});
