import React, { useState } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';

interface ScorePanelProps {
  tableId: number;
  gameLimit: number;
  betAmount: number;
  playerScore: number;
  aiScore: number;
  playerRoundScore: number;
  aiRoundScore: number;
  dockedBottom?: boolean;
  playerLabel?: string;
  opponentLabel?: string;
}

export const ScorePanel: React.FC<ScorePanelProps> = ({
  tableId,
  gameLimit,
  betAmount,
  playerScore,
  aiScore,
  playerRoundScore,
  aiRoundScore,
  dockedBottom = true,
  playerLabel = 'Я',
  opponentLabel = 'AI',
}) => {
  const [collapsed, setCollapsed] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );

  React.useEffect(() => {
    const onResize = () => {
      if (window.innerWidth < 768) {
        setCollapsed(true);
      } else {
        setCollapsed(false);
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <aside
      aria-label="Счет игры"
      className={`w-[206px] sm:w-[258px] bg-[#222632] border border-white/10 ${
        dockedBottom ? 'sm:border-b-0 rounded-lg sm:rounded-b-none sm:rounded-t-lg' : 'rounded-lg'
      } shadow-2xl overflow-hidden text-slate-200 select-none`}
    >
      {/* Collapse Toggle Header */}
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
        aria-label={collapsed ? 'Развернуть счет' : 'Свернуть счет'}
        className="w-full h-7 bg-[#2a2f3d] hover:bg-[#323848] border-b border-white/10 flex items-center justify-between px-3 text-slate-300 transition-colors cursor-pointer"
      >
        <span className="text-[11px] font-mono font-bold tabular-nums text-slate-300 sm:hidden">
          {playerLabel} {playerScore} : {aiScore} {opponentLabel}
        </span>
        <span className="hidden sm:inline text-[11px] font-medium text-slate-400">
          Счет
        </span>
        {collapsed ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
      </button>

      {!collapsed && (
        <div className="text-xs">
          {/* Table ID Row */}
          <div className="px-3.5 py-2 border-b border-white/10 flex items-center justify-between gap-2">
            <span className="text-slate-400">Номер</span>
            <span className="px-2.5 py-0.5 rounded bg-[#2d3240] text-[#e5a93c] font-mono font-semibold tabular-nums">
              {tableId}
            </span>
          </div>

          {/* Target & Bet Row */}
          <div className="px-3.5 py-2 border-b border-white/10 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">До</span>
              <span className="px-2 py-0.5 rounded bg-[#2d3240] text-slate-200 font-mono font-bold tabular-nums">
                {gameLimit}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">Ставка</span>
              <span className="px-2 py-0.5 rounded bg-[#2d3240] text-[#e5a93c] font-mono font-semibold tabular-nums">
                {betAmount.toLocaleString('en-US')}
              </span>
            </div>
          </div>

          {/* Player / Opponent Header */}
          <div className="grid grid-cols-2 text-center border-b border-white/10 bg-[#1e222d]">
            <div className="py-1.5 border-r border-white/10 font-semibold text-slate-300 truncate px-1">{playerLabel}</div>
            <div className="py-1.5 font-semibold text-slate-300 truncate px-1">{opponentLabel}</div>
          </div>

          {/* Scores */}
          <div className="grid grid-cols-2 text-center">
            <div className="py-2.5 border-r border-white/10 flex flex-col items-center">
              <span className="text-base font-bold text-white font-mono tabular-nums" data-testid="player-score">
                {playerScore}
              </span>
              <span className="text-[10px] text-slate-400 font-mono tabular-nums">
                раунд: {playerRoundScore}
              </span>
            </div>
            <div className="py-2.5 flex flex-col items-center">
              <span className="text-base font-bold text-white font-mono tabular-nums" data-testid="ai-score">
                {aiScore}
              </span>
              <span className="text-[10px] text-slate-400 font-mono tabular-nums">
                раунд: {aiRoundScore}
              </span>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};

export default ScorePanel;
