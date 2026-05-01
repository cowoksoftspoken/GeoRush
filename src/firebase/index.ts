import { initializeApp } from 'firebase/app'
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check'
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInAnonymously,
  onAuthStateChanged,
  signOut,
  type User
} from 'firebase/auth'
import {
  getDatabase,
  ref as dbRef,
  set,
  get,
  update,
  remove,
  onValue,
  onDisconnect,
  query as rtdbQuery,
  orderByChild,
  equalTo,
  limitToLast,
  push,
  serverTimestamp,
  increment,
  runTransaction,
  type DatabaseReference,
  type Unsubscribe
} from 'firebase/database'
import {
  getFirestore,
  collection,
  query as fsQuery,
  where,
  limit,
  getDocs,
  doc,
  getDoc
} from 'firebase/firestore'
import type {
  GeoLocation,
  PlayerData,
  GuessData,
  RoomMeta,
  RoomData,
  GlobalLeaderboardEntry,
  MatchmakingPreferences,
  PlayerRoundResult,
  RoundResultData
} from '../types'
import { PLAYER_COLORS } from '../types'
import { calculateScore, haversineDistance } from '../utils'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
}

const app = initializeApp(firebaseConfig)
if (typeof window !== 'undefined' && import.meta.env.VITE_RECAPTCHA_SITE_KEY) {
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(import.meta.env.VITE_RECAPTCHA_SITE_KEY),
    isTokenAutoRefreshEnabled: true
  })
}
const auth = getAuth(app)
const db = getDatabase(app)
const firestore = getFirestore(app)
const googleProvider = new GoogleAuthProvider()
googleProvider.setCustomParameters({ prompt: 'select_account' })

export { db, firestore, auth, dbRef, set, get, update, remove, onValue, onDisconnect, push, serverTimestamp }
export type { DatabaseReference, Unsubscribe }

interface PublicLocationDocument {
  imageId: string
  country?: string
  region?: string
  difficulty?: string
  mapPackId?: string
  isActive?: boolean
}

interface PrivateLocationDocument {
  lat: number
  lng: number
}

interface CreateRoomOptions {
  visibility?: 'private' | 'public'
  preferences?: MatchmakingPreferences
}

const ROOM_SIZE = 4
const MAX_PLAYERS = 6
const TOTAL_ROUNDS = 5
const ROUND_DURATION_SECONDS = 90

let serverTimeOffset = 0
onValue(dbRef(db, '.info/serverTimeOffset'), snap => {
  serverTimeOffset = snap.val() || 0
})
export function getServerTime(): number {
  return Date.now() + serverTimeOffset
}

export function signInAnon(): Promise<User> {
  return new Promise((resolve, reject) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        unsub()
        resolve(user)
      }
    })
    signInAnonymously(auth).catch(reject)
  })
}

export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider)
  return result.user
}

export async function signOutUser(): Promise<void> {
  await signOut(auth)
}

export function listenToAuth(callback: (user: User | null) => void): Unsubscribe {
  return onAuthStateChanged(auth, callback)
}

export function getCurrentUser(): User | null {
  return auth.currentUser
}

function buildPlayerData(nickname: string, color: string): PlayerData {
  const user = auth.currentUser
  return {
    nickname,
    joinedAt: Date.now(),
    color,
    scores: {},
    totalScore: 0,
    photoURL: user?.photoURL || '',
    provider: user?.isAnonymous ? 'guest' : 'google',
    ready: false,
    connected: true,
    lastSeen: Date.now()
  }
}

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < ROOM_SIZE; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

function shuffle<T>(items: T[]): T[] {
  return [...items].sort(() => Math.random() - 0.5)
}

function withoutUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => withoutUndefined(item)) as T
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entryValue]) => entryValue !== undefined)
        .map(([key, entryValue]) => [key, withoutUndefined(entryValue)])
    ) as T
  }
  return value
}

function publicLocationToRoundLocation(id: string, data: PublicLocationDocument): GeoLocation {
  return withoutUndefined({
    locationId: id,
    mapillaryId: data.imageId,
    heading: 0,
    pitch: 0,
    zoom: 1,
    label: [data.country, data.region].filter(Boolean).join(', ') || data.region || data.country || 'Mystery location',
    country: data.country,
    region: data.region,
    difficulty: data.difficulty,
    mapPackId: data.mapPackId
  })
}

function matchesPreferences(location: GeoLocation, preferences?: MatchmakingPreferences): boolean {
  if (!preferences) return true
  const region = (location as GeoLocation & { region?: string }).region
  const difficulty = (location as GeoLocation & { difficulty?: string }).difficulty
  const mapPackId = (location as GeoLocation & { mapPackId?: string }).mapPackId
  if (preferences.region !== 'world' && region && region !== preferences.region) return false
  if (preferences.difficulty !== 'mixed' && difficulty && difficulty !== preferences.difficulty) return false
  if (preferences.mapPack !== 'world' && mapPackId && mapPackId !== preferences.mapPack) return false
  return true
}

async function fetchPublicLocations(count: number, preferences?: MatchmakingPreferences): Promise<GeoLocation[]> {
  const snapshot = await getDocs(fsQuery(collection(firestore, 'publicLocations'), where('isActive', '==', true), limit(100)))
  const locations = snapshot.docs
    .map((entry) => publicLocationToRoundLocation(entry.id, entry.data() as PublicLocationDocument))
    .filter((location) => matchesPreferences(location, preferences))

  if (locations.length < count) {
    throw new Error('Not enough Firestore publicLocations. Add active curated locations before creating a room.')
  }

  return shuffle(locations).slice(0, count)
}

async function fetchPrivateLocation(locationId: string): Promise<PrivateLocationDocument> {
  const snapshot = await getDoc(doc(firestore, 'privateLocations', locationId))
  if (!snapshot.exists()) {
    throw new Error(`Missing privateLocations/${locationId}`)
  }
  const data = snapshot.data() as PrivateLocationDocument
  if (typeof data.lat !== 'number' || typeof data.lng !== 'number') {
    throw new Error(`Invalid private location coordinates for ${locationId}`)
  }
  return data
}

async function createRoomCode(): Promise<string> {
  for (let attempt = 0; attempt < 12; attempt++) {
    const code = generateRoomCode()
    const snapshot = await get(dbRef(db, `rooms/${code}`))
    if (!snapshot.exists()) return code
  }
  throw new Error('Could not allocate a room code. Please try again.')
}

async function publicRoomExists(roomCode: string): Promise<boolean> {
  const snapshot = await get(dbRef(db, `publicRooms/${roomCode}`))
  return snapshot.exists()
}

export async function createRoom(hostUid: string, nickname: string, options: CreateRoomOptions = {}): Promise<string> {
  const preferences = options.preferences
  const locations = await fetchPublicLocations(TOTAL_ROUNDS, preferences)
  const roomCode = await createRoomCode()
  const playerData = buildPlayerData(nickname, PLAYER_COLORS[0])
  const now = Date.now()
  const meta = withoutUndefined<RoomMeta>({
    host: hostUid,
    status: 'waiting',
    currentRound: 0,
    totalRounds: TOTAL_ROUNDS,
    roundDurationSeconds: ROUND_DURATION_SECONDS,
    createdAt: now,
    mode: options.visibility === 'public' ? 'quickPlay' : 'private',
    region: preferences?.region,
    difficulty: preferences?.difficulty,
    mapPack: preferences?.mapPack
  })

  await set(dbRef(db, `rooms/${roomCode}`), withoutUndefined({
    meta,
    locations: Object.fromEntries(locations.map((location, index) => [index, location])),
    players: { [hostUid]: playerData },
    rounds: {},
    playerCount: 1,
    maxPlayers: MAX_PLAYERS,
    createdAt: now
  }))

  const playerRef = dbRef(db, `rooms/${roomCode}/players/${hostUid}`)
  onDisconnect(playerRef).remove()

  if (options.visibility === 'public') {
    await set(dbRef(db, `publicRooms/${roomCode}`), {
      status: 'waiting',
      playerCount: 1,
      maxPlayers: MAX_PLAYERS,
      mode: preferences?.mode ?? 'duel',
      mapPackId: preferences?.mapPack ?? 'world',
      difficulty: preferences?.difficulty ?? 'mixed',
      region: preferences?.region ?? 'world',
      hostId: hostUid,
      createdAt: now
    })
  }

  return roomCode
}

export async function joinRoom(roomCode: string, uid: string, nickname: string): Promise<RoomData> {
  const normalizedCode = roomCode.toUpperCase()
  const roomRef = dbRef(db, `rooms/${normalizedCode}`)
  const snapshot = await get(roomRef)

  if (!snapshot.exists()) throw new Error('Room not found')

  const roomData = snapshot.val() as RoomData & { playerCount?: number; maxPlayers?: number }
  if (roomData.meta.status !== 'waiting') throw new Error('Game already in progress')
  if (roomData.players?.[uid]) return roomData

  const players = roomData.players || {}
  const maxPlayers = roomData.maxPlayers ?? MAX_PLAYERS
  const initialCount = Object.keys(players).length
  const countRef = dbRef(db, `rooms/${normalizedCode}/playerCount`)
  const transaction = await runTransaction(countRef, (current) => {
    const count = typeof current === 'number' ? current : initialCount
    if (count >= maxPlayers) return
    return count + 1
  })

  if (!transaction.committed) throw new Error(`Room is full (max ${maxPlayers} players)`)

  const usedColors = new Set(Object.values(players).map((p) => p.color))
  const availableColor = PLAYER_COLORS.find((color) => !usedColors.has(color)) || PLAYER_COLORS[0]
  const playerData = buildPlayerData(nickname, availableColor)
  const playerRef = dbRef(db, `rooms/${normalizedCode}/players/${uid}`)

  try {
    await set(playerRef, playerData)
    onDisconnect(playerRef).remove()

    const publicRoomSnap = await get(dbRef(db, `publicRooms/${normalizedCode}`))
    if (publicRoomSnap.exists()) {
      await update(dbRef(db, `publicRooms/${normalizedCode}`), {
        playerCount: transaction.snapshot.val(),
        status: 'waiting'
      })
    }
  } catch (err) {
    await runTransaction(countRef, (current) => Math.max(0, (Number(current) || 1) - 1))
    throw err
  }

  return { ...roomData, players: { ...players, [uid]: playerData } }
}

export async function quickJoinRoom(
  uid: string,
  nickname: string,
  photoURL: string,
  preferences: MatchmakingPreferences
): Promise<string> {
  void photoURL
  const waitingRooms = await get(rtdbQuery(dbRef(db, 'publicRooms'), orderByChild('status'), equalTo('waiting')))
  const candidates = Object.entries((waitingRooms.val() ?? {}) as Record<string, {
    playerCount?: number
    maxPlayers?: number
    mode?: string
    region?: string
    difficulty?: string
    mapPackId?: string
    createdAt?: number
  }>)
    .filter(([, room]) => {
      const maxPlayers = room.maxPlayers ?? MAX_PLAYERS
      if ((room.playerCount ?? 0) >= maxPlayers) return false
      if (room.region && room.region !== 'world' && preferences.region !== room.region) return false
      if (room.difficulty && room.difficulty !== 'mixed' && preferences.difficulty !== room.difficulty) return false
      if (room.mapPackId && room.mapPackId !== 'world' && preferences.mapPack !== room.mapPackId) return false
      return true
    })
    .sort(([, a], [, b]) => (a.createdAt ?? 0) - (b.createdAt ?? 0))

  for (const [roomCode] of candidates) {
    try {
      await joinRoom(roomCode, uid, nickname)
      return roomCode
    } catch {
      continue
    }
  }

  return createRoom(uid, nickname, { visibility: 'public', preferences })
}

export async function updatePlayerReady(roomCode: string, uid: string, ready: boolean): Promise<void> {
  await update(dbRef(db, `rooms/${roomCode}/players/${uid}`), {
    ready,
    lastSeen: Date.now()
  })
}

export async function leaveRoom(roomCode: string, uid: string): Promise<void> {
  const playerRef = dbRef(db, `rooms/${roomCode}/players/${uid}`)
  await remove(playerRef)
  await runTransaction(dbRef(db, `rooms/${roomCode}/playerCount`), (current) => Math.max(0, (Number(current) || 1) - 1))

  const playersRef = dbRef(db, `rooms/${roomCode}/players`)
  const snapshot = await get(playersRef)
  const publicRoomRef = dbRef(db, `publicRooms/${roomCode}`)
  const hasPublicRoom = await publicRoomExists(roomCode)

  if (!snapshot.exists() || Object.keys(snapshot.val()).length === 0) {
    await remove(dbRef(db, `rooms/${roomCode}`))
    if (hasPublicRoom) await remove(publicRoomRef)
    return
  }

  if (hasPublicRoom) {
    await update(publicRoomRef, { playerCount: Object.keys(snapshot.val()).length })
  }

  const metaRef = dbRef(db, `rooms/${roomCode}/meta`)
  const metaSnap = await get(metaRef)
  if (metaSnap.exists()) {
    const meta = metaSnap.val() as RoomMeta
    if (meta.host === uid) {
      const players = snapshot.val() as Record<string, PlayerData>
      const sortedPlayers = Object.entries(players).sort(([, a], [, b]) => a.joinedAt - b.joinedAt)
      if (sortedPlayers.length > 0) await update(metaRef, { host: sortedPlayers[0][0] })
    }
  }
}

export async function startGame(roomCode: string): Promise<void> {
  const metaSnap = await get(dbRef(db, `rooms/${roomCode}/meta`))
  const meta = metaSnap.val() as RoomMeta | null
  if (!meta) throw new Error('Room not found')
  if (meta.host !== auth.currentUser?.uid) throw new Error('Only the host can start the game')

  const startedAt = getServerTime()
  const expiresAt = startedAt + meta.roundDurationSeconds * 1000
  const updates: Record<string, unknown> = {
    [`rooms/${roomCode}/meta/status`]: 'playing',
    [`rooms/${roomCode}/meta/currentRound`]: 0,
    [`rooms/${roomCode}/rounds/0`]: { startedAt, expiresAt, guesses: {} }
  }
  if (await publicRoomExists(roomCode)) updates[`publicRooms/${roomCode}/status`] = 'playing'
  await update(dbRef(db), updates)
}

export async function submitGuess(
  roomCode: string,
  roundIndex: number,
  uid: string,
  lat: number,
  lng: number
): Promise<void> {
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new Error('Guess is outside valid latitude/longitude range')
  }

  const guessRef = dbRef(db, `rooms/${roomCode}/rounds/${roundIndex}/guesses/${uid}`)
  const snapshot = await get(guessRef)
  if (snapshot.exists()) throw new Error('Guess already submitted')

  const guess: GuessData = { lat, lng, lockedAt: Date.now() }
  await set(guessRef, guess)
}

export async function advanceToResults(roomCode: string): Promise<void> {
  const roomSnap = await get(dbRef(db, `rooms/${roomCode}`))
  if (!roomSnap.exists()) throw new Error('Room not found')

  const room = roomSnap.val() as RoomData
  const meta = room.meta
  if (meta.host !== auth.currentUser?.uid) throw new Error('Only the host can reveal results')

  const roundIndex = meta.currentRound ?? 0
  const location = room.locations?.[roundIndex.toString()]
  if (!location?.locationId || !location.mapillaryId) throw new Error('Round location is missing')

  const answer = await fetchPrivateLocation(location.locationId)
  const guesses = room.rounds?.[roundIndex.toString()]?.guesses ?? {}
  const players = room.players ?? {}
  const playerResults: Record<string, PlayerRoundResult> = {}
  const updates: Record<string, unknown> = {
    [`rooms/${roomCode}/meta/status`]: 'roundResults',
    [`rooms/${roomCode}/locations/${roundIndex}/label`]: location.label,
    [`rooms/${roomCode}/locations/${roundIndex}/revealed`]: true
  }
  if (await publicRoomExists(roomCode)) updates[`publicRooms/${roomCode}/status`] = 'playing'

  for (const [uid, player] of Object.entries(players)) {
    const guess = guesses[uid]
    const noGuess = !guess
    const distanceMeters = noGuess ? 0 : haversineDistance(guess.lat, guess.lng, answer.lat, answer.lng)
    const score = noGuess ? 0 : calculateScore(distanceMeters)
    playerResults[uid] = {
      uid,
      nickname: player.nickname,
      photoURL: player.photoURL,
      color: player.color,
      guessLat: guess?.lat ?? null,
      guessLng: guess?.lng ?? null,
      distanceMeters,
      score,
      noGuess
    }
    updates[`rooms/${roomCode}/players/${uid}/scores/${roundIndex}`] = score
    updates[`rooms/${roomCode}/players/${uid}/totalScore`] = increment(score)
  }

  const result: RoundResultData = {
    roundIndex,
    locationId: location.locationId,
    imageId: location.mapillaryId,
    answerLat: answer.lat,
    answerLng: answer.lng,
    country: (location as GeoLocation & { country?: string }).country,
    region: (location as GeoLocation & { region?: string }).region,
    label: location.label,
    players: playerResults,
    createdAt: Date.now()
  }

  updates[`results/${roomCode}/${roundIndex}`] = result
  await update(dbRef(db), updates)
}

export async function advanceToNextRound(roomCode: string, nextRound: number, totalRounds: number): Promise<void> {
  const metaSnap = await get(dbRef(db, `rooms/${roomCode}/meta`))
  const meta = metaSnap.val() as RoomMeta | null
  if (!meta) throw new Error('Room not found')
  if (meta.host !== auth.currentUser?.uid) throw new Error('Only the host can advance rounds')

  if (nextRound >= totalRounds) {
    const playersSnap = await get(dbRef(db, `rooms/${roomCode}/players`))
    const players = (playersSnap.val() ?? {}) as Record<string, PlayerData>
    const winner = Object.entries(players).sort(([, a], [, b]) => b.totalScore - a.totalScore)[0]
    const updates: Record<string, unknown> = {
      [`rooms/${roomCode}/meta/status`]: 'gameOver',
      [`rooms/${roomCode}/meta/winnerUid`]: winner?.[0] ?? '',
      [`rooms/${roomCode}/meta/winReason`]: 'score'
    }
    if (await publicRoomExists(roomCode)) updates[`publicRooms/${roomCode}/status`] = 'finished'
    await update(dbRef(db), updates)
    return
  }

  const startedAt = getServerTime()
  const expiresAt = startedAt + meta.roundDurationSeconds * 1000
  const updates: Record<string, unknown> = {
    [`rooms/${roomCode}/meta/status`]: 'playing',
    [`rooms/${roomCode}/meta/currentRound`]: nextRound,
    [`rooms/${roomCode}/rounds/${nextRound}`]: { startedAt, expiresAt, guesses: {} }
  }
  await update(dbRef(db), updates)
}

export async function declareSoloWinner(roomCode: string, uid: string): Promise<boolean> {
  const roomSnap = await get(dbRef(db, `rooms/${roomCode}`))
  if (!roomSnap.exists()) return false

  const room = roomSnap.val() as RoomData
  const playerIds = Object.keys(room.players ?? {})
  if (playerIds.length !== 1 || playerIds[0] !== uid || room.meta.status === 'waiting' || room.meta.status === 'gameOver') {
    return false
  }

  const updates: Record<string, unknown> = {
    [`rooms/${roomCode}/meta/status`]: 'gameOver',
    [`rooms/${roomCode}/meta/winnerUid`]: uid,
    [`rooms/${roomCode}/meta/winReason`]: 'solo'
  }
  if (await publicRoomExists(roomCode)) updates[`publicRooms/${roomCode}/status`] = 'finished'
  await update(dbRef(db), updates)
  return true
}

export async function rerollRoundLocation(roomCode: string, roundIndex: number): Promise<GeoLocation> {
  const metaSnap = await get(dbRef(db, `rooms/${roomCode}/meta`))
  const meta = metaSnap.val() as RoomMeta | null
  if (!meta) throw new Error('Room not found')
  if (meta.host !== auth.currentUser?.uid) throw new Error('Only the host can reroll imagery')

  const preferences: MatchmakingPreferences = {
    mode: meta.mode === 'quickPlay' ? 'duel' : 'party',
    region: (meta.region as MatchmakingPreferences['region']) || 'world',
    difficulty: (meta.difficulty as MatchmakingPreferences['difficulty']) || 'mixed',
    mapPack: (meta.mapPack as MatchmakingPreferences['mapPack']) || 'world'
  }
  const [location] = await fetchPublicLocations(1, preferences)
  await set(dbRef(db, `rooms/${roomCode}/locations/${roundIndex}`), location)
  return location
}

export async function updatePlayerScore(
  roomCode: string,
  uid: string,
  roundIndex: number,
  score: number
): Promise<void> {
  await update(dbRef(db, `rooms/${roomCode}/players/${uid}`), {
    [`scores/${roundIndex}`]: score,
    totalScore: increment(score)
  })
}

export async function deleteRoom(roomCode: string): Promise<void> {
  const roomSnap = await get(dbRef(db, `rooms/${roomCode}`))
  if (!roomSnap.exists()) return

  const room = roomSnap.val() as RoomData
  if (room.meta.host !== auth.currentUser?.uid) throw new Error('Only the host can delete the room')

  const updates: Record<string, unknown> = {
    [`rooms/${roomCode}`]: null,
    [`results/${roomCode}`]: null
  }
  if (await publicRoomExists(roomCode)) {
    updates[`publicRooms/${roomCode}`] = null
  }
  await update(dbRef(db), updates)
}

export function listenGlobalLeaderboard(
  callback: (entries: GlobalLeaderboardEntry[]) => void
): Unsubscribe {
  const leaderboardQuery = rtdbQuery(
    dbRef(db, 'leaderboard'),
    orderByChild('bestScore'),
    limitToLast(20)
  )

  return onValue(leaderboardQuery, (snap) => {
    const value = (snap.val() ?? {}) as Record<string, GlobalLeaderboardEntry>
    const entries = Object.values(value).sort((a, b) => {
      if (b.bestScore !== a.bestScore) return b.bestScore - a.bestScore
      if (b.wins !== a.wins) return b.wins - a.wins
      return b.averageScore - a.averageScore
    })
    callback(entries)
  })
}

export async function recordGameResult(params: {
  uid: string
  nickname: string
  photoURL: string
  totalScore: number
  roundsPlayed: number
  won: boolean
}): Promise<void> {
  const entryRef = dbRef(db, `leaderboard/${params.uid}`)
  const snapshot = await get(entryRef)
  const previous = snapshot.val() as GlobalLeaderboardEntry | null

  const gamesPlayed = (previous?.gamesPlayed ?? 0) + 1
  const totalScore = (previous?.totalScore ?? 0) + params.totalScore
  const wins = (previous?.wins ?? 0) + (params.won ? 1 : 0)
  const bestScore = Math.max(previous?.bestScore ?? 0, params.totalScore)

  await set(entryRef, {
    uid: params.uid,
    nickname: params.nickname,
    photoURL: params.photoURL,
    bestScore,
    lastScore: params.totalScore,
    totalScore,
    gamesPlayed,
    averageScore: Math.round(totalScore / gamesPlayed),
    wins,
    roundsPlayed: params.roundsPlayed,
    lastPlayedAt: Date.now()
  } satisfies GlobalLeaderboardEntry)
}
