import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { t as tr, useLocale } from '../i18n'

// Shared file context menu (add to play queue / file info) for Gallery and the playback panel.
export function FileMenu({
  x,
  y,
  count,
  onAdd,
  onInfo,
  onClose,
}: {
  x: number
  y: number
  count: number
  onAdd?: () => void
  onInfo?: () => void
  onClose: () => void
}) {
  useLocale()
  const item = useRef<HTMLButtonElement>(null),
    opener = useRef(document.activeElement as HTMLElement | null)
  useEffect(() => {
    item.current?.focus()
    const away = (event: Event) => {
      if (!(event.target as HTMLElement).closest?.('.queue-menu')) onClose()
    }
    document.addEventListener('pointerdown', away, true)
    window.addEventListener('blur', onClose)
    const previous = opener.current
    return () => {
      document.removeEventListener('pointerdown', away, true)
      window.removeEventListener('blur', onClose)
      if (previous?.isConnected) previous.focus({ preventScroll: true })
    }
  }, [])
  return createPortal(
    <div
      className="queue-menu"
      role="menu"
      style={{
        left: Math.max(4, Math.min(x, window.innerWidth - 220)),
        top: Math.max(4, Math.min(y, window.innerHeight - 48)),
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          onClose()
        }
      }}
    >
      {onAdd && (
        <button ref={item} role="menuitem" onClick={onAdd}>
          {count > 1 ? tr('加入播放佇列（{0} 項）', String(count)) : tr('加入播放佇列')}
        </button>
      )}
      {onInfo && (
        <button ref={onAdd ? undefined : item} role="menuitem" onClick={onInfo}>
          {tr('檔案資訊')}
        </button>
      )}
    </div>,
    document.body
  )
}
