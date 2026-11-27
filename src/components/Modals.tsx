import React from 'react';
import { motion } from 'motion/react';
import { Trophy, ArrowRight, X, Lock } from 'lucide-react';
import { GameState, Rank, TrumpType } from '../types';
import { ROOM_PASSWORD_MAX } from '../utils/firestorePayloads';

interface RoundResultModalProps {
  state: GameState;
  getPaperScore: (points: number) => number;
  translateCombo: (type: string, highRank?: Rank, isConfirmed?: boolean) => string;
  onNextRound: () => void;
  playerLabel?: string;
  opponentLabel?: string;
  canAdvanceRound?: boolean;
}

export const RoundResultModal: React.FC<RoundResultModalProps> = ({
  state,
  getPaperScore,
  translateCombo,
  onNextRound,
  playerLabel = 'Вы',
  opponentLabel = 'AI',
  canAdvanceRound = true,
}) => {
  if (!state.roundBreakdown) return null;

  const { player, ai, isBait, bidder } = state.roundBreakdown;

  const trumpLabel =
    state.trump === TrumpType.HEARTS
      ? '♥'
      : state.trump === TrumpType.DIAMONDS
      ? '♦'
      : state.trump === TrumpType.CLUBS
      ? '♣'
      : state.trump === TrumpType.SPADES
      ? '♠'
      : 'A';

  return (
    <div
      className="fixed inset-0 bg-black/75 backdrop-blur-sm z-[200] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Итоги раунда"
    >
      <motion.div
        initial={{ scale: 0.94, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.18 }}
        className="bg-[#222632] border border-white/15 rounded-2xl shadow-2xl w-full max-w-md p-6 text-slate-100"
      >
        <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-5">
          <div>
            <h2 className="text-xl font-bold tracking-tight">
              Итоги раунда {state.roundNumber}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Заказал козырь: {bidder === 'player' ? playerLabel : opponentLabel}
            </p>
          </div>
          {state.trump && (
            <div className="w-10 h-10 rounded-full bg-[#181b24] border border-white/15 flex items-center justify-center text-xl font-bold">
              <span
                className={
                  state.trump === TrumpType.HEARTS ||
                  state.trump === TrumpType.DIAMONDS
                    ? 'text-[#ef233c]'
                    : 'text-white'
                }
              >
                {trumpLabel}
              </span>
            </div>
          )}
        </div>

        {isBait && (
          <div className="mb-4 bg-rose-500/15 border border-rose-500/40 px-4 py-2.5 rounded-lg text-center">
            <p className="text-rose-400 font-bold text-xs uppercase tracking-wider">
              Байт: все очки переданы сопернику
            </p>
          </div>
        )}

        <div className="space-y-3 mb-6">
          {/* Player */}
          {(() => {
            const isLoser = isBait && bidder === 'player';
            const isWinner = isBait && bidder === 'ai';
            return (
              <div
                className={`p-4 rounded-xl border ${
                  isLoser
                    ? 'bg-rose-950/30 border-rose-500/40'
                    : isWinner
                    ? 'bg-emerald-950/30 border-emerald-500/40'
                    : 'bg-[#191c25] border-white/10'
                }`}
              >
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Вы
                  </span>
                  <div className="flex items-center gap-2">
                    {isLoser && (
                      <span className="text-rose-400 font-bold text-xs uppercase">
                        БАЙТ
                      </span>
                    )}
                    <span
                      className={`text-2xl font-extrabold font-mono tabular-nums ${
                        isLoser ? 'text-rose-400' : 'text-emerald-400'
                      }`}
                    >
                      +{state.playerRoundScore}
                    </span>
                  </div>
                </div>
                <div className="space-y-1 text-xs text-slate-400 border-t border-white/10 pt-2">
                  <div className="flex justify-between">
                    <span>Взятки (очки)</span>
                    <span
                      className={`font-mono tabular-nums ${
                        isLoser ? 'line-through opacity-60' : 'text-slate-200'
                      }`}
                    >
                      {player.originalTricks}
                    </span>
                  </div>
                  {player.originalCombos.map((c, idx) => (
                    <div key={idx} className="flex justify-between">
                      <span>{translateCombo(c.type, c.highRank, true)}</span>
                      <span
                        className={`font-mono tabular-nums ${
                          isLoser ? 'line-through opacity-60' : 'text-slate-200'
                        }`}
                      >
                        +{c.points / 10}
                      </span>
                    </div>
                  ))}
                  {isWinner && (
                    <div className="flex justify-between text-emerald-400 font-semibold pt-1">
                      <span>Бонус за Байт</span>
                      <span className="font-mono tabular-nums flex items-center gap-1">
                        <ArrowRight size={12} />+
                        {getPaperScore(ai.originalTricks) +
                          ai.originalCombos.reduce((s, c) => s + c.points / 10, 0)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* AI */}
          {(() => {
            const isLoser = isBait && bidder === 'ai';
            const isWinner = isBait && bidder === 'player';
            return (
              <div
                className={`p-4 rounded-xl border ${
                  isLoser
                    ? 'bg-rose-950/30 border-rose-500/40'
                    : isWinner
                    ? 'bg-emerald-950/30 border-emerald-500/40'
                    : 'bg-[#191c25] border-white/10'
                }`}
              >
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    {opponentLabel}
                  </span>
                  <div className="flex items-center gap-2">
                    {isLoser && (
                      <span className="text-rose-400 font-bold text-xs uppercase">
                        БАЙТ
                      </span>
                    )}
                    <span
                      className={`text-2xl font-extrabold font-mono tabular-nums ${
                        isLoser ? 'text-rose-400' : 'text-[#e91e63]'
                      }`}
                    >
                      +{state.aiRoundScore}
                    </span>
                  </div>
                </div>
                <div className="space-y-1 text-xs text-slate-400 border-t border-white/10 pt-2">
                  <div className="flex justify-between">
                    <span>Взятки (очки)</span>
                    <span
                      className={`font-mono tabular-nums ${
                        isLoser ? 'line-through opacity-60' : 'text-slate-200'
                      }`}
                    >
                      {ai.originalTricks}
                    </span>
                  </div>
                  {ai.originalCombos.map((c, idx) => (
                    <div key={idx} className="flex justify-between">
                      <span>{translateCombo(c.type, c.highRank, true)}</span>
                      <span
                        className={`font-mono tabular-nums ${
                          isLoser ? 'line-through opacity-60' : 'text-slate-200'
                        }`}
                      >
                        +{c.points / 10}
                      </span>
                    </div>
                  ))}
                  {isWinner && (
                    <div className="flex justify-between text-emerald-400 font-semibold pt-1">
                      <span>Бонус за Байт</span>
                      <span className="font-mono tabular-nums flex items-center gap-1">
                        <ArrowRight size={12} />+
                        {getPaperScore(player.originalTricks) +
                          player.originalCombos.reduce(
                            (s, c) => s + c.points / 10,
                            0
                          )}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </div>

        {canAdvanceRound ? (
          <button
            type="button"
            onClick={onNextRound}
            className="btn-vivaro w-full py-3.5 text-sm uppercase tracking-wider cursor-pointer"
          >
            Следующий раунд
          </button>
        ) : (
          <div className="text-center text-xs text-slate-400 py-2">
            Ожидание следующей раздачи от хоста...
          </div>
        )}
      </motion.div>
    </div>
  );
};

interface GameOverModalProps {
  state: GameState;
  onPlayAgain: () => void;
  onExitLobby: () => void;
  playerLabel?: string;
  opponentLabel?: string;
  isOnline?: boolean;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  state,
  onPlayAgain,
  onExitLobby,
  playerLabel = 'Вы',
  opponentLabel = 'AI',
  isOnline = false,
}) => {
  const playerWon =
    state.aiTimeBank === 0 ||
    (state.playerTimeBank > 0 && state.playerScore >= state.aiScore);

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[300] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Игра завершена"
    >
      <motion.div
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.2 }}
        className="bg-[#222632] border border-white/15 rounded-2xl shadow-2xl w-full max-w-md p-8 text-center text-slate-100"
      >
        <Trophy
          size={64}
          className={`mx-auto mb-4 ${
            playerWon ? 'text-amber-400' : 'text-slate-500'
          }`}
        />
        <h2 className="text-4xl font-extrabold tracking-tight mb-2">
          {playerWon ? 'Победа!' : 'Поражение'}
        </h2>
        <p className="text-sm text-slate-400 mb-6">
          {(state.playerTimeBank === 0 || state.aiTimeBank === 0)
            ? 'Время банка истекло'
            : `Партия до ${state.gameLimit} очков завершена`}
        </p>

        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-[#191c25] border border-white/10 rounded-xl p-4">
            <div className="text-xs text-slate-400 mb-1">{playerLabel}</div>
            <div className="text-3xl font-extrabold font-mono tabular-nums text-emerald-400">
              {state.playerScore}
            </div>
          </div>
          <div className="bg-[#191c25] border border-white/10 rounded-xl p-4">
            <div className="text-xs text-slate-400 mb-1">{opponentLabel}</div>
            <div className="text-3xl font-extrabold font-mono tabular-nums text-[#e91e63]">
              {state.aiScore}
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onExitLobby}
            className="flex-1 py-3 bg-[#191c25] hover:bg-[#2a2f3d] border border-white/10 rounded-xl text-xs font-bold uppercase tracking-wider text-slate-200 cursor-pointer"
          >
            В лобби
          </button>
          <button
            type="button"
            data-start="true"
            onClick={onPlayAgain}
            className="flex-1 py-3 btn-vivaro text-xs uppercase tracking-wider cursor-pointer"
          >
            {isOnline ? 'Новый онлайн-стол' : 'Играть снова'}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

interface RulesModalProps {
  onClose: () => void;
}

export const RulesModal: React.FC<RulesModalProps> = ({ onClose }) => (
  <div
    className="fixed inset-0 bg-black/75 backdrop-blur-sm z-[300] flex items-center justify-center p-4"
    role="dialog"
    aria-modal="true"
    aria-label="Правила Блота"
  >
    <div className="bg-[#222632] border border-white/15 rounded-2xl shadow-2xl w-full max-w-lg p-6 text-slate-200">
      <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
        <h2 className="text-lg font-bold">Правила игры «Блот»</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть правила"
          className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white cursor-pointer"
        >
          <X size={18} />
        </button>
      </div>
      <div className="space-y-3 text-xs leading-relaxed text-slate-300">
        <p>
          <strong>Колода и раздача:</strong> Используется колода из 24 карт (от 9 до Туза). В начале раздается по 5 карт и открывается козырная карта. После выбора козыря игроки добирают до 8 карт.
        </p>
        <p>
          <strong>Ход и взятки:</strong> Обязательно ходить в масть первой карты. Если масти нет — необходимо класть козырь. При игре в козырь нужно перебивать старшим козырем, если он есть на руке.
        </p>
        <p>
          <strong>Комбинации:</strong> Объявляются в первой взятке и показываются перед вторым ходом: Терц (3 карты подряд, +20), 50 (4 карты, +50), 100 (5+ карт, +100), Каре (+100..200). Блот (Король и Дама козыря) приносит +20.
        </p>
        <p>
          <strong>Байт:</strong> Игрок, заказавший козырь, должен набрать больше очков, чем соперник. Иначе все очки раунда переходят сопернику.
        </p>
      </div>
      <div className="mt-5 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="btn-vivaro px-5 py-2 text-xs uppercase tracking-wider cursor-pointer"
        >
          Понятно
        </button>
      </div>
    </div>
  </div>
);

interface JoinPasswordModalProps {
  roomCode: string;
  hostName?: string;
  password: string;
  error: string | null;
  isSubmitting: boolean;
  onPasswordChange: (val: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}

export const JoinPasswordModal: React.FC<JoinPasswordModalProps> = ({
  roomCode,
  hostName,
  password,
  error,
  isSubmitting,
  onPasswordChange,
  onSubmit,
  onClose,
}) => (
  <div
    className="fixed inset-0 bg-black/75 backdrop-blur-sm z-[300] flex items-center justify-center p-4"
    role="dialog"
    aria-modal="true"
    aria-label={`Вход за стол ${roomCode}`}
  >
    <div className="bg-[#222632] border border-white/15 rounded-2xl shadow-2xl w-full max-w-sm p-6 text-slate-100">
      <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#e91e63]/15 border border-[#e91e63]/40 flex items-center justify-center text-[#e91e63]">
            <Lock size={17} />
          </div>
          <div>
            <h2 className="text-base font-bold leading-tight">Вход за стол</h2>
            <p className="text-xs text-slate-400">
              Код: <span className="font-mono font-bold text-amber-400">{roomCode}</span>
              {hostName ? ` · ${hostName}` : ''}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть окно входа"
          className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white cursor-pointer"
        >
          <X size={18} />
        </button>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-slate-300">
            Пароль стола (спросите у друга)
          </span>
          <input
            type="text"
            autoFocus
            autoComplete="off"
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            maxLength={ROOM_PASSWORD_MAX}
            placeholder="Введите пароль"
            className="bg-[#151821] border border-white/15 rounded-lg px-3 py-2.5 text-sm font-mono text-white placeholder:text-slate-500 outline-none focus:border-[#e91e63]"
          />
        </label>

        {error && (
          <div
            role="alert"
            className="bg-rose-950/60 border border-rose-500/40 rounded-lg px-3 py-2 text-xs text-rose-200"
          >
            {error}
          </div>
        )}

        <div className="flex gap-2.5 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 bg-[#181b24] hover:bg-[#2a2f3d] border border-white/10 rounded-lg text-xs font-bold uppercase tracking-wider text-slate-300 cursor-pointer"
          >
            Отмена
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex-1 py-2.5 btn-vivaro text-xs uppercase tracking-wider cursor-pointer disabled:opacity-60 disabled:cursor-wait"
          >
            {isSubmitting ? 'Входим…' : 'Войти за стол'}
          </button>
        </div>
      </form>
    </div>
  </div>
);
