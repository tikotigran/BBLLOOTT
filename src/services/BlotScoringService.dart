import 'dart:math';

/// Suits in the game
enum Suit { hearts, diamonds, clubs, spades }

/// Ranks in the game
enum Rank { nine, ten, jack, queen, king, ace }

/// Game modes/Trump types
enum TrumpType { hearts, diamonds, clubs, spades, noTrump, allTrump }

/// Card model
class Card {
  final Rank rank;
  final Suit suit;
  final String id;

  Card({required this.rank, required this.suit, required this.id});
}

/// Types of combinations
enum CombinationType { blot, terz, fifty, hundred, carre }

/// Combination model
class Combination {
  final CombinationType type;
  final int points;
  final Rank? highRank;
  final Suit? suit;

  Combination({
    required this.type,
    required this.points,
    this.highRank,
    this.suit,
  });
}

/// Player model for scoring
class Player {
  final String name;
  int actualTotalPoints = 0;
  bool isBidder = false;
  bool tookLastTrick = false;
  List<Card> cardsTaken = [];
  List<Combination> declaredCombinations = [];

  Player({required this.name});

  void resetRound() {
    isBidder = false;
    tookLastTrick = false;
    cardsTaken = [];
    declaredCombinations = [];
  }
}

/// Service to handle all Blot scoring logic
class BlotScoringService {
  static const int gameGoal = 1001;

  /// Points for cards when NOT trump
  static const Map<Rank, int> normalPoints = {
    Rank.nine: 0,
    Rank.ten: 10,
    Rank.jack: 2,
    Rank.queen: 3,
    Rank.king: 4,
    Rank.ace: 11,
  };

  /// Points for cards when TRUMP
  static const Map<Rank, int> trumpPoints = {
    Rank.nine: 14,
    Rank.ten: 10,
    Rank.jack: 20,
    Rank.queen: 3,
    Rank.king: 4,
    Rank.ace: 19,
  };

  /// Calculates points for a list of cards based on the trump suit
  int calculateCardPoints(List<Card> cards, TrumpType trump) {
    int points = 0;
    for (var card in cards) {
      bool isTrump = false;
      if (trump == TrumpType.allTrump) {
        isTrump = true;
      } else if (trump != TrumpType.noTrump) {
        isTrump = card.suit.name == trump.name;
      }

      if (isTrump) {
        points += trumpPoints[card.rank] ?? 0;
      } else {
        points += normalPoints[card.rank] ?? 0;
      }
    }
    return points;
  }

  /// Calculates points for declared combinations
  int calculateCombinationPoints(List<Combination> combinations) {
    return combinations.fold(0, (sum, combo) => sum + combo.points);
  }

  /// Returns the "Paper Score" (shortened for UI)
  /// Rules: Divide by 10, if remainder >= 6, round up.
  int paperScore(int totalPoints) {
    int base = totalPoints ~/ 10;
    int remainder = totalPoints % 10;
    return remainder >= 6 ? base + 1 : base;
  }

  /// Calculates total round points for a player (cards + combos + last trick)
  int calculateRoundPoints(Player player, TrumpType trump) {
    int cardPoints = calculateCardPoints(player.cardsTaken, trump);
    int comboPoints = calculateCombinationPoints(player.declaredCombinations);
    int total = cardPoints + comboPoints;
    if (player.tookLastTrick) total += 10;
    return total;
  }

  /// Updates total points for a player after a round
  void updateTotalPoints(Player player, int roundPoints) {
    player.actualTotalPoints += roundPoints;
  }

  /// Finalizes the round and updates total points for both players.
  /// Handles: 162 points total logic, Bait logic, Capot logic, and Last Trick bonus.
  Map<String, int> finalizeRound({
    required Player player1,
    required Player player2,
    required TrumpType trump,
  }) {
    // 1. Calculate card points for both
    int p1Cards = calculateCardPoints(player1.cardsTaken, trump);
    int p2Cards = calculateCardPoints(player2.cardsTaken, trump);

    // 2. Add Last Trick Bonus (+10)
    if (player1.tookLastTrick) p1Cards += 10;
    if (player2.tookLastTrick) p2Cards += 10;

    // 3. Remainder Logic (Total 162)
    // The sum of card points + last trick should be 162.
    // If it's less, the remainder goes to the round winner.
    int currentTotal = p1Cards + p2Cards;
    int remainder = 162 - currentTotal;
    
    // Determine round winner (who got more card points + last trick)
    if (remainder > 0) {
      if (p1Cards > p2Cards) {
        p1Cards += remainder;
      } else if (p2Cards > p1Cards) {
        p2Cards += remainder;
      } else {
        // If equal, usually bidder loses or points are split, 
        // but here we'll give it to the one who took the last trick as a tie-breaker
        if (player1.tookLastTrick) p1Cards += remainder;
        else p2Cards += remainder;
      }
    }

    // 4. Calculate Combination Points (Added ONLY after round)
    int p1Combo = calculateCombinationPoints(player1.declaredCombinations);
    int p2Combo = calculateCombinationPoints(player2.declaredCombinations);

    // 5. Capot Logic (+21 if opponent got 0 points)
    // Capot is checked on card points (including last trick and remainder)
    if (p1Cards == 0 && p2Cards > 0) p2Cards += 21;
    if (p2Cards == 0 && p1Cards > 0) p1Cards += 21;

    // 6. Total Round Points
    int p1RoundTotal = p1Cards + p1Combo;
    int p2RoundTotal = p2Cards + p2Combo;

    // 7. Bait Logic (Байт)
    // If bidder's total < opponent's total, all points go to opponent
    int p1Final = p1RoundTotal;
    int p2Final = p2RoundTotal;

    if (player1.isBidder && p1RoundTotal < p2RoundTotal) {
      p2Final = p1RoundTotal + p2RoundTotal;
      p1Final = 0;
    } else if (player2.isBidder && p2RoundTotal < p1RoundTotal) {
      p1Final = p1RoundTotal + p2RoundTotal;
      p2Final = 0;
    }

    // 8. Update Actual Total Points
    updateTotalPoints(player1, p1Final);
    updateTotalPoints(player2, p2Final);

    return {
      player1.name: p1Final,
      player2.name: p2Final,
    };
  }

  /// Checks if a player has reached the game goal (1001 points)
  String? checkWinner(Player player1, Player player2) {
    if (player1.actualTotalPoints >= gameGoal && player1.actualTotalPoints > player2.actualTotalPoints) {
      return player1.name;
    }
    if (player2.actualTotalPoints >= gameGoal && player2.actualTotalPoints > player1.actualTotalPoints) {
      return player2.name;
    }
    return null;
  }

  /// Helper to detect combinations in a hand (for auto-calculation)
  List<Combination> detectCombinationsInHand(List<Card> hand, TrumpType trump) {
    List<Combination> combos = [];
    
    // 1. Carre (4 of a kind)
    Map<Rank, List<Card>> rankGroups = {};
    for (var card in hand) {
      rankGroups[card.rank] = (rankGroups[card.rank] ?? [])..add(card);
    }

    rankGroups.forEach((rank, cards) {
      if (cards.length == 4) {
        int points = 100;
        bool isNoTrump = trump == TrumpType.noTrump;
        
        if (isNoTrump) {
          if (rank == Rank.ace) points = 190;
          else if (rank == Rank.nine) points = 0;
          else points = 100;
        } else {
          if (rank == Rank.jack) points = 200;
          else if (rank == Rank.nine) points = 140;
          else if (rank == Rank.ace) points = 110;
          else points = 100;
        }
        
        if (points > 0) {
          combos.add(Combination(type: CombinationType.carre, points: points, highRank: rank));
        }
      }
    });

    // 2. Sequences (Terz, Fifty, Hundred)
    for (var suit in Suit.values) {
      List<Card> suitCards = hand.where((c) => c.suit == suit).toList();
      // Sort by rank index
      suitCards.sort((a, b) => a.rank.index.compareTo(b.rank.index));
      
      int seqLen = 1;
      for (int i = 0; i < suitCards.length - 1; i++) {
        if (suitCards[i+1].rank.index == suitCards[i].rank.index + 1) {
          seqLen++;
        } else {
          _addSequenceIfValid(combos, seqLen, suitCards[i].rank, suit);
          seqLen = 1;
        }
      }
      _addSequenceIfValid(combos, seqLen, suitCards.last.rank, suit);
    }

    // 3. Blot (King and Queen of trump)
    if (trump != TrumpType.noTrump && trump != TrumpType.allTrump) {
      Suit trumpSuit = Suit.values.firstWhere((s) => s.name == trump.name);
      bool hasKing = hand.any((c) => c.suit == trumpSuit && c.rank == Rank.king);
      bool hasQueen = hand.any((c) => c.suit == trumpSuit && c.rank == Rank.queen);
      if (hasKing && hasQueen) {
        combos.add(Combination(type: CombinationType.blot, points: 20, suit: trumpSuit));
      }
    }

    return combos;
  }

  void _addSequenceIfValid(List<Combination> combos, int len, Rank highRank, Suit suit) {
    if (len == 3) combos.add(Combination(type: CombinationType.terz, points: 20, highRank: highRank, suit: suit));
    if (len == 4) combos.add(Combination(type: CombinationType.fifty, points: 50, highRank: highRank, suit: suit));
    if (len >= 5) combos.add(Combination(type: CombinationType.hundred, points: 100, highRank: highRank, suit: suit));
  }
}
