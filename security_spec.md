# Firestore Security Specification (Phase 0)

## 1. Data Invariants
1. **Owner-Only Accounts**: A `users/{userId}` document belongs exclusively to `request.auth.uid == userId` (`email_verified == true`). No PII (`email`, `phone`, `address`) is stored on the document, and no other user can read or list another user's profile.
2. **Valid Room Membership**: Only authenticated, email-verified users can create or join `/rooms/{roomId}`. Once both `hostUid` and `guestUid` are set, only those two participants can read or update the room state.
3. **Private Hand Isolation**: `/rooms/{roomId}/hands/{playerId}` can ONLY be read (`get`) by `request.auth.uid == playerId`, and ONLY if `playerId` is a member (`hostUid` or `guestUid`) of the parent `/rooms/{roomId}` document.
4. **Atomic Hand + Room Sync**: Every write to `/rooms/{roomId}/hands/{playerId}` must occur in the same `writeBatch` as an update to `/rooms/{roomId}` (`updatedAt == request.time`), enforced via `getAfter(...)`.
5. **Terminal State Locking**: Once `/rooms/{roomId}` reaches `status == 'finished'`, no subsequent updates are allowed.
6. **Strict Schema & Bounds**: Every write enforces `hasAll`/`hasOnly` keys, `.size()` checks on every string and array, `^[a-zA-Z0-9_-]+$` regex on IDs, and `request.time` on `createdAt`/`updatedAt`.

## 2. "Dirty Dozen" Adversarial Payloads
1. **Cross-User Profile Read/Write**: User B attempts `get`/`update` on `/users/{userA}` -> `PERMISSION_DENIED`.
2. **Ghost Field Injection on Profile**: User A sends `{ ..., isAdmin: true }` to `/users/{userA}` -> `PERMISSION_DENIED`.
3. **Client Timestamp Forgery**: Client sends `createdAt: new Date(0)` instead of `serverTimestamp()` -> `PERMISSION_DENIED`.
4. **Identity Spoofing on Room Create**: User A tries to create `/rooms/ABC123` with `hostUid: "victim_uid"` -> `PERMISSION_DENIED`.
5. **Oversized Room ID Poisoning**: Attacker writes `/rooms/<200-char-junk>` -> `PERMISSION_DENIED`.
6. **Unauthorized Room Hijack**: User C attempts to update an active `'playing'` room between User A and User B -> `PERMISSION_DENIED`.
7. **Host Self-Join Exploit**: Host attempts to join their own `'waiting'` room as `guestUid` -> `PERMISSION_DENIED`.
8. **Post-Finish Score Tampering**: Participant updates `hostScore` after `status == 'finished'` -> `PERMISSION_DENIED`.
9. **Blanket Room List Scrape**: User A runs an unfiltered `getDocs(collection(db, 'rooms'))` -> `PERMISSION_DENIED`.
10. **Opponent Hand Peek**: Guest attempts `get` on `/rooms/{roomId}/hands/{hostUid}` -> `PERMISSION_DENIED`.
11. **Oversized Array Exhaustion**: Player attempts to push 20 cards (`cards.length > 8`) into `/rooms/{roomId}/hands/{uid}` -> `PERMISSION_DENIED`.
12. **Orphaned Hand Write**: User attempts to write `/rooms/NONEXISTENT/hands/{uid}` without a valid parent room -> `PERMISSION_DENIED`.
