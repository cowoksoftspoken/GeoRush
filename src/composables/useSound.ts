
import { store } from '../store'

const SOUNDS = {
  click: 'https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3',
  success: 'https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3',
  transition: 'https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3',
  error: 'https://assets.mixkit.co/active_storage/sfx/2573/2573-preview.mp3'
}

type SoundKey = keyof typeof SOUNDS

export function useSound() {
  const playSound = (key: SoundKey) => {
    if (!store.settings.sound) return
    
    const audio = new Audio(SOUNDS[key])
    audio.volume = store.settings.volume ?? 0.5
    audio.play().catch(err => console.warn('Audio play blocked:', err))
  }

  return { playSound }
}
