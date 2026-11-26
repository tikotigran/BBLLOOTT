import React from 'react';
import { TrumpType } from '../types';

interface SegmentedAvatarProps {
  label: string;
  playerId: string;
  isActive: boolean;
  showTimer?: boolean;
  timeLeft: number;
  maxTime: number;
  timeBank: number;
  isDealer: boolean;
  isBidder: boolean;
  trump: TrumpType | null;
  tricksWon: number;
  announcedComboLabel?: string | null;
  position: 'top' | 'bottom';
}

const TOTAL_SEGMENTS = 24;

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

export const SegmentedAvatar: React.FC<SegmentedAvatarProps> = ({
  label,
  playerId,
  isActive,
  showTimer = true,
  timeLeft,
  maxTime,
  timeBank,
  isDealer,
  isBidder,
  trump,
  tricksWon,
  announcedComboLabel,
  position,
}) => {
  const timerActive = showTimer && isActive;
  const isTimeBankActive = timerActive && timeLeft === 0;
  const ratio = timerActive
    ? isTimeBankActive
      ? Math.max(0, timeBank / 180)
      : Math.max(0, timeLeft / maxTime)
    : 1;
  const activeSegments = Math.round(ratio * TOTAL_SEGMENTS);

  const formatBank = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const trumpGlyph = trump ? renderTrumpGlyph(trump) : null;

  return (
    <div className="relative flex items-start gap-2.5 select-none">
      {/* Main Avatar + Name Pill */}
      <div className="flex flex-col items-center gap-1.5">
        <div className="relative w-[76px] h-[76px] sm:w-[92px] sm:h-[92px] flex items-center justify-center">
          {/* 24-Segment Radial Ring */}
          <svg
            viewBox="0 0 100 100"
            className="absolute inset-0 w-full h-full -rotate-90"
            aria-hidden="true"
          >
            {Array.from({ length: TOTAL_SEGMENTS }).map((_, i) => {
              const angleDeg = (i / TOTAL_SEGMENTS) * 360;
              const isLit = !timerActive || i < activeSegments;
              let fill = '#4e596c';
              if (timerActive) {
                fill = isLit
                  ? isTimeBankActive
                    ? '#ef4444'
                    : '#22c55e'
                  : '#272c38';
              } else {
                fill = i % 2 === 0 ? '#68748a' : '#586377';
              }
              return (
                <rect
                  key={i}
                  x="47.2"
                  y="3.5"
                  width="5.6"
                  height="8.5"
                  rx="1.2"
                  fill={fill}
                  transform={`rotate(${angleDeg} 50 50)`}
                />
              );
            })}
          </svg>

          {/* Inner Silhouette Avatar */}
          <div className="w-[54px] h-[54px] sm:w-[64px] sm:h-[64px] rounded-full bg-[#6d7c95] border-2 border-[#313847] overflow-hidden shadow-inner flex items-end justify-center relative">
            <svg viewBox="0 0 64 64" className="w-full h-full" aria-hidden="true">
              <circle cx="32" cy="32" r="32" fill="#6d7c95" />
              {/* Diagonal soft shadow */}
              <path d="M22 25 L54 58 L32 64 L12 58 Z" fill="#596880" opacity="0.55" />
              {/* Head & Shoulders Silhouette */}
              <circle cx="32" cy="24" r="11" fill="#3a4759" />
              <path d="M12 62 C13 46 21 39 32 39 C43 39 51 46 52 62 Z" fill="#3a4759" />
            </svg>
          </div>

          {/* TimeBank countdown badge when turn timer expires */}
          {isTimeBankActive && (
            <div className="absolute -top-1.5 bg-red-600 text-white text-[10px] font-mono font-bold px-1.5 py-0.5 rounded shadow tabular-nums">
              {formatBank(timeBank)}
            </div>
          )}

          {/* Dealer Badge */}
          {isDealer && (
            <div
              title="Дилер"
              className="absolute bottom-0.5 left-0.5 w-6 h-6 rounded-full bg-amber-400 border-2 border-[#232732] text-[#111827] text-[10px] font-extrabold flex items-center justify-center shadow"
            >
              D
            </div>
          )}
        </div>

        {/* Name / ID Capsule */}
        <div className="bg-[#222632] border border-white/10 rounded-full px-3 py-1 flex items-center gap-2 shadow-md min-w-[104px] justify-center">
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              isActive ? 'bg-emerald-400' : 'bg-[#8d96a8]'
            }`}
            aria-hidden="true"
          />
          <span className="text-[11px] font-semibold text-slate-200 tracking-tight tabular-nums whitespace-nowrap">
            {label} · {playerId}
          </span>
        </div>
      </div>

      {/* Side Badges: Trump Suit & Captured Tricks Mini-Stack */}
      <div className="flex flex-col items-center gap-2 pt-1">
        {isBidder && trumpGlyph && (
          <div
            title="Козырь раунда"
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#222632] border border-white/15 shadow-lg flex items-center justify-center"
          >
            <span
              className={`text-lg sm:text-xl leading-none font-bold ${
                trumpGlyph.isRed ? 'text-[#ef233c]' : 'text-slate-100'
              }`}
            >
              {trumpGlyph.symbol}
            </span>
          </div>
        )}

        {/* Mini Captured Tricks Stack Icon */}
        <div
          className={`flex items-center gap-1.5 px-1.5 py-1 rounded transition-opacity ${
            tricksWon > 0 ? 'opacity-90' : 'opacity-35'
          }`}
          title={`Взято взяток: ${tricksWon}`}
        >
          <div className="relative w-5 h-5" aria-hidden="true">
            <div className="absolute left-0 top-0.5 w-3.5 h-4.5 rounded-[2px] bg-[#2a2f3c] border border-white/20 -rotate-12" />
            <div className="absolute left-1.5 top-0 w-3.5 h-4.5 rounded-[2px] bg-[#363d4e] border border-white/25 rotate-12" />
          </div>
          {tricksWon > 0 && (
            <span className="text-[11px] font-mono font-bold text-slate-300 tabular-nums">
              {tricksWon}
            </span>
          )}
        </div>

        {/* Announced Combo Callout */}
        {announcedComboLabel && (
          <div
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold shadow-md whitespace-nowrap ${
              position === 'top'
                ? 'bg-slate-100 text-slate-900'
                : 'bg-emerald-500 text-white'
            }`}
          >
            {announcedComboLabel}
          </div>
        )}
      </div>
    </div>
  );
};

export default SegmentedAvatar;
