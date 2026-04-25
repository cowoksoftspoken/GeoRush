<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { store } from '../../store'
import {
  createRoom,
  joinRoom,
  listenGlobalLeaderboard,
  signInWithGoogle,
  signOutUser,
  type Unsubscribe
} from '../../firebase'
import { generateNickname } from '../../utils'
import { globalToast } from '../../composables/useToast'
import type { GlobalLeaderboardEntry } from '../../types'

const { showToast } = globalToast

const mode = ref<'main' | 'join'>('main')
const joinCode = ref('')
const nickname = ref(store.myNickname || generateNickname())
const isCreating = ref(false)
const isJoining = ref(false)
const joinError = ref('')
const shakeInput = ref(false)
const isSigningIn = ref(false)
const leaderboard = ref<GlobalLeaderboardEntry[]>([])
let unsubscribeLeaderboard: Unsubscribe | null = null

const isGoogleSignedIn = computed(() => Boolean(store.myUid && !store.isAnonymous))
const displayName = computed(() => store.myNickname || 'Player')

async function ensureAuth() {
  if (!isGoogleSignedIn.value) {
    const user = await signInWithGoogle()
    store.myUid = user.uid
    store.myPhotoURL = user.photoURL ?? ''
    store.myEmail = user.email ?? ''
    store.isAnonymous = false
    if (!nickname.value.trim() && user.displayName) {
      nickname.value = user.displayName
    }
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
  if (!nickname.value.trim()) {
    showToast('Please enter a nickname', 'warning')
    return
  }
  isCreating.value = true
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
  }
}

async function handleJoin() {
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

onUnmounted(() => {
  unsubscribeLeaderboard?.()
})
</script>

<template>
  <div class="lobby">

    <div class="lobby__bg">
      <div class="starfield"></div>
      <div class="gradient-overlay"></div>
    </div>

    <div class="lobby__layout">

    <div class="lobby__card">

      <div class="lobby__logo">
        <h1 class="lobby__title">GeoRush</h1>
        <p class="lobby__tagline">How well do you know the world?</p>
      </div>

      <div class="lobby__auth">
        <template v-if="isGoogleSignedIn">
          <img v-if="store.myPhotoURL" :src="store.myPhotoURL" alt="" class="lobby__avatar" />
          <div class="lobby__auth-copy">
            <span class="lobby__auth-label">Signed in</span>
            <span class="lobby__auth-name">{{ displayName }}</span>
          </div>
          <button class="btn btn--ghost btn--sm" @click="handleSignOut">Sign out</button>
        </template>
        <button v-else class="btn btn--secondary lobby__google-btn" :disabled="isSigningIn" @click="handleGoogleSignIn">
          <span v-if="isSigningIn" class="btn__spinner"></span>
          <template v-else>
            <i data-lucide="log-in" class="btn__icon"></i>
            Continue with Google
          </template>
        </button>
      </div>


      <div class="lobby__field">
        <label class="lobby__label">Your Name</label>
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


      <template v-if="mode === 'main'">
        <div class="lobby__actions">
          <button class="btn btn--primary btn--large" :disabled="isCreating" @click="handleCreate">
            <span v-if="isCreating" class="btn__spinner"></span>
            <template v-else>
              <i data-lucide="plus-circle" class="btn__icon"></i>
              Create Room
            </template>
          </button>
          <button class="btn btn--secondary btn--large" @click="mode = 'join'">
            <i data-lucide="link" class="btn__icon"></i>
            Join Room
          </button>
        </div>
      </template>


      <template v-else>
        <div class="lobby__join-section">
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
          <div class="lobby__actions">
            <button class="btn btn--primary btn--large" :disabled="isJoining" @click="handleJoin">
              <span v-if="isJoining" class="btn__spinner"></span>
              <template v-else>Join Game</template>
            </button>
            <button class="btn btn--ghost" @click="mode = 'main'; joinError = ''">
              ← Back
            </button>
          </div>
        </div>
      </template>


      <p class="lobby__footer">
        <span class="lobby__version">v1.0</span>
        <span class="lobby__dot">·</span>
        <span>Real-time multiplayer</span>
        <span class="lobby__dot">·</span>
        <span>Mapillary powered</span>
      </p>
    </div>
    <aside class="lobby__leaderboard">
      <div class="leaderboard__header">
        <h2 class="leaderboard__title">Leaderboard</h2>
        <span class="leaderboard__pill">Global</span>
      </div>
      <div v-if="leaderboard.length" class="leaderboard__list">
        <div v-for="(entry, idx) in leaderboard" :key="entry.uid" class="leaderboard__row">
          <span class="leaderboard__rank">{{ idx + 1 }}</span>
          <img v-if="entry.photoURL" :src="entry.photoURL" alt="" class="leaderboard__avatar" />
          <span v-else class="leaderboard__avatar leaderboard__avatar--empty">
            {{ entry.nickname.charAt(0).toUpperCase() }}
          </span>
          <span class="leaderboard__name">{{ entry.nickname }}</span>
          <span class="leaderboard__score">{{ entry.bestScore.toLocaleString() }}</span>
        </div>
      </div>
      <p v-else class="leaderboard__empty">No ranked games yet.</p>
    </aside>
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
}

.lobby__bg {
  position: absolute;
  inset: 0;
  background: var(--bg-deep);
  overflow: hidden;
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

.starfield {
  position: absolute;
  inset: 0;
  background: transparent;
}

.starfield::before,
.starfield::after {
  content: '';
  position: absolute;
  width: 2px;
  height: 2px;
  border-radius: 50%;
  animation: drift 60s linear infinite;
}

.starfield::before {
  box-shadow:
    40vw 10vh 0 0 rgba(255,255,255,0.3),
    80vw 20vh 0 0 rgba(255,255,255,0.2),
    20vw 40vh 0 0 rgba(255,255,255,0.4),
    60vw 60vh 0 0 rgba(255,255,255,0.15),
    10vw 80vh 0 0 rgba(255,255,255,0.3),
    90vw 30vh 0 0 rgba(255,255,255,0.25),
    50vw 50vh 0 0 rgba(255,255,255,0.2),
    30vw 70vh 0 0 rgba(255,255,255,0.35),
    70vw 85vh 0 0 rgba(255,255,255,0.15),
    15vw 15vh 0 0 rgba(255,255,255,0.3),
    85vw 45vh 0 0 rgba(255,255,255,0.2),
    45vw 25vh 0 0 rgba(255,255,255,0.25),
    5vw 55vh 0 0 rgba(255,255,255,0.4),
    75vw 75vh 0 0 rgba(255,255,255,0.2),
    25vw 90vh 0 0 rgba(255,255,255,0.15),
    95vw 5vh 0 0 rgba(255,255,255,0.3),
    55vw 35vh 0 0 rgba(255,255,255,0.25),
    35vw 65vh 0 0 rgba(255,255,255,0.3),
    65vw 95vh 0 0 rgba(255,255,255,0.2),
    12vw 42vh 0 0 rgba(255,255,255,0.35);
  animation-duration: 80s;
}

.starfield::after {
  box-shadow:
    22vw 8vh 0 0 rgba(245,200,66,0.2),
    78vw 35vh 0 0 rgba(45,212,191,0.15),
    42vw 72vh 0 0 rgba(245,200,66,0.15),
    88vw 88vh 0 0 rgba(45,212,191,0.2),
    8vw 28vh 0 0 rgba(245,200,66,0.1),
    58vw 48vh 0 0 rgba(45,212,191,0.15),
    32vw 18vh 0 0 rgba(255,255,255,0.3),
    68vw 58vh 0 0 rgba(255,255,255,0.2),
    48vw 82vh 0 0 rgba(255,255,255,0.25),
    92vw 12vh 0 0 rgba(255,255,255,0.15);
  animation-duration: 100s;
  animation-direction: reverse;
}

@keyframes drift {
  from { transform: translateY(0) translateX(0); }
  to { transform: translateY(-30px) translateX(15px); }
}

.gradient-overlay {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse at 20% 50%, rgba(45, 212, 191, 0.06) 0%, transparent 60%),
    radial-gradient(ellipse at 80% 20%, rgba(245, 200, 66, 0.05) 0%, transparent 50%),
    radial-gradient(ellipse at 50% 80%, rgba(244, 63, 94, 0.04) 0%, transparent 50%);
  animation: gradientPulse 8s ease-in-out infinite alternate;
}

@keyframes gradientPulse {
  from { opacity: 0.6; }
  to { opacity: 1; }
}

.lobby__layout {
  position: relative;
  z-index: 10;
  display: grid;
  grid-template-columns: minmax(320px, 420px) minmax(280px, 360px);
  gap: 20px;
  align-items: stretch;
  width: min(94vw, 820px);
}

.lobby__card {
  position: relative;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 48px 40px;
  box-shadow: var(--shadow-deep);
  backdrop-filter: blur(20px);
  animation: cardIn 0.6s ease-out;
}

@keyframes cardIn {
  from {
    opacity: 0;
    transform: translateY(30px) scale(0.97);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.lobby__logo {
  text-align: center;
  margin-bottom: 36px;
}

.lobby__title {
  font-family: 'Bebas Neue', sans-serif;
  font-size: 72px;
  line-height: 1;
  background: linear-gradient(135deg, var(--accent-gold), #fff 60%, var(--accent-gold));
  background-size: 200% 200%;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  animation: shimmer 4s ease-in-out infinite;
  margin: 0;
  letter-spacing: 4px;
}

@keyframes shimmer {
  0%, 100% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
}

.lobby__tagline {
  font-family: 'DM Sans', sans-serif;
  color: var(--text-secondary);
  font-size: 15px;
  margin: 8px 0 0;
  font-weight: 400;
}

.lobby__auth {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 52px;
  margin-bottom: 22px;
  padding: 10px;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
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
  font-family: 'DM Sans', sans-serif;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 1.5px;
  margin-bottom: 8px;
}

.lobby__input-row {
  display: flex;
  gap: 8px;
}

.lobby__input {
  flex: 1;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 14px 16px;
  color: var(--text-primary);
  font-family: 'DM Sans', sans-serif;
  font-size: 15px;
  outline: none;
  transition: border-color 0.3s ease, box-shadow 0.3s ease;
}

.lobby__input:focus {
  border-color: var(--border-active);
  box-shadow: 0 0 0 3px rgba(245, 200, 66, 0.1);
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
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
}

.lobby__leaderboard {
  background: rgba(26, 29, 36, 0.88);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 24px;
  box-shadow: var(--shadow-deep);
  backdrop-filter: blur(20px);
  animation: cardIn 0.6s ease-out;
  overflow: hidden;
}

.leaderboard__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.leaderboard__title {
  margin: 0;
  font-family: var(--font-heading);
  font-size: 30px;
  color: var(--text-primary);
  letter-spacing: 1.5px;
}

.leaderboard__pill {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--accent-teal);
  border: 1px solid rgba(45, 212, 191, 0.28);
  border-radius: 999px;
  padding: 4px 8px;
  text-transform: uppercase;
}

.leaderboard__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.leaderboard__row {
  display: grid;
  grid-template-columns: 22px 34px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  padding: 10px;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
}

.leaderboard__rank {
  font-family: var(--font-mono);
  color: var(--text-muted);
  font-size: 12px;
  text-align: center;
}

.leaderboard__avatar--empty {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--accent-gold);
  color: var(--bg-deep);
  font-family: var(--font-heading);
  font-size: 18px;
}

.leaderboard__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 600;
}

.leaderboard__score {
  color: var(--accent-gold);
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 700;
}

.leaderboard__empty {
  color: var(--text-secondary);
  font-size: 13px;
  margin: 0;
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

@media (max-width: 860px) {
  .lobby {
    align-items: flex-start;
    overflow-y: auto;
    padding: 24px 0;
  }

  .lobby__layout {
    grid-template-columns: 1fr;
    width: min(92vw, 480px);
  }
}

@media (max-width: 480px) {
  .lobby__card {
    padding: 32px 24px;
  }
  .lobby__title {
    font-size: 56px;
  }
}
</style>
