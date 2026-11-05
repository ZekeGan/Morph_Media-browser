import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Popover } from '@mantine/core'
import { Icon, type IconName } from './icons'
import { t as tr, useLocale } from './i18n'

export const videoTime = (value: number) => {
  const seconds = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0,
    h = Math.floor(seconds / 3600),
    m = Math.floor(seconds / 60) % 60,
    s = seconds % 60

  return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(s).padStart(2, '0')
}
interface Props {
  controls: RefObject<HTMLDivElement | null>
  stage: RefObject<HTMLDivElement | null>
  panelHeight: number
  panelWidth: number
  subtitleSettings: ReactNode
  visible: boolean
  paused: boolean
  time: number
  duration: number
  buffered: number

  volume: number
  muted: boolean
  rate: number
  audioReady: boolean

  fullscreen: boolean
  canPrevious: boolean
  canNext: boolean
  menuOpen: boolean

  menu: (open: boolean) => void
  play: () => void
  seek: (time: number) => void
  audio: (volume: number, muted: boolean) => void

  speed: (value: number) => void
  interacting: (value: boolean) => void
  previous: () => void
  next: () => void
  full: () => void
}
export function VideoControls(p: Props) {
  useLocale()

  const [hover, setHover] = useState<number>()
  const [dragging, setDragging] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!dragging) return
    p.interacting(true)
    const stop = () => setDragging(false)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
    window.addEventListener('blur', stop)
    return () => {
      p.interacting(false)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
      window.removeEventListener('blur', stop)
    }
  }, [dragging, p.interacting])

  const tool = (
    label: string,
    icon: IconName,
    action: () => void,
    disabled = false,
    shortcut?: string,
    pressed?: boolean,
    extra = ''
  ) => (
    <button
      type="button"
      className={'player-button ' + extra}
      title={label + (shortcut ? ' · ' + shortcut : '')}
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={action}
    >
      <Icon name={icon} size={20} />
    </button>
  )

  const seekable = Number.isFinite(p.duration) && p.duration > 0

  const percent = seekable ? Math.min(100, (p.time / p.duration) * 100) : 0

  return (
    <div
      ref={p.controls}
      className="video-controls"
      role="group"
      aria-label={tr('影片播放控制')}
      data-visible={p.visible}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <div
        className="player-timeline"
        style={
          {
            '--played': percent + '%',
            '--buffered': (seekable ? Math.min(100, (p.buffered / p.duration) * 100) : 0) + '%',
          } as React.CSSProperties
        }
      >
        <input
          type="range"
          aria-label={tr('播放進度')}
          aria-valuetext={videoTime(p.time) + ' / ' + videoTime(p.duration)}
          min={0}
          max={seekable ? p.duration : 1}
          step={0.1}
          value={seekable ? Math.min(p.time, p.duration) : 0}
          disabled={!seekable}
          onChange={(event) => p.seek(Number(event.currentTarget.value))}
          onKeyDown={(event) => {
            if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
              event.preventDefault()
              event.stopPropagation()
              p.seek(
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? p.duration
                    : p.time + (event.key === 'ArrowLeft' ? -5 : 5)
              )
            }
          }}
          onPointerMove={(event) => {
            const bounds = event.currentTarget.getBoundingClientRect()
            setHover(
              Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)) * p.duration
            )
          }}
          onPointerLeave={() => setHover(undefined)}
          onBlur={() => setHover(undefined)}
        />
        {hover !== undefined && seekable && (
          <output
            className="timeline-hint"
            style={{ left: Math.max(5, Math.min(95, (hover / p.duration) * 100)) + '%' }}
          >
            {videoTime(hover)}
          </output>
        )}
      </div>
      <div className="player-control-row">
        <div className="player-transport">
          {tool(
            p.paused ? tr('播放') : tr('暫停'),
            p.paused ? 'play' : 'pause',
            p.play,
            false,
            'K / Space'
          )}
          {(p.canPrevious || p.canNext) && (
            <span className="player-playlist">
              {tool(tr('上一部'), 'previous', p.previous, !p.canPrevious)}
              {tool(tr('下一部'), 'next', p.next, !p.canNext)}
            </span>
          )}
          <span className="player-audio" data-dragging={dragging}>
            {tool(
              p.muted || p.volume === 0 ? tr('取消靜音') : tr('靜音'),
              p.muted || p.volume === 0 ? 'muted' : 'volume',
              () => p.audio(p.volume || 0.5, p.volume === 0 ? false : !p.muted),
              !p.audioReady,
              'M'
            )}
            <span className="player-volume-reveal">
              <input
                className="player-volume"
                type="range"
                aria-label={tr('音量')}
                aria-valuetext={Math.round((p.muted ? 0 : p.volume) * 100) + '%'}
                min={0}
                max={1}
                step={0.01}
                value={p.muted ? 0 : p.volume}
                disabled={!p.audioReady}
                onPointerDown={() => setDragging(true)}
                onChange={(event) => {
                  const value = Number(event.currentTarget.value)
                  p.audio(value, value === 0)
                }}
              />
            </span>
          </span>
          <span className="player-time" aria-live="off">
            {videoTime(p.time)} / {videoTime(p.duration)}
          </span>
        </div>
        <div className="player-actions">
          <Popover
            opened={p.menuOpen}
            onChange={p.menu}
            position="top-end"
            withinPortal={false}
            withArrow
            shadow="md"
            trapFocus
            returnFocus
            closeOnEscape={false}
            middlewares={{
              flip: false,
              shift: { boundary: p.stage.current ?? undefined, padding: 8 },
            }}
          >
            <Popover.Target>
              <button
                ref={trigger}
                type="button"
                className="player-button"
                title={tr('更多播放設定')}
                aria-label={tr('更多播放設定')}
                aria-expanded={p.menuOpen}
                aria-haspopup="dialog"
                onClick={() => p.menu(!p.menuOpen)}
              >
                <Icon name="settings" size={20} />
              </button>
            </Popover.Target>
            <Popover.Dropdown
              className="player-settings"
              role="dialog"
              aria-label={tr('更多播放設定')}
              style={{ width: p.panelWidth, maxHeight: p.panelHeight }}
              onKeyDown={(event) => {
                if (event.key === 'Escape' && !event.defaultPrevented) {
                  event.preventDefault()
                  event.stopPropagation()
                  p.menu(false)
                  trigger.current?.focus()
                }
              }}
            >
              <div className="player-settings-heading">
                <strong>{tr('播放設定')}</strong>
                <button
                  type="button"
                  className="player-settings-close"
                  aria-label={tr('關閉播放設定')}
                  onClick={() => {
                    p.menu(false)
                    trigger.current?.focus()
                  }}
                >
                  <Icon name="close" size={18} />
                </button>
              </div>
              <label className="player-speed-label">
                {tr('播放速度')}
                <select
                  aria-label={tr('播放速度')}
                  value={p.rate}
                  onChange={(event) => p.speed(Number(event.currentTarget.value))}
                >
                  {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => (
                    <option key={rate} value={rate}>
                      {rate === 1 ? tr('正常速度') : rate + '×'}
                    </option>
                  ))}
                </select>
              </label>
              {p.subtitleSettings}
            </Popover.Dropdown>
          </Popover>
          {tool(
            p.fullscreen ? tr('退出全螢幕') : tr('全螢幕'),
            p.fullscreen ? 'restore' : 'focus',
            p.full,
            false,
            'F'
          )}
        </div>
      </div>
    </div>
  )
}
