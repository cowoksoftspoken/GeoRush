<script setup lang="ts">
defineProps<{
  name: string
  photoURL?: string
  color?: string
  size?: 'sm' | 'md' | 'lg'
  isCurrent?: boolean
}>()
</script>

<template>
  <span
    class="player-avatar"
    :class="[`player-avatar--${size || 'md'}`, { 'player-avatar--current': isCurrent }]"
    :style="{ '--avatar-color': color || '#fafafa' }"
  >
    <img v-if="photoURL" :src="photoURL" alt="" />
    <span v-else>{{ name.slice(0, 1).toUpperCase() }}</span>
  </span>
</template>

<style scoped>
.player-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
  background: var(--avatar-color);
  color: #09090b;
  font-family: var(--font-sans);
  font-weight: 800;
  border: 2px solid rgba(255, 255, 255, 0.16);
  box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.18);
}

.player-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.player-avatar--sm {
  width: 30px;
  height: 30px;
  font-size: 0.8rem;
}

.player-avatar--lg {
  width: 56px;
  height: 56px;
  font-size: 1.35rem;
}

.player-avatar--current {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(250, 250, 250, 0.14), 0 10px 30px rgba(0, 0, 0, 0.35);
}
</style>
