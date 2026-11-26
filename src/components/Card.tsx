import React from 'react';
import { Card as CardType, Suit, Rank, CardBackTheme } from '../types';
import { motion } from 'motion/react';

interface CardProps {
  card: CardType;
  onClick?: () => void;
  style?: React.CSSProperties;
  hidden?: boolean;
  isPlayable?: boolean;
  isDimmed?: boolean;
  isShowingCombo?: boolean;
  compact?: boolean;
  cardBackTheme?: CardBackTheme;
  showBottomIndex?: boolean;
}

const BACK_THEME_STYLES: Record<
  CardBackTheme,
  { outer: string; inner: string; border: string }
> = {
  slate: { outer: '#667082', inner: '#4c5464', border: 'rgba(207, 213, 223, 0.7)' },
  crimson: { outer: '#882038', inner: '#621325', border: 'rgba(244, 180, 196, 0.55)' },
  emerald: { outer: '#1d694b', inner: '#134934', border: 'rgba(167, 243, 208, 0.5)' },
  navy: { outer: '#2a4475', inner: '#1c2f54', border: 'rgba(191, 219, 254, 0.55)' },
};

const SUIT_LABEL: Record<Suit, string> = {
  [Suit.HEARTS]: 'Червы',
  [Suit.DIAMONDS]: 'Бубны',
  [Suit.CLUBS]: 'Трефы',
  [Suit.SPADES]: 'Пики',
};

const SuitIcon: React.FC<{ suit: Suit; className?: string }> = ({ suit, className = 'w-4 h-4' }) => {
  switch (suit) {
    case Suit.HEARTS:
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
        </svg>
      );
    case Suit.DIAMONDS:
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
          <path d="M12 2L20 12L12 22L4 12Z" />
        </svg>
      );
    case Suit.CLUBS:
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
          <path d="M12 2.5a4.2 4.2 0 0 0-4.2 4.2c0 1.48.77 2.78 1.93 3.53A4.3 4.3 0 0 0 4 14.3a4.2 4.2 0 0 0 7.15 2.98L9.6 21.5h4.8l-1.55-4.22A4.2 4.2 0 0 0 20 14.3a4.3 4.3 0 0 0-5.73-4.07A4.2 4.2 0 0 0 16.2 6.7 4.2 4.2 0 0 0 12 2.5z" />
        </svg>
      );
    case Suit.SPADES:
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
          <path d="M12 2C9 6.2 4 9.7 4 13.8c0 2.6 2.1 4.5 4.6 4.5 1.3 0 2.4-.6 3.1-1.5L10.1 21.5h3.8l-1.6-4.7c.7.9 1.8 1.5 3.1 1.5 2.5 0 4.6-1.9 4.6-4.5C20 9.7 15 6.2 12 2z" />
        </svg>
      );
  }
};

const CourtArtwork: React.FC<{ rank: Rank; isRed: boolean }> = ({ rank, isRed }) => {
  const tunicMain = isRed ? '#c81e2b' : '#242b38';
  const tunicShade = isRed ? '#99121d' : '#161b24';
  const hairColor = rank === Rank.QUEEN ? '#9c621d' : '#4a2b18';
  const skinColor = '#f4c7a5';
  const skinShade = '#e3b08b';

  if (rank === Rank.JACK) {
    return (
      <svg viewBox="0 0 80 100" className="w-full h-full" aria-hidden="true">
        {/* Upright Silver Sword */}
        <polygon points="65,12 68,20 68,72 62,72 62,20" fill="#cbd5e1" stroke="#64748b" strokeWidth="1" />
        <line x1="65" y1="15" x2="65" y2="72" stroke="#94a3b8" strokeWidth="1.2" />
        <rect x="57" y="71" width="16" height="4" rx="1.5" fill="#d97706" />
        <rect x="63" y="75" width="4" height="10" rx="1" fill="#78350f" />

        {/* Shoulders / Tunic */}
        <path d="M16 100 C16 78 26 70 42 70 C54 70 62 77 62 100 Z" fill={tunicMain} />
        <path d="M42 70 C54 70 62 77 62 100 L42 100 Z" fill={tunicShade} />
        <path d="M33 70 L42 82 L51 70 Z" fill="#f8fafc" />

        {/* Neck */}
        <rect x="36" y="61" width="12" height="12" rx="4" fill={skinShade} />

        {/* Head & Hair */}
        <circle cx="42" cy="48" r="15" fill={skinColor} />
        <path d="M27 47 C27 33 36 28 44 28 C53 28 57 36 57 46 C54 40 48 38 42 39 C35 40 31 43 27 47 Z" fill={hairColor} />
        <circle cx="27" cy="49" r="3.2" fill={skinColor} />
      </svg>
    );
  }

  if (rank === Rank.QUEEN) {
    return (
      <svg viewBox="0 0 80 100" className="w-full h-full" aria-hidden="true">
        {/* Flowing Hair Back */}
        <path d="M23 48 C20 68 20 84 26 98 L58 98 C62 84 62 68 59 48 C59 32 51 25 41 25 C31 25 23 32 23 48 Z" fill={hairColor} />

        {/* Royal Gown */}
        <path d="M18 100 C20 78 28 71 41 71 C54 71 62 78 64 100 Z" fill={tunicMain} />
        <path d="M41 71 C54 71 62 78 64 100 L41 100 Z" fill={tunicShade} />
        <path d="M32 71 L41 85 L50 71 Z" fill="#fef3c7" />

        {/* Neck */}
        <rect x="36" y="61" width="10" height="12" rx="4" fill={skinShade} />

        {/* Face */}
        <ellipse cx="41" cy="48" rx="13" ry="15" fill={skinColor} />
        <path d="M28 45 C30 34 37 31 43 32 C49 33 53 38 54 46 C50 41 44 39 38 40 C34 41 30 43 28 45 Z" fill={hairColor} />

        {/* Gold Tiara */}
        <polygon points="31,32 34,20 41,26 48,20 51,32" fill="#f59e0b" stroke="#b45309" strokeWidth="1" />
        <circle cx="41" cy="27" r="2" fill={isRed ? '#dc2626' : '#38bdf8'} />
      </svg>
    );
  }

  // King
  return (
    <svg viewBox="0 0 80 100" className="w-full h-full" aria-hidden="true">
      {/* Sword behind */}
      <polygon points="66,14 69,22 69,74 63,74 63,22" fill="#cbd5e1" stroke="#64748b" strokeWidth="1" />
      <rect x="59" y="73" width="14" height="3.5" rx="1.5" fill="#d97706" />

      {/* Royal Mantle */}
      <path d="M14 100 C16 76 26 68 41 68 C56 68 66 76 68 100 Z" fill={tunicMain} />
      <path d="M41 68 C56 68 66 76 68 100 L41 100 Z" fill={tunicShade} />
      <path d="M31 68 L41 84 L51 68 Z" fill="#fde68a" />

      {/* Head & Beard */}
      <circle cx="41" cy="48" r="14.5" fill={skinColor} />
      <path d="M28 49 C28 60 34 67 41 67 C48 67 54 60 54 49 L49 52 L41 54 L33 52 Z" fill="#5c3a21" />
      <path d="M27 42 C28 33 34 29 41 29 C48 29 54 33 55 42 Z" fill="#5c3a21" />

      {/* Gold Crown */}
      <polygon points="29,33 31,17 37,24 41,15 45,24 51,17 53,33" fill="#fbbf24" stroke="#b45309" strokeWidth="1" />
      <rect x="29" y="31" width="24" height="4" rx="1" fill="#d97706" />
    </svg>
  );
};

const PipGrid: React.FC<{ rank: Rank; suit: Suit }> = ({ rank, suit }) => {
  if (rank === Rank.ACE) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <SuitIcon suit={suit} className="w-9 h-9 sm:w-11 sm:h-11" />
      </div>
    );
  }

  if (rank === Rank.NINE || rank === Rank.TEN) {
    const hasTwoCenter = rank === Rank.TEN;
    return (
      <div className="w-full h-full grid grid-cols-3 items-center justify-items-center py-1 px-1">
        {/* Left column: 4 pips */}
        <div className="flex flex-col justify-between h-full py-0.5">
          <SuitIcon suit={suit} className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
          <SuitIcon suit={suit} className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
          <SuitIcon suit={suit} className="w-3 h-3 sm:w-3.5 sm:h-3.5 rotate-180" />
          <SuitIcon suit={suit} className="w-3 h-3 sm:w-3.5 sm:h-3.5 rotate-180" />
        </div>
        {/* Middle column: 1 pip for 9, 2 pips for 10 */}
        <div className="flex flex-col justify-around h-full py-2">
          <SuitIcon suit={suit} className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
          {hasTwoCenter && <SuitIcon suit={suit} className="w-3 h-3 sm:w-3.5 sm:h-3.5 rotate-180" />}
        </div>
        {/* Right column: 4 pips */}
        <div className="flex flex-col justify-between h-full py-0.5">
          <SuitIcon suit={suit} className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
          <SuitIcon suit={suit} className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
          <SuitIcon suit={suit} className="w-3 h-3 sm:w-3.5 sm:h-3.5 rotate-180" />
          <SuitIcon suit={suit} className="w-3 h-3 sm:w-3.5 sm:h-3.5 rotate-180" />
        </div>
      </div>
    );
  }

  return null;
};

const Card: React.FC<CardProps> = ({
  card,
  onClick,
  style,
  hidden,
  isPlayable = false,
  isDimmed = false,
  isShowingCombo = false,
  compact = false,
  cardBackTheme = 'slate',
  showBottomIndex = false,
}) => {
  const sizeClass = compact
    ? 'w-[58px] h-[84px]'
    : 'w-[66px] h-[96px] sm:w-[96px] sm:h-[138px]';

  if (hidden) {
    const backStyle = BACK_THEME_STYLES[cardBackTheme] || BACK_THEME_STYLES.slate;
    return (
      <div
        className={`${sizeClass} rounded-[7px] p-[3px] shadow-[0_6px_16px_rgba(0,0,0,0.45)] border border-white/20 select-none transition-colors duration-150`}
        style={{ ...style, backgroundColor: backStyle.outer }}
        aria-hidden="true"
      >
        <div
          className="w-full h-full rounded-[5px] border"
          style={{
            backgroundColor: backStyle.inner,
            borderColor: backStyle.border,
            backgroundImage:
              'repeating-linear-gradient(45deg, rgba(255,255,255,0.2) 0px, rgba(255,255,255,0.2) 1px, transparent 1px, transparent 6px), repeating-linear-gradient(-45deg, rgba(255,255,255,0.2) 0px, rgba(255,255,255,0.2) 1px, transparent 1px, transparent 6px)',
          }}
        />
      </div>
    );
  }

  const isRed = card.suit === Suit.HEARTS || card.suit === Suit.DIAMONDS;
  const isCourt = card.rank === Rank.JACK || card.rank === Rank.QUEEN || card.rank === Rank.KING;

  const content = (
    <motion.div
      layoutId={card.id}
      animate={
        isShowingCombo
          ? { y: -32, scale: 1.1 }
          : { y: 0, scale: 1 }
      }
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      whileHover={isPlayable ? { y: -12, scale: 1.04 } : undefined}
      whileTap={isPlayable ? { scale: 0.97 } : undefined}
      className={`${sizeClass} bg-white rounded-[7px] border border-[#d6dae2] shadow-[0_6px_18px_rgba(0,0,0,0.4)] flex flex-col p-1 ${
        compact ? '' : 'sm:p-1.5'
      } select-none relative overflow-hidden transition-opacity duration-150 ${
        isRed ? 'text-[#d91424]' : 'text-[#151820]'
      } ${isDimmed ? 'opacity-55 brightness-[0.72]' : 'opacity-100'} ${
        isShowingCombo ? 'ring-3 ring-amber-400 shadow-[0_0_24px_rgba(251,191,36,0.65)]' : ''
      }`}
      style={style}
    >
      {/* Top-Left Corner Index */}
      <div className={`flex flex-col items-center leading-none ${compact ? 'w-3.5' : 'w-4 sm:w-6'} z-10 shrink-0`}>
        <span
          className={`font-card ${
            compact ? 'text-[17px]' : 'text-[18px] sm:text-[26px]'
          } font-extrabold leading-[0.88] tracking-tight`}
        >
          {card.rank}
        </span>
        <SuitIcon suit={card.suit} className={compact ? 'w-2.5 h-2.5 mt-0.5' : 'w-3 h-3 sm:w-4 sm:h-4 mt-0.5'} />
      </div>

      {/* Main Card Artwork / Pips */}
      <div
        className={`flex-1 relative -mt-2 ${
          isCourt
            ? compact
              ? 'ml-1'
              : 'ml-1.5 sm:ml-2'
            : compact
            ? 'ml-2.5'
            : 'ml-3.5 sm:ml-4'
        } ${showBottomIndex ? (compact ? 'mr-2.5 mb-1.5' : 'mr-3.5 sm:mr-4 mb-2') : 'mr-0.5 mb-0.5'} flex items-center justify-center overflow-hidden`}
      >
        {isCourt ? (
          <CourtArtwork rank={card.rank} isRed={isRed} />
        ) : (
          <PipGrid rank={card.rank} suit={card.suit} />
        )}
      </div>

      {/* Optional Bottom-Right Inverted Index */}
      {showBottomIndex && (
        <div
          className={`absolute bottom-1 right-1 ${
            compact ? '' : 'sm:bottom-1.5 sm:right-1.5'
          } flex flex-col items-center leading-none ${compact ? 'w-3.5' : 'w-4 sm:w-6'} z-10 rotate-180 pointer-events-none`}
          aria-hidden="true"
        >
          <span
            className={`font-card ${
              compact ? 'text-[17px]' : 'text-[18px] sm:text-[26px]'
            } font-extrabold leading-[0.88] tracking-tight`}
          >
            {card.rank}
          </span>
          <SuitIcon suit={card.suit} className={compact ? 'w-2.5 h-2.5 mt-0.5' : 'w-3 h-3 sm:w-4 sm:h-4 mt-0.5'} />
        </div>
      )}
    </motion.div>
  );

  if (onClick && isPlayable) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={`Сыграть ${card.rank} ${SUIT_LABEL[card.suit]}`}
        className="bg-transparent border-0 p-0 m-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e91e63] rounded-[7px]"
      >
        {content}
      </button>
    );
  }

  return content;
};

export default Card;
