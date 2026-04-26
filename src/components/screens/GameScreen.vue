<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  store, isHost, currentRound, totalRounds,
  currentLocation, currentRoundData, allPlayersLocked, sortedLeaderboard
} from '../../store'
import { db, dbRef, onValue, submitGuess, advanceToResults, rerollRoundLocation } from '../../firebase'
import type { Unsubscribe } from '../../firebase'
import type { RoomMeta } from '../../types'
import { formatTime } from '../../utils'
import { resolveMapillaryLocation } from '../../services/mapillary'
import { globalToast } from '../../composables/useToast'
import { useSound } from '../../composables/useSound'

const { playSound } = useSound()

const { showToast } = globalToast

const panoramaDiv = ref<HTMLDivElement>()
const miniMapDiv = ref<HTMLDivElement>()
const panorama = ref<any>(null)
let mlyViewer: any = null


const MAPILLARY_TOKEN = import.meta.env.VITE_MAPILLARY_ACCESS_TOKEN

let leafletMap: L.Map | null = null
let guessMarkerL: L.Marker | L.CircleMarker | null = null

const timeRemaining = ref(90)
const guessLocked = ref(false)
const guessLat = ref<number | null>(null)
const guessLng = ref<number | null>(null)
const mapExpanded = ref(false)
const showHint = ref(true)
const svLoading = ref(true)

const unsubs: Unsubscribe[] = []
let timerInterval: ReturnType<typeof setInterval> | null = null
let rerollAttempts = 0

const timerColor = computed(() => {
  if (timeRemaining.value <= 10) return 'var(--accent-danger)'
  if (timeRemaining.value <= 30) return '#fb923c'
  return 'var(--accent-gold)'
})
const timerPulse = computed(() => timeRemaining.value <= 10)
const hasGuess = computed(() => guessLat.value !== null && guessLng.value !== null)
const top3 = computed(() => sortedLeaderboard.value.slice(0, 3))


async function initStreetView() {
  const loc = currentLocation.value
  if (!loc || !panoramaDiv.value) return
  svLoading.value = true

  if (mlyViewer) {
    mlyViewer.remove()
    mlyViewer = null
  }

  try {
    if (!MAPILLARY_TOKEN) {
      throw new Error('Mapillary Access Token not found in .env')
    }


    let retries = 0
    while (!(window as any).Mapillary && !(window as any).mapillary && retries < 10) {
      await new Promise(resolve => setTimeout(resolve, 500))
      retries++
    }

    const MapillaryLib = (window as any).Mapillary || (window as any).mapillary
    if (!MapillaryLib) {
      throw new Error('Mapillary library failed to load from CDN')
    }

    const enriched = await resolveMapillaryLocation(loc)
    Object.assign(loc, enriched)
    const imageId = enriched.mapillaryId || ''

    if (!imageId) throw new Error('No Mapillary imagery available for this round')

    mlyViewer = new MapillaryLib.Viewer({
      accessToken: MAPILLARY_TOKEN,
      container: panoramaDiv.value,
      imageId: imageId,
      component: {
        cover: false,
        direction: true,
        imagePlane: true,
        sequence: true,
        zoom: true,
        bearing: true,
        mouse: true,
        keyboard: true,
        navigation: true,
      }
    })

    panorama.value = mlyViewer


    setTimeout(() => {
      svLoading.value = false
      nextTick(() => (window as any).lucide.createIcons())
    }, 1500)

  } catch (err) {
    console.error('Mapillary failed:', err)
    await recoverStreetView()
  }
}

async function recoverStreetView() {
  if (isHost.value && rerollAttempts < 3) {
    rerollAttempts++
    showToast('Imagery failed. Rolling a new location...', 'warning')
    try {
      const location = await rerollRoundLocation(store.roomCode, currentRound.value)
      store.locations[currentRound.value.toString()] = location
      return
    } catch (err) {
      console.error('Mapillary reroll failed:', err)
    }
  }

  if (!isHost.value) {
    showToast('Imagery failed. Waiting for host to reroll...', 'warning')
    return
  }

  showToast('Mapillary imagery could not be loaded after retries', 'error')
  svLoading.value = false
}


function initMiniMap() {
  if (!miniMapDiv.value || leafletMap) return
  leafletMap = L.map(miniMapDiv.value, { zoomControl: true, attributionControl: false }).setView([20, 0], 1)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19
  }).addTo(leafletMap)

  leafletMap.on('click', (e: L.LeafletMouseEvent) => {
    if (guessLocked.value) return
    placeGuessPin(e.latlng.lat, e.latlng.lng)
  })
}

function placeGuessPin(lat: number, lng: number) {
  guessLat.value = lat
  guessLng.value = lng
  const playerColor = store.players[store.myUid]?.color || '#f5c842'

  if (guessMarkerL) {
    guessMarkerL.setLatLng([lat, lng])
  } else if (leafletMap) {
    guessMarkerL = L.circleMarker([lat, lng], {
      radius: 10, fillColor: playerColor, fillOpacity: 1,
      color: '#fff', weight: 2
    }).addTo(leafletMap)
    if (!guessLocked.value) {
      guessMarkerL?.on('mousedown', () => {
        if (guessLocked.value || !leafletMap) return
        const onMove = (e: L.LeafletMouseEvent) => {
          guessLat.value = e.latlng.lat
          guessLng.value = e.latlng.lng
          guessMarkerL?.setLatLng(e.latlng)
        }
        leafletMap!.on('mousemove', onMove)
        leafletMap!.once('mouseup', () => leafletMap!.off('mousemove', onMove))
      })
    }
  }
}


function startTimer() {
  stopTimer()
  const roundData = currentRoundData.value
  if (!roundData) return
  function updateTime() {
    const remaining = Math.max(0, Math.ceil((roundData!.expiresAt - Date.now()) / 1000))
    timeRemaining.value = remaining
    if (remaining <= 0) { stopTimer(); handleTimerExpiry() }
  }
  updateTime()
  timerInterval = setInterval(updateTime, 250)
}
function stopTimer() { if (timerInterval) { clearInterval(timerInterval); timerInterval = null } }

async function handleTimerExpiry() {
  if (!guessLocked.value && hasGuess.value) await lockGuess()
  if (isHost.value) await advanceToResults(store.roomCode)
}

async function lockGuess() {
  if (guessLocked.value || !hasGuess.value) return
  playSound('click')
  try {
    await submitGuess(store.roomCode, currentRound.value, store.myUid, guessLat.value!, guessLng.value!)
    guessLocked.value = true
    showToast('Guess locked! ✓', 'success')
  } catch (err) { showToast(`Failed: ${(err as Error).message}`, 'error') }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'l' || e.key === 'L') lockGuess()
  else if (e.key === 'm' || e.key === 'M') { mapExpanded.value = !mapExpanded.value; setTimeout(() => leafletMap?.invalidateSize(), 400) }
  else if (e.key === 'Escape') { mapExpanded.value = false; setTimeout(() => leafletMap?.invalidateSize(), 400) }
}

onMounted(async () => {
  const code = store.roomCode
  unsubs.push(onValue(dbRef(db, `rooms/${code}/meta`), (snap) => {
    const val = snap.val() as RoomMeta | null
    if (val) {
      store.meta = val
      if (val.status === 'roundResults') {
        playSound('success')
        store.screen = 'roundResults'
      }
      else if (val.status === 'gameOver') store.screen = 'finalResults'
    }
  }))
  unsubs.push(onValue(dbRef(db, `rooms/${code}/rounds`), (snap) => { store.rounds = snap.val() ?? {} }))
  unsubs.push(onValue(dbRef(db, `rooms/${code}/players`), (snap) => { store.players = snap.val() ?? {} }))
  unsubs.push(onValue(dbRef(db, `rooms/${code}/locations`), (snap) => { store.locations = snap.val() ?? {} }))

  await nextTick()
  await initStreetView()
  initMiniMap()


  watch(currentRoundData, (data) => {
    if (data && data.expiresAt) startTimer()
  }, { immediate: true })

  setTimeout(() => (showHint.value = false), 5000)
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  unsubs.forEach((fn) => fn())
  stopTimer()
  window.removeEventListener('keydown', handleKeydown)
  if (leafletMap) { leafletMap.remove(); leafletMap = null }
  guessMarkerL = null
})

watch(allPlayersLocked, async (locked) => {
  if (locked && isHost.value && timeRemaining.value > 0) {
    showToast('All players locked in!', 'info')
    await advanceToResults(store.roomCode)
  }
})

watch(currentRound, async () => {
  guessLocked.value = false; guessLat.value = null; guessLng.value = null
  rerollAttempts = 0
  if (guessMarkerL && leafletMap) { leafletMap.removeLayer(guessMarkerL); guessMarkerL = null }
  await nextTick(); await initStreetView()
})

watch(currentLocation, async (loc, oldLoc) => {
  if (!loc || loc.mapillaryId === oldLoc?.mapillaryId) return
  await nextTick()
  await initStreetView()
})

function toggleMap() {
  mapExpanded.value = !mapExpanded.value
  playSound('transition')
  setTimeout(() => leafletMap?.invalidateSize(), 400)
}
</script>

<template>
  <div class="game">
    <Transition name="fade">
      <div v-if="svLoading" class="game__loader">
        <div class="globe-spinner">
          <svg viewBox="0 0 100 100" class="globe-svg">
            <circle cx="50" cy="50" r="40" fill="none" stroke="var(--accent-gold-dim)" stroke-width="2" />
            <ellipse cx="50" cy="50" rx="40" ry="16" fill="none" stroke="var(--accent-gold-dim)" stroke-width="1.5" />
            <ellipse cx="50" cy="50" rx="16" ry="40" fill="none" stroke="var(--accent-gold-dim)" stroke-width="1.5" />
            <circle cx="50" cy="50" r="40" fill="none" stroke="var(--accent-gold)" stroke-width="2.5" stroke-dasharray="20 231" class="globe-ring" />
          </svg>
        </div>
        <p class="game__loader-text">Finding your location...</p>
      </div>
    </Transition>

    <div ref="panoramaDiv" class="game__panorama"></div>


    <div class="game__hud">
      <div class="game__hud-left">
        <div class="hud-pill">
          <span class="hud-pill__label">Round</span>
          <span class="hud-pill__value">{{ currentRound + 1 }} / {{ totalRounds }}</span>
        </div>
      </div>
      <div class="game__hud-right">
        <div :class="['hud-pill', 'hud-timer', { 'hud-timer--pulse': timerPulse }]" :style="{ color: timerColor }">
          <i data-lucide="clock" style="width: 18px; height: 18px;"></i>
          <span class="hud-timer__value">{{ formatTime(timeRemaining) }}</span>
        </div>
      </div>
    </div>


    <div :class="['game__minimap', { 'game__minimap--expanded': mapExpanded }]">
      <div class="minimap__header" @click="toggleMap">
        <span class="minimap__title"><i data-lucide="map-pin" style="width: 16px; height: 16px;"></i> Place your guess</span>
        <button class="minimap__toggle">
          <i :data-lucide="mapExpanded ? 'chevron-down' : 'chevron-up'"></i>
        </button>
      </div>
      <div ref="miniMapDiv" class="minimap__map"></div>
      <div class="minimap__actions">
        <button :class="['btn', 'btn--primary', 'minimap__lock-btn', { 'btn--locked': guessLocked }]"
          :disabled="!hasGuess || guessLocked" @click="lockGuess">
          <template v-if="guessLocked"><i data-lucide="check-circle" style="width: 16px;"></i> Guess Locked</template>
          <template v-else-if="hasGuess"><i data-lucide="lock" style="width: 16px;"></i> Lock In Guess</template>
          <template v-else>Click map to guess</template>
        </button>
      </div>
    </div>

    <Transition name="fade">
      <div v-if="showHint" class="game__hint">Click & drag to look around · Scroll to zoom</div>
    </Transition>
  </div>
</template>

<style scoped>
.game { position: fixed; inset: 0; z-index: 50; }
.game__panorama { width: 100%; height: 100%; }

.game__loader { position: absolute; inset: 0; z-index: 60; background: var(--bg-deep); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 24px; }
.globe-spinner { width: 80px; height: 80px; animation: globeSpin 3s linear infinite; }
.globe-svg { width: 100%; height: 100%; }
.globe-ring { animation: ringDash 2s ease-in-out infinite; transform-origin: center; }
@keyframes globeSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@keyframes ringDash { 0% { stroke-dashoffset: 0; } 100% { stroke-dashoffset: -251; } }
.game__loader-text { font-family: var(--font-sans); color: var(--muted-foreground); font-size: 0.875rem; font-weight: 500; animation: textPulse 1.5s ease-in-out infinite; }
@keyframes textPulse { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }

.game__hud { position: absolute; top: 0; left: 0; right: 0; z-index: 70; display: flex; align-items: flex-start; justify-content: space-between; padding: 1.5rem; pointer-events: none; }
.game__hud-left, .game__hud-right { pointer-events: auto; }
.hud-pill { display: flex; align-items: center; gap: 0.5rem; background-color: var(--card); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 0.5rem 1rem; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
.hud-pill__label { font-family: var(--font-sans); font-size: 0.875rem; color: var(--muted-foreground); font-weight: 500; }
.hud-pill__value { font-family: var(--font-mono); font-size: 1.125rem; font-weight: 700; color: var(--foreground); }

.hud-timer { font-family: var(--font-mono); transition: color 0.3s ease; }
.hud-timer__value { font-size: 1.5rem; font-weight: 700; letter-spacing: 0.05em; }
.hud-timer--pulse .hud-timer__value { animation: timerPulse 0.5s ease-in-out infinite; color: var(--destructive); }
@keyframes timerPulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.8; transform: scale(1.05); } }

.game__minimap { position: absolute; bottom: 24px; right: 24px; z-index: 70; width: 280px; background-color: var(--card); border: 1px solid var(--border); border-radius: var(--radius-md); overflow: hidden; transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1); box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
.game__minimap--expanded { width: min(560px, calc(100vw - 48px)); }
.minimap__header { display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 1rem; cursor: pointer; border-bottom: 1px solid var(--border); background-color: var(--secondary); }
.minimap__title { font-family: var(--font-sans); font-size: 0.875rem; color: var(--foreground); font-weight: 600; display: flex; align-items: center; gap: 0.5rem; }
.minimap__toggle { background: var(--background); border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--foreground); cursor: pointer; padding: 4px; display: flex; align-items: center; justify-content: center; transition: background-color 0.15s ease; }
.minimap__toggle:hover { background-color: var(--accent); }
.minimap__map { width: 100%; height: 220px; transition: height 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
.game__minimap--expanded .minimap__map { height: min(430px, calc(100vh - 220px)); }
.minimap__actions { padding: 0.75rem 1rem; border-top: 1px solid var(--border); }
.minimap__lock-btn { width: 100%; }
.btn--locked { background-color: var(--secondary) !important; color: var(--muted-foreground) !important; border-color: var(--border) !important; cursor: default !important; opacity: 0.8 !important; box-shadow: none !important; }

.game__hint { position: absolute; bottom: 24px; left: 24px; z-index: 70; padding: 0.5rem 1rem; background-color: rgba(9, 9, 11, 0.8); backdrop-filter: blur(12px); border: 1px solid var(--border); border-radius: var(--radius-sm); font-family: var(--font-sans); font-size: 0.75rem; font-weight: 500; color: var(--muted-foreground); }

.fade-enter-active, .fade-leave-active { transition: opacity 0.4s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

@media (max-width: 768px) {
  .game__hud { padding: 1rem; }
  .game__minimap { width: 180px; bottom: 16px; right: 16px; }
  .game__minimap--expanded { width: calc(100vw - 32px); }
  .hud-timer__value { font-size: 1.25rem; }
  .game__hint { display: none; }
}
</style>
