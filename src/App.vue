<script setup lang="ts">
import { onMounted } from 'vue'
import { store } from './store'
import { db, dbRef, onValue } from './firebase'
import LobbyScreen from './components/screens/LobbyScreen.vue'
import WaitingScreen from './components/screens/WaitingScreen.vue'
import GameScreen from './components/screens/GameScreen.vue'
import RoundResultsScreen from './components/screens/RoundResultsScreen.vue'
import FinalResultsScreen from './components/screens/FinalResultsScreen.vue'
import ToastContainer from './components/ToastContainer.vue'
import ConnectionBanner from './components/ConnectionBanner.vue'
import DebugPanel from './components/DebugPanel.vue'
import { watch } from 'vue'
import { playerCount } from './store'
import { declareSoloWinner, listenToAuth } from './firebase'
import { globalToast } from './composables/useToast'

const { showToast } = globalToast


const DEV_MODE = import.meta.env.DEV


onMounted(() => {
  listenToAuth((user) => {
    store.myUid = user?.uid ?? ''
    store.myPhotoURL = user?.photoURL ?? ''
    store.myEmail = user?.email ?? ''
    store.isAnonymous = user?.isAnonymous ?? true
    if (user?.displayName && !store.myNickname) {
      store.myNickname = user.displayName
    }
  })

  const connRef = dbRef(db, '.info/connected')
  onValue(connRef, (snap) => {
    store.connectionLost = snap.val() === false
  })

  watch(playerCount, async (count) => {
    const status = store.meta?.status
    if (count === 1 && store.roomCode && store.myUid && status && status !== 'waiting' && status !== 'gameOver') {
      const won = await declareSoloWinner(store.roomCode, store.myUid)
      if (won) {
        showToast('Opponent left. You win!', 'success')
        store.screen = 'finalResults'
      }
    }
  })
})
</script>

<template>
  <div class="app-root">

    <ConnectionBanner />


    <ToastContainer />


    <Transition name="screen" mode="out-in">
      <LobbyScreen v-if="store.screen === 'lobby'" key="lobby" />
      <WaitingScreen v-else-if="store.screen === 'waiting'" key="waiting" />
      <GameScreen v-else-if="store.screen === 'game'" key="game" />
      <RoundResultsScreen v-else-if="store.screen === 'roundResults'" key="roundResults" />
      <FinalResultsScreen v-else-if="store.screen === 'finalResults'" key="finalResults" />
    </Transition>


    <DebugPanel v-if="DEV_MODE" />
  </div>
</template>

<style scoped>
.app-root {
  height: 100%;
  width: 100%;
  position: relative;
}
</style>
