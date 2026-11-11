import { useSyncExternalStore } from 'react'

// Music loop mode, shared by every audio player in the window. It lasts for this session; keeping it across
// restarts is part of the local reading/playback record (R-253 batch).
export type LoopMode = 'off' | 'all' | 'one'

let mode: LoopMode = 'off'
const listeners = new Set<() => void>()

export const nextLoop = (value: LoopMode): LoopMode =>
  value === 'off' ? 'all' : value === 'all' ? 'one' : 'off'

export function setLoop(value: LoopMode) {
  mode = value
  for (const listener of listeners) listener()
}

export function useAudioLoop() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => mode
  )
}
