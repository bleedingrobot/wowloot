# Architecture Overview

## Frontend

- React + Vite SPA with HashRouter for GitHub Pages compatibility.
- Route-level pages:
  - Dashboard
  - Characters
  - Raids
  - Loot
  - Settings
- Shared state:
  - `AuthContext` for Firebase auth session
  - `useUserCollections` hook for real-time Firestore subscriptions

## Data Flow

1. User signs in with Google on Settings.
2. App subscribes to user-scoped collections:
   - accounts
   - characters
   - raidStatuses
   - lootItems
3. Dashboard computes urgency in memory and renders sorted character cards.

## Urgency Algorithm

For each character:

- Count wishlist items not marked obtained by priority.
- Add lockout penalty for raids completed but not reset yet.

Formula:

```text
urgencyScore =
  (highPriorityLoot * 5) +
  (mediumPriorityLoot * 3) +
  (lowPriorityLoot * 1) +
  (raidsLockedOutPenalty)
```

Current lockout weight is `2` points per locked raid and is configurable in `src/utils/urgency.js`.

## Weekly Reset Logic

`src/utils/raidReset.js` computes the next weekly reset as Tuesday at 15:00 UTC. If a raid is marked complete, the app stores:

- `lastRunDate`
- `resetDate`
- `completed`

When `resetDate` passes, the raid is effectively available again.

## Security Model

- Every document includes `userId`.
- Firestore rules enforce read/write only when `request.auth.uid == resource.data.userId` (or request data for create).
- No custom backend required for MVP.
