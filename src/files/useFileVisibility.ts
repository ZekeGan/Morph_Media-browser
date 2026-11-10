import { useEffect, useState } from 'react'
import { defaultVisibility, type FileVisibility } from '../../shared/media'

const changed = 'media-viewer-file-visibility'
export function useFileVisibility() {
  const [visibility, setVisibility] = useState(defaultVisibility),
    [error, setError] = useState('')
  useEffect(() => {
    let alive = true,
      updated = false
    const receive = (event: Event) => {
      updated = true
      setVisibility((event as CustomEvent<FileVisibility>).detail)
    }
    window.addEventListener(changed, receive)
    void window.desktop
      .workspace()
      .then((result) => {
        if (alive && !updated) setVisibility(result.prefs.fileVisibility ?? defaultVisibility)
      })
      .catch((reason) => {
        if (alive) setError(String(reason))
      })
    return () => {
      alive = false
      window.removeEventListener(changed, receive)
    }
  }, [])
  const save = async (value: FileVisibility) => {
    try {
      const result = await window.desktop.updateWorkspace({ action: 'fileVisibility', value })
      window.dispatchEvent(
        new CustomEvent(changed, { detail: result.prefs.fileVisibility ?? defaultVisibility })
      )
      setError('')
    } catch (reason) {
      setError(String(reason))
    }
  }
  return { visibility, save, error }
}
