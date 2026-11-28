import React, { useState, useEffect } from 'react';
import { Layers, ZapOff, Users, Bot, KeyRound, Trash2 } from 'lucide-react';
import { GameState } from '../types';
import { OnlineRoomDoc, UserProfile } from '../utils/firestorePayloads';

interface LobbyViewProps {
  state: GameState;
  userProfile: UserProfile | null;
  isSignedIn: boolean;
  waitingRooms: OnlineRoomDoc[];
  roomsError: string | null;
  roomActionError?: string | null;
  roomActionDebug?: string | null;
  onRetryRooms: () => void;
  onDismissRoomActionError?: () => void;
  roomAction: 'creating' | 'joining' | null;
  botsEnabled: boolean;
  initialJoinCode?: string;
  onUpdateSettings: (patch: Partial<GameState>) => void;
  onCreateBotGame: () => void;
  onCreateOnlineGame: () => void;
  onJoinOnlineByCode: (code: string) => void;
  onOpenOwnRoom: (code: string) => void;
  onCancelOwnRoom: (code: string) => void;
  onOpenAuth: () => void;
}

export const LobbyView: React.FC<LobbyViewProps> = ({
  state,
  userProfile,
  isSignedIn,
  waitingRooms,
  roomsError,
  roomActionError,
  roomActionDebug,
  onRetryRooms,
  onDismissRoomActionError,
  roomAction,
  botsEnabled,
  initialJoinCode = '',
  onUpdateSettings,
  onCreateBotGame,
  onCreateOnlineGame,
  onJoinOnlineByCode,
  onOpenOwnRoom,
  onCancelOwnRoom,
  onOpenAuth,
}) => {
  const [mobileTab, setMobileTab] = useState<'rooms' | 'create'>('rooms');
  const [createMode, setCreateMode] = useState<'friend' | 'ai'>('friend');
  const [joinCode, setJoinCode] = useState(initialJoinCode);

  useEffect(() => {
    if (initialJoinCode) {
      setJoinCode(initialJoinCode);
    }
  }, [initialJoinCode]);

  useEffect(() => {
    if (!botsEnabled && createMode === 'ai') {
      setCreateMode('friend');
    }
  }, [botsEnabled, createMode]);

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onJoinOnlineByCode(joinCode);
  };

  const activeMode = botsEnabled ? createMode : 'friend';
  const canPlayOnline = Boolean(isSignedIn && userProfile?.registrationComplete);

  return (
    <div className="flex-1 w-full bg-[#12141c] flex flex-col lg:flex-row overflow-hidden">
      {/* Mobile / Tablet Tab Switcher (hidden on desktop lg+) */}
      <div className="lg:hidden px-3 py-2 bg-[#161922] border-b border-white/10 flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={() => setMobileTab('rooms')}
          className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer ${
            mobileTab === 'rooms'
              ? 'bg-[#e91e63] text-white'
              : 'bg-[#1f2432] text-slate-300 hover:text-white'
          }`}
        >
          Столы ({waitingRooms.length})
        </button>
        <button
          type="button"
          onClick={() => setMobileTab('create')}
          className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer ${
            mobileTab === 'create'
              ? 'bg-[#e91e63] text-white'
              : 'bg-[#1f2432] text-slate-300 hover:text-white'
          }`}
        >
          Создать стол
        </button>
      </div>

      {/* Active Online Tables List */}
      <div
        className={`${
          mobileTab === 'rooms' ? 'flex' : 'hidden lg:flex'
        } flex-1 flex-col overflow-hidden border-b lg:border-b-0 lg:border-r border-white/10 min-h-0`}
      >
        {roomsError && (
          <div
            role="alert"
            className="flex items-center justify-between gap-3 px-3 sm:px-4 py-2 bg-rose-950/50 border-b border-rose-400/20 text-xs text-rose-100"
          >
            <span className="min-w-0 flex-1 leading-relaxed">{roomsError}</span>
            <button
              type="button"
              onClick={onRetryRooms}
              className="shrink-0 underline underline-offset-2 hover:text-white"
            >
              Повторить
            </button>
          </div>
        )}

        {/* Online Friend Invite / Join Strip */}
        <div className="px-3 sm:px-4 py-2.5 bg-[#161923] border-b border-white/10 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <form
            onSubmit={handleJoinSubmit}
            className="flex items-center gap-2 flex-1 min-w-[220px] max-w-md"
          >
            <KeyRound size={15} className="text-[#e91e63] shrink-0" />
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="Код стола друга (например, AB12CD)"
              aria-label="Код стола друга"
              maxLength={16}
              className="flex-1 min-w-0 bg-[#11131b] border border-white/15 rounded-md px-2.5 py-1.5 text-xs font-mono text-white placeholder:text-slate-500 outline-none focus:border-[#e91e63]"
            />
            <button
              type="submit"
              disabled={roomAction !== null}
              className="px-3 py-1.5 rounded-md bg-[#23473c] hover:bg-[#2d5a4c] border border-emerald-500/40 text-emerald-300 text-xs font-bold uppercase tracking-wider cursor-pointer shrink-0 disabled:opacity-60 disabled:cursor-wait"
            >
              {roomAction === 'joining' ? 'Подключение…' : 'Войти'}
            </button>
          </form>

          {!userProfile?.registrationComplete && (
            <button
              type="button"
              onClick={onOpenAuth}
              className="text-[11px] font-semibold text-amber-300 hover:text-amber-200 underline underline-offset-2 cursor-pointer"
            >
              Войдите через Google и завершите регистрацию, чтобы играть с другом
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {/* Mobile Compact Room Cards (< 768px) */}
          <div className="md:hidden p-3 space-y-2.5">
            {botsEnabled && (
              <button
                type="button"
                onClick={onCreateBotGame}
                className="w-full py-2.5 btn-vivaro text-xs uppercase tracking-widest cursor-pointer"
              >
                Игра против AI
              </button>
            )}

            {waitingRooms.length === 0 ? (
              <div className="bg-[#1a1d27] border border-white/10 rounded-xl p-5 text-center space-y-3">
                <Users size={28} className="mx-auto text-slate-500" />
                <p className="text-xs text-slate-300 leading-relaxed">
                  {canPlayOnline
                    ? 'Открытых столов пока нет. Создайте стол и отправьте другу код. Оба игрока должны быть зарегистрированы.'
                    : 'Войдите через Google и завершите регистрацию профиля, чтобы создавать столы и присоединяться к друзьям.'}
                </p>
                {!canPlayOnline ? (
                  <button
                    type="button"
                    onClick={onOpenAuth}
                    className="btn-vivaro px-5 py-2 text-xs uppercase tracking-wider cursor-pointer"
                  >
                    Войти в аккаунт
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setMobileTab('create')}
                    className="btn-vivaro px-5 py-2 text-xs uppercase tracking-wider cursor-pointer"
                  >
                    Создать стол
                  </button>
                )}
              </div>
            ) : (
              waitingRooms.map((room) => {
                const isMine = Boolean(userProfile?.uid && room.hostUid === userProfile.uid);
                return (
                  <div
                    key={room.roomCode}
                    className="bg-[#1a1d27] border border-white/10 rounded-xl p-3 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white truncate">
                          {room.hostName}
                        </span>
                        <span className="text-[11px] font-mono text-amber-400">
                          {room.roomCode}
                        </span>
                        {!room.config.allowHighCombos && !room.config.allCombinationsDisabled && (
                          <Layers size={12} className="text-slate-400" />
                        )}
                        {room.config.allCombinationsDisabled && (
                          <ZapOff size={12} className="text-slate-400" />
                        )}
                      </div>
                      <div className="flex items-center flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
                        <span className="font-mono font-bold text-[#e5a93c]">
                          {room.config.betAmount.toLocaleString('en-US')}
                        </span>
                        <span className="text-slate-300 font-mono">До {room.config.gameLimit}</span>
                        <span className="text-slate-400 font-mono">
                          {room.config.turnTimeLimit}с / 3м
                        </span>
                        <span className="text-emerald-400">
                          {isMine ? 'ваш стол' : 'в ожидании'}
                        </span>
                      </div>
                    </div>

                    {isMine ? (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => onOpenOwnRoom(room.roomCode)}
                          className="px-3 py-2 bg-[#2a3142] hover:bg-[#353e54] border border-white/15 text-white rounded-lg text-xs font-bold uppercase tracking-wider cursor-pointer"
                        >
                          Открыть
                        </button>
                        <button
                          type="button"
                          onClick={() => onCancelOwnRoom(room.roomCode)}
                          aria-label={`Закрыть стол ${room.roomCode}`}
                          className="p-2 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 rounded-lg cursor-pointer"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onJoinOnlineByCode(room.roomCode)}
                        disabled={roomAction !== null}
                        className="px-4 py-2 bg-[#23473c] hover:bg-[#2d5a4c] border border-emerald-500/40 text-emerald-300 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer shrink-0 disabled:opacity-60 disabled:cursor-wait"
                      >
                        {roomAction === 'joining' ? 'Подключение…' : 'Войти'}
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Desktop / Tablet Table (>= 768px) */}
          <table className="hidden md:table w-full text-left border-collapse">
            <thead className="sticky top-0 bg-[#151821] z-10 border-b border-white/10">
              <tr className="text-[11px] text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-4 font-semibold text-center">Код / Номер</th>
                <th className="py-3 px-3 font-semibold">Игра</th>
                <th className="py-3 px-3 font-semibold">Статус</th>
                <th className="py-3 px-3 font-semibold">Создал</th>
                <th className="py-3 px-3 font-semibold text-center">Счет</th>
                <th className="py-3 px-3 font-semibold text-center">Игрок 2</th>
                <th className="py-3 px-3 font-semibold text-center">Ставка</th>
                <th className="py-3 px-3 font-semibold text-center">До</th>
                <th className="py-3 px-3 font-semibold text-center">Время</th>
                <th className="py-3 px-3 font-semibold text-center">Тип</th>
              </tr>
            </thead>
            <tbody className="text-[13px] divide-y divide-white/5">
              {waitingRooms.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-16 px-6 text-center">
                    <div className="max-w-sm mx-auto space-y-3">
                      <Users size={34} className="mx-auto text-slate-600" />
                      <div className="text-sm font-semibold text-slate-200">
                        Открытых столов пока нет
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        {canPlayOnline
                          ? 'Создайте стол справа и отправьте другу код. Присоединиться смогут только зарегистрированные игроки.'
                          : 'Войдите через Google и завершите регистрацию профиля, чтобы создать стол или подключиться к другу.'}
                      </p>
                      {!canPlayOnline && (
                        <button
                          type="button"
                          onClick={onOpenAuth}
                          className="btn-vivaro px-5 py-2 text-xs uppercase tracking-wider cursor-pointer"
                        >
                          Войти / Регистрация
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                waitingRooms.map((room) => {
                  const isMine = Boolean(userProfile?.uid && room.hostUid === userProfile.uid);
                  return (
                    <tr
                      key={room.roomCode}
                      className="hover:bg-white/[0.03] transition-colors h-14"
                    >
                      <td className="px-4 text-amber-400 text-center font-mono font-bold tabular-nums">
                        {room.roomCode}
                      </td>
                      <td className="px-3 font-semibold text-slate-100">Блот</td>
                      <td className="px-3">
                        <span className="text-xs font-medium text-emerald-400">
                          {isMine ? 'ваш стол' : 'в ожидании'}
                        </span>
                      </td>
                      <td className="px-3 text-slate-200 font-medium">
                        {room.hostName}{' '}
                        <span className="text-slate-500 font-mono text-xs">
                          #{room.hostShortId}
                        </span>
                      </td>
                      <td className="px-3 text-center text-slate-300 font-mono tabular-nums">
                        0:0
                      </td>
                      <td className="px-3 text-center">
                        {isMine ? (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => onOpenOwnRoom(room.roomCode)}
                              className="px-3 py-1.5 bg-[#2a3142] hover:bg-[#353e54] border border-white/15 text-white rounded text-xs font-bold uppercase tracking-wider cursor-pointer whitespace-nowrap"
                            >
                              Открыть
                            </button>
                            <button
                              type="button"
                              onClick={() => onCancelOwnRoom(room.roomCode)}
                              aria-label={`Закрыть стол ${room.roomCode}`}
                              className="p-1.5 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 rounded cursor-pointer"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onJoinOnlineByCode(room.roomCode)}
                            disabled={roomAction !== null}
                            className="px-4 py-1.5 bg-[#23473c] hover:bg-[#2d5a4c] border border-emerald-500/40 text-emerald-300 rounded text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60 disabled:cursor-wait"
                          >
                            {roomAction === 'joining' ? 'Подключение…' : 'Войти'}
                          </button>
                        )}
                      </td>
                      <td className="px-3 text-center font-mono font-bold text-[#e5a93c] tabular-nums">
                        {room.config.betAmount.toLocaleString('en-US')}
                      </td>
                      <td className="px-3 text-center text-slate-200 font-mono tabular-nums">
                        {room.config.gameLimit}
                      </td>
                      <td className="px-3 text-center text-slate-400 font-mono tabular-nums">
                        {room.config.turnTimeLimit}с / 3м
                      </td>
                      <td className="px-3 text-center">
                        <div className="flex justify-center items-center text-slate-400">
                          {!room.config.allowHighCombos && !room.config.allCombinationsDisabled && (
                            <Layers size={14} aria-label="Без высоких комбинаций" />
                          )}
                          {room.config.allCombinationsDisabled && (
                            <ZapOff size={14} aria-label="Без комбинаций" />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Table Settings Panel */}
      <div
        className={`${
          mobileTab === 'create' ? 'flex' : 'hidden lg:flex'
        } flex-1 lg:flex-none w-full lg:w-[320px] bg-[#1a1d27] flex-col shrink-0 min-h-0 overflow-hidden`}
      >
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-5 flex flex-col gap-4">
          <div>
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              Создать стол
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {activeMode === 'ai'
                ? 'Партия против искусственного интеллекта'
                : 'Друг увидит стол в лобби или войдёт по ссылке'}
            </p>
          </div>

          {botsEnabled && (
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#12141c] rounded-lg border border-white/10">
              <button
                type="button"
                onClick={() => setCreateMode('friend')}
                className={`py-2 px-2 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                  activeMode === 'friend'
                    ? 'bg-[#e91e63] text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Users size={14} />
                <span>С другом</span>
              </button>
              <button
                type="button"
                onClick={() => setCreateMode('ai')}
                className={`py-2 px-2 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                  activeMode === 'ai'
                    ? 'bg-[#e91e63] text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Bot size={14} />
                <span>Против AI</span>
              </button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium text-slate-400">Время хода</span>
              <select
                className="bg-[#12141c] border border-white/10 rounded-md px-2.5 py-2 text-xs text-slate-100 outline-none focus:border-[#e91e63]"
                value={state.turnTimeLimit}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  onUpdateSettings({ turnTimeLimit: val, timeLeft: val });
                }}
              >
                <option value={30}>30 сек</option>
                <option value={20}>20 сек</option>
                <option value={15}>15 сек</option>
              </select>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium text-slate-400">Игра до</span>
              <select
                className="bg-[#12141c] border border-white/10 rounded-md px-2.5 py-2 text-xs text-slate-100 outline-none focus:border-[#e91e63]"
                value={state.gameLimit}
                onChange={(e) =>
                  onUpdateSettings({ gameLimit: parseInt(e.target.value, 10) })
                }
              >
                <option value={51}>51</option>
                <option value={101}>101</option>
                <option value={151}>151</option>
              </select>
            </label>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium text-slate-400">Ставка</span>
            <select
              className="bg-[#12141c] border border-white/10 rounded-md px-2.5 py-2 text-xs text-[#e5a93c] font-mono font-semibold outline-none focus:border-[#e91e63]"
              value={state.betAmount}
              onChange={(e) =>
                onUpdateSettings({ betAmount: parseInt(e.target.value, 10) })
              }
            >
              <option value={1000}>1,000</option>
              <option value={5000}>5,000</option>
              <option value={10000}>10,000</option>
              <option value={40000}>40,000</option>
            </select>
          </label>

          {/* Combination Options */}
          <fieldset className="flex flex-col gap-2 pt-2 border-t border-white/10">
            <legend className="text-[11px] font-medium text-slate-400 mb-1">
              Комбинации
            </legend>

            <label className="flex items-center gap-3 cursor-pointer text-xs text-slate-200">
              <input
                type="radio"
                name="comboMode"
                checked={state.allowHighCombos && !state.allCombinationsDisabled}
                onChange={() =>
                  onUpdateSettings({
                    allowHighCombos: true,
                    allCombinationsDisabled: false,
                  })
                }
                className="accent-[#e91e63] w-4 h-4"
              />
              <span>Со всеми комбинациями</span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer text-xs text-slate-200">
              <input
                type="radio"
                name="comboMode"
                checked={!state.allowHighCombos && !state.allCombinationsDisabled}
                onChange={() =>
                  onUpdateSettings({
                    allowHighCombos: false,
                    allCombinationsDisabled: false,
                  })
                }
                className="accent-[#e91e63] w-4 h-4"
              />
              <span className="flex-1">Без Каре и 100</span>
              <Layers size={13} className="text-slate-400" />
            </label>

            <label className="flex items-center gap-3 cursor-pointer text-xs text-slate-200">
              <input
                type="radio"
                name="comboMode"
                checked={state.allCombinationsDisabled}
                onChange={() =>
                  onUpdateSettings({ allCombinationsDisabled: true })
                }
                className="accent-[#e91e63] w-4 h-4"
              />
              <span className="flex-1">Без комбинаций</span>
              <ZapOff size={13} className="text-slate-400" />
            </label>
          </fieldset>
        </div>

        <div className="p-3 sm:p-5 pt-2 border-t border-white/10 bg-[#181b24] shrink-0 space-y-2.5">
          {roomActionError && (
            <div
              role="alert"
              className="px-3 py-2 rounded-lg bg-rose-500/15 border border-rose-500/35 text-[11px] text-rose-200 leading-relaxed space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="break-words">{roomActionError}</span>
                {onDismissRoomActionError && (
                  <button
                    type="button"
                    onClick={onDismissRoomActionError}
                    aria-label="Скрыть ошибку"
                    className="text-rose-300 hover:text-white font-bold shrink-0 cursor-pointer"
                  >
                    ×
                  </button>
                )}
              </div>
              {roomActionDebug && (
                <pre className="max-h-36 overflow-auto rounded bg-black/40 border border-rose-400/20 p-2 text-[10px] font-mono text-rose-100 whitespace-pre-wrap break-all">
                  {roomActionDebug}
                </pre>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={activeMode === 'ai' ? onCreateBotGame : onCreateOnlineGame}
            disabled={roomAction !== null}
            className="w-full py-3 btn-vivaro text-xs uppercase tracking-widest cursor-pointer disabled:opacity-60 disabled:cursor-wait"
          >
            {roomAction === 'creating'
              ? 'Создаём стол…'
              : activeMode === 'ai'
                ? 'Создать стол с AI'
                : 'Создать стол'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LobbyView;
