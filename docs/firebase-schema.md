# Firebase Schema Setup

## Collections

### `accounts`

- `userId` (string)
- `battleNetId` (string)
- `createdAt` (ISO string)

### `characters`

- `userId` (string)
- `accountId` (string)
- `name` (string)
- `class` (string)
- `faction` (string)
- `realm` (string)
- `avatarUrl` (string, optional)
- `createdAt` (ISO string)

### `inventoryItems`

- `userId` (string)
- `characterName` (string)
- `realm` (string)
- `itemId` (number)
- `itemName` (string)
- `count` (number)
- `locationGroup` ("bags" | "bank")
- `bagKey` (string)
- `slotIndex` (number)
- `sourceFileName` (string)
- `createdAt` (ISO string)

### `raidStatuses`

- `userId` (string)
- `characterId` (string)
- `raidName` (string)
- `completed` (boolean)
- `lastRunDate` (ISO string or null)
- `resetDate` (ISO string or null)
- `updatedAt` (ISO string)

### `lootItems`

- `userId` (string)
- `characterId` (string)
- `itemName` (string)
- `raidName` (string)
- `priority` ("high" | "medium" | "low")
- `iconUrl` (string, optional)
- `obtained` (boolean)
- `createdAt` (ISO string)

## Firestore Index Suggestions

Create composite indexes as needed when expanding queries. MVP currently filters mostly by `userId` and performs per-character grouping in frontend.

## Auth

Enable Google provider in Firebase Authentication.
