


import { reactive, computed } from 'vue'
import type { ScreenName, PlayerData, RoomMeta, GeoLocation, RoundData } from '../types'

export interface GameStore {

  myUid: string
  myNickname: string
  myPhotoURL: string
  myEmail: string
  isAnonymous: boolean


  roomCode: string
  meta: RoomMeta | null
  players: Record<string, PlayerData>
  locations: Record<string, GeoLocation>
  rounds: Record<string, RoundData>


  screen: ScreenName
  isLoading: boolean
  loadingMessage: string
  connectionLost: boolean

  settings: {
    units: 'Metric' | 'Imperial'
    quality: 'Auto' | 'High' | 'Low'
    sound: boolean
    volume: number
  }
  stats: {
    gamesPlayed: number
    totalPoints: number
    bestScore: number
    totalDistance: number
    guessCount: number
  }
}

const DEFAULT_SETTINGS = {
  units: 'Metric',
  quality: 'Auto',
  sound: true,
  volume: 0.5
}

const DEFAULT_STATS = {
  gamesPlayed: 0,
  totalPoints: 0,
  bestScore: 0,
  totalDistance: 0,
  guessCount: 0
}

function getStored<T>(key: string, fallback: T): T {
  const data = localStorage.getItem(key)
  if (!data) return fallback
  try {
    return JSON.parse(data)
  } catch {
    return fallback
  }
}

export const store = reactive<GameStore>({
  myUid: '',
  myNickname: localStorage.getItem('georush_nickname') || '',
  myPhotoURL: '',
  myEmail: '',
  isAnonymous: true,

  roomCode: '',
  meta: null,
  players: {},
  locations: {},
  rounds: {},

  screen: 'lobby',
  isLoading: false,
  loadingMessage: '',
  connectionLost: false,

  settings: getStored('georush_settings', DEFAULT_SETTINGS) as GameStore['settings'],
  stats: getStored('georush_stats', DEFAULT_STATS)
})


export const isHost = computed(() => {
  return store.meta?.host === store.myUid
})

export const playerCount = computed(() => {
  return Object.keys(store.players).length
})

export const sortedLeaderboard = computed(() => {
  return Object.entries(store.players)
    .map(([uid, p]) => ({ uid, ...p }))
    .sort((a, b) => b.totalScore - a.totalScore)
})

export const currentRound = computed(() => {
  return store.meta?.currentRound ?? 0
})

export const totalRounds = computed(() => {
  return store.meta?.totalRounds ?? 5
})

export const currentLocation = computed((): GeoLocation | null => {
  const round = currentRound.value
  return store.locations[round.toString()] ?? null
})

export const currentRoundData = computed((): RoundData | null => {
  const round = currentRound.value
  return store.rounds[round.toString()] ?? null
})

export const allPlayersLocked = computed(() => {
  const roundData = currentRoundData.value
  if (!roundData?.guesses) return false
  const playerUids = Object.keys(store.players)
  return playerUids.every((uid) => roundData.guesses[uid]?.lockedAt)
})

export const myPlayer = computed((): PlayerData | null => {
  return store.players[store.myUid] ?? null
})

export const avgDistance = computed(() => {
  if (store.stats.guessCount === 0) return 0
  return Math.round(store.stats.totalDistance / store.stats.guessCount)
})

export const achievements = computed(() => {
  return [
    {
      id: 'globetrotter',
      name: 'Globetrotter',
      desc: 'Play at least 10 games',
      icon: '🌍',
      earned: store.stats.gamesPlayed >= 10
    },
    {
      id: 'sniper',
      name: 'Sniper',
      desc: 'Get a score above 4500 in a single round',
      icon: '🎯',
      earned: store.stats.bestScore >= 4500
    },
    {
      id: 'veteran',
      name: 'Veteran',
      desc: 'Earn a total of 100,000 points',
      icon: '🎖️',
      earned: store.stats.totalPoints >= 100000
    }
  ]
})

export function updateSettings(updates: Partial<GameStore['settings']>) {
  Object.assign(store.settings, updates)
  localStorage.setItem('georush_settings', JSON.stringify(store.settings))
}

export function updateStats(updates: Partial<GameStore['stats']>) {
  Object.assign(store.stats, updates)
  localStorage.setItem('georush_stats', JSON.stringify(store.stats))
}

export function resetStore(): void {
  store.roomCode = ''
  store.meta = null
  store.players = {}
  store.locations = {}
  store.rounds = {}
  store.screen = 'lobby'
  store.isLoading = false
  store.loadingMessage = ''
}
