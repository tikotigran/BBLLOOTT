import React, { useState, useRef, useEffect } from 'react';
import {
  Menu,
  Info,
  Trophy,
  X,
  SlidersHorizontal,
  Volume2,
  VolumeX,
  HelpCircle,
  RotateCcw,
  LogOut,
  User,
} from 'lucide-react';

interface MobileTopBarProps {
  tableId: number;
  gameLimit: number;
  betAmount: number;
  roundNumber: number;
  playerTricksWon: number;
  aiTricksWon: number;
  playerLabel?: string;
  opponentLabel?: string;
  accountBalance?: number | null;
  isMuted: boolean;
  onToggleMute: () => void;
  onGoLobby: () => void;
  onNewRound: () => void;
  onOpenRules: () => void;
  onOpenSettings: () => void;
  onOpenAuth: () => void;
}

export const MobileTopBar: React.FC<MobileTopBarProps> = ({
  gameLimit,
  betAmount,
  roundNumber,
  playerTricksWon,
  aiTricksWon,
  playerLabel = 'Я',
  opponentLabel = 'AI',
  accountBalance = null,
  isMuted,
  onToggleMute,
  onGoLobby,
  onNewRound,
  onOpenRules,
  onOpenSettings,
  onOpenAuth,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const balanceDisplay = (
    accountBalance !== null ? accountBalance : betAmount * 5.5 + 755
  ).toLocaleString('ru-RU');

  return (
    <header
      className="w-full h-10 bg-[#151821] border-b border-[#e91e63]/65 flex items-center justify-between px-2.5 z-50 shrink-0 select-none"
      data-testid="mobile-topbar"
    >
      {/* Left: Menu, Info, Balance */}
      <div className="flex items-center gap-2 min-w-0" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((prev) => !prev)}
          aria-label="Меню"
          aria-expanded={menuOpen}
          className="p-1.5 rounded text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0"
        >
          <Menu size={18} />
        </button>

        <button
          type="button"
          onClick={onOpenRules}
          aria-label="Правила игры"
          className="w-5 h-5 rounded-full border border-slate-400/70 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer shrink-0"
        >
          <Info size={12} />
        </button>

        <button
          type="button"
          onClick={onOpenAuth}
          aria-label="Аккаунт и баланс"
          className="flex flex-col items-start leading-tight pl-0.5 truncate cursor-pointer text-left"
        >
          <span className="text-[9px] text-slate-400 font-medium">Баланс &rsaquo;</span>
          <span className="text-[11px] font-mono font-bold text-[#22c55e] tabular-nums truncate">
            {balanceDisplay} ֏
          </span>
        </button>

        {menuOpen && (
          <div className="absolute left-2.5 top-11 w-56 bg-[#222633] border border-white/15 rounded-lg shadow-2xl py-1.5 z-[220]">
            <button
              type="button"
              onClick={() => {
                onOpenSettings();
                setMenuOpen(false);
              }}
              className="w-full px-3.5 py-2.5 text-left text-xs font-semibold text-white hover:bg-[#e91e63]/20 flex items-center gap-2.5 cursor-pointer"
            >
              <SlidersHorizontal size={15} className="text-[#e91e63]" />
              <span>Настроить карты и стол</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onOpenAuth();
                setMenuOpen(false);
              }}
              className="w-full px-3.5 py-2 text-left text-xs font-medium text-slate-200 hover:bg-white/10 flex items-center gap-2.5 cursor-pointer"
            >
              <User size={15} className="text-emerald-400" />
              <span>Мой аккаунт</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onToggleMute();
                setMenuOpen(false);
              }}
              className="w-full px-3.5 py-2 text-left text-xs font-medium text-slate-200 hover:bg-white/10 flex items-center gap-2.5 cursor-pointer"
            >
              {isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
              <span>{isMuted ? 'Включить звук' : 'Выключить звук'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onOpenRules();
                setMenuOpen(false);
              }}
              className="w-full px-3.5 py-2 text-left text-xs font-medium text-slate-200 hover:bg-white/10 flex items-center gap-2.5 cursor-pointer"
            >
              <HelpCircle size={15} />
              <span>Правила игры</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onNewRound();
                setMenuOpen(false);
              }}
              className="w-full px-3.5 py-2 text-left text-xs font-medium text-slate-200 hover:bg-white/10 flex items-center gap-2.5 cursor-pointer"
            >
              <RotateCcw size={15} />
              <span>Новая раздача</span>
            </button>

            <div className="my-1 border-t border-white/10" />

            <button
              type="button"
              onClick={() => {
                onGoLobby();
                setMenuOpen(false);
              }}
              className="w-full px-3.5 py-2 text-left text-xs font-medium text-rose-400 hover:bg-white/10 flex items-center gap-2.5 cursor-pointer"
            >
              <LogOut size={15} />
              <span>Выйти в лобби</span>
            </button>
          </div>
        )}
      </div>

      {/* Center: Compact Trophy + Trick Counts (landscape / wider phones) */}
      <div className="hidden min-[520px]:flex items-center gap-3">
        <div
          title={`Раунд ${roundNumber}`}
          className="w-7 h-7 rounded-full border-2 border-amber-400/80 bg-[#232836] flex items-center justify-center text-amber-300"
        >
          <Trophy size={13} />
        </div>

        <div className="flex items-center gap-1" title={`Ваши взятки: ${playerTricksWon}`}>
          <div className="relative w-6 h-6 rounded-full bg-[#2a3040] border border-white/15 flex items-center justify-center text-[10px] font-mono font-bold text-slate-200">
            <span>{playerLabel.slice(0, 2)}</span>
            <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-[#151821] border border-white/25 text-[9px] flex items-center justify-center tabular-nums">
              {playerTricksWon}
            </span>
          </div>
          <span className="text-[11px] font-mono font-bold text-slate-200 tabular-nums">
            {roundNumber}
          </span>
        </div>

        <div className="relative w-6 h-6 rounded-full bg-[#2a3040] border border-white/15 flex items-center justify-center text-[10px] font-mono font-bold text-slate-300" title={`Взятки соперника: ${aiTricksWon}`}>
          <span>{opponentLabel.slice(0, 2)}</span>
          <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-[#151821] border border-white/25 text-[9px] flex items-center justify-center tabular-nums">
            {aiTricksWon}
          </span>
        </div>
      </div>

      {/* Right: Till / Bet + Close Table */}
      <div className="flex items-center gap-2.5 shrink-0">
        <div className="flex flex-col items-end leading-tight text-[10px]">
          <span className="text-slate-400 font-medium">
            До: <strong className="text-slate-100 font-mono tabular-nums">{gameLimit}</strong>
          </span>
          <span className="text-slate-400 font-medium">
            Ставка:{' '}
            <strong className="text-[#22c55e] font-mono tabular-nums">
              {betAmount.toLocaleString('ru-RU')} ֏
            </strong>
          </span>
        </div>

        <button
          type="button"
          onClick={onGoLobby}
          aria-label="Закрыть стол"
          className="p-1 text-slate-400 hover:text-white rounded hover:bg-white/10 transition-colors cursor-pointer"
        >
          <X size={17} />
        </button>
      </div>
    </header>
  );
};

export default MobileTopBar;
