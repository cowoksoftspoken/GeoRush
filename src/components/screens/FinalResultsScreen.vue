<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { store, isHost, sortedLeaderboard, resetStore, updateStats } from '../../store'
import { auth, db, dbRef, onValue, resetRoom, leaveRoom, recordGameResult } from '../../firebase'
import type { Unsubscribe } from '../../firebase'
import type { PlayerData, RoomMeta } from '../../types'
import { globalToast } from '../../composables/useToast'

const { showToast } = globalToast

const unsubs: Unsubscribe[] = []
const showConfetti = ref(true)
const leaderboardWritten = ref(false)


const podiumPlayers = computed(() => {
  const sorted = sortedLeaderboard.value
  return {
    first: sorted[0] || null,
    second: sorted[1] || null,
    third: sorted[2] || null
  }
})

const avgDistances = computed(() => {

  const result: Record<string, string> = {}
  for (const player of sortedLeaderboard.value) {
    const scores = Object.values(player.scores || {})
    if (scores.length === 0) {
      result[player.uid] = 'N/A'
      continue
    }

    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length
    const avgDist = Math.max((5000 - avgScore) / 2, 0)
    if (avgDist < 1) result[player.uid] = '< 1 km'
    else if (avgDist < 100) result[player.uid] = `${avgDist.toFixed(0)} km`
    else result[player.uid] = `${Math.round(avgDist).toLocaleString()} km`
  }
  return result
})


const confettiCanvas = ref<HTMLCanvasElement>()

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  color: string
  rotation: number
  rotationSpeed: number
  opacity: number
}

let particles: Particle[] = []
let animFrame: number = 0

function initConfetti() {
  const canvas = confettiCanvas.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  canvas.width = window.innerWidth
  canvas.height = window.innerHeight

  const colors = ['#f5c842', '#2dd4bf', '#f43f5e', '#a78bfa', '#34d399', '#fb923c', '#fff']


  particles = []
  for (let i = 0; i < 150; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height - canvas.height,
      vx: (Math.random() - 0.5) * 4,
      vy: Math.random() * 3 + 2,
      size: Math.random() * 8 + 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 10,
      opacity: 1
    })
  }

  function animate() {
    if (!ctx || !canvas) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    let activeParticles = 0

    for (const p of particles) {
      p.x += p.vx
      p.y += p.vy
      p.vy += 0.05
      p.rotation += p.rotationSpeed
      p.vx *= 0.99

      if (p.y > canvas.height) {
        p.opacity -= 0.02
      }

      if (p.opacity <= 0) continue
      activeParticles++

      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate((p.rotation * Math.PI) / 180)
      ctx.globalAlpha = p.opacity
      ctx.fillStyle = p.color
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6)
      ctx.restore()
    }

    if (activeParticles > 0) {
      animFrame = requestAnimationFrame(animate)
    }
  }

  animate()
}


async function handlePlayAgain() {
  try {
    await resetRoom(store.roomCode)
    showToast('Room reset! Starting fresh.', 'success')
  } catch (err) {
    showToast(`Error: ${(err as Error).message}`, 'error')
  }
}

async function handleBackToLobby() {
  try {
    await leaveRoom(store.roomCode, store.myUid)
  } catch {

  }
  resetStore()
}

async function maybeRecordGlobalLeaderboard() {
  const user = auth.currentUser
  if (leaderboardWritten.value || !user || user.isAnonymous) return

  const me = store.players[store.myUid]
  const winner = sortedLeaderboard.value[0]
  if (!me || !winner) return

  leaderboardWritten.value = true
  try {
    await recordGameResult({
      uid: store.myUid,
      nickname: me.nickname,
      photoURL: user.photoURL ?? '',
      totalScore: me.totalScore,
      roundsPlayed: Object.keys(me.scores || {}).length,
      won: winner.uid === store.myUid
    })
    showToast('Global leaderboard updated', 'success')
  } catch (err) {
    leaderboardWritten.value = false
    showToast(`Leaderboard update failed: ${(err as Error).message}`, 'warning')
  }
}


onMounted(() => {
  // Update local persistent stats
  const me = store.players[store.myUid]
  if (me) {
    const roundScores = Object.values(me.scores || {})
    const totalPoints = me.totalScore
    const bestScore = Math.max(...roundScores, 0)
    
    // Estimate distance based on score: 5000 = 0km, 0 = 2500km
    const gameDistances = roundScores.map(score => Math.max((5000 - score) / 2, 0))
    const totalDistance = gameDistances.reduce((a, b) => a + b, 0)
    
    updateStats({
      gamesPlayed: store.stats.gamesPlayed + 1,
      totalPoints: store.stats.totalPoints + totalPoints,
      bestScore: Math.max(store.stats.bestScore, bestScore),
      totalDistance: store.stats.totalDistance + totalDistance,
      guessCount: store.stats.guessCount + roundScores.length
    })
  }

  const code = store.roomCode

  const metaRef = dbRef(db, `rooms/${code}/meta`)
  unsubs.push(onValue(metaRef, (snap) => {
    const val = snap.val() as RoomMeta | null
    if (val) {
      store.meta = val
      if (val.status === 'waiting') {
        store.screen = 'waiting'
      }
    }
  }))

  const playersRef = dbRef(db, `rooms/${code}/players`)
  unsubs.push(onValue(playersRef, (snap) => {
    store.players = snap.val() ?? {}
    maybeRecordGlobalLeaderboard()
  }))


  setTimeout(() => initConfetti(), 300)

  ;(window as any).lucide?.createIcons()


  setTimeout(() => {
    showConfetti.value = false
    cancelAnimationFrame(animFrame)
  }, 6000)
})

onUnmounted(() => {
  unsubs.forEach((fn) => fn())
  cancelAnimationFrame(animFrame)
})

function getPodiumColor(place: number): string {
  if (place === 1) return '#f5c842'
  if (place === 2) return '#c0c0c0'
  return '#cd7f32'
}

function getPodiumEmoji(place: number): string {
  if (place === 1) return '🥇'
  if (place === 2) return '🥈'
  return '🥉'
}
</script>

<template>
  <div class="final">
    <div class="final__overlay"></div>


    <canvas v-if="showConfetti" ref="confettiCanvas" class="final__confetti"></canvas>

    <div class="final__content">

      <h1 class="final__title">Game Over</h1>
      <p class="final__subtitle">And the explorer champion is...</p>


      <div class="podium">

        <div class="podium__slot podium__slot--second" v-if="podiumPlayers.second">
          <div class="podium__player">
            <div class="podium__avatar" :style="{ backgroundColor: podiumPlayers.second.color }">
              {{ podiumPlayers.second.nickname.charAt(0).toUpperCase() }}
            </div>
            <span class="podium__name">{{ podiumPlayers.second.nickname }}</span>
            <span class="podium__pts">{{ podiumPlayers.second.totalScore.toLocaleString() }} pts</span>
          </div>
          <div class="podium__bar podium__bar--second" :style="{ '--podium-color': getPodiumColor(2) }">
            <span class="podium__medal"><i data-lucide="medal" style="color: #c0c0c0;"></i></span>
            <span class="podium__place">2nd</span>
          </div>
        </div>


        <div class="podium__slot podium__slot--first" v-if="podiumPlayers.first">
          <div class="podium__player">
            <div class="podium__crown"><i data-lucide="crown" style="width: 32px; height: 32px; color: #f5c842;"></i></div>
            <div class="podium__avatar podium__avatar--first" :style="{ backgroundColor: podiumPlayers.first.color }">
              {{ podiumPlayers.first.nickname.charAt(0).toUpperCase() }}
            </div>
            <span class="podium__name podium__name--first">{{ podiumPlayers.first.nickname }}</span>
            <span class="podium__pts podium__pts--first">{{ podiumPlayers.first.totalScore.toLocaleString() }} pts</span>
          </div>
          <div class="podium__bar podium__bar--first" :style="{ '--podium-color': getPodiumColor(1) }">
            <span class="podium__medal"><i data-lucide="trophy" style="color: #f5c842;"></i></span>
            <span class="podium__place">1st</span>
          </div>
        </div>


        <div class="podium__slot podium__slot--third" v-if="podiumPlayers.third">
          <div class="podium__player">
            <div class="podium__avatar" :style="{ backgroundColor: podiumPlayers.third.color }">
              {{ podiumPlayers.third.nickname.charAt(0).toUpperCase() }}
            </div>
            <span class="podium__name">{{ podiumPlayers.third.nickname }}</span>
            <span class="podium__pts">{{ podiumPlayers.third.totalScore.toLocaleString() }} pts</span>
          </div>
          <div class="podium__bar podium__bar--third" :style="{ '--podium-color': getPodiumColor(3) }">
            <span class="podium__medal"><i data-lucide="medal" style="color: #cd7f32;"></i></span>
            <span class="podium__place">3rd</span>
          </div>
        </div>
      </div>


      <div class="final__leaderboard">
        <h3 class="final__lb-title">Full Standings</h3>
        <div class="final__lb-table">
          <div class="lb-header">
            <span class="lb-header__col">#</span>
            <span class="lb-header__col lb-header__col--name">Player</span>
            <span class="lb-header__col">Total Score</span>
            <span class="lb-header__col">Avg Distance</span>
          </div>
          <div
            v-for="(p, idx) in sortedLeaderboard"
            :key="p.uid"
            class="lb-entry"
          >
            <span class="lb-entry__rank">{{ idx + 1 }}</span>
            <span class="lb-entry__player">
              <span class="lb-entry__dot" :style="{ backgroundColor: p.color }"></span>
              {{ p.nickname }}
              <span v-if="p.uid === store.myUid" class="lb-entry__you">(You)</span>
            </span>
            <span class="lb-entry__score">{{ p.totalScore.toLocaleString() }}</span>
            <span class="lb-entry__dist">{{ avgDistances[p.uid] }}</span>
          </div>
        </div>
      </div>


      <div class="final__actions">
        <button v-if="isHost" class="btn btn--primary btn--large" @click="handlePlayAgain">
          <i data-lucide="refresh-ccw"></i> Play Again
        </button>
        <button class="btn btn--secondary btn--large" @click="handleBackToLobby">
          <i data-lucide="home"></i> Back to Lobby
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.final {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow-y: auto;
}

.final__overlay {
  position: fixed;
  inset: 0;
  background-color: var(--background);
}

.final__confetti {
  position: fixed;
  inset: 0;
  z-index: 95;
  pointer-events: none;
}

.final__content {
  position: relative;
  z-index: 96;
  max-width: 800px;
  width: 95vw;
  padding: 48px 0;
  animation: finalIn 0.6s ease-out;
}

@keyframes finalIn {
  from { opacity: 0; transform: translateY(30px) scale(0.97); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.final__title {
  font-family: var(--font-sans);
  font-size: 3rem;
  font-weight: 800;
  text-align: center;
  margin: 0;
  color: var(--foreground);
  letter-spacing: -0.05em;
}

.final__subtitle {
  text-align: center;
  font-family: var(--font-sans);
  font-size: 1rem;
  color: var(--muted-foreground);
  margin: 0.5rem 0 2.5rem;
}


.podium {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 8px;
  margin-bottom: 40px;
  padding: 0 20px;
}

.podium__slot {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
  max-width: 180px;
}

.podium__player {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  margin-bottom: 12px;
  position: relative;
}

.podium__crown {
  font-size: 28px;
  animation: crownBounce 1s ease-in-out infinite;
}

@keyframes crownBounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}

.podium__avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-sans);
  font-weight: 600;
  font-size: 1.25rem;
  color: var(--background);
  border: 3px solid var(--border);
}

.podium__avatar--first {
  width: 64px;
  height: 64px;
  font-size: 1.5rem;
  border-color: var(--primary);
  box-shadow: 0 0 20px rgba(250, 250, 250, 0.1);
}

.podium__name {
  font-family: var(--font-sans);
  font-size: 0.875rem;
  color: var(--foreground);
  font-weight: 500;
  text-align: center;
}

.podium__name--first {
  font-size: 1rem;
  font-weight: 700;
}

.podium__pts {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--muted-foreground);
}

.podium__pts--first {
  color: var(--primary);
  font-size: 0.875rem;
}

.podium__bar {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
  background-color: var(--podium-color);
  opacity: 0.2;
  border: 1px solid var(--border);
  border-bottom: none;
  animation: podiumGrow 0.6s ease-out both;
}

.podium__bar--first {
  height: 140px;
  animation-delay: 0.3s;
}

.podium__bar--second {
  height: 100px;
  animation-delay: 0.5s;
}

.podium__bar--third {
  height: 70px;
  animation-delay: 0.7s;
}

@keyframes podiumGrow {
  from { height: 0; opacity: 0; }
  to { opacity: 1; }
}

.podium__medal {
  font-size: 24px;
}

.podium__place {
  font-family: var(--font-sans);
  font-size: 1.125rem;
  font-weight: 700;
  color: var(--background);
  letter-spacing: 0.05em;
}

.final__leaderboard {
  background-color: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 1.5rem;
  margin-bottom: 2rem;
}

.final__lb-title {
  font-family: var(--font-sans);
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--foreground);
  margin: 0 0 1rem;
}

.lb-header {
  display: grid;
  grid-template-columns: 40px 1fr 100px 100px;
  gap: 8px;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--border);
  font-family: var(--font-sans);
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--muted-foreground);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.lb-entry {
  display: grid;
  grid-template-columns: 40px 1fr 100px 100px;
  gap: 8px;
  padding: 0.625rem 0;
  border-bottom: 1px solid var(--border);
  align-items: center;
}

.lb-entry:last-child {
  border-bottom: none;
}

.lb-entry__rank {
  font-family: var(--font-mono);
  font-size: 0.875rem;
  color: var(--muted-foreground);
  text-align: center;
}

.lb-entry__player {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-sans);
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--foreground);
}

.lb-entry__dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.lb-entry__you {
  color: var(--primary);
  font-size: 0.75rem;
  font-weight: 600;
}

.lb-entry__score {
  font-family: var(--font-mono);
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--primary);
  text-align: right;
}

.lb-entry__dist {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--muted-foreground);
  text-align: right;
}


.final__actions {
  display: flex;
  justify-content: center;
  gap: 16px;
}


@media (max-width: 640px) {
  .final__title { font-size: 44px; }
  .podium { gap: 4px; padding: 0 8px; }
  .podium__bar--first { height: 100px; }
  .podium__bar--second { height: 70px; }
  .podium__bar--third { height: 50px; }
  .lb-header, .lb-entry {
    grid-template-columns: 30px 1fr 80px 80px;
    font-size: 12px;
  }
  .final__actions { flex-direction: column; align-items: center; }
}
</style>
