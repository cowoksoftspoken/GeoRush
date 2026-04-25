<script setup lang="ts">
import { computed } from 'vue'
import { store, isHost, currentRound, totalRounds, allPlayersLocked } from '../store'

const storeDebug = computed(() => ({
  myUid: store.myUid,
  myNickname: store.myNickname,
  roomCode: store.roomCode,
  screen: store.screen,
  isHost: isHost.value,
  currentRound: currentRound.value,
  totalRounds: totalRounds.value,
  allPlayersLocked: allPlayersLocked.value,
  status: store.meta?.status,
  playerCount: Object.keys(store.players).length,
  players: Object.entries(store.players).map(([uid, p]) => ({
    uid: uid.slice(0, 8) + '...',
    nickname: p.nickname,
    totalScore: p.totalScore,
    color: p.color
  })),
  rounds: store.rounds
}))
</script>

<template>
  <div class="debug">
    <div class="debug__header">
      <span>Debug Panel</span>
      <span class="debug__env">DEV</span>
    </div>
    <pre class="debug__content">{{ JSON.stringify(storeDebug, null, 2) }}</pre>
  </div>
</template>

<style scoped>
.debug {
  position: fixed;
  bottom: 16px;
  left: 16px;
  z-index: 10000;
  max-width: 400px;
  max-height: 400px;
  overflow: auto;
  background: rgba(10, 12, 15, 0.92);
  border: 1px solid rgba(245, 200, 66, 0.3);
  border-radius: var(--radius-sm);
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  backdrop-filter: blur(10px);
  box-shadow: var(--shadow-card);
}

.debug__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-subtle);
  color: var(--accent-gold);
  font-weight: 600;
  font-size: 11px;
}

.debug__env {
  background: rgba(245, 200, 66, 0.15);
  color: var(--accent-gold);
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 9px;
  letter-spacing: 1px;
}

.debug__content {
  padding: 12px;
  margin: 0;
  color: var(--text-secondary);
  white-space: pre-wrap;
  word-break: break-all;
  line-height: 1.5;
}
</style>
