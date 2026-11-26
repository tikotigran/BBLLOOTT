import React from 'react';
import { TrumpType } from '../types';

interface MobileLeftSidebarProps {
  tableId: number;
  playerScore: number;
  aiScore: number;
  playerRoundScore: number;
  aiRoundScore: number;
  dealer: 'player' | 'ai';
  bidder: 'player' | 'ai' | null;
  trump: TrumpType | null;
  turn: 'player' | 'ai';
  isPlayingOrBidding: boolean;
  playerHasCardInTrick: boolean;
  aiHasCardInTrick: boolean;
  timeLeft: number;
  maxTime: number;
  playerTimeBank: number;
  aiTimeBank: number;
  showTimers: boolean;
  hideScores: boolean;
  aiComboLabel: string | null;
  playerComboLabel: string | null;
  playerLabel?: string;
  opponentLabel?: string;
}

const renderTrumpGlyph = (trump: TrumpType) => {
  switch (trump) {
    case TrumpType.HEARTS:
      return { symbol: '♥', isRed: true };
    case TrumpType.DIAMONDS:
      return { symbol: '♦', isRed: true };
    case TrumpType.CLUBS:
      return { symbol: '♣', isRed: false };
    case TrumpType.SPADES:
      return { symbol: '♠', isRed: false };
    case TrumpType.NO_TRUMP:
      return { symbol: 'A', isRed: false };
  }
};

const SmoothRingAvatar: React.FC<{
  variant: 'ai' | 'player';
  isActive: boolean;
  showTimer: boolean;
  timeLeft: number;
  maxTime: number;
  timeBank: number;
}> = ({ variant, isActive, showTimer, timeLeft, maxTime, timeBank }) => {
  const timerActive = showTimer && isActive;
  const isTimeBank = timerActive && timeLeft === 0;
  const ratio = timerActive
    ? isTimeBank
      ? Math.max(0.04, timeBank / 180)
      : Math.max(0.04, timeLeft / maxTime)
    : 0.72;

  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - ratio);

  const strokeColor = timerActive
    ? isTimeBank
      ? '#ef4444'
      : '#22c55e'
    : '#949aa6';

  return (
    <div className="relative w-[56px] h-[56px] flex items-center justify-center shrink-0">
      {/* Dark bezel + smooth progress ring */}
      <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full -rotate-90" aria-hidden="true">
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="#222630"
          stroke="#2f3542"
          strokeWidth="6"
        />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="transparent"
          stroke={strokeColor}
          strokeWidth="5.5"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          className="transition-[stroke-dashoffset,stroke] duration-500 ease-linear"
        />
      </svg>

      {variant === 'ai' ? (
        <div className="w-[42px] h-[42px] rounded-full bg-[#8ca0be] border-2 border-[#1b1f29] overflow-hidden flex items-end justify-center relative z-10">
          <svg viewBox="0 0 64 64" className="w-full h-full" aria-hidden="true">
            <circle cx="32" cy="32" r="32" fill="#8ca0be" />
            {/* Neck */}
            <rect x="27" y="34" width="10" height="10" rx="4" fill="#e6b798" />
            {/* White Shirt */}
            <path d="M14 62 C15 47 22 41 32 41 C42 41 49 47 50 62 Z" fill="#f8fafc" />
            <path d="M25 42 L32 49 L39 42 Z" fill="#dbe3ee" />
            {/* Face */}
            <ellipse cx="32" cy="27" rx="10.5" ry="12" fill="#f5caa8" />
            {/* Messy Dark Hair */}
            <path
              d="M20 26 C19 15 26 10 33 10 C41 10 45 16 44 26 L41 21 L37 24 L34 19 L29 24 L25 20 Z"
              fill="#1f232c"
            />
          </svg>
        </div>
      ) : (
        <div className="w-[42px] h-[42px] rounded-full bg-[#18a84c] border-2 border-[#1b1f29] flex items-center justify-center relative z-10 shadow-inner">
          {/* White speech bubble with 3 emerald dots (matches reference mobile player icon) */}
          <svg viewBox="0 0 28 28" className="w-6 h-6" aria-hidden="true">
            <path
              d="M14 4C8.2 4 3.5 8 3.5 13c0 2.3 1 4.4 2.7 6L5 23.5l4.8-1.6c1.3.4 2.7.6 4.2.6 5.8 0 10.5-4 10.5-9.5S19.8 4 14 4z"
              fill="#ffffff"
            />
            <circle cx="9.6" cy="13" r="1.45" fill="#18a84c" />
            <circle cx="14" cy="13" r="1.45" fill="#18a84c" />
            <circle cx="18.4" cy="13" r="1.45" fill="#18a84c" />
          </svg>
        </div>
      )}
    </div>
  );
};

export const MobileLeftSidebar: React.FC<MobileLeftSidebarProps> = ({
  tableId,
  playerScore,
  aiScore,
  playerRoundScore,
  aiRoundScore,
  dealer,
  bidder,
  trump,
  turn,
  isPlayingOrBidding,
  playerHasCardInTrick,
  aiHasCardInTrick,
  timeLeft,
  maxTime,
  playerTimeBank,
  aiTimeBank,
  showTimers,
  hideScores,
  aiComboLabel,
  playerComboLabel,
  playerLabel = 'Я',
  opponentLabel = 'AI',
}) => {
  const trumpGlyph = trump ? renderTrumpGlyph(trump) : null;
  const aiActive = isPlayingOrBidding && turn === 'ai' && !aiHasCardInTrick;
  const playerActive = isPlayingOrBidding && turn === 'player' && !playerHasCardInTrick;

  const hasTopBadge = (bidder === 'ai' && Boolean(trumpGlyph)) || dealer === 'ai';
  const hasBottomBadge = (bidder === 'player' && Boolean(trumpGlyph)) || dealer === 'player';

  return (
    <aside
      aria-label="Панель игроков и счета"
      data-testid="mobile-left-sidebar"
      className="w-[74px] min-[520px]:w-[80px] h-full bg-[#12151e]/55 border-r border-white/[0.06] flex flex-col items-center justify-between py-2.5 px-1 z-30 shrink-0 select-none relative"
    >
      {/* Top: AI Avatar + White Badge + Green Speech Bubble */}
      <div className="flex flex-col items-center gap-2 relative w-full">
        <SmoothRingAvatar
          variant="ai"
          isActive={aiActive}
          showTimer={showTimers}
          timeLeft={timeLeft}
          maxTime={maxTime}
          timeBank={aiTimeBank}
        />

        <div className="relative flex items-center justify-center gap-1 min-h-[28px] w-full">
          {bidder === 'ai' && trumpGlyph && (
            <div
              title="Козырь AI"
              className="w-7 h-7 rounded-full bg-white shadow-md flex items-center justify-center"
            >
              <span
                className={`text-[15px] font-bold leading-none ${
                  trumpGlyph.isRed ? 'text-[#e11d48]' : 'text-[#151820]'
                }`}
              >
                {trumpGlyph.symbol}
              </span>
            </div>
          )}

          {dealer === 'ai' && (
            <div
              title="Дилер"
              className="w-7 h-7 rounded-full bg-white text-[#151820] text-xs font-extrabold shadow-md flex items-center justify-center"
            >
              D
            </div>
          )}

          {/* AI Combo Green Speech Bubble */}
          {aiComboLabel && (
            <div
              className={`absolute left-full ${
                hasTopBadge ? 'top-1/2 -translate-y-1/2' : 'top-0'
              } ml-1 bg-[#169c46] text-white text-[13px] font-semibold px-3.5 py-1.5 rounded-full shadow-lg whitespace-nowrap flex items-center gap-1 z-40 pointer-events-none`}
            >
              <svg
                viewBox="0 0 10 12"
                className="w-2.5 h-3 absolute -left-1.5 top-1/2 -translate-y-1/2 text-[#169c46]"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M10 0 C5 3 1 5 0 6 C1 7 5 9 10 12 Z" />
              </svg>
              <span>{aiComboLabel} ✓</span>
            </div>
          )}
        </div>
      </div>

      {/* Middle: Clean Borderless Score Block (matches reference) */}
      {!hideScores ? (
        <div
          className="w-full flex flex-col items-center text-center my-0.5"
          title={`Счет раунда: ${playerRoundScore} : ${aiRoundScore}`}
          data-testid="mobile-score-box"
        >
          <span className="text-[10px] text-slate-300/60 tracking-tight mb-0.5 tabular-nums">
            {tableId.toString().slice(-7)}
          </span>
          <div className="w-full grid grid-cols-2 divide-x divide-white/15 leading-tight">
            <div className="flex flex-col items-center pr-0.5 min-w-0">
              <span className="text-[10px] text-slate-300/75 font-medium truncate max-w-[34px]">{playerLabel}</span>
              <span
                className="text-[15px] font-semibold text-[#d4a048] tabular-nums mt-0.5"
                data-testid="player-score"
              >
                {playerScore}
              </span>
            </div>
            <div className="flex flex-col items-center pl-0.5 min-w-0">
              <span className="text-[10px] text-slate-300/75 font-medium truncate max-w-[34px]">{opponentLabel}</span>
              <span
                className="text-[15px] font-semibold text-[#d4a048] tabular-nums mt-0.5"
                data-testid="ai-score"
              >
                {aiScore}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1 mt-1.5" aria-hidden="true">
            <span className="w-1 h-1 rounded-full bg-white/40" />
            <span className="w-1 h-1 rounded-full bg-white/40" />
            <span className="w-1 h-1 rounded-full bg-white/40" />
          </div>
        </div>
      ) : (
        <div />
      )}

      {/* Bottom: White Badge + White Combo Bubble + Player Avatar */}
      <div className="flex flex-col items-center gap-2 relative w-full">
        <div className="relative flex items-center justify-center gap-1 min-h-[28px] w-full">
          {bidder === 'player' && trumpGlyph && (
            <div
              title="Ваш козырь"
              className="w-7 h-7 rounded-full bg-white shadow-md flex items-center justify-center"
            >
              <span
                className={`text-[15px] font-bold leading-none ${
                  trumpGlyph.isRed ? 'text-[#e11d48]' : 'text-[#151820]'
                }`}
              >
                {trumpGlyph.symbol}
              </span>
            </div>
          )}

          {dealer === 'player' && (
            <div
              title="Дилер"
              className="w-7 h-7 rounded-full bg-white text-[#151820] text-xs font-extrabold shadow-md flex items-center justify-center"
            >
              D
            </div>
          )}

          {/* Player Combo White Speech Bubble */}
          {playerComboLabel && (
            <div
              className={`absolute left-full ${
                hasBottomBadge ? 'top-1/2 -translate-y-1/2' : 'bottom-0'
              } ml-1 bg-white text-[#1b1f29] text-[13px] font-semibold px-3.5 py-1.5 rounded-full shadow-lg whitespace-nowrap z-40 pointer-events-none`}
            >
              <svg
                viewBox="0 0 10 12"
                className="w-2.5 h-3 absolute -left-1.5 top-1/2 -translate-y-1/2 text-white"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M10 0 C5 3 1 5 0 6 C1 7 5 9 10 12 Z" />
              </svg>
              <span>{playerComboLabel}</span>
            </div>
          )}
        </div>

        <SmoothRingAvatar
          variant="player"
          isActive={playerActive}
          showTimer={showTimers}
          timeLeft={timeLeft}
          maxTime={maxTime}
          timeBank={playerTimeBank}
        />
      </div>
    </aside>
  );
};

export default MobileLeftSidebar;
