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
const mapMode = ref<'hidden' | 'small' | 'medium' | 'large'>('medium')
const isMobile = ref(false)
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

    const imageId = loc.mapillaryId || ''

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
  leafletMap = L.map(miniMapDiv.value, { zoomControl: false, attributionControl: false }).setView([20, 0], 1)
  L.control.zoom({ position: 'bottomright' }).addTo(leafletMap)
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
      radius: 12,
      fillColor: playerColor,
      fillOpacity: 1,
      color: '#fff',
      weight: 3,
      className: 'guess-marker'
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
  else if (e.key === 'm' || e.key === 'M') setMapMode(mapMode.value === 'hidden' ? 'medium' : 'hidden')
  else if (e.key === 'Escape') setMapMode(isMobile.value ? 'hidden' : 'small')
}

onMounted(async () => {
  isMobile.value = window.matchMedia('(max-width: 768px)').matches
  if (isMobile.value) mapMode.value = 'hidden'

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
  if (mapMode.value !== 'hidden') initMiniMap()


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

function setMapMode(mode: 'hidden' | 'small' | 'medium' | 'large') {
  mapMode.value = mode
  playSound('transition')
  nextTick(() => {
    if (mode !== 'hidden') initMiniMap()
    ;(window as any).lucide?.createIcons()
    setTimeout(() => leafletMap?.invalidateSize(), 320)
  })
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


    <button v-if="mapMode === 'hidden'" class="minimap-fab" @click="setMapMode(isMobile ? 'large' : 'medium')" aria-label="Open guess map">
      <i data-lucide="map" style="width: 22px; height: 22px;"></i>
      <span v-if="hasGuess" class="minimap-fab__dot"></span>
    </button>

    <div v-else :class="['game__minimap', `game__minimap--${mapMode}`]">
      <div class="minimap__header">
        <span class="minimap__title"><i data-lucide="map-pin" style="width: 16px; height: 16px;"></i> Place your guess</span>
        <div class="minimap__tools">
          <button class="minimap__tool" :class="{ 'minimap__tool--active': mapMode === 'small' }" title="Small map" @click="setMapMode('small')">
            <i data-lucide="minimize-2"></i>
          </button>
          <button class="minimap__tool" :class="{ 'minimap__tool--active': mapMode === 'medium' }" title="Medium map" @click="setMapMode('medium')">
            <i data-lucide="square"></i>
          </button>
          <button class="minimap__tool" :class="{ 'minimap__tool--active': mapMode === 'large' }" title="Large map" @click="setMapMode('large')">
            <i data-lucide="maximize-2"></i>
          </button>
          <button class="minimap__tool" title="Close map" @click="setMapMode('hidden')">
            <i data-lucide="x"></i>
          </button>
        </div>
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

.minimap-fab { position: absolute; right: 24px; bottom: 24px; z-index: 72; width: 56px; height: 56px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; background: var(--primary); color: var(--primary-foreground); border: 1px solid rgba(255,255,255,0.18); box-shadow: 0 18px 40px rgba(0,0,0,0.35); cursor: pointer; transition: transform 0.18s ease, box-shadow 0.18s ease; }
.minimap-fab:hover { transform: translateY(-2px) scale(1.03); box-shadow: 0 22px 52px rgba(0,0,0,0.45); }
.minimap-fab__dot { position: absolute; top: 8px; right: 8px; width: 12px; height: 12px; border-radius: 50%; background: #22c55e; border: 2px solid var(--primary-foreground); }

.game__minimap { position: absolute; bottom: 24px; right: 24px; z-index: 70; background-color: rgba(9, 9, 11, 0.94); border: 1px solid rgba(255,255,255,0.14); border-radius: var(--radius-md); overflow: hidden; transition: width 0.28s cubic-bezier(0.16, 1, 0.3, 1), height 0.28s cubic-bezier(0.16, 1, 0.3, 1), transform 0.28s cubic-bezier(0.16, 1, 0.3, 1); box-shadow: 0 18px 52px rgba(0, 0, 0, 0.45); backdrop-filter: blur(16px); }
.game__minimap--small { width: 220px; }
.game__minimap--medium { width: 340px; }
.game__minimap--large { width: min(620px, calc(100vw - 48px)); }
.minimap__header { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; padding: 0.7rem 0.85rem; border-bottom: 1px solid rgba(255,255,255,0.1); background: linear-gradient(180deg, rgba(39,39,42,0.96), rgba(24,24,27,0.94)); }
.minimap__title { font-family: var(--font-sans); font-size: 0.875rem; color: var(--foreground); font-weight: 600; display: flex; align-items: center; gap: 0.5rem; }
.minimap__tools { display: flex; align-items: center; gap: 0.25rem; }
.minimap__tool { width: 30px; height: 30px; border-radius: 7px; display: inline-flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.06); color: var(--muted-foreground); border: 1px solid rgba(255,255,255,0.08); cursor: pointer; transition: background-color 0.15s ease, color 0.15s ease, transform 0.15s ease; }
.minimap__tool svg { width: 15px; height: 15px; }
.minimap__tool:hover, .minimap__tool--active { background: rgba(255,255,255,0.15); color: var(--foreground); transform: translateY(-1px); }
.minimap__map { width: 100%; height: 240px; transition: height 0.28s cubic-bezier(0.16, 1, 0.3, 1); background: #d9e7dd; }
:deep(.guess-marker) { filter: drop-shadow(0 5px 12px rgba(0,0,0,0.45)); transition: r 0.18s ease, opacity 0.18s ease; }
.game__minimap--small .minimap__map { height: 170px; }
.game__minimap--large .minimap__map { height: min(480px, calc(100dvh - 210px)); }
.minimap__actions { padding: 0.75rem 1rem; border-top: 1px solid var(--border); }
.minimap__lock-btn { width: 100%; }
.btn--locked { background-color: var(--secondary) !important; color: var(--muted-foreground) !important; border-color: var(--border) !important; cursor: default !important; opacity: 0.8 !important; box-shadow: none !important; }

.game__hint { position: absolute; bottom: 24px; left: 24px; z-index: 70; padding: 0.5rem 1rem; background-color: rgba(9, 9, 11, 0.8); backdrop-filter: blur(12px); border: 1px solid var(--border); border-radius: var(--radius-sm); font-family: var(--font-sans); font-size: 0.75rem; font-weight: 500; color: var(--muted-foreground); }

.fade-enter-active, .fade-leave-active { transition: opacity 0.4s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

@media (max-width: 768px) {
  .game__hud { padding: 1rem; }
  .minimap-fab { right: calc(16px + env(safe-area-inset-right)); bottom: calc(18px + env(safe-area-inset-bottom)); width: 58px; height: 58px; }
  .game__minimap { left: 0; right: 0; bottom: 0; width: 100%; border-radius: 18px 18px 0 0; border-left: 0; border-right: 0; border-bottom: 0; transform: translateY(0); }
  .game__minimap--small,
  .game__minimap--medium,
  .game__minimap--large { width: 100%; }
  .game__minimap--small .minimap__map,
  .game__minimap--medium .minimap__map,
  .game__minimap--large .minimap__map { height: min(58dvh, 430px); }
  .minimap__header { padding: 0.85rem 1rem; }
  .minimap__tools .minimap__tool:nth-child(1),
  .minimap__tools .minimap__tool:nth-child(2) { display: none; }
  .hud-timer__value { font-size: 1.25rem; }
  .game__hint { display: none; }
}
</style>
