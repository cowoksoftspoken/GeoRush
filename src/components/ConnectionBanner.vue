<script setup lang="ts">
import { store } from '../store'
</script>

<template>
  <Transition name="banner">
    <div v-if="store.connectionLost" class="conn-banner">
      <span class="conn-banner__dot"></span>
      <span>Connection lost — reconnecting...</span>
    </div>
  </Transition>
</template>

<style scoped>
.conn-banner {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 9998;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 10px;
  background: rgba(244, 63, 94, 0.15);
  border-bottom: 1px solid rgba(244, 63, 94, 0.3);
  backdrop-filter: blur(10px);
  font-family: 'DM Sans', sans-serif;
  font-size: 13px;
  color: var(--accent-danger);
}

.conn-banner__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent-danger);
  animation: connPulse 1s ease-in-out infinite;
}

@keyframes connPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

.banner-enter-active {
  animation: slideDown 0.3s ease-out;
}

.banner-leave-active {
  animation: slideDown 0.3s ease-in reverse;
}

@keyframes slideDown {
  from { transform: translateY(-100%); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
</style>
