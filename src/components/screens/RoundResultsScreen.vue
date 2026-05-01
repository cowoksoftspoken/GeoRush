<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  store, isHost, currentRound, totalRounds,
  currentResult, sortedLeaderboard
} from '../../store'
import { db, dbRef, onValue, advanceToNextRound } from '../../firebase'
import type { Unsubscribe } from '../../firebase'
import type { PlayerRoundResult, RoomMeta, RoundResultData } from '../../types'
import { formatDistance } from '../../utils'
import PlayerAvatar from '../ui/PlayerAvatar.vue'

const resultsMapDiv = ref<HTMLDivElement>()
const results = ref<PlayerRoundResult[]>([])
const countdown = ref(5)
const showCards = ref(false)
const unsubs: Unsubscribe[] = []
let countdownInterval: ReturnType<typeof setInterval> | null = null
let leafletMap: L.Map | null = null

const actualLoc = computed(() => currentResult.value)

function applyResult(result: RoundResultData | null) {
  if (!result?.players) return
  results.value = Object.values(result.players).sort((a, b) => b.score - a.score)
}

function initResultsMap() {
  const loc = actualLoc.value
  if (!loc || !resultsMapDiv.value) return
  if (leafletMap) {
    leafletMap.remove()
    leafletMap = null
  }
  leafletMap = L.map(resultsMapDiv.value, { zoomControl: true, attributionControl: false }).setView([loc.answerLat, loc.answerLng], 3)
  L.tileLayer('https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(leafletMap)


  const starIcon = L.divIcon({ html: '<div style="color:#f5c842;filter:drop-shadow(0 0 4px rgba(245,200,66,0.6))"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-star"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></div>', className: '', iconSize: [24, 24], iconAnchor: [12, 12] })
  L.marker([loc.answerLat, loc.answerLng], { icon: starIcon }).addTo(leafletMap)

  const bounds = L.latLngBounds([[loc.answerLat, loc.answerLng]])
  for (const r of results.value) {
    if (r.noGuess || r.guessLat === null || r.guessLng === null) continue
    bounds.extend([r.guessLat, r.guessLng])
    L.circleMarker([r.guessLat, r.guessLng], { radius: 9, fillColor: r.color, fillOpacity: 1, color: '#fff', weight: 3, className: 'result-marker' }).addTo(leafletMap)
    L.polyline([[r.guessLat, r.guessLng], [loc.answerLat, loc.answerLng]], { color: r.color, weight: 3, opacity: 0.62, dashArray: '6' }).addTo(leafletMap)
  }
  leafletMap.fitBounds(bounds, { padding: [40, 40] })
}

function startCountdown() {
  countdown.value = 5
  countdownInterval = setInterval(() => {
    countdown.value--
    if (countdown.value <= 0) { stopCountdown(); if (isHost.value) goNext() }
  }, 1000)
}
function stopCountdown() { if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null } }

async function goNext() {
  stopCountdown()
  await advanceToNextRound(store.roomCode, currentRound.value + 1, totalRounds.value)
}

onMounted(async () => {
  const code = store.roomCode
  unsubs.push(onValue(dbRef(db, `rooms/${code}/meta`), (snap) => {
    const val = snap.val() as RoomMeta | null
    if (val) { store.meta = val; if (val.status === 'playing') store.screen = 'game'; else if (val.status === 'gameOver') store.screen = 'finalResults' }
  }))
  unsubs.push(onValue(dbRef(db, `rooms/${code}/players`), (snap) => { store.players = snap.val() ?? {} }))
  unsubs.push(onValue(dbRef(db, `rooms/${code}/rounds`), (snap) => { store.rounds = snap.val() ?? {} }))
  unsubs.push(onValue(dbRef(db, `results/${code}`), (snap) => { store.results = snap.val() ?? {} }))

  await nextTick()
  applyResult(currentResult.value)
  initResultsMap()
  setTimeout(() => (showCards.value = true), 400)
  startCountdown()
  ;(window as any).lucide?.createIcons()
})

onUnmounted(() => {
  unsubs.forEach((fn) => fn()); stopCountdown()
  if (leafletMap) { leafletMap.remove(); leafletMap = null }
})

watch(currentResult, async (result) => {
  applyResult(result)
  await nextTick()
  initResultsMap()
})
</script>

<template>
  <div class="round-results">
    <div class="round-results__overlay"></div>
    <div class="round-results__content">
      <div class="round-results__header">
        <div>
          <p class="round-results__eyebrow">Round {{ currentRound + 1 }} / {{ totalRounds }}</p>
          <h2 class="round-results__title">{{ actualLoc?.label || actualLoc?.country || 'Location revealed' }}</h2>
        </div>
        <div class="round-results__countdown">
          <span>Next round in</span>
          <span class="round-results__countdown-num">{{ countdown }}</span>
          <button v-if="isHost" class="btn btn--ghost btn--sm" @click="goNext">Skip <i data-lucide="arrow-right" style="width: 14px;"></i></button>
        </div>
      </div>
      <div class="round-results__body">
        <div class="round-results__map-container">
          <div ref="resultsMapDiv" class="round-results__map"></div>
        </div>
        <div class="round-results__scores">
          <TransitionGroup name="score-card" tag="div" class="round-results__card-list">
            <div v-for="(r, idx) in results" :key="r.uid" v-show="showCards" class="score-card"
              :style="{ animationDelay: `${idx * 150}ms` }">
              <div class="score-card__rank">{{ idx + 1 }}</div>
              <PlayerAvatar :name="r.nickname" :photoURL="r.photoURL" :color="r.color" :is-current="r.uid === store.myUid" />
              <div class="score-card__info">
                <span class="score-card__name">{{ r.nickname }}</span>
                <span class="score-card__distance">
                  <template v-if="r.noGuess">No guess</template>
                  <template v-else>{{ formatDistance(r.distanceMeters) }} away</template>
                </span>
              </div>
              <div class="score-card__points">
                <span class="score-card__score" :class="{ 'score-card__score--perfect': r.score === 5000 }">
                  <template v-if="r.score === 5000"><i data-lucide="target" style="width: 16px;"></i> Perfect!</template>
                  <template v-else>+{{ r.score.toLocaleString() }}</template>
                </span>
                <span class="score-card__formula">max(5000 − {{ r.noGuess ? '∞' : Math.round(r.distanceMeters / 1000) }}km × 2, 0)</span>
              </div>
            </div>
          </TransitionGroup>
          <div class="round-results__leaderboard">
            <h3 class="round-results__lb-title">Standings</h3>
            <div v-for="(p, idx) in sortedLeaderboard" :key="p.uid" class="lb-row">
              <span class="lb-row__rank">{{ idx + 1 }}</span>
              <PlayerAvatar :name="p.nickname" :photoURL="p.photoURL" :color="p.color" size="sm" :is-current="p.uid === store.myUid" />
              <span class="lb-row__name">{{ p.nickname }}</span>
              <span class="lb-row__score">{{ p.totalScore.toLocaleString() }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.round-results { position: fixed; inset: 0; z-index: 80; display: flex; align-items: flex-start; justify-content: center; overflow-y: auto; padding: calc(24px + env(safe-area-inset-top)) 16px calc(24px + env(safe-area-inset-bottom)); }
.round-results__overlay { position: absolute; inset: 0; background-color: rgba(9, 9, 11, 0.85); backdrop-filter: blur(8px); }
.round-results__content { position: relative; z-index: 10; width: min(1120px, 100%); animation: slideUp 0.3s ease-out; }
@keyframes slideUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

.round-results__header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem; }
.round-results__eyebrow { margin: 0 0 0.35rem; color: var(--muted-foreground); font-family: var(--font-mono); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.08em; }
.round-results__title { font-family: var(--font-sans); font-size: clamp(1.8rem, 4vw, 3rem); font-weight: 800; color: var(--foreground); margin: 0; letter-spacing: -0.04em; }
.round-results__countdown { display: flex; align-items: center; gap: 0.5rem; font-family: var(--font-sans); font-size: 0.875rem; color: var(--muted-foreground); font-weight: 500; }
.round-results__countdown-num { font-family: var(--font-mono); font-size: 1.5rem; font-weight: 700; color: var(--primary); min-width: 30px; text-align: center; }

.round-results__body { display: grid; grid-template-columns: 1.15fr 0.85fr; gap: 1.5rem; }
.round-results__map-container { border-radius: var(--radius-md); overflow: hidden; border: 1px solid var(--border); box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); background-color: var(--secondary); }
.round-results__map { width: 100%; height: 460px; }
:deep(.result-marker) { filter: drop-shadow(0 4px 10px rgba(0,0,0,0.45)); animation: markerPop 0.35s ease-out both; }
@keyframes markerPop { from { transform: scale(0.55); opacity: 0; } to { transform: scale(1); opacity: 1; } }
.round-results__scores { display: flex; flex-direction: column; gap: 1rem; }
.round-results__card-list { display: flex; flex-direction: column; gap: 0.5rem; }

.score-card { display: flex; align-items: center; gap: 0.75rem; background-color: var(--card); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 0.75rem 1rem; animation: cardSlideIn 0.3s ease-out both; }
.score-card:has(.player-avatar--current) { border-color: rgba(250, 250, 250, 0.34); background: rgba(250, 250, 250, 0.055); }
@keyframes cardSlideIn { from { opacity: 0; transform: translateX(10px); } to { opacity: 1; transform: translateX(0); } }
.score-card__rank { font-family: var(--font-mono); font-size: 0.875rem; color: var(--muted-foreground); width: 20px; text-align: center; flex-shrink: 0; }
.score-card__info { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.score-card__name { font-family: var(--font-sans); font-size: 0.875rem; font-weight: 500; color: var(--foreground); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.score-card__distance { font-family: var(--font-mono); font-size: 0.75rem; color: var(--muted-foreground); }
.score-card__points { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; flex-shrink: 0; }
.score-card__score { font-family: var(--font-mono); font-size: 1rem; font-weight: 700; color: var(--foreground); }
.score-card__score--perfect { color: var(--primary); }
.score-card__formula { font-family: var(--font-mono); font-size: 0.625rem; color: var(--muted-foreground); }

.round-results__leaderboard { background-color: var(--card); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 1rem; }
.round-results__lb-title { font-family: var(--font-sans); font-size: 1rem; font-weight: 600; color: var(--foreground); margin: 0 0 0.75rem; }
.lb-row { display: flex; align-items: center; gap: 0.6rem; padding: 0.45rem 0; }
.lb-row__rank { font-family: var(--font-mono); font-size: 0.75rem; color: var(--muted-foreground); width: 18px; text-align: center; }
.lb-row__name { font-family: var(--font-sans); font-size: 0.875rem; font-weight: 500; color: var(--foreground); flex: 1; }
.lb-row__score { font-family: var(--font-mono); font-size: 0.875rem; font-weight: 600; color: var(--foreground); }

.score-card-enter-active { transition: all 0.4s ease-out; }
.score-card-enter-from { opacity: 0; transform: translateX(30px); }

@media (max-width: 768px) {
  .round-results__body { grid-template-columns: 1fr; }
  .round-results__map { height: 250px; }
  .round-results__title { font-size: 28px; }
}
</style>
