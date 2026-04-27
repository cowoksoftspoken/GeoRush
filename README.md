# GeoRush

GeoRush is a realtime multiplayer GeoGuessr-style game built with Vue, Firebase Auth, Firebase Realtime Database, Firestore, Leaflet, and MapillaryJS.

This version intentionally does not use Firebase Cloud Functions. The app is a secure-as-possible MVP with client-side room flow, RTDB transactions, and strict Firebase rules where Firebase can enforce them.

## Features

- Google sign-in and guest auth
- Private rooms with shareable room code
- Hybrid Quick Play: joins a compatible waiting public room or creates one
- Realtime lobby, ready state, host controls, countdown-ready flow
- Mapillary street-level imagery by curated image id
- Responsive minimap with desktop resize and mobile collapse
- Round result map with answer and player guesses
- Final leaderboard with player names, avatars, host/current-player states
- Global leaderboard in RTDB
- Firebase App Check support through reCAPTCHA v3

## Architecture

```text
Vue client
  -> Firebase Auth
  -> Firebase RTDB: room state, players, guesses, results, leaderboard
  -> Firestore: curated public location metadata and private coordinates
  -> MapillaryJS: street-level viewer
```

No backend function performs scoring or matchmaking. The host/client reveals answers and calculates scores after a round ends.

## Security Model

This is an Honest MVP mode, not a cheat-proof competitive backend.

What is protected:

- Users must be authenticated.
- Players can only submit their own guess.
- A guess can only be written once.
- Guess latitude and longitude are validated in RTDB rules.
- Answer coordinates are not stored in public RTDB room data during an active round.
- Normal players cannot directly write `results`.
- Firestore location/map-pack writes require an admin custom claim.
- RTDB room joining uses transactions to reduce overfilling.

Known limitations without backend code:

- A determined authenticated user may read `privateLocations/{locationId}` from Firestore if they know the id.
- The host/client can manipulate scoring because scoring runs on the client.
- App Check reduces abuse but is not a substitute for server-authoritative game logic.

For a fully cheat-resistant ranked mode, add a trusted backend later. This project currently avoids that by design.

## Firebase Data

### Firestore

`mapPacks/{mapPackId}`

```json
{
  "name": "World",
  "description": "Global mixed locations",
  "region": "world",
  "difficulty": "mixed",
  "isPublic": true
}
```

`publicLocations/{locationId}`

```json
{
  "imageId": "mapillary_image_id",
  "country": "Japan",
  "region": "asia",
  "difficulty": "medium",
  "mapPackId": "world",
  "isActive": true
}
```

`privateLocations/{locationId}`

```json
{
  "lat": 35.6812,
  "lng": 139.7671
}
```

Use the same `locationId` in `publicLocations` and `privateLocations`.

### RTDB

```text
rooms/{roomId}
  meta
  locations/{roundIndex}
  players/{uid}
  rounds/{roundIndex}/guesses/{uid}
  playerCount
  maxPlayers

publicRooms/{roomId}
results/{roomId}/{roundIndex}
leaderboard/{uid}
users/{uid}
```

`rooms/{roomId}/locations/{roundIndex}` stores only safe data such as `locationId` and `mapillaryId`. It must not contain answer `lat` or `lng`.

## Quick Play

Quick Play uses a cheap RTDB-only hybrid flow:

1. Client reads `publicRooms` with `status = waiting`.
2. Client filters by region, difficulty, and map pack.
3. Client joins the first compatible room using a transaction on `rooms/{roomId}/playerCount`.
4. If no compatible room is available, client creates a new public waiting room.
5. Game starts from the lobby when enough players are ready.

There is no queue worker, lock document, or server pairing process.

## Environment

Create `.env` from `.env.example`:

```bash
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_DATABASE_URL=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_MAPILLARY_ACCESS_TOKEN=...
VITE_RECAPTCHA_SITE_KEY=...
```

`VITE_RECAPTCHA_SITE_KEY` is optional for local development, but recommended for production App Check.

## Setup

```bash
npm install
npm run dev
```

Seed starter Firestore locations:

```bash
npm run seed:locations
```

The seed script uses your Firebase CLI login, validates curated Mapillary image ids, then writes matching `publicLocations` and `privateLocations` documents.

Build:

```bash
npm run build
```

Deploy rules:

```bash
firebase deploy --only database,firestore
```

## Firebase Rules

- RTDB rules live in `firebase-rules.json`.
- Firestore rules live in `firestore.rules`.
- Firestore admin writes require `request.auth.token.admin == true`.
- Deploy both rules before testing multiplayer on a real project.

To grant an admin custom claim, use Firebase Admin tooling outside this app.

## Required Firebase Console Setup

1. Enable Firebase Auth providers:
   - Google
   - Anonymous, if guest mode is desired
2. Enable Realtime Database.
3. Enable Firestore.
4. Add App Check with reCAPTCHA v3 for the web app.
5. Add curated `mapPacks`, `publicLocations`, and `privateLocations`.
6. Add your Mapillary access token to `.env`.

## Notes For Production

- Keep ranked/competitive claims modest until scoring is moved to a trusted backend.
- Treat global leaderboard as casual mode data.
- Monitor RTDB usage and add cleanup jobs later if rooms accumulate.
- Split large frontend chunks with dynamic imports if bundle size becomes an issue.
