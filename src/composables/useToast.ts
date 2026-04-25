


import { ref } from 'vue'
import type { Toast, ToastType } from '../types'

const toasts = ref<Toast[]>([])
let toastId = 0

export function useToast() {
  function showToast(message: string, type: ToastType = 'info') {
    const id = ++toastId
    toasts.value.push({ id, message, type })

    setTimeout(() => {
      removeToast(id)
    }, 3000)
  }

  function removeToast(id: number) {
    const index = toasts.value.findIndex((t) => t.id === id)
    if (index !== -1) {
      toasts.value.splice(index, 1)
    }
  }

  return {
    toasts,
    showToast,
    removeToast
  }
}


export const globalToast = useToast()
