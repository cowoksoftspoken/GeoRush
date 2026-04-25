


import { initializeApp } from 'firebase/app'
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
  query,
  orderByChild,
  limitToLast,
  push,
  serverTimestamp,
  increment,
  type DatabaseReference,
  type Unsubscribe
} from 'firebase/database'
import type { GeoLocation, PlayerData, GuessData, RoomMeta, RoomData, GlobalLeaderboardEntry } from '../types'
import { PLAYER_COLORS } from '../types'
import { pickGameLocations } from '../data/locations'


const firebaseConfig = {
  apiKey: "AIzaSyB_pHPEipkYTN6CHCtCQFbDc1D6bzC9XZo",
  authDomain: "animeh-82385.firebaseapp.com",
  databaseURL: "https://animeh-82385-default-rtdb.firebaseio.com",
  projectId: "animeh-82385",
  storageBucket: "animeh-82385.firebasestorage.app",
  messagingSenderId: "915460612859",
  appId: "1:915460612859:web:1dd864e039c31261ef865e"
}

const app = initializeApp(firebaseConfig)
const auth = getAuth(app)
const db = getDatabase(app)
const googleProvider = new GoogleAuthProvider()
googleProvider.setCustomParameters({ prompt: 'select_account' })

export { db, auth, dbRef, set, get, update, remove, onValue, onDisconnect, push, serverTimestamp }
export type { DatabaseReference, Unsubscribe }


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
    provider: user?.isAnonymous ? 'guest' : 'google'
  }
}


function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  let code = ''
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}


export async function createRoom(hostUid: string, nickname: string): Promise<string> {
  let attempts = 0
  let roomCode = ''

  while (attempts < 3) {
    roomCode = generateRoomCode()
    const roomRef = dbRef(db, `rooms/${roomCode}`)
    const snapshot = await get(roomRef)

    if (!snapshot.exists()) {
      const locations = await pickGameLocations(5)
      const locationsObj: Record<string, GeoLocation> = {}
      locations.forEach((loc, i) => {
        locationsObj[i.toString()] = loc
      })

      const meta: RoomMeta = {
        host: hostUid,
        status: 'waiting',
        currentRound: 0,
        totalRounds: 5,
        roundDurationSeconds: 90,
        createdAt: Date.now()
      }

      const playerData = buildPlayerData(nickname, PLAYER_COLORS[0])

      await set(roomRef, {
        meta,
        locations: locationsObj,
        players: { [hostUid]: playerData },
        rounds: {}
      })


      const playerRef = dbRef(db, `rooms/${roomCode}/players/${hostUid}`)
      onDisconnect(playerRef).remove()

      return roomCode
    }
    attempts++
  }

  throw new Error('Failed to generate unique room code after 3 attempts')
}

export async function joinRoom(roomCode: string, uid: string, nickname: string): Promise<RoomData> {
  const roomRef = dbRef(db, `rooms/${roomCode}`)
  const snapshot = await get(roomRef)

  if (!snapshot.exists()) {
    throw new Error('Room not found')
  }

  const roomData = snapshot.val() as RoomData

  if (roomData.meta.status !== 'waiting') {
    throw new Error('Game already in progress')
  }

  const playerCount = roomData.players ? Object.keys(roomData.players).length : 0
  if (playerCount >= 6) {
    throw new Error('Room is full (max 6 players)')
  }


  const usedColors = new Set(
    Object.values(roomData.players || {}).map((p) => p.color)
  )
  const availableColor = PLAYER_COLORS.find((c) => !usedColors.has(c)) || PLAYER_COLORS[0]

  const playerData = buildPlayerData(nickname, availableColor)

  const playerRef = dbRef(db, `rooms/${roomCode}/players/${uid}`)
  await set(playerRef, playerData)


  onDisconnect(playerRef).remove()

  return { ...roomData, players: { ...roomData.players, [uid]: playerData } }
}

export async function leaveRoom(roomCode: string, uid: string): Promise<void> {
  const playerRef = dbRef(db, `rooms/${roomCode}/players/${uid}`)
  await remove(playerRef)


  const playersRef = dbRef(db, `rooms/${roomCode}/players`)
  const snapshot = await get(playersRef)
  if (!snapshot.exists() || Object.keys(snapshot.val()).length === 0) {
    await remove(dbRef(db, `rooms/${roomCode}`))
    return
  }


  const metaRef = dbRef(db, `rooms/${roomCode}/meta`)
  const metaSnap = await get(metaRef)
  if (metaSnap.exists()) {
    const meta = metaSnap.val() as RoomMeta
    if (meta.host === uid) {
      const players = snapshot.val() as Record<string, PlayerData>
      const sortedPlayers = Object.entries(players).sort(
        ([, a], [, b]) => a.joinedAt - b.joinedAt
      )
      if (sortedPlayers.length > 0) {
        await update(metaRef, { host: sortedPlayers[0][0] })
      }
    }
  }
}

export async function startGame(roomCode: string): Promise<void> {
  const roundDuration = 90
  const now = Date.now()

  await update(dbRef(db, `rooms/${roomCode}/meta`), {
    status: 'playing',
    currentRound: 0,
    roundDurationSeconds: roundDuration
  })

  await set(dbRef(db, `rooms/${roomCode}/rounds/0`), {
    startedAt: now,
    expiresAt: now + roundDuration * 1000,
    guesses: {}
  })
}

export async function submitGuess(
  roomCode: string,
  roundIndex: number,
  uid: string,
  lat: number,
  lng: number
): Promise<void> {
  const guessRef = dbRef(db, `rooms/${roomCode}/rounds/${roundIndex}/guesses/${uid}`)
  const snapshot = await get(guessRef)

  if (snapshot.exists()) {
    throw new Error('Guess already submitted')
  }

  const guess: GuessData = {
    lat,
    lng,
    lockedAt: Date.now()
  }

  await set(guessRef, guess)
}

export async function advanceToResults(roomCode: string): Promise<void> {
  await update(dbRef(db, `rooms/${roomCode}/meta`), {
    status: 'roundResults'
  })
}

export async function advanceToNextRound(roomCode: string, nextRound: number, totalRounds: number): Promise<void> {
  if (nextRound >= totalRounds) {
    await update(dbRef(db, `rooms/${roomCode}/meta`), {
      status: 'gameOver'
    })
    return
  }

  const roundDuration = 90
  const now = Date.now()

  await set(dbRef(db, `rooms/${roomCode}/rounds/${nextRound}`), {
    startedAt: now,
    expiresAt: now + roundDuration * 1000,
    guesses: {}
  })

  await update(dbRef(db, `rooms/${roomCode}/meta`), {
    status: 'playing',
    currentRound: nextRound
  })
}

export async function declareSoloWinner(roomCode: string, uid: string): Promise<boolean> {
  const roomRef = dbRef(db, `rooms/${roomCode}`)
  const snapshot = await get(roomRef)
  if (!snapshot.exists()) return false

  const roomData = snapshot.val() as RoomData
  const players = roomData.players ?? {}
  const remainingUids = Object.keys(players)
  const status = roomData.meta.status

  if (remainingUids.length !== 1 || remainingUids[0] !== uid || status === 'waiting' || status === 'gameOver') {
    return false
  }

  await update(dbRef(db, `rooms/${roomCode}/meta`), {
    host: uid,
    status: 'gameOver',
    winnerUid: uid,
    winReason: 'solo'
  })

  return true
}

export async function rerollRoundLocation(roomCode: string, roundIndex: number): Promise<GeoLocation> {
  const [location] = await pickGameLocations(1)
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

export async function resetRoom(roomCode: string): Promise<void> {
  const locations = await pickGameLocations(5)
  const locationsObj: Record<string, GeoLocation> = {}
  locations.forEach((loc, i) => {
    locationsObj[i.toString()] = loc
  })


  const playersRef = dbRef(db, `rooms/${roomCode}/players`)
  const snap = await get(playersRef)
  if (snap.exists()) {
    const players = snap.val() as Record<string, PlayerData>
    const updates: Record<string, unknown> = {}
    for (const uid of Object.keys(players)) {
      updates[`players/${uid}/scores`] = null
      updates[`players/${uid}/totalScore`] = 0
    }
    updates['meta/status'] = 'waiting'
    updates['meta/currentRound'] = 0
    updates['locations'] = locationsObj
    updates['rounds'] = null
    await update(dbRef(db, `rooms/${roomCode}`), updates)
  }
}

export function listenGlobalLeaderboard(
  callback: (entries: GlobalLeaderboardEntry[]) => void
): Unsubscribe {
  const leaderboardQuery = query(
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
