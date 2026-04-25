<script setup lang="ts">
import { onMounted, onUnmounted, computed, ref } from 'vue'
import { store, isHost, playerCount, resetStore } from '../../store'
import {
  db, dbRef, onValue, leaveRoom, startGame
} from '../../firebase'
import type { Unsubscribe } from '../../firebase'
import type { PlayerData, RoomMeta } from '../../types'
import { globalToast } from '../../composables/useToast'
import { copyToClipboard } from '../../utils'

const { showToast } = globalToast

const unsubs: Unsubscribe[] = []
const copied = ref(false)
const isStarting = ref(false)

const canStart = computed(() => isHost.value && playerCount.value >= 2)

const playerList = computed(() => {
  return Object.entries(store.players)
    .map(([uid, p]) => ({
      uid,
      ...p,
      isHost: store.meta?.host === uid,
      isMe: uid === store.myUid
    }))
    .sort((a, b) => a.joinedAt - b.joinedAt)
})

onMounted(() => {
  const code = store.roomCode
  if (!code) return


  const playersRef = dbRef(db, `rooms/${code}/players`)
  const unsubPlayers = onValue(playersRef, (snap) => {
    const val = snap.val() as Record<string, PlayerData> | null
    const oldPlayerUids = new Set(Object.keys(store.players))
    store.players = val ?? {}


    if (val) {
      const newPlayerUids = new Set(Object.keys(val))
      for (const uid of oldPlayerUids) {
        if (!newPlayerUids.has(uid) && uid !== store.myUid) {
          showToast('A player left the room', 'warning')
        }
      }

      for (const uid of newPlayerUids) {
        if (!oldPlayerUids.has(uid) && uid !== store.myUid && oldPlayerUids.size > 0) {
          showToast(`${val[uid].nickname} joined!`, 'info')
        }
      }
    }


    if (!val || !val[store.myUid]) {
      showToast('You were removed from the room', 'error')
      resetStore()
      return
    }
  })
  unsubs.push(unsubPlayers)


  const metaRef = dbRef(db, `rooms/${code}/meta`)
  const unsubMeta = onValue(metaRef, (snap) => {
    const val = snap.val() as RoomMeta | null
    if (!val) {
      resetStore()
      return
    }
    store.meta = val

    if (val.status === 'playing') {
      store.screen = 'game'
    }
  })
  unsubs.push(unsubMeta)


  const locsRef = dbRef(db, `rooms/${code}/locations`)
  const unsubLocs = onValue(locsRef, (snap) => {
    store.locations = snap.val() ?? {}
  })
  unsubs.push(unsubLocs)

  ;(window as any).lucide?.createIcons()
})

onUnmounted(() => {
  unsubs.forEach((fn) => fn())
})

async function handleCopy() {
  const success = await copyToClipboard(store.roomCode)
  if (success) {
    copied.value = true
    showToast('Room code copied!', 'success')
    setTimeout(() => (copied.value = false), 2000)
  }
}

async function handleStart() {
  isStarting.value = true
  try {
    await startGame(store.roomCode)
  } catch (err) {
    showToast(`Failed to start: ${(err as Error).message}`, 'error')
  } finally {
    isStarting.value = false
  }
}

async function handleLeave() {
  try {
    await leaveRoom(store.roomCode, store.myUid)
    resetStore()
    showToast('Left the room', 'info')
  } catch (err) {
    showToast(`Error leaving: ${(err as Error).message}`, 'error')
  }
}
</script>

<template>
  <div class="waiting">
    <div class="waiting__bg">
      <div class="starfield"></div>
      <div class="gradient-overlay"></div>
    </div>

    <div class="waiting__card">

      <div class="waiting__header">
        <h2 class="waiting__subtitle">Waiting Room</h2>
        <div class="waiting__live-indicator">
          <span class="pulse-dot"></span>
          <span>Live</span>
        </div>
      </div>


      <div class="waiting__code-section">
        <p class="waiting__code-label">Room Code</p>
        <div class="waiting__code-display" @click="handleCopy">
          <span class="waiting__code">{{ store.roomCode }}</span>
          <button class="waiting__copy-btn">
            {{ copied ? '✓' : '' }} <i data-lucide="copy" style="width: 14px;"></i> {{ copied ? 'Copied' : 'Copy' }}
          </button>
        </div>
        <p class="waiting__code-hint">Share this code with friends to join</p>
      </div>


      <div class="waiting__count">
        <span class="waiting__count-num">{{ playerCount }}</span>
        <span class="waiting__count-sep">/</span>
        <span class="waiting__count-max">6</span>
        <span class="waiting__count-label">players</span>
      </div>


      <div class="waiting__players">
        <TransitionGroup name="player-list" tag="div" class="waiting__player-list">
          <div
            v-for="player in playerList"
            :key="player.uid"
            class="waiting__player"
          >
            <img v-if="player.photoURL" :src="player.photoURL" alt="" class="waiting__avatar waiting__avatar--photo" />
            <div v-else class="waiting__avatar" :style="{ backgroundColor: player.color }">
              {{ player.nickname.charAt(0).toUpperCase() }}
            </div>
            <div class="waiting__player-info">
              <span class="waiting__player-name">
                {{ player.nickname }}
                <span v-if="player.isMe" class="waiting__me-badge">You</span>
              </span>
              <span v-if="player.isHost" class="waiting__host-badge"><i data-lucide="crown" style="width: 14px; height: 14px; vertical-align: middle;"></i> Host</span>
            </div>
          </div>
        </TransitionGroup>
      </div>


      <div class="waiting__actions">
        <button
          v-if="isHost"
          class="btn btn--primary btn--large"
          :disabled="!canStart || isStarting"
          @click="handleStart"
        >
          <span v-if="isStarting" class="btn__spinner"></span>
          <template v-else-if="!canStart"><i data-lucide="users" style="width: 18px;"></i> Need 2+ players</template>
          <template v-else><i data-lucide="play" style="width: 18px;"></i> Start Game</template>
        </button>
        <p v-else class="waiting__status-text">
          <span class="pulse-dot pulse-dot--gold"></span>
          Waiting for host to start...
        </p>
        <button class="btn btn--ghost" @click="handleLeave">Leave Room</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.waiting {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.waiting__bg {
  position: absolute;
  inset: 0;
  background: var(--bg-deep);
  overflow: hidden;
}

.starfield {
  position: absolute;
  inset: 0;
}

.starfield::before {
  content: '';
  position: absolute;
  width: 2px;
  height: 2px;
  border-radius: 50%;
  box-shadow:
    40vw 10vh 0 0 rgba(255,255,255,0.3),
    80vw 20vh 0 0 rgba(255,255,255,0.2),
    20vw 40vh 0 0 rgba(255,255,255,0.4),
    60vw 60vh 0 0 rgba(255,255,255,0.15),
    10vw 80vh 0 0 rgba(255,255,255,0.3),
    90vw 30vh 0 0 rgba(255,255,255,0.25),
    50vw 50vh 0 0 rgba(255,255,255,0.2),
    30vw 70vh 0 0 rgba(255,255,255,0.35);
  animation: drift 80s linear infinite;
}

@keyframes drift {
  from { transform: translateY(0) translateX(0); }
  to { transform: translateY(-30px) translateX(15px); }
}

.gradient-overlay {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse at 30% 40%, rgba(45, 212, 191, 0.06) 0%, transparent 60%),
    radial-gradient(ellipse at 70% 70%, rgba(245, 200, 66, 0.05) 0%, transparent 50%);
}

.waiting__card {
  position: relative;
  z-index: 10;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 40px;
  max-width: 480px;
  width: 92vw;
  box-shadow: var(--shadow-deep);
  animation: cardIn 0.5s ease-out;
}

@keyframes cardIn {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

.waiting__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 28px;
}

.waiting__subtitle {
  font-family: 'Bebas Neue', sans-serif;
  font-size: 32px;
  color: var(--text-primary);
  margin: 0;
  letter-spacing: 2px;
}

.waiting__live-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: var(--accent-teal);
  text-transform: uppercase;
  letter-spacing: 1px;
}

.pulse-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent-teal);
  animation: pulse 1.5s ease-in-out infinite;
  flex-shrink: 0;
}

.pulse-dot--gold {
  background: var(--accent-gold);
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(0.8); }
}

.waiting__code-section {
  text-align: center;
  margin-bottom: 24px;
}

.waiting__code-label {
  font-family: 'DM Sans', sans-serif;
  font-size: 12px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 1.5px;
  margin: 0 0 8px;
}

.waiting__code-display {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 16px 24px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.waiting__code-display:hover {
  border-color: var(--border-active);
  background: var(--bg-hover);
}

.waiting__code {
  font-family: 'JetBrains Mono', monospace;
  font-size: 40px;
  font-weight: 700;
  color: var(--accent-gold);
  letter-spacing: 12px;
}

.waiting__copy-btn {
  background: none;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-family: 'DM Sans', sans-serif;
  font-size: 12px;
  padding: 6px 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.waiting__copy-btn:hover {
  color: var(--text-primary);
  border-color: var(--border-active);
}

.waiting__code-hint {
  font-family: 'DM Sans', sans-serif;
  font-size: 12px;
  color: var(--text-muted);
  margin: 10px 0 0;
}

.waiting__count {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 4px;
  margin-bottom: 16px;
  font-family: 'JetBrains Mono', monospace;
}

.waiting__count-num {
  font-size: 28px;
  font-weight: 700;
  color: var(--accent-teal);
}

.waiting__count-sep {
  font-size: 20px;
  color: var(--text-muted);
}

.waiting__count-max {
  font-size: 20px;
  color: var(--text-muted);
}

.waiting__count-label {
  font-size: 13px;
  color: var(--text-secondary);
  margin-left: 6px;
  font-family: 'DM Sans', sans-serif;
}

.waiting__players {
  margin-bottom: 24px;
}

.waiting__player-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.waiting__player {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  transition: all 0.3s ease;
}

.waiting__player:hover {
  background: var(--bg-hover);
}

.waiting__avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Bebas Neue', sans-serif;
  font-size: 20px;
  color: var(--bg-deep);
  font-weight: 700;
  flex-shrink: 0;
}

.waiting__avatar--photo {
  object-fit: cover;
  border: 2px solid rgba(255, 255, 255, 0.16);
}

.waiting__player-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: 1;
}

.waiting__player-name {
  font-family: 'DM Sans', sans-serif;
  font-size: 15px;
  color: var(--text-primary);
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 8px;
}

.waiting__me-badge {
  font-size: 10px;
  background: rgba(45, 212, 191, 0.15);
  color: var(--accent-teal);
  padding: 2px 8px;
  border-radius: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 600;
}

.waiting__host-badge {
  font-size: 12px;
  color: var(--accent-gold);
}

.waiting__actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.waiting__status-text {
  display: flex;
  align-items: center;
  gap: 10px;
  font-family: 'DM Sans', sans-serif;
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0;
  padding: 14px 0;
}


.player-list-enter-active {
  animation: slideIn 0.3s ease-out;
}

.player-list-leave-active {
  animation: slideOut 0.3s ease-in;
}

@keyframes slideIn {
  from { opacity: 0; transform: translateX(-20px); }
  to { opacity: 1; transform: translateX(0); }
}

@keyframes slideOut {
  from { opacity: 1; transform: translateX(0); }
  to { opacity: 0; transform: translateX(20px); }
}

@media (max-width: 480px) {
  .waiting__card { padding: 28px 20px; }
  .waiting__code { font-size: 32px; letter-spacing: 8px; }
  .waiting__subtitle { font-size: 26px; }
}
</style>
