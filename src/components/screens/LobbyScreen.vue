<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { store, achievements, avgDistance, updateSettings } from '../../store'
import {
  createRoom,
  joinRoom,
  quickJoinRoom,
  listenGlobalLeaderboard,
  signInWithGoogle,
  signInAnon,
  signOutUser,
  startGame,
  leaveRoom,
  get,
  dbRef,
  db,
  onValue,
  type Unsubscribe
} from '../../firebase'
import { generateNickname } from '../../utils'
import { globalToast } from '../../composables/useToast'
import { useSound } from '../../composables/useSound'
import type { GlobalLeaderboardEntry, MatchmakingPreferences } from '../../types'

const { playSound } = useSound()

const { showToast } = globalToast

const currentTab = ref<'play' | 'leaderboard' | 'profile'>('play')
const mode = ref<'main' | 'join'>('main')
const joinCode = ref('')
const nickname = ref(store.myNickname || generateNickname())
const isCreating = ref(false)
const isJoining = ref(false)
const joinError = ref('')
const shakeInput = ref(false)
const isSigningIn = ref(false)
const leaderboard = ref<GlobalLeaderboardEntry[]>([])
const matchmaking = ref<{
  open: boolean
  roomCode: string
  status: 'idle' | 'queued' | 'matched' | 'starting' | 'error'
  startedAt: number
  countdown: number
  error: string
}>({
  open: false,
  roomCode: '',
  status: 'idle',
  startedAt: 0,
  countdown: 4,
  error: ''
})
const preferences = ref<MatchmakingPreferences>({
  mode: 'duel',
  region: 'world',
  difficulty: 'mixed',
  mapPack: 'world'
})
const queueSeconds = ref(0)
let unsubscribeLeaderboard: Unsubscribe | null = null
let queueTimer: ReturnType<typeof setInterval> | null = null
let matchmakingCleanup: () => void = () => {}

const isGoogleSignedIn = computed(() => Boolean(store.myUid && !store.isAnonymous))
const displayName = computed(() => store.myNickname || 'Player')

async function ensureAuth() {
  if (!store.myUid) {
    const user = await signInAnon()
    store.myUid = user.uid
    store.isAnonymous = true
  }
  store.myNickname = nickname.value
  localStorage.setItem('georush_nickname', nickname.value)
}

async function handleGoogleSignIn() {
  isSigningIn.value = true
  try {
    const user = await signInWithGoogle()
    store.myUid = user.uid
    store.myPhotoURL = user.photoURL ?? ''
    store.myEmail = user.email ?? ''
    store.isAnonymous = false
    if (user.displayName) {
      nickname.value = user.displayName.slice(0, 16)
      store.myNickname = nickname.value
      localStorage.setItem('georush_nickname', nickname.value)
    }
    showToast('Signed in with Google', 'success')
  } catch (err) {
    showToast(`Google sign-in failed: ${(err as Error).message}`, 'error')
  } finally {
    isSigningIn.value = false
  }
}

async function handleSignOut() {
  await signOutUser()
  store.myUid = ''
  store.myPhotoURL = ''
  store.myEmail = ''
  store.isAnonymous = true
  showToast('Signed out', 'info')
}

async function handleCreate() {
  if (isCreating.value) return
  if (!nickname.value.trim()) {
    showToast('Please enter a nickname', 'warning')
    return
  }
  isCreating.value = true
  playSound('click')
  try {
    await ensureAuth()
    const code = await createRoom(store.myUid, nickname.value.trim())
    store.roomCode = code
    store.screen = 'waiting'
    if (import.meta.env.DEV) console.log('Room created:', code)
    showToast(`Room ${code} created!`, 'success')
  } catch (err) {
    showToast(`Failed to create room: ${(err as Error).message}`, 'error')
  } finally {
    isCreating.value = false
    if (store.screen === 'waiting') playSound('success')
  }
}

async function handleJoin() {
  playSound('click')
  const code = joinCode.value.trim().toUpperCase()
  if (!code || code.length !== 4) {
    joinError.value = 'Enter a 4-letter room code'
    triggerShake()
    return
  }
  if (!nickname.value.trim()) {
    showToast('Please enter a nickname', 'warning')
    return
  }
  isJoining.value = true
  joinError.value = ''
  try {
    await ensureAuth()
    await joinRoom(code, store.myUid, nickname.value.trim())
    store.roomCode = code
    store.screen = 'waiting'
    showToast(`Joined room ${code}!`, 'success')
  } catch (err) {
    joinError.value = (err as Error).message
    triggerShake()
  } finally {
    isJoining.value = false
  }
}

async function handleQuickPlay() {
  if (matchmaking.value.status === 'queued') return
  if (!nickname.value.trim()) {
    showToast('Please enter a nickname', 'warning')
    return
  }

  try {
    await ensureAuth()
    matchmaking.value = {
      open: true,
      roomCode: '',
      status: 'queued',
      startedAt: Date.now(),
      countdown: 4,
      error: ''
    }
    queueSeconds.value = 0
    queueTimer = setInterval(() => {
      queueSeconds.value = Math.floor((Date.now() - matchmaking.value.startedAt) / 1000)
    }, 1000)

    showToast('Searching for players...', 'info')
    const roomCode = await quickJoinRoom(
      store.myUid,
      nickname.value.trim(),
      store.myPhotoURL,
      preferences.value
    )
    
    const roomSnap = await get(dbRef(db, `rooms/${roomCode}/meta`))
    const isHost = roomSnap.val()?.host === store.myUid

    matchmaking.value.status = 'matched'
    matchmaking.value.roomCode = roomCode
    matchmaking.value.countdown = 4
    clearQueueTimer()
    store.roomCode = roomCode

    let countdownInterval: ReturnType<typeof setInterval> | null = null
    const unsubPlayers = onValue(dbRef(db, `rooms/${roomCode}/playerCount`), (snap) => {
      const count = snap.val() || 1
      if (count >= 2 && matchmaking.value.status !== 'starting') {
        matchmaking.value.status = 'starting'
        matchmaking.value.countdown = 4
        countdownInterval = setInterval(() => {
          matchmaking.value.countdown--
          if (matchmaking.value.countdown <= 0) {
            if (countdownInterval) clearInterval(countdownInterval)
            if (isHost) startGame(roomCode).catch(console.error)
          }
        }, 1000)
      } else if (count < 2 && matchmaking.value.status === 'starting') {
        if (countdownInterval) clearInterval(countdownInterval)
        matchmaking.value.status = 'matched'
      }
    })

    const unsubMeta = onValue(dbRef(db, `rooms/${roomCode}/meta`), (snap) => {
      const meta = snap.val()
      if (meta?.status === 'playing') {
        matchmakingCleanup()
        matchmaking.value.open = false
        store.screen = 'game'
      }
    })

    matchmakingCleanup = () => {
      unsubPlayers()
      unsubMeta()
      if (countdownInterval) clearInterval(countdownInterval)
    }
  } catch (err) {
    clearQueueTimer()
    matchmaking.value.open = true
    matchmaking.value.status = 'error'
    matchmaking.value.error = (err as Error).message
  }
}

async function handleCancelQueue(message = 'Matchmaking cancelled') {
  clearQueueTimer()
  matchmakingCleanup()
  if (matchmaking.value.roomCode) {
    try {
      await leaveRoom(matchmaking.value.roomCode, store.myUid)
    } catch (err) {
      console.error('Failed to leave room:', err)
    }
  }
  matchmaking.value = {
    open: false,
    roomCode: '',
    status: 'idle',
    startedAt: 0,
    countdown: 4,
    error: ''
  }
  showToast(message, 'info')
}

function clearQueueTimer() {
  if (queueTimer) {
    clearInterval(queueTimer)
    queueTimer = null
  }
}

function triggerShake() {
  shakeInput.value = true
  setTimeout(() => (shakeInput.value = false), 500)
}

function randomizeNickname() {
  nickname.value = generateNickname()
}
onMounted(() => {
  unsubscribeLeaderboard = listenGlobalLeaderboard((entries) => {
    leaderboard.value = entries.slice(0, 8)
  })
  ;(window as any).lucide?.createIcons()
})

watch([currentTab, mode], async () => {
  await nextTick()
  ;(window as any).lucide?.createIcons()
  playSound('transition')
})

onUnmounted(() => {
  unsubscribeLeaderboard?.()
  clearQueueTimer()
})
</script>

<template>
  <div class="lobby">

    <div class="lobby__bg"></div>

    <div class="dashboard">
      <aside class="dashboard__sidebar">
        <div class="sidebar__brand">
          <h1 class="sidebar__title">GeoRush</h1>
          <p class="sidebar__tagline">How well do you know the world?</p>
        </div>
        <nav class="sidebar__nav">
          <button class="nav-item" :class="{ 'nav-item--active': currentTab === 'play' }" @click="currentTab = 'play'; playSound('click')">
            <i data-lucide="play-circle" class="nav-item__icon"></i> Play
          </button>
          <button class="nav-item" :class="{ 'nav-item--active': currentTab === 'leaderboard' }" @click="currentTab = 'leaderboard'; playSound('click')">
            <i data-lucide="trophy" class="nav-item__icon"></i> Leaderboard
          </button>
          <button class="nav-item" :class="{ 'nav-item--active': currentTab === 'profile' }" @click="currentTab = 'profile'; playSound('click')">
            <i data-lucide="user" class="nav-item__icon"></i> Profile
          </button>
        </nav>
      </aside>

      <main class="dashboard__main">
        <div class="dashboard__content">
          <!-- PLAY TAB -->
          <template v-if="currentTab === 'play'">
            <div class="play-tab">
              <div class="tab-header">
                <h2 class="tab-title">Play GeoRush</h2>
                <p class="tab-subtitle">How well do you know the world?</p>
              </div>

              <div class="lobby__field" style="margin-bottom: 2rem;">
                <label class="lobby__label">Playing As</label>
                <div class="lobby__input-row">
                  <input
                    v-model="nickname"
                    type="text"
                    class="lobby__input"
                    placeholder="Enter nickname..."
                    maxlength="16"
                    @keyup.enter="mode === 'join' ? handleJoin() : handleCreate()"
                  />
                  <button class="lobby__dice-btn" @click="randomizeNickname" title="Random nickname">
                    <i data-lucide="refresh-cw" style="width: 20px; height: 20px;"></i>
                  </button>
                </div>
              </div>

              <div class="play-modes">
                <div class="matchmaking-panel">
                  <div class="matchmaking-panel__header">
                    <div>
                      <h3 class="matchmaking-panel__title">Quick Play</h3>
                      <p class="matchmaking-panel__desc">Find compatible players by region, difficulty, and map pack.</p>
                    </div>
                    <button class="btn btn--primary" :disabled="matchmaking.status === 'queued'" @click="handleQuickPlay">
                      <i data-lucide="zap" style="width: 18px;"></i>
                      {{ matchmaking.status === 'queued' ? 'Finding...' : 'Quick Play' }}
                    </button>
                  </div>
                  <div class="matchmaking-panel__controls">
                    <label class="match-select">
                      <span>Region</span>
                      <select v-model="preferences.region">
                        <option value="world">World</option>
                        <option value="asia">Asia</option>
                        <option value="europe">Europe</option>
                        <option value="americas">Americas</option>
                        <option value="oceania">Oceania</option>
                      </select>
                    </label>
                    <label class="match-select">
                      <span>Difficulty</span>
                      <select v-model="preferences.difficulty">
                        <option value="mixed">Mixed</option>
                        <option value="easy">Easy</option>
                        <option value="medium">Medium</option>
                        <option value="hard">Hard</option>
                      </select>
                    </label>
                    <label class="match-select">
                      <span>Map Pack</span>
                      <select v-model="preferences.mapPack">
                        <option value="world">World</option>
                        <option value="urban">Urban</option>
                        <option value="landmarks">Landmarks</option>
                      </select>
                    </label>
                  </div>
                </div>

                <div
                  class="mode-card"
                  :class="{ 'mode-card--loading': isCreating }"
                  @click="!isCreating && handleCreate()"
                >
                  <div class="mode-card__icon">
                    <span v-show="isCreating" class="mode-card__spinner"></span>
                    <span v-show="!isCreating"><i data-lucide="globe"></i></span>
                  </div>
                  <div class="mode-card__content">
                    <h3 class="mode-card__title">{{ isCreating ? 'Creating Room...' : 'Create Room' }}</h3>
                    <p class="mode-card__desc">{{ isCreating ? 'Please wait...' : 'Host a private game and invite friends' }}</p>
                  </div>
                  <span v-show="!isCreating"><i data-lucide="chevron-right" class="mode-card__arrow"></i></span>
                </div>

                <template v-if="mode === 'main'">
                  <div 
                    class="mode-card" 
                    :class="{ 'mode-card--disabled': isCreating }"
                    @click="!isCreating && (mode = 'join')"
                  >
                    <div class="mode-card__icon"><span><i data-lucide="users"></i></span></div>
                    <div class="mode-card__content">
                      <h3 class="mode-card__title">Join Game</h3>
                      <p class="mode-card__desc">Enter a 4-letter room code to play</p>
                    </div>
                    <span><i data-lucide="chevron-right" class="mode-card__arrow"></i></span>
                  </div>
                </template>

                <template v-else>
                  <div class="join-active-card">
                    <label class="lobby__label">Room Code</label>
                    <input
                      v-model="joinCode"
                      type="text"
                      :class="['lobby__input', 'lobby__input--code', { 'shake': shakeInput }]"
                      placeholder="ABCD"
                      maxlength="4"
                      @keyup.enter="handleJoin"
                    />
                    <p v-if="joinError" class="lobby__error">{{ joinError }}</p>
                    <div class="lobby__actions" style="flex-direction: row; margin-top: 1rem;">
                      <button class="btn btn--primary" style="flex: 1;" :disabled="isJoining" @click="handleJoin">
                        <span v-show="isJoining" class="btn__spinner"></span>
                        <span v-show="!isJoining">Join Room</span>
                      </button>
                      <button class="btn btn--secondary" @click="mode = 'main'; joinError = ''">Cancel</button>
                    </div>
                  </div>
                </template>
              </div>

              <Transition name="queue">
                <div v-if="matchmaking.open" class="matchmaking-modal">
                  <div class="matchmaking-modal__card">
                    <div class="matchmaking-modal__pulse"></div>
                    <h3>{{ matchmaking.status === 'starting' ? 'Game starting' : matchmaking.status === 'matched' ? 'Match found' : matchmaking.status === 'error' ? 'Matchmaking failed' : 'Finding players...' }}</h3>
                    <p v-if="matchmaking.status === 'queued'">
                      {{ preferences.region }} · {{ preferences.difficulty }} · {{ preferences.mapPack }}
                    </p>
                    <p v-else-if="matchmaking.status === 'starting'">Get ready in {{ matchmaking.countdown }}...</p>
                    <p v-else-if="matchmaking.status === 'matched'">Waiting for more players...</p>
                    <p v-else>{{ matchmaking.error }}</p>
                    <div v-if="matchmaking.status !== 'starting'" class="matchmaking-modal__time">{{ queueSeconds }}s</div>
                    <button v-if="matchmaking.status === 'queued' || matchmaking.status === 'matched'" class="btn btn--secondary" @click="handleCancelQueue()">Cancel Queue</button>
                    <button v-if="matchmaking.status === 'error'" class="btn btn--primary" @click="matchmaking.open = false">Close</button>
                  </div>
                </div>
              </Transition>
            </div>
          </template>

          <!-- LEADERBOARD TAB -->
          <template v-else-if="currentTab === 'leaderboard'">
            <div class="leaderboard-tab">
              <div class="tab-header">
                <h2 class="tab-title">Global Leaderboard</h2>
                <p class="tab-subtitle">Top players worldwide based on high scores</p>
              </div>
              
              <div class="leaderboard__list-container">
                <div class="leaderboard__header-row">
                  <span>Rank</span>
                  <span>Player</span>
                  <span style="text-align: right;">High Score</span>
                </div>
                <div v-if="leaderboard.length" class="leaderboard__list">
                  <div v-for="(entry, idx) in leaderboard" :key="entry.uid || idx" class="leaderboard__row">
                    <span class="leaderboard__rank">
                      <template v-if="idx === 0">🥇</template>
                      <template v-else-if="idx === 1">🥈</template>
                      <template v-else-if="idx === 2">🥉</template>
                      <template v-else>{{ idx + 1 }}</template>
                    </span>
                    <div class="leaderboard__player">
                      <img v-if="entry.photoURL" :src="entry.photoURL" alt="" class="leaderboard__avatar" />
                      <span v-else class="leaderboard__avatar leaderboard__avatar--empty">
                        {{ entry.nickname.charAt(0).toUpperCase() }}
                      </span>
                      <span class="leaderboard__name">{{ entry.nickname }}</span>
                    </div>
                    <span class="leaderboard__score">{{ entry.bestScore.toLocaleString() }} pts</span>
                  </div>
                </div>
                <div v-else class="leaderboard__empty">
                  <span><i data-lucide="inbox" style="margin-bottom: 8px; color: var(--muted-foreground); width: 24px; height: 24px;"></i></span>
                  <p>No ranked games yet.</p>
                </div>
              </div>
            </div>
          </template>

          <!-- PROFILE TAB -->
          <template v-else-if="currentTab === 'profile'">
            <div class="profile-tab">
              <div class="tab-header">
                <h2 class="tab-title">Profile & Settings</h2>
                <p class="tab-subtitle">Manage your account, view stats and preferences</p>
              </div>
              
              <div class="profile-grid">
                <div class="settings-column">
                  <div class="settings-section">
                    <h3 class="settings-title">Account</h3>
                    <div class="settings-card">
                      <div class="lobby__auth">
                        <template v-if="isGoogleSignedIn">
                          <img v-if="store.myPhotoURL" :src="store.myPhotoURL" alt="" class="lobby__avatar" />
                          <div class="lobby__auth-copy">
                            <span class="lobby__auth-label">Signed in as</span>
                            <span class="lobby__auth-name">{{ displayName }}</span>
                          </div>
                          <button class="btn btn--ghost btn--sm" @click="handleSignOut">Sign out</button>
                        </template>
                        <button v-else class="btn btn--secondary lobby__google-btn" :disabled="isSigningIn" @click="handleGoogleSignIn">
                          <span v-if="isSigningIn" class="btn__spinner"></span>
                          <template v-else>
                            <span><i data-lucide="log-in" class="btn__icon"></i></span>
                            Continue with Google
                          </template>
                        </button>
                      </div>
                    </div>
                  </div>

                  <div class="settings-section">
                    <h3 class="settings-title">Preferences</h3>
                    <div class="settings-card">
                      <div class="setting-item">
                        <div class="setting-item__info">
                          <span class="setting-item__name">Distance Units</span>
                          <span class="setting-item__desc">Metric (km) or Imperial (miles)</span>
                        </div>
                        <select 
                          class="setting-select" 
                          :value="store.settings.units"
                          @change="e => updateSettings({ units: (e.target as HTMLSelectElement).value as any })"
                        >
                          <option>Metric</option>
                          <option>Imperial</option>
                        </select>
                      </div>
                      <div class="setting-separator"></div>
                      <div class="setting-item">
                        <div class="setting-item__info">
                          <span class="setting-item__name">Mapillary Quality</span>
                          <span class="setting-item__desc">High quality uses more bandwidth</span>
                        </div>
                        <select 
                          class="setting-select"
                          :value="store.settings.quality"
                          @change="e => updateSettings({ quality: (e.target as HTMLSelectElement).value as any })"
                        >
                          <option>Auto</option>
                          <option>High</option>
                          <option>Low</option>
                        </select>
                      </div>
                      <div class="setting-separator"></div>
                      <div class="setting-item">
                        <div class="setting-item__info">
                          <span class="setting-item__name">Sound Effects</span>
                          <span class="setting-item__desc">Enable or disable game sounds</span>
                        </div>
                        <label class="toggle-switch">
                          <input 
                            type="checkbox" 
                            :checked="store.settings.sound" 
                            @change="e => { updateSettings({ sound: (e.target as HTMLInputElement).checked }); playSound('click'); }"
                          />
                          <span class="toggle-slider"></span>
                        </label>
                      </div>
                      <div class="setting-item" style="flex-direction: column; align-items: flex-start; gap: 0.5rem;" :class="{ 'setting-item--disabled': !store.settings.sound }">
                        <div class="setting-item__info">
                          <span class="setting-item__name">Volume</span>
                        </div>
                        <div style="width: 100%; display: flex; align-items: center; gap: 1rem;">
                          <input 
                            type="range" 
                            min="0" 
                            max="1" 
                            step="0.01" 
                            class="volume-slider"
                            :disabled="!store.settings.sound"
                            :value="store.settings.volume"
                            @input="e => updateSettings({ volume: parseFloat((e.target as HTMLInputElement).value) })"
                          />
                          <span style="font-family: var(--font-mono); font-size: 0.75rem; width: 3ch;">{{ Math.round(store.settings.volume * 100) }}%</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="stats-column">
                  <div class="settings-section">
                    <h3 class="settings-title">Your Statistics</h3>
                    <div v-if="store.isAnonymous" class="guest-warning">
                      <i data-lucide="info" style="margin-right: 8px;"></i>
                      Sign in with Google to track your statistics!
                    </div>
                    <div v-else class="stats-grid">
                      <div class="stat-card">
                        <span class="stat-label">Games Played</span>
                        <span class="stat-value">{{ store.stats.gamesPlayed }}</span>
                      </div>
                      <div class="stat-card">
                        <span class="stat-label">Total Points</span>
                        <span class="stat-value">{{ store.stats.totalPoints.toLocaleString() }}</span>
                      </div>
                      <div class="stat-card">
                        <span class="stat-label">Avg. Distance</span>
                        <span class="stat-value">{{ avgDistance }}{{ store.settings.units === 'Metric' ? 'km' : 'mi' }}</span>
                      </div>
                      <div class="stat-card">
                        <span class="stat-label">Best Score</span>
                        <span class="stat-value">{{ store.stats.bestScore.toLocaleString() }}</span>
                      </div>
                    </div>
                  </div>

                  <div class="settings-section">
                    <h3 class="settings-title">Achievements</h3>
                    <div v-if="store.isAnonymous" class="guest-warning">
                      <i data-lucide="award" style="margin-right: 8px;"></i>
                      Sign in with Google to unlock achievements!
                    </div>
                    <div v-else class="achievements-list">
                      <div 
                        v-for="ach in achievements" 
                        :key="ach.id"
                        class="achievement-item"
                        :class="{ 'achievement-item--earned': ach.earned }"
                      >
                        <div class="achievement-icon" :class="{ 'achievement-icon--locked': !ach.earned }">
                          {{ ach.icon }}
                        </div>
                        <div class="achievement-info">
                          <span class="achievement-name">{{ ach.name }}</span>
                          <span class="achievement-desc">{{ ach.desc }}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </template>
        </div>
      </main>
    </div>
  </div>
</template>

<style scoped>
.lobby {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  background-image: url("/1451187580459-43490279c0fa.avif");
  background-size: cover;
  background-position: center;
}

.lobby__bg {
  position: absolute;
  inset: 0;
  /* background-color: rgba(9, 9, 11, 0.85); */
  backdrop-filter: blur(3px);
}

.lobby__dice-btn {
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 14px;
  font-size: 18px;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  color: var(--text-primary);
  align-items: center;
  justify-content: center;
}

/* Removed old starfield and heavy animations */

.dashboard {
  position: relative;
  z-index: 10;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100vh;
  background-color: transparent;
  animation: cardIn 0.3s ease-out;
}

@media (min-width: 860px) {
  .dashboard {
    flex-direction: row;
  }
}

.dashboard__sidebar {
  width: 100%;
  background-color: transparent;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

@media (min-width: 860px) {
  .dashboard__sidebar {
    width: 320px;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    padding: 3rem 2rem;
    border-bottom: none;
    border-right: 1px solid rgba(255, 255, 255, 0.05);
  }
}

.sidebar__brand {
  margin-bottom: 0;
}

@media (min-width: 860px) {
  .sidebar__brand {
    margin-bottom: 3rem;
  }
}

.sidebar__title {
  font-family: var(--font-sans);
  font-weight: 800;
  font-size: 1.5rem;
  line-height: 1;
  color: var(--foreground);
  letter-spacing: -0.05em;
  margin: 0;
  text-shadow: 0 2px 10px rgba(0,0,0,0.5);
}

@media (min-width: 860px) {
  .sidebar__title {
    font-size: 3rem;
  }
}

.sidebar__tagline {
  display: none;
  font-family: var(--font-sans);
  color: rgba(255, 255, 255, 0.9);
  text-shadow: 0 2px 8px rgba(0,0,0,0.5);
}

@media (min-width: 860px) {
  .sidebar__tagline {
    display: block;
    margin-top: 0.5rem;
  }
}

.sidebar__nav {
  display: flex;
  flex-direction: row;
  gap: 0.5rem;
}

@media (min-width: 860px) {
  .sidebar__nav {
    flex-direction: column;
    width: 100%;
    gap: 1rem;
  }
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  background: transparent;
  border: none;
  border-radius: var(--radius-full);
  color: var(--muted-foreground);
  font-family: var(--font-sans);
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: left;
  text-shadow: 0 2px 8px rgba(0,0,0,0.4);
}

@media (min-width: 860px) {
  .nav-item {
    font-size: 1.125rem;
    padding: 0.75rem 1.5rem;
  }
}

.nav-item:hover {
  background-color: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(8px);
  color: var(--foreground);
}

.nav-item--active {
  background-color: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(12px);
  color: var(--foreground);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
}

.nav-item--active:hover {
  background-color: rgba(255, 255, 255, 0.2);
}

.nav-item__icon {
  width: 20px;
  height: 20px;
}

.dashboard__main {
  flex: 1;
  padding: 1.5rem;
  overflow-y: auto;
  display: flex;
  align-items: flex-start;
  justify-content: center;
}

@media (min-width: 860px) {
  .dashboard__main {
    padding: 3rem;
    align-items: center;
    justify-content: flex-start;
  }
}

.dashboard__content {
  width: 100%;
  max-width: 800px;
  background-color: transparent;
  backdrop-filter: none;
  border: none;
  padding: 0;
  box-shadow: none;
}

.lobby__card {
  width: 100%;
}

@keyframes cardIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.lobby__auth {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-height: 52px;
  margin-bottom: 1.5rem;
  padding: 0.5rem 0.75rem;
  background-color: var(--secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

.lobby__google-btn {
  width: 100%;
}

.lobby__avatar,
.leaderboard__avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.lobby__auth-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.lobby__auth-label {
  font-family: var(--font-mono);
  color: var(--accent-teal);
  font-size: 10px;
  text-transform: uppercase;
}

.lobby__auth-name {
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lobby__field {
  margin-bottom: 24px;
}

.lobby__label {
  display: block;
  font-family: var(--font-sans);
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--foreground);
  margin-bottom: 0.5rem;
  text-shadow: 0 2px 8px rgba(0,0,0,0.5);
}

.lobby__input-row {
  display: flex;
  gap: 0.5rem;
}

.lobby__input {
  flex: 1;
  background-color: rgba(9, 9, 11, 0.6);
  border: 1px solid var(--input);
  border-radius: var(--radius-md);
  padding: 0.5rem 0.75rem;
  color: var(--foreground);
  font-family: var(--font-sans);
  font-size: 0.875rem;
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.lobby__input:focus {
  border-color: var(--ring);
  box-shadow: 0 0 0 1px var(--ring);
}

.lobby__input::placeholder {
  color: var(--text-muted);
}

.lobby__input--code {
  font-family: 'JetBrains Mono', monospace;
  font-size: 24px;
  text-align: center;
  letter-spacing: 8px;
  text-transform: uppercase;
  padding: 16px;
}

.lobby__dice-btn {
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 14px;
  font-size: 18px;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.lobby__dice-btn:hover {
  background: var(--bg-hover);
  border-color: var(--border-active);
  transform: rotate(90deg);
}

.lobby__actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 8px;
}

.lobby__join-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.lobby__error {
  color: var(--accent-danger);
  font-family: 'DM Sans', sans-serif;
  font-size: 13px;
  margin: 0;
  padding: 0 4px;
}

.lobby__footer {
  text-align: center;
  margin-top: 32px;
  font-family: 'DM Sans', sans-serif;
  font-size: 12px;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.lobby__dot {
  opacity: 0.4;
}

.lobby__version {
  font-family: var(--font-mono);
  font-size: 0.75rem;
}

.lobby__leaderboard {
  width: 100%;
}

.tab-header {
  margin-bottom: 1.5rem;
}

.tab-title {
  font-family: var(--font-sans);
  font-weight: 700;
  font-size: 1.5rem;
  color: var(--foreground);
  margin: 0 0 0.25rem;
  text-shadow: 0 2px 8px rgba(0,0,0,0.5);
}

.tab-subtitle {
  font-family: var(--font-sans);
  color: rgba(255, 255, 255, 0.9);
  font-size: 0.875rem;
  margin: 0;
  text-shadow: 0 2px 8px rgba(0,0,0,0.5);
}

/* PLAY TAB */
.play-modes {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.matchmaking-panel {
  padding: 1.25rem;
  background: rgba(9, 9, 11, 0.6);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: var(--radius-md);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

.matchmaking-panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}

.matchmaking-panel__title {
  margin: 0 0 0.25rem;
  font-size: 1.125rem;
}

.matchmaking-panel__desc {
  margin: 0;
  color: var(--muted-foreground);
  font-size: 0.875rem;
}

.matchmaking-panel__controls {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
}

.match-select {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  color: var(--muted-foreground);
  font-size: 0.75rem;
  font-weight: 700;
}

.match-select select {
  width: 100%;
  min-height: 38px;
  background: rgba(9, 9, 11, 0.7);
  color: var(--foreground);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 0.45rem 0.6rem;
}

.matchmaking-modal {
  position: fixed;
  inset: 0;
  z-index: 120;
  display: grid;
  place-items: center;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(10px);
}

.matchmaking-modal__card {
  width: min(92vw, 360px);
  padding: 1.5rem;
  border-radius: var(--radius);
  border: 1px solid rgba(250, 250, 250, 0.12);
  background: rgba(9, 9, 11, 0.92);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.55);
  text-align: center;
}

.matchmaking-modal__pulse {
  width: 52px;
  height: 52px;
  margin: 0 auto 1rem;
  border-radius: 50%;
  border: 3px solid var(--primary);
  animation: queuePulse 1.2s ease-in-out infinite;
}

.matchmaking-modal__card h3 {
  margin: 0 0 0.5rem;
}

.matchmaking-modal__card p {
  margin: 0;
  color: var(--muted-foreground);
}

.matchmaking-modal__time {
  margin: 1rem 0;
  font-family: var(--font-mono);
  font-size: 1.6rem;
  font-weight: 800;
}

@keyframes queuePulse {
  0%, 100% { transform: scale(0.92); opacity: 0.65; }
  50% { transform: scale(1.08); opacity: 1; }
}

.queue-enter-active,
.queue-leave-active {
  transition: opacity 0.2s ease;
}

.queue-enter-from,
.queue-leave-to {
  opacity: 0;
}

.mode-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1.25rem;
  background-color: rgba(9, 9, 11, 0.6);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: var(--radius-md);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  cursor: pointer;
  transition: all 0.2s ease;
}

.mode-card:hover:not(.mode-card--loading) {
  background-color: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.1);
  transform: translateY(-2px);
}

.mode-card--disabled {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
  filter: grayscale(0.5);
}

.mode-card--loading {
  opacity: 0.85;
  cursor: not-allowed;
}

.mode-card__icon {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background-color: var(--primary);
  color: var(--primary-foreground);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.mode-card__content {
  flex: 1;
}

.mode-card__title {
  margin: 0 0 0.25rem;
  font-family: var(--font-sans);
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--foreground);
}

.mode-card__desc {
  margin: 0;
  font-family: var(--font-sans);
  font-size: 0.875rem;
  color: var(--muted-foreground);
}

.mode-card__arrow {
  color: var(--muted-foreground);
  width: 20px;
  height: 20px;
}

.mode-card__spinner {
  width: 22px;
  height: 22px;
  border: 2px solid rgba(0, 0, 0, 0.2);
  border-top-color: var(--primary-foreground);
  border-radius: 50%;
  animation: modeSpin 0.8s linear infinite;
  display: block;
}

@keyframes modeSpin {
  to { transform: rotate(360deg); }
}

.join-active-card {
  padding: 1.5rem;
  background-color: rgba(39, 39, 42, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: var(--radius-md);
  animation: cardIn 0.3s ease;
}

/* SETTINGS & PROFILE */
.settings-section {
  margin-bottom: 1.5rem;
}

.settings-title {
  font-family: var(--font-sans);
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--foreground);
  margin: 0 0 0.75rem;
}

.settings-card {
  background-color: rgba(39, 39, 42, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.setting-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem;
}

.setting-item__info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.setting-item__name {
  font-family: var(--font-sans);
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--foreground);
}

.setting-item__desc {
  font-family: var(--font-sans);
  font-size: 0.75rem;
  color: var(--muted-foreground);
}

.setting-select {
  background-color: var(--background);
  color: var(--foreground);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 0.5rem;
  font-family: var(--font-sans);
  font-size: 0.875rem;
  outline: none;
  cursor: pointer;
}

.setting-separator {
  height: 1px;
  background-color: rgba(255, 255, 255, 0.05);
  margin: 0 1.25rem;
}

/* PROFILE GRID */
.profile-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
}

.stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

.stat-card {
  background-color: rgba(39, 39, 42, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: var(--radius-md);
  padding: 0.75rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.stat-label {
  font-family: var(--font-sans);
  font-size: 0.7rem;
  color: var(--muted-foreground);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.stat-value {
  font-family: var(--font-mono);
  font-size: 1.125rem;
  font-weight: 700;
  color: var(--foreground);
}

/* ACHIEVEMENTS */
.achievements-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.achievement-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  background-color: rgba(39, 39, 42, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: var(--radius-md);
  opacity: 0.6;
}

.achievement-item--earned {
  opacity: 1;
  background-color: rgba(250, 250, 250, 0.05);
  border-color: rgba(250, 250, 250, 0.1);
}

.achievement-icon {
  font-size: 1.25rem;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgba(0, 0, 0, 0.2);
  border-radius: 50%;
}

.achievement-icon--locked {
  filter: grayscale(1);
  opacity: 0.5;
}

.achievement-info {
  display: flex;
  flex-direction: column;
}

.achievement-name {
  font-family: var(--font-sans);
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--foreground);
}

.achievement-desc {
  font-family: var(--font-sans);
  font-size: 0.7rem;
  color: var(--muted-foreground);
}

.guest-warning {
  display: flex;
  align-items: center;
  padding: 1rem;
  background-color: rgba(234, 179, 8, 0.15); /* amber tint */
  border: 1px solid rgba(234, 179, 8, 0.4);
  border-radius: var(--radius-md);
  color: rgba(253, 230, 138, 1);
  font-family: var(--font-sans);
  font-size: 0.9rem;
  font-weight: 500;
  margin-top: 0.5rem;
}

/* TOGGLE SWITCH */
.toggle-switch {
  position: relative;
  display: inline-block;
  width: 40px;
  height: 20px;
}

.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--muted);
  transition: .3s;
  border-radius: 20px;
}

.toggle-slider:before {
  position: absolute;
  content: "";
  height: 14px;
  width: 14px;
  left: 3px;
  bottom: 3px;
  background-color: white;
  transition: .3s;
  border-radius: 50%;
}

input:checked + .toggle-slider {
  background-color: var(--primary);
}

input:checked + .toggle-slider:before {
  transform: translateX(20px);
}
input:checked + .toggle-slider:before {
  background-color: var(--primary-foreground);
}

/* VOLUME SLIDER */
.volume-slider {
  appearance: none;
  width: 100%;
  height: 6px;
  border-radius: 5px;
  background: rgba(255, 255, 255, 0.1);
  outline: none;
  cursor: pointer;
}

.volume-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--primary);
  cursor: pointer;
  border: 2px solid var(--background);
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
  transition: transform 0.1s ease;
}

.volume-slider::-webkit-slider-thumb:hover {
  transform: scale(1.2);
}

.volume-slider::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--primary);
  cursor: pointer;
  border: 2px solid var(--background);
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
}

.volume-slider:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.volume-slider:disabled::-webkit-slider-thumb {
  background: var(--muted-foreground);
  cursor: not-allowed;
}

.setting-item--disabled {
  opacity: 0.5;
  pointer-events: none;
}

.mode-card__spinner {
  width: 24px;
  height: 24px;
  border: 2px solid rgba(0, 0, 0, 0.1);
  border-top-color: var(--primary-foreground);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 1024px) {
  .profile-grid {
    grid-template-columns: 1fr;
    gap: 1.5rem;
  }
}

/* LEADERBOARD */
.leaderboard__list-container {
  background-color: rgba(39, 39, 42, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.leaderboard__header-row {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr) 100px;
  gap: 12px;
  padding: 0.75rem 1rem;
  background-color: rgba(0, 0, 0, 0.2);
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  font-family: var(--font-sans);
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted-foreground);
}

.leaderboard__list {
  display: flex;
  flex-direction: column;
}

.leaderboard__row {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  padding: 1rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  transition: background-color 0.2s ease;
}

.leaderboard__row:last-child {
  border-bottom: none;
}

.leaderboard__row:hover {
  background-color: rgba(255, 255, 255, 0.05);
}

.leaderboard__rank {
  font-family: var(--font-mono);
  color: var(--muted-foreground);
  font-size: 0.875rem;
  text-align: center;
  font-weight: 600;
}

.leaderboard__player {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.leaderboard__avatar--empty {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background-color: var(--muted-foreground);
  color: var(--background);
  font-family: var(--font-sans);
  font-size: 1rem;
  font-weight: 600;
}

.leaderboard__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--foreground);
  font-family: var(--font-sans);
  font-size: 0.875rem;
  font-weight: 500;
}

.leaderboard__score {
  color: var(--foreground);
  font-family: var(--font-mono);
  font-size: 0.875rem;
  font-weight: 700;
  text-align: right;
}

.leaderboard__empty {
  color: var(--muted-foreground);
  font-family: var(--font-sans);
  font-size: 0.875rem;
  margin: 0;
  padding: 3rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}


.shake {
  animation: shake 0.4s ease;
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-8px); }
  40% { transform: translateX(8px); }
  60% { transform: translateX(-6px); }
  80% { transform: translateX(6px); }
}

@media (max-width: 1024px) {
  .profile-grid {
    grid-template-columns: 1fr;
    gap: 1.5rem;
  }
}

@media (max-width: 768px) {
  .lobby {
    align-items: stretch;
    justify-content: stretch;
    min-height: 100dvh;
    min-height: 100svh;
    padding: env(safe-area-inset-top) 0 env(safe-area-inset-bottom);
  }
  .dashboard {
    flex-direction: column;
    min-height: 100dvh;
    height: auto;
    border-radius: 0;
    border: none;
  }
  .dashboard__sidebar {
    width: 100%;
    border-right: none;
    border-bottom: none;
    padding: 1rem 1.15rem 1rem 1.15rem;
  }
  .sidebar__brand {
    display: none;
  }
  .sidebar__nav {
    flex-direction: row;
    justify-content: center;
    gap: 0.5rem;
  }
  .nav-item {
    padding: 0.5rem 0.6rem;
    font-size: 0.8rem;
  }
  .nav-item--active {
    border-radius: 5px;
  }
  .dashboard__main {
    padding: 1rem;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }
  .matchmaking-panel__header {
    flex-direction: column;
  }
  .matchmaking-panel__header .btn {
    width: 100%;
  }
  .matchmaking-panel__controls {
    grid-template-columns: 1fr;
  }
  .stats-grid {
    grid-template-columns: 1fr;
  }
}
</style>
