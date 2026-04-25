<script setup lang="ts">
import { globalToast } from '../composables/useToast'

const { toasts, removeToast } = globalToast
</script>

<template>
  <div class="toast-container">
    <TransitionGroup name="toast">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        :class="['toast', `toast--${toast.type}`]"
        @click="removeToast(toast.id)"
      >
        <span class="toast__icon">
          <template v-if="toast.type === 'success'">✓</template>
          <template v-else-if="toast.type === 'warning'">⚠</template>
          <template v-else-if="toast.type === 'error'">✕</template>
          <template v-else>ℹ</template>
        </span>
        <span class="toast__message">{{ toast.message }}</span>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-container {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 10px;
  pointer-events: none;
}

.toast {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 20px;
  border-radius: var(--radius-sm);
  backdrop-filter: blur(20px);
  font-family: 'DM Sans', sans-serif;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  min-width: 280px;
  box-shadow: var(--shadow-card);
  border: 1px solid var(--border-subtle);
}

.toast--success {
  background: rgba(45, 212, 191, 0.15);
  color: var(--accent-teal);
  border-color: rgba(45, 212, 191, 0.3);
}

.toast--warning {
  background: rgba(245, 200, 66, 0.15);
  color: var(--accent-gold);
  border-color: rgba(245, 200, 66, 0.3);
}

.toast--error {
  background: rgba(244, 63, 94, 0.15);
  color: var(--accent-danger);
  border-color: rgba(244, 63, 94, 0.3);
}

.toast--info {
  background: rgba(240, 242, 245, 0.1);
  color: var(--text-primary);
  border-color: rgba(240, 242, 245, 0.15);
}

.toast__icon {
  font-size: 16px;
  flex-shrink: 0;
  width: 20px;
  text-align: center;
}

.toast__message {
  flex: 1;
}


.toast-enter-active {
  animation: toastIn 0.35s ease-out;
}

.toast-leave-active {
  animation: toastOut 0.3s ease-in forwards;
}

@keyframes toastIn {
  from {
    opacity: 0;
    transform: translateX(60px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateX(0) scale(1);
  }
}

@keyframes toastOut {
  from {
    opacity: 1;
    transform: translateX(0) scale(1);
  }
  to {
    opacity: 0;
    transform: translateX(60px) scale(0.95);
  }
}
</style>
