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
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-radius: var(--radius-sm);
  background-color: var(--card);
  border: 1px solid var(--border);
  font-family: var(--font-sans);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  min-width: 280px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
  color: var(--foreground);
}

.toast--success {
  border-left: 4px solid var(--primary);
}

.toast--warning {
  border-left: 4px solid var(--muted-foreground);
}

.toast--error {
  border-left: 4px solid var(--destructive);
}

.toast--info {
  border-left: 4px solid var(--foreground);
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
