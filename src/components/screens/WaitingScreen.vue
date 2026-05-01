<script setup lang="ts">
import { onMounted, onUnmounted, computed, ref } from 'vue'
import { store, isHost, playerCount, resetStore } from '../../store'
import {
  db, dbRef, onValue, leaveRoom, startGame, updatePlayerReady
} from '../../firebase'
import type { Unsubscribe } from '../../firebase'
import type { PlayerData, RoomMeta } from '../../types'
import { globalToast } from '../../composables/useToast'
import { copyToClipboard } from '../../utils'
import PlayerAvatar from '../ui/PlayerAvatar.vue'

const { showToast } = globalToast

const unsubs: Unsubscribe[] = []
const copied = ref(false)
const isStarting = ref(false)

const readyCount = computed(() => Object.values(store.players).filter((player) => player.ready).length)
const allReady = computed(() => playerCount.value >= 2 && readyCount.value === playerCount.value)
const canStart = computed(() => isHost.value && allReady.value)
const myReady = computed(() => Boolean(store.players[store.myUid]?.ready))

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

async function handleReadyToggle() {
  try {
    await updatePlayerReady(store.roomCode, store.myUid, !myReady.value)
  } catch (err) {
    showToast(`Failed to update ready status: ${(err as Error).message}`, 'error')
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
    <div class="waiting__bg"></div>

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
            <i :data-lucide="copied ? 'check' : 'copy'" style="width: 14px; height: 14px;"></i>
            <span>{{ copied ? 'Copied' : 'Copy' }}</span>
          </button>
        </div>
        <p class="waiting__code-hint">Share this code with friends to join</p>
      </div>


      <div class="waiting__count">
        <span class="waiting__count-num">{{ playerCount }}</span>
        <span class="waiting__count-sep">/</span>
        <span class="waiting__count-max">6</span>
        <span class="waiting__count-label">players · {{ readyCount }}/{{ playerCount }} ready</span>
      </div>


      <div class="waiting__players">
        <TransitionGroup name="player-list" tag="div" class="waiting__player-list">
          <div
            v-for="(player, idx) in playerList"
            :key="player.uid || idx"
            class="waiting__player"
          >
            <PlayerAvatar :name="player.nickname" :photoURL="player.photoURL" :color="player.color" :is-current="player.isMe" />
            <div class="waiting__player-info">
              <span class="waiting__player-name">
                {{ player.nickname }}
                <span v-if="player.isMe" class="waiting__me-badge">You</span>
              </span>
              <span v-if="player.isHost" class="waiting__host-badge"><span><i data-lucide="crown" style="width: 14px; height: 14px; vertical-align: middle;"></i></span> Host</span>
              <span v-else-if="player.ready" class="waiting__ready-badge">Ready</span>
              <span v-else class="waiting__not-ready-badge">Not ready</span>
            </div>
          </div>
        </TransitionGroup>
      </div>


      <div class="waiting__actions">
        <button
          class="btn"
          :class="myReady ? 'btn--secondary' : 'btn--primary'"
          @click="handleReadyToggle"
        >
          <span v-show="myReady"><i data-lucide="check-circle-2" style="width: 18px;"></i></span>
          <span v-show="!myReady"><i data-lucide="circle" style="width: 18px;"></i></span>
          {{ myReady ? 'Ready' : 'Mark Ready' }}
        </button>
        <button
          v-if="isHost"
          class="btn btn--primary btn--large"
          :disabled="!canStart || isStarting"
          @click="handleStart"
        >
          <span v-if="isStarting" class="btn__spinner"></span>
          <template v-else-if="!canStart"><i data-lucide="users" style="width: 18px;"></i> Waiting for ready players</template>
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
  background-color: var(--background);
  background-image: radial-gradient(circle at 50% -20%, rgba(255,255,255,0.05), transparent 50%);
}

.waiting__card {
  position: relative;
  z-index: 10;
  background-color: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 2.5rem;
  max-width: 480px;
  width: 92vw;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
  animation: cardIn 0.3s ease-out;
}

@keyframes cardIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.waiting__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 28px;
}

.waiting__subtitle {
  font-family: var(--font-sans);
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--foreground);
  margin: 0;
  letter-spacing: -0.02em;
}

.waiting__live-indicator {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--primary);
  text-transform: uppercase;
  font-weight: 500;
}

.pulse-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: var(--primary);
  animation: pulse 1.5s ease-in-out infinite;
  flex-shrink: 0;
}

.pulse-dot--gold {
  background-color: var(--muted-foreground);
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
  font-family: var(--font-sans);
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--muted-foreground);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0 0 0.5rem;
}

.waiting__code-display {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  background-color: var(--secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 1rem 1.5rem;
  cursor: pointer;
  transition: border-color 0.15s ease, background-color 0.15s ease;
}

.waiting__code-display:hover {
  border-color: var(--ring);
}

.waiting__code {
  font-family: var(--font-mono);
  font-size: 2rem;
  font-weight: 700;
  color: var(--foreground);
  letter-spacing: 0.25em;
}

.waiting__copy-btn {
  background: none;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--muted-foreground);
  font-family: var(--font-sans);
  font-size: 0.75rem;
  font-weight: 500;
  padding: 0.35rem 0.65rem;
  cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  line-height: 1;
}

.waiting__copy-btn:hover {
  color: var(--foreground);
  border-color: var(--ring);
}

.waiting__code-hint {
  font-family: var(--font-sans);
  font-size: 0.75rem;
  color: var(--muted-foreground);
  margin: 0.5rem 0 0;
}

.waiting__count {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 0.25rem;
  margin-bottom: 1rem;
  font-family: var(--font-mono);
}

.waiting__count-num {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--foreground);
}

.waiting__count-sep,
.waiting__count-max {
  font-size: 1.125rem;
  color: var(--muted-foreground);
}

.waiting__count-label {
  font-size: 0.875rem;
  color: var(--muted-foreground);
  margin-left: 0.25rem;
  font-family: var(--font-sans);
}

.waiting__players {
  margin-bottom: 1.5rem;
}

.waiting__player-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.waiting__player {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  background-color: var(--secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  transition: background-color 0.2s ease;
}

.waiting__player:hover {
  background-color: rgba(39, 39, 42, 0.8);
}

.waiting__avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-sans);
  font-size: 0.875rem;
  color: var(--background);
  font-weight: 600;
  flex-shrink: 0;
}

.waiting__avatar--photo {
  object-fit: cover;
  border: 1px solid var(--border);
}

.waiting__player-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: 1;
}

.waiting__player-name {
  font-family: var(--font-sans);
  font-size: 0.875rem;
  color: var(--foreground);
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.waiting__me-badge {
  font-size: 0.625rem;
  background-color: var(--primary);
  color: var(--primary-foreground);
  padding: 0.125rem 0.375rem;
  border-radius: 9999px;
  text-transform: uppercase;
  font-weight: 600;
}

.waiting__host-badge {
  font-size: 0.75rem;
  color: var(--muted-foreground);
}

.waiting__ready-badge,
.waiting__not-ready-badge {
  font-size: 0.7rem;
  border-radius: 999px;
  padding: 0.15rem 0.5rem;
  font-weight: 700;
}

.waiting__ready-badge {
  background: rgba(34, 197, 94, 0.14);
  color: #86efac;
}

.waiting__not-ready-badge {
  background: rgba(255, 255, 255, 0.06);
  color: var(--muted-foreground);
}

.waiting__actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
}

.waiting__status-text {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-family: var(--font-sans);
  font-size: 0.875rem;
  color: var(--muted-foreground);
  margin: 0;
  padding: 0.75rem 0;
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
