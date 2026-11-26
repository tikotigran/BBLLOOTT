import {
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  serverTimestamp,
  getDoc,
  Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  AvatarTheme,
  UserProfile,
  deriveShortIdFromUid,
  sanitizeNickname,
} from '../utils/firestorePayloads';

export const subscribeUserProfile = (
  uid: string,
  onData: (profile: UserProfile | null) => void
): Unsubscribe => {
  const path = `users/${uid}`;
  const ref = doc(db, 'users', uid);
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      onData(snap.data() as UserProfile);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
};

export const registerOrUpdateUserProfile = async (
  uid: string,
  nickname: string,
  avatarId: AvatarTheme = 'classic'
): Promise<void> => {
  const path = `users/${uid}`;
  const ref = doc(db, 'users', uid);
  const cleanName = sanitizeNickname(nickname);
  if (cleanName.length < 2) {
    throw new Error('Имя должно содержать минимум 2 символа');
  }

  try {
    const existingSnap = await getDoc(ref);
    if (existingSnap.exists()) {
      await updateDoc(ref, {
        nickname: cleanName,
        avatarId,
        registrationComplete: true,
        updatedAt: serverTimestamp(),
      });
    } else {
      const shortId = deriveShortIdFromUid(uid);
      await setDoc(ref, {
        uid,
        nickname: cleanName,
        shortId,
        avatarId,
        balance: 220755,
        gamesPlayed: 0,
        wins: 0,
        registrationComplete: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
};

export const recordUserMatchResult = async (
  uid: string,
  profile: UserProfile,
  didWin: boolean,
  betAmount: number
): Promise<void> => {
  const path = `users/${uid}`;
  const ref = doc(db, 'users', uid);
  const nextGames = Math.min(1000000, (profile.gamesPlayed || 0) + 1);
  const nextWins = Math.min(nextGames, (profile.wins || 0) + (didWin ? 1 : 0));
  const delta = didWin ? betAmount : -betAmount;
  const nextBalance = Math.max(0, Math.min(1000000000, (profile.balance || 0) + delta));

  try {
    await updateDoc(ref, {
      balance: nextBalance,
      gamesPlayed: nextGames,
      wins: nextWins,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
};
