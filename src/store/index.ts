


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
  connectionLost: false
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
