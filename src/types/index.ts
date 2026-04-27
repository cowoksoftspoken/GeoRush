


export interface GeoLocation {
  locationId?: string
  lat?: number
  lng?: number
  heading: number
  pitch: number
  zoom: number
  label?: string
  panoUrl?: string
  mapillaryId?: string
  thumbnailUrl?: string
  country?: string
  region?: string
  difficulty?: string
  mapPackId?: string
  revealed?: boolean
}

export interface PlayerData {
  nickname: string
  joinedAt: number
  color: string
  scores: Record<string, number>
  totalScore: number
  photoURL?: string
  provider?: 'google' | 'guest'
  ready?: boolean
  connected?: boolean
  lastSeen?: number
}

export interface GuessData {
  lat: number
  lng: number
  lockedAt: number
}

export interface RoomMeta {
  host: string
  status: RoomStatus
  currentRound: number
  totalRounds: number
  roundDurationSeconds: number
  createdAt: number
  winnerUid?: string
  winReason?: 'score' | 'solo'
  mode?: 'private' | 'public' | 'quickPlay'
  region?: string
  difficulty?: string
  mapPack?: string
}

export interface RoundData {
  startedAt: number
  expiresAt: number
  guesses: Record<string, GuessData>
}

export interface PlayerRoundResult {
  uid: string
  nickname: string
  photoURL?: string
  color: string
  guessLat: number | null
  guessLng: number | null
  distanceMeters: number
  score: number
  noGuess: boolean
}

export interface RoundResultData {
  roundIndex: number
  locationId: string
  imageId: string
  answerLat: number
  answerLng: number
  country?: string
  region?: string
  label?: string
  players: Record<string, PlayerRoundResult>
  createdAt: number
}

export interface RoomData {
  meta: RoomMeta
  locations: Record<string, GeoLocation>
  players: Record<string, PlayerData>
  rounds: Record<string, RoundData>
}

export interface GlobalLeaderboardEntry {
  uid: string
  nickname: string
  photoURL: string
  bestScore: number
  lastScore: number
  totalScore: number
  gamesPlayed: number
  averageScore: number
  wins: number
  roundsPlayed: number
  lastPlayedAt: number
}

export interface MatchmakingPreferences {
  mode: 'duel' | 'party'
  region: 'world' | 'asia' | 'europe' | 'americas' | 'oceania'
  difficulty: 'mixed' | 'easy' | 'medium' | 'hard'
  mapPack: 'world' | 'urban' | 'landmarks'
  partyId?: string
}

export interface MatchmakingEntry {
  uid: string
  displayName: string
  photoURL?: string
  rating: number
  partyId?: string
  preferences: MatchmakingPreferences
  joinedAt: object | number
  status: 'queued' | 'matched' | 'cancelled'
  matchedRoomId?: string
}

export type RoomStatus = 'waiting' | 'countdown' | 'playing' | 'roundResults' | 'gameOver'

export type ScreenName = 'lobby' | 'waiting' | 'game' | 'roundResults' | 'finalResults'

export type ToastType = 'success' | 'warning' | 'error' | 'info'

export interface Toast {
  id: number
  message: string
  type: ToastType
}

export const PLAYER_COLORS = [
  '#2dd4bf',
  '#f5c842',
  '#f43f5e',
  '#a78bfa',
  '#34d399',
  '#fb923c'
] as const

export const ADJECTIVES = [
  'Swift', 'Bold', 'Clever', 'Brave', 'Sly', 'Quick', 'Wild',
  'Fierce', 'Calm', 'Bright', 'Dark', 'Silent', 'Lucky', 'Proud',
  'Noble', 'Keen', 'Sharp', 'Witty', 'Daring', 'Gentle'
]

export const ANIMALS = [
  'Panda', 'Falcon', 'Wolf', 'Fox', 'Eagle', 'Tiger', 'Bear',
  'Hawk', 'Lynx', 'Raven', 'Otter', 'Cobra', 'Crane', 'Shark',
  'Owl', 'Stag', 'Viper', 'Heron', 'Jaguar', 'Bison'
]
