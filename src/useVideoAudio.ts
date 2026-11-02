import { useEffect, useRef, useState } from 'react'
import { t as tr } from './i18n'
type AudioPrefs = {
  volume: number
  muted: boolean
}

export function useVideoAudio() {
  const [value, setValue] = useState<AudioPrefs>({ volume: 1, muted: false }),
    [ready, setReady] = useState(false),
    [error, setError] = useState('')

  const current = useRef(value),
    mounted = useRef(false),
    blocked = useRef(false),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const persist = () => {
    timer.current = undefined

    if (blocked.current) return

    void window.desktop
      .updateWorkspace({ action: 'videoAudio', value: current.current })
      .catch((reason) => {
        if (mounted.current) setError(tr('音量偏好尚未保存：') + String(reason))
      })
  }

  useEffect(() => {
    mounted.current = true

    let alive = true

    window.desktop
      .workspace()
      .then((state) => {
        if (!alive) return

        blocked.current = !!state.error

        current.current = state.prefs.videoAudio ?? { volume: 1, muted: false }
        setValue(current.current)

        if (state.error) setError(tr('音量偏好無法讀取，暫用本次設定。'))
      })
      .catch(() => {
        if (alive) {
          blocked.current = true
          setError(tr('音量偏好無法讀取，暫用本次設定。'))
        }
      })
      .finally(() => {
        if (alive) setReady(true)
      })

    return () => {
      alive = false
      mounted.current = false
      if (timer.current) {
        clearTimeout(timer.current)
        persist()
      }
    }
  }, [])

  const change = (next: AudioPrefs) => {
    current.current = next
    setValue(next)
    setError('')

    if (timer.current) clearTimeout(timer.current)

    if (!blocked.current) timer.current = setTimeout(persist, 250)
  }

  return { ...value, ready, error, change }
}
