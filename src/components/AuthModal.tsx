import React, { useState, useEffect } from 'react';
import { User as FirebaseUser, signInWithPopup, signOut } from 'firebase/auth';
import { X, UserCheck, LogOut, Trophy, Wallet, ShieldCheck } from 'lucide-react';
import { auth, googleProvider } from '../firebase';
import { registerOrUpdateUserProfile } from '../services/userService';
import { AvatarTheme, AVATAR_IDS, UserProfile, isValidNickname } from '../utils/firestorePayloads';

interface AuthModalProps {
  firebaseUser: FirebaseUser | null;
  profile: UserProfile | null;
  onClose: () => void;
}

const AVATAR_OPTIONS: { id: AvatarTheme; label: string; color: string }[] = [
  { id: 'classic', label: 'Классик', color: '#6d7c95' },
  { id: 'emerald', label: 'Изумруд', color: '#18a84c' },
  { id: 'crimson', label: 'Vivaro', color: '#e91e63' },
  { id: 'gold', label: 'Золото', color: '#e5a93c' },
];

export const AuthModal: React.FC<AuthModalProps> = ({
  firebaseUser,
  profile,
  onClose,
}) => {
  const [nickname, setNickname] = useState(
    profile?.nickname || firebaseUser?.displayName?.slice(0, 24) || ''
  );
  const [avatarId, setAvatarId] = useState<AvatarTheme>(
    profile?.avatarId && AVATAR_IDS.includes(profile.avatarId)
      ? profile.avatarId
      : 'classic'
  );
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setNickname(profile.nickname);
      setAvatarId(profile.avatarId);
    } else if (firebaseUser?.displayName && !nickname) {
      setNickname(firebaseUser.displayName.slice(0, 24));
    }
  }, [profile, firebaseUser]);

  const handleGoogleSignIn = async () => {
    setError(null);
    setBusy(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: unknown) {
      const code =
        typeof err === 'object' && err !== null && 'code' in err && typeof err.code === 'string'
          ? err.code
          : '';
      const messages: Record<string, string> = {
        'auth/popup-closed-by-user': 'Окно входа было закрыто. Попробуйте ещё раз.',
        'auth/popup-blocked': 'Браузер заблокировал окно входа. Разрешите всплывающие окна для этого сайта.',
        'auth/unauthorized-domain': 'Домен сайта не разрешён в Firebase. Добавьте текущий домен в Firebase Console → Authentication → Settings → Authorized domains.',
        'auth/operation-not-allowed': 'Вход через Google отключён. Включите Google в Firebase Console → Authentication → Sign-in method.',
        'auth/network-request-failed': 'Не удалось подключиться к Firebase. Проверьте интернет-соединение и попробуйте ещё раз.',
        'auth/too-many-requests': 'Слишком много попыток входа. Подождите немного и попробуйте снова.',
      };
      setError(
        messages[code] ||
          `Не удалось войти через Google${code ? ` (${code})` : ''}. Проверьте настройки Firebase Authentication и попробуйте ещё раз.`
      );
    } finally {
      setBusy(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser) return;
    if (!isValidNickname(nickname)) {
      setError('Никнейм должен быть от 2 до 24 символов.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await registerOrUpdateUserProfile(firebaseUser.uid, nickname, avatarId);
      setEditing(false);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Ошибка сохранения профиля. Попробуйте снова.'
      );
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    setBusy(true);
    try {
      await signOut(auth);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const needsRegistration = Boolean(firebaseUser && (!profile || !profile.registrationComplete));

  return (
    <div
      className="fixed inset-0 bg-black/75 backdrop-blur-sm z-[300] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Аккаунт и регистрация"
    >
      <div className="bg-[#222632] border border-white/15 rounded-2xl shadow-2xl w-full max-w-md p-6 text-slate-100">
        <div className="flex items-center justify-between border-b border-white/10 pb-3.5 mb-5">
          <div>
            <h2 className="text-lg font-bold tracking-tight">
              {!firebaseUser
                ? 'Вход и регистрация'
                : needsRegistration
                ? 'Регистрация профиля'
                : 'Мой аккаунт'}
            </h2>
            <p className="text-xs text-slate-400">
              Личный профиль для онлайн-игры с друзьями
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть окно аккаунта"
            className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="mb-4 px-3.5 py-2.5 rounded-lg bg-rose-500/15 border border-rose-500/40 text-xs text-rose-300">
            {error}
          </div>
        )}

        {!firebaseUser ? (
          <div className="space-y-4">
            <div className="bg-[#181b24] border border-white/10 rounded-xl p-4 space-y-2 text-xs text-slate-300 leading-relaxed">
              <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                <ShieldCheck size={16} />
                <span>Единый аккаунт между устройствами</span>
              </div>
              <p>
                Войдите через Google, выберите игровой никнейм — и вы сможете создавать онлайн-столы по ссылке для друзей из любого города, а также сохранять баланс и статистику побед.
              </p>
            </div>

            <button
              type="button"
              disabled={busy}
              onClick={handleGoogleSignIn}
              className="btn-vivaro w-full py-3 text-xs uppercase tracking-wider cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2"
            >
              <span>{busy ? 'Подключение...' : 'Войти через Google'}</span>
            </button>
          </div>
        ) : needsRegistration || editing ? (
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-slate-300">
                Игровой никнейм (2–24 символа)
              </span>
              <input
                type="text"
                value={nickname}
                maxLength={24}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="Например, Tigran777"
                className="bg-[#141720] border border-white/15 rounded-lg px-3.5 py-2.5 text-sm text-white outline-none focus:border-[#e91e63]"
                required
              />
            </label>

            <div>
              <span className="text-xs font-semibold text-slate-300 block mb-2">
                Цвет профиля
              </span>
              <div className="grid grid-cols-4 gap-2">
                {AVATAR_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setAvatarId(opt.id)}
                    className={`p-2 rounded-lg border text-[11px] font-medium flex flex-col items-center gap-1.5 cursor-pointer ${
                      avatarId === opt.id
                        ? 'border-[#e91e63] bg-[#e91e63]/15 text-white'
                        : 'border-white/10 bg-[#141720] text-slate-300 hover:border-white/25'
                    }`}
                  >
                    <span
                      className="w-6 h-6 rounded-full border border-white/25"
                      style={{ backgroundColor: opt.color }}
                    />
                    <span>{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2.5 pt-2">
              {editing && (
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    setError(null);
                  }}
                  className="flex-1 py-2.5 rounded-lg bg-[#2a2f3d] hover:bg-[#353c4e] text-xs font-bold text-slate-200 cursor-pointer"
                >
                  Отмена
                </button>
              )}
              <button
                type="submit"
                disabled={busy}
                className="flex-1 btn-vivaro py-2.5 text-xs uppercase tracking-wider cursor-pointer disabled:opacity-60"
              >
                {busy
                  ? 'Сохранение...'
                  : needsRegistration
                  ? 'Завершить регистрацию'
                  : 'Сохранить'}
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="bg-[#181b24] border border-white/10 rounded-xl p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-11 h-11 rounded-full border-2 border-white/20 flex items-center justify-center text-white font-extrabold text-sm shrink-0"
                  style={{
                    backgroundColor:
                      AVATAR_OPTIONS.find((a) => a.id === profile?.avatarId)?.color ||
                      '#6d7c95',
                  }}
                >
                  {profile?.nickname.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-white truncate flex items-center gap-1.5">
                    <span>{profile?.nickname}</span>
                    <UserCheck size={14} className="text-emerald-400 shrink-0" />
                  </div>
                  <div className="text-[11px] font-mono text-slate-400">
                    ID: {profile?.shortId}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setEditing(true)}
                className="px-3 py-1.5 rounded-lg bg-[#282d3b] hover:bg-[#343b4d] border border-white/10 text-xs font-semibold text-slate-200 cursor-pointer shrink-0"
              >
                Изменить
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <div className="bg-[#181b24] border border-white/10 rounded-xl p-3 text-center">
                <Wallet size={15} className="mx-auto text-emerald-400 mb-1" />
                <div className="text-[10px] text-slate-400">Баланс</div>
                <div className="text-xs font-mono font-bold text-emerald-400 tabular-nums mt-0.5">
                  {profile?.balance.toLocaleString('ru-RU')} ֏
                </div>
              </div>
              <div className="bg-[#181b24] border border-white/10 rounded-xl p-3 text-center">
                <Trophy size={15} className="mx-auto text-[#e5a93c] mb-1" />
                <div className="text-[10px] text-slate-400">Побед</div>
                <div className="text-xs font-mono font-bold text-white tabular-nums mt-0.5">
                  {profile?.wins ?? 0}
                </div>
              </div>
              <div className="bg-[#181b24] border border-white/10 rounded-xl p-3 text-center">
                <span className="text-xs font-bold text-slate-300 block mb-1">♠♥</span>
                <div className="text-[10px] text-slate-400">Игр всего</div>
                <div className="text-xs font-mono font-bold text-white tabular-nums mt-0.5">
                  {profile?.gamesPlayed ?? 0}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 pt-2">
              <button
                type="button"
                disabled={busy}
                onClick={handleLogout}
                className="px-4 py-2.5 rounded-lg bg-[#2a2f3d] hover:bg-rose-500/20 border border-white/10 text-xs font-semibold text-rose-300 flex items-center gap-2 cursor-pointer"
              >
                <LogOut size={14} />
                <span>Выйти</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="btn-vivaro px-6 py-2.5 text-xs uppercase tracking-wider cursor-pointer"
              >
                Готово
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuthModal;
