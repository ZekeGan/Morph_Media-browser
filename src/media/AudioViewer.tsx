import { Audio, AudioPlayer } from '@videojs/react/audio'
import { ActionIcon, Button, Checkbox, Menu, Slider, Tooltip } from '@mantine/core'
import { useEffect, useRef, useState } from 'react'
import type { MediaEntry } from '../../shared/explorer'
import { useVideoAudio } from './useVideoAudio'
import { Icon } from '../common/icons'
import { t as tr } from '../i18n'

const clock = (seconds: number) =>
  Number.isFinite(seconds)
    ? Math.floor(seconds / 60) + ':' + String(Math.floor(seconds % 60)).padStart(2, '0')
    : '0:00'
export function AudioViewer({
  background = false,
  file,
  cover,
  covers = [],
  previous,
  next,
  autoNext,
  changeAutoNext,
}: {
  background?: boolean
  file: MediaEntry
  cover?: string
  covers?: MediaEntry[]
  previous?: () => void
  next?: () => void
  autoNext: boolean
  changeAutoNext: (value: boolean) => void
}) {
  const node = useRef<HTMLAudioElement | null>(null),
    allowed = useRef(false),
    intent = useRef(true),
    starting = useRef(false)
  const [paused, setPaused] = useState(true),
    [time, setTime] = useState(0),
    [duration, setDuration] = useState(0),
    [error, setError] = useState(''),
    [coverError, setCoverError] = useState(''),
    [chosenCover, setChosenCover] = useState<string>()
  const candidates = covers.filter((entry) =>
    /^(cover|folder|front|album)\.[^.]+$/i.test(entry.name)
  )
  const [embeddedCover, setEmbeddedCover] = useState<string>(),
    [embeddedError, setEmbeddedError] = useState(''),
    [coverLoading, setCoverLoading] = useState(!cover)
  const coverUrl =
    chosenCover ??
    cover ??
    embeddedCover ??
    (!coverLoading && candidates.length === 1 ? candidates[0].url : undefined)
  useEffect(() => {
    if (cover) return
    let active = true,
      url: string | undefined
    const controller = new AbortController(),
      source = new URL(file.url)
    source.hostname = 'audio-cover'
    setEmbeddedCover(undefined)
    setEmbeddedError('')
    setCoverLoading(true)
    void fetch(source, { signal: controller.signal })
      .then(async (response) => {
        if (response.status === 204) return
        if (!response.ok) throw new Error(tr('內嵌封面無法讀取，仍可選擇資料夾圖片'))
        const blob = await response.blob()
        if (!active) return
        url = URL.createObjectURL(blob)
        setEmbeddedCover(url)
      })
      .catch((error) => {
        if (active && error.name !== 'AbortError') setEmbeddedError(String(error.message ?? error))
      })
      .finally(() => {
        if (active) setCoverLoading(false)
      })
    return () => {
      active = false
      controller.abort()
      if (url) URL.revokeObjectURL(url)
    }
  }, [file.url, cover])
  const audio = useVideoAudio(),
    live = useRef(audio)
  live.current = audio
  const start = async () => {
    const current = node.current
    if (
      !current ||
      starting.current ||
      !current.isConnected ||
      !allowed.current ||
      (!background && document.hidden) ||
      !live.current.ready
    )
      return
    current.volume = live.current.volume
    current.muted = live.current.muted
    starting.current = true
    try {
      await current.play()
    } catch (reason) {
      if (current === node.current && allowed.current && intent.current) setError(String(reason))
    } finally {
      starting.current = false
    }
  }
  const wantedUrl = useRef<string | undefined>(undefined)
  const bind = (current: HTMLAudioElement | null) => {
    const old = node.current
    if (old && old !== current) {
      old.pause()
      old.removeAttribute('src')
      old.load()
    }
    node.current = current
    // StrictMode re-attaches the same node after its src was cleared above.
    if (current && wantedUrl.current && !current.getAttribute('src'))
      current.src = wantedUrl.current
  }
  const bindRef = useRef(bind)
  wantedUrl.current = file.url
  // Keep a stable ref so ordinary state updates never detach the audio source.
  useEffect(() => {
    let alive = true,
      observed = false
    intent.current = true
    const pause = () => {
      intent.current = false
      node.current?.pause()
    }
    const visibility = () => {
      if (!background && document.hidden) pause()
    }
    const apply = (visible?: boolean) => {
      allowed.current = background || visible !== false
      if (!allowed.current) pause()
      else if (intent.current && node.current && node.current.readyState >= 1) void start()
    }
    const remove = window.desktop.onWindowState((state) => {
      observed = true
      apply(state.visible)
    })
    void window.desktop
      .windowAction('state')
      .then((state) => {
        if (alive && !observed) apply(state.visible)
      })
      .catch(() => {})
    document.addEventListener('visibilitychange', visibility)
    // StrictMode replays effects without detaching the DOM ref. Only the ref
    // callback releases the source on a real detach; effect cleanup just pauses.
    return () => {
      alive = false
      allowed.current = false
      intent.current = false
      node.current?.pause()
      remove()
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [])
  useEffect(() => {
    const current = node.current
    if (!current) return
    current.volume = audio.volume
    current.muted = audio.muted
    if (audio.ready && intent.current && current.readyState >= 1) void start()
  }, [audio.ready, audio.volume, audio.muted])
  const toggle = () => {
    const current = node.current
    if (!current) return
    setError('')
    if (current.paused) {
      intent.current = true
      void start()
    } else {
      intent.current = false
      current.pause()
    }
  }
  return (
    <div
      className="audio-viewer"
      tabIndex={0}
      aria-label={tr('音樂播放器')}
      onKeyDown={(event) => {
        if ((event.target as HTMLElement).closest('input,button,[role="slider"]')) return
        if (event.key === ' ' || event.key.toLowerCase() === 'k') {
          event.preventDefault()
          toggle()
        }
        if (['ArrowLeft', 'ArrowRight'].includes(event.key) && node.current) {
          event.preventDefault()
          node.current.currentTime = Math.max(
            0,
            Math.min(duration, node.current.currentTime + (event.key === 'ArrowRight' ? 5 : -5))
          )
        }
      }}
    >
      <AudioPlayer>
        <Audio
          ref={bindRef.current}
          src={file.url}
          controls={false}
          preload="metadata"
          onLoadedMetadata={(event) => {
            if (event.currentTarget !== node.current) return
            setDuration(event.currentTarget.duration)
            if (intent.current) void start()
          }}
          onPlay={(event) => {
            if (
              event.currentTarget !== node.current ||
              !allowed.current ||
              (!background && document.hidden) ||
              !intent.current
            )
              event.currentTarget.pause()
            else setPaused(false)
          }}
          onPause={() => setPaused(true)}
          onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
          onEnded={() => {
            intent.current = false
            setPaused(true)
            if (autoNext) next?.()
          }}
          onError={() => {
            intent.current = false
            setError(tr('無法播放此音樂格式或檔案已失效'))
          }}
        />
      </AudioPlayer>
      <div className="album-cover">
        {coverUrl && coverError !== coverUrl ? (
          <img
            key={coverUrl}
            src={coverUrl}
            alt={tr('專輯封面')}
            onError={() => setCoverError(coverUrl)}
          />
        ) : (
          <Icon name="music" size={80} />
        )}
      </div>
      {coverUrl && coverError === coverUrl ? (
        <small role="alert">{tr('無法載入專輯封面')}</small>
      ) : (
        !coverUrl &&
        !embeddedError && (
          <small className="muted">{coverLoading ? tr('載入內容…') : tr('尚未設定專輯封面')}</small>
        )
      )}
      {embeddedError && !cover && !chosenCover && <small role="alert">{embeddedError}</small>}
      {(cover || covers.length > 0) && (
        <Menu position="bottom" zIndex={450}>
          <Menu.Target>
            <Button
              variant="subtle"
              size="compact-xs"
              leftSection={<Icon name="image" size={14} />}
            >
              {tr('選擇專輯封面')}
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            {cover && (
              <Menu.Item
                onClick={() => {
                  setChosenCover(undefined)
                  setCoverError('')
                }}
              >
                {tr('使用資料夾指定封面')}
              </Menu.Item>
            )}
            {covers.map((entry) => (
              <Menu.Item
                key={entry.id}
                onClick={() => {
                  setChosenCover(entry.url)
                  setCoverError('')
                }}
              >
                {entry.name}
              </Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu>
      )}
      <h2 title={file.name}>{file.name}</h2>
      <Slider
        aria-label={tr('音樂進度')}
        value={time}
        min={0}
        max={duration || 1}
        step={0.1}
        disabled={!duration}
        label={clock}
        onChange={(value) => {
          if (node.current) node.current.currentTime = value
          setTime(value)
        }}
      />
      <small>
        {clock(time)} / {clock(duration)}
      </small>
      <div className="audio-buttons">
        <ActionIcon
          aria-label={tr('上一首')}
          variant="subtle"
          disabled={!previous}
          onClick={previous}
        >
          <Icon name="chevron-left" />
        </ActionIcon>
        <ActionIcon
          size="xl"
          variant="light"
          aria-label={paused ? tr('播放') : tr('暫停')}
          onClick={toggle}
        >
          <Icon name={paused ? 'play' : 'pause'} />
        </ActionIcon>
        <ActionIcon aria-label={tr('下一首')} variant="subtle" disabled={!next} onClick={next}>
          <Icon name="chevron-right" />
        </ActionIcon>
      </div>
      <div className="audio-volume">
        <Tooltip label={tr('靜音')}>
          <ActionIcon
            variant="subtle"
            aria-label={tr('靜音')}
            aria-pressed={audio.muted}
            onClick={() => audio.change({ volume: audio.volume, muted: !audio.muted })}
          >
            <Icon name={audio.muted ? 'muted' : 'volume'} />
          </ActionIcon>
        </Tooltip>
        <Slider
          aria-label={tr('音量')}
          thumbLabel={tr('音量')}
          min={0}
          max={100}
          step={1}
          value={audio.muted ? 0 : Math.round(audio.volume * 100)}
          onChange={(volume) => audio.change({ volume: volume / 100, muted: volume === 0 })}
        />
      </div>
      {!background && (
        <Checkbox
          label={tr('播完接下一首')}
          checked={autoNext}
          onChange={(event) => changeAutoNext(event.currentTarget.checked)}
        />
      )}
      {(error || audio.error) && <p role="alert">{error || audio.error}</p>}
    </div>
  )
}
