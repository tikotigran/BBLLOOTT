import React, { useState, useRef, useEffect } from 'react';
import {
  Home,
  List,
  X,
  Volume2,
  VolumeX,
  RotateCcw,
  HelpCircle,
  LogOut,
  SlidersHorizontal,
  User,
} from 'lucide-react';
import { UserProfile } from '../utils/firestorePayloads';

interface TopBarProps {
  currentScreen: 'LOBBY' | 'GAME';
  tableId: number;
  isMuted: boolean;
  userProfile: UserProfile | null;
  isSignedIn: boolean;
  onToggleMute: () => void;
  onGoLobby: () => void;
  onEnterGame: () => void;
  onNewRound: () => void;
  onOpenRules: () => void;
  onOpenSettings: () => void;
  onOpenAuth: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  currentScreen,
  tableId,
  isMuted,
  userProfile,
  isSignedIn,
  onToggleMute,
  onGoLobby,
  onEnterGame,
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

  return (
    <header className="w-full h-11 bg-[#181b24] border-b border-white/10 flex items-center justify-between z-50 shrink-0">
      {/* Left Navigation Tabs */}
      <div className="flex items-stretch h-full">
        <button
          type="button"
          onClick={onGoLobby}
          aria-label="На главную"
          className="w-14 h-full bg-[#222633] hover:bg-[#2b3040] border-r border-white/10 flex items-center justify-center text-slate-300 hover:text-white transition-colors cursor-pointer"
        >
          <Home size={18} />
        </button>

        <button
          type="button"
          onClick={onGoLobby}
          className={`px-7 h-full text-xs font-bold uppercase tracking-wider border-r border-white/10 transition-colors cursor-pointer whitespace-nowrap shrink-0 flex items-center ${
            currentScreen === 'LOBBY'
              ? 'bg-[#222633] text-white border-b-2 border-b-[#e91e63]'
              : 'bg-transparent text-slate-400 hover:text-slate-200 hover:bg-white/5'
          }`}
        >
          Лобби
        </button>

        {currentScreen === 'GAME' && (
          <div className="h-full bg-[#262b38] border-r border-white/10 border-b-2 border-b-[#e91e63] flex items-center pl-4 pr-2 gap-3">
            <button
              type="button"
              onClick={onEnterGame}
              className="text-xs font-mono font-semibold text-slate-100 tabular-nums cursor-pointer whitespace-nowrap"
            >
              {tableId}
            </button>
            <button
              type="button"
              onClick={onGoLobby}
              aria-label="Закрыть стол"
              className="p-1 text-slate-400 hover:text-white rounded hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Right Account + Menu Dropdown */}
      <div className="relative h-full flex items-center gap-2 pr-3" ref={menuRef}>
        <button
          type="button"
          onClick={onOpenAuth}
          className="h-8 px-3 rounded bg-[#222633] hover:bg-[#2b3040] border border-white/10 text-slate-200 flex items-center gap-2 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <User size={14} className={userProfile ? 'text-emerald-400' : 'text-slate-400'} />
          <span>
            {userProfile?.registrationComplete
              ? `${userProfile.nickname} · ${userProfile.balance.toLocaleString('ru-RU')} ֏`
              : isSignedIn
              ? 'Завершить профиль'
              : 'Аккаунт'}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setMenuOpen((prev) => !prev)}
          aria-expanded={menuOpen}
          className="h-8 px-3 rounded hover:bg-white/10 text-slate-200 flex items-center gap-2 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <List size={16} />
          <span>Меню</span>
        </button>

        {menuOpen && (
          <div className="absolute right-3 top-11 w-56 bg-[#222633] border border-white/15 rounded-lg shadow-2xl py-1.5 z-[200]">
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

            {currentScreen === 'GAME' && (
              <>
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
              </>
            )}
          </div>
        )}
      </div>
    </header>
  );
};

export default TopBar;
