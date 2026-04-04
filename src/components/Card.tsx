import React from 'react';
import { Card as CardType, Suit, Rank } from '../types';
import { motion } from 'motion/react';

interface CardProps {
  card: CardType;
  onClick?: () => void;
  style?: React.CSSProperties;
  hidden?: boolean;
  isPlayable?: boolean;
  isShowingCombo?: boolean;
  isDimmed?: boolean;
}

const Card: React.FC<CardProps> = ({ card, onClick, style, hidden, isPlayable, isShowingCombo, isDimmed }) => {
  const getSuitSymbol = (suit: Suit) => {
    switch (suit) {
      case Suit.HEARTS: return '♥';
      case Suit.DIAMONDS: return '♦';
      case Suit.CLUBS: return '♣';
      case Suit.SPADES: return '♠';
    }
  };

  const getIllustration = (rank: Rank, suit: Suit) => {
    if (rank === Rank.JACK) return '👤';
    if (rank === Rank.QUEEN) return '👸';
    if (rank === Rank.KING) return '🤴';
    return null;
  };

  if (hidden) {
    return (
      <motion.div
        className="w-20 h-28 sm:w-24 sm:h-36 bg-zinc-800 border-2 border-zinc-700 rounded-lg shadow-lg flex items-center justify-center overflow-hidden"
        style={style}
      >
        <div className="w-full h-full bg-[repeating-linear-gradient(45deg,#222,#222_10px,#333_10px,#333_20px)] rounded-md m-1 opacity-50" />
        <div className="absolute inset-0 flex items-center justify-center opacity-10">
          <div className="w-12 h-12 border-4 border-white rounded-full" />
        </div>
      </motion.div>
    );
  }

  const isRed = card.suit === Suit.HEARTS || card.suit === Suit.DIAMONDS;
  const illustration = getIllustration(card.rank, card.suit);

  return (
    <motion.div
      layoutId={card.id}
      onClick={onClick}
      animate={isShowingCombo 
        ? { y: -40, scale: 1.15, boxShadow: '0 0 30px rgba(255,215,0,0.9)' } 
        : { y: 0, scale: 1, boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }
      }
      transition={{ duration: 0.3 }}
      className={`w-20 h-28 sm:w-24 sm:h-36 bg-white rounded-lg shadow-xl flex flex-col p-1.5 select-none relative ${isRed ? 'text-[#e60000]' : 'text-black'} ${isPlayable ? 'cursor-pointer' : 'opacity-60 grayscale cursor-not-allowed'} ${isShowingCombo ? 'ring-4 ring-yellow-500 z-[100] !opacity-100 !grayscale-0' : ''} ${isDimmed ? 'opacity-40 grayscale' : ''}`}
      style={style}
      whileHover={isPlayable ? { scale: 1.05, y: -10, zIndex: 100 } : {}}
      whileTap={isPlayable ? { scale: 0.95 } : {}}
    >
      {/* Top Left */}
      <div className="flex flex-col items-center leading-none w-fit space-y-0.5">
        <span className="text-lg font-black leading-none">{card.rank}</span>
        <span className="text-[16px] leading-none">{getSuitSymbol(card.suit)}</span>
      </div>

      {/* Center Content */}
      <div className="flex-1 flex items-center justify-center relative overflow-hidden">
        {illustration ? (
          <div className="text-5xl sm:text-6xl flex flex-col items-center">
            <span className="z-10">{illustration}</span>
            <span className="absolute inset-0 flex items-center justify-center opacity-10 text-[80px] sm:text-[96px]">
              {getSuitSymbol(card.suit)}
            </span>
          </div>
        ) : (
          <div className="text-[42px] sm:text-[52px] flex flex-col items-center gap-1">
            <span>{getSuitSymbol(card.suit)}</span>
            {card.rank === Rank.TEN && <span className="text-[10px] opacity-50 font-bold">TEN</span>}
          </div>
        )}
      </div>

      {/* Bottom Right */}
      <div className="flex flex-col items-center leading-none rotate-180 self-end w-fit space-y-0.5">
        <span className="text-lg font-black leading-none">{card.rank}</span>
        <span className="text-[16px] leading-none">{getSuitSymbol(card.suit)}</span>
      </div>
    </motion.div>
  );
};

export default Card;
