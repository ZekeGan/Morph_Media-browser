import { t as tr, useLocale } from '../i18n'
import { Icon } from '../common/icons'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Video, VideoPlayer } from '@videojs/react/video'
import type { FolderRow } from '../../shared/model'
import {
  defaultSubtitle,
  type ExplorerRequest,
  type ExplorerResponse,
  type MediaEntry,
  type SubtitlePrefs,
} from '../../shared/explorer'
import { parseSubtitles, type Cue } from '../../shared/subtitles'
import { VideoControls } from './VideoControls'
import { Accordion } from '@mantine/core'
import { VideoSubtitleSettings } from './VideoSubtitleSettings'
import { useVideoAudio } from '../media/useVideoAudio'

type UpNext = {
  fileId: string
  nextId: string
  remaining: number
}
export function VideoViewer({
  background = false,
  row,
  entries,
  run,
  busy,
  autoplay,
  autoNext,
  changeAutoNext,
  changeAutoplay,
  initialFileId,
  hideStrip = false,
  onSelected,
}: {
  background?: boolean
  row: FolderRow
  entries: MediaEntry[]
  run: (req: ExplorerRequest) => Promise<ExplorerResponse | undefined>
  autoplay: boolean
  hideStrip?: boolean
  onSelected?: (id: string) => void
  initialFileId?: string

  busy: boolean
  autoNext: boolean
  changeAutoNext: (value: boolean) => Promise<boolean>
  changeAutoplay: (value: boolean) => Promise<boolean>
}) {
  useLocale()

  const videos = entries.filter((entry) => entry.kind === 'video'),
    subtitles = entries.filter((entry) => entry.kind === 'subtitle')

  const [fileId, setFileId] = useState(initialFileId ?? videos[0]?.id),
    [subtitle, setSubtitle] = useState<ExplorerResponse['subtitle']>(),
    [cues, setCues] = useState<Cue[]>([])

  const [settings, setSettings] = useState(defaultSubtitle),
    [error, setError] = useState(''),
    [failure, setFailure] = useState<{ fileId: string; probe?: string }>(),
    [files, setFiles] = useState<File[]>([]),
    [captions, setCaptions] = useState(true)

  const [subtitleSection, setSubtitleSection] = useState<string | null>(null),
    [audioDragging, setAudioDragging] = useState(false),
    [menuOpen, setMenuOpen] = useState(false),
    [subtitleExpanded, setSubtitleExpanded] = useState(false)

  const [paused, setPaused] = useState(true),
    [time, setTime] = useState(0),
    [duration, setDuration] = useState(0),
    [buffered, setBuffered] = useState(0),
    [rate, setRate] = useState(1),
    [waiting, setWaiting] = useState(false)

  const [active, setActive] = useState(true),
    [fullscreen, setFullscreen] = useState(false),
    [upNext, setUpNext] = useState<UpNext>()

  const [box, setBox] = useState({ bottom: 0, left: 0, width: 0, height: 0 }),
    [controlHeight, setControlHeight] = useState(80),
    [stageSize, setStageSize] = useState({ width: 360, height: 480 })

  const viewer = useRef<HTMLDivElement>(null),
    stage = useRef<HTMLDivElement>(null),
    controls = useRef<HTMLDivElement>(null),
    strip = useRef<HTMLDivElement>(null)

  const video = useRef<HTMLVideoElement | null>(null),
    latest = useRef(row),
    mounted = useRef(false),
    saving = useRef(false),
    wantsPlayback = useRef(initialFileId ? true : autoplay),
    pendingStart = useRef(false)

  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    clickTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    nextRef = useRef<UpNext | undefined>(undefined)

  const windowVisible = useRef(true)

  const audio = useVideoAudio(),
    audioLive = useRef(audio),
    speed = useRef(rate),
    filesLive = useRef(videos),
    currentFile = useRef<string | undefined>(undefined),
    wantedUrl = useRef<string | undefined>(undefined)

  const file = videos.find((entry) => entry.id === fileId) ?? videos[0],
    index = videos.findIndex((entry) => entry.id === file?.id)

  latest.current = row
  audioLive.current = audio
  speed.current = rate
  filesLive.current = videos
  currentFile.current = file?.id
  wantedUrl.current = file?.url

  const countdown = (value?: UpNext) => {
    nextRef.current = value
    setUpNext(value)
  }

  const release = (node: HTMLVideoElement) => {
    node.pause()
    node.removeAttribute('src')
    node.load()
  }

  const bindVideo = useCallback((node: HTMLVideoElement | null) => {
    const previous = video.current
    video.current = node
    pendingStart.current = false

    if (previous && previous !== node) release(previous)

    if (node) {
      // StrictMode detaches and re-attaches the same node after release() cleared its src.
      if (wantedUrl.current && !node.getAttribute('src')) node.src = wantedUrl.current
      node.muted = true
      if (audioLive.current.ready) {
        node.volume = audioLive.current.volume
        node.muted = audioLive.current.muted
      }
      node.playbackRate = speed.current
    }
  }, [])

  const showControls = () => {
    setActive(true)

    if (hideTimer.current) clearTimeout(hideTimer.current)

    hideTimer.current = setTimeout(() => {
      if (
        !controls.current?.querySelector(':focus-visible') &&
        !controls.current?.matches(':hover')
      )
        setActive(false)
    }, 2500)
  }

  const playSelected = async (node: HTMLVideoElement) => {
    if (node !== video.current || !node.isConnected) return

    if ((!background && document.hidden) || !windowVisible.current || !audioLive.current.ready) {
      pendingStart.current = true
      return
    }

    pendingStart.current = false

    try {
      await node.play()
      if (
        node !== video.current ||
        !node.isConnected ||
        (!background && document.hidden) ||
        !windowVisible.current
      )
        node.pause()
      else if (mounted.current) setError('')
    } catch (reason) {
      if (
        mounted.current &&
        node === video.current &&
        node.isConnected &&
        (reason as Error).name !== 'AbortError'
      )
        if (node.error || (reason as Error).name === 'NotSupportedError') reportDecodeFailure()
        else setError(tr('無法自動播放，請按播放器的播放按鈕。'))
    }
  }

  // The browser only says "cannot decode"; the file's first bytes usually say why.
  const reportDecodeFailure = () => {
    setError(tr('此影片無法解碼或已失效；首輪驗證 MP4／WebM，MKV／HEVC 不保證支援。'))
    const target = currentFile.current
    if (!target) return
    setFailure({ fileId: target })
    void run({ action: 'fileProbe', rowId: row.rowId, fileId: target }).then((result) => {
      if (mounted.current && currentFile.current === target)
        setFailure({ fileId: target, probe: result?.probe?.kind })
    })
  }
  const failureCause = (kind?: string) =>
    ({
      zip: tr('這個檔案其實是 ZIP 壓縮檔，只是副檔名是影片；請先解壓縮。'),
      rar: tr('這個檔案其實是 RAR 壓縮檔，只是副檔名是影片；請先解壓縮。'),
      '7z': tr('這個檔案其實是 7z 壓縮檔，只是副檔名是影片；請先解壓縮。'),
      gzip: tr('這個檔案其實是壓縮檔，只是副檔名是影片；請先解壓縮。'),
      html: tr('這個檔案是網頁或文字，不是影片；可能是下載失敗，請重新下載。'),
      empty: tr('這個檔案是空的（0 位元組）；可能是下載或複製中斷。'),
    })[kind as 'zip'] ?? ''

  const togglePlay = () => {
    const node = video.current
    if (!node) return

    countdown()
    showControls()

    if (node.paused) {
      wantsPlayback.current = true
      void playSelected(node)
    } else {
      pendingStart.current = false
      node.pause()
    }
  }

  const selectVideo = (entry: MediaEntry) => {
    countdown()
    setMenuOpen(false)
    showControls()

    wantsPlayback.current = true

    if (entry.id === file?.id) {
      if (video.current) void playSelected(video.current)
      return
    }

    video.current?.pause()
    setFileId(entry.id)
  }

  useEffect(() => {
    if (initialFileId && initialFileId !== file?.id) {
      const next = videos.find((entry) => entry.id === initialFileId)
      if (next) selectVideo(next)
    }
  }, [initialFileId])
  useEffect(() => {
    if (file) onSelected?.(file.id)
  }, [file?.id])
  const seek = (value: number) => {
    const node = video.current
    if (!node || !Number.isFinite(node.duration) || node.duration <= 0) return

    countdown()
    node.currentTime = Math.max(0, Math.min(node.duration, value))
    setTime(node.currentTime)
    showControls()
  }

  const changeAudio = (volume: number, muted: boolean) => {
    audio.change({ volume, muted })
    const node = video.current
    if (node) {
      node.volume = volume
      node.muted = muted
    }
    showControls()
  }

  const changeRate = (value: number) => {
    speed.current = value
    setRate(value)
    if (video.current) video.current.playbackRate = value
  }

  const openSubtitles = () => {
    countdown()
    setSubtitleSection('source')
    setSubtitleExpanded(true)
    setMenuOpen(true)
    showControls()
  }

  const toggleCaptions = () => {
    if (subtitle) setCaptions((value) => !value)
    else openSubtitles()
    showControls()
  }

  const toggleFullscreen = async () => {
    const target = viewer.current
    if (!target) return

    try {
      if (document.fullscreenElement === target) await document.exitFullscreen()
      else if (!document.fullscreenElement) {
        await target.requestFullscreen()
        if (!target.isConnected && document.fullscreenElement === target)
          await document.exitFullscreen()
      }

      if (mounted.current) showControls()
    } catch (reason) {
      if (mounted.current) setError(tr('全螢幕切換失敗：') + String(reason))
    }
  }

  const save = async () => {
    if (!file || !subtitle || row.readonly || !latest.current.record || saving.current) return

    saving.current = true

    try {
      await run({
        action: 'playback',
        rowId: row.rowId,
        revision: latest.current.record.revision,
        fileId: file.id,
        time: 0,
        subtitle: subtitle.token,
        settings,
      })
    } finally {
      saving.current = false
    }
  }

  const apply = (value: ExplorerResponse['subtitle']) => {
    if (!value) return

    try {
      const parsed = parseSubtitles(value.text)
      setCues(parsed)
      setSubtitle(value)
      setCaptions(true)
      setSettings(
        latest.current.record?.details?.playback?.[file?.id ?? '']?.settings?.[value.token] ??
          defaultSubtitle()
      )
      setError('')
    } catch (reason) {
      setError(String(reason))
    }
  }

  const load = async (entry?: MediaEntry, external?: File) => {
    const target = currentFile.current

    try {
      const result = external
        ? await window.explorer.dropSubtitle(row.rowId, external)
        : await window.explorer.request(
            entry
              ? {
                  action: 'subtitle',
                  rowId: row.rowId,
                  fileId: entry.id,
                  encoding: settings.encoding,
                }
              : { action: 'chooseSubtitle', rowId: row.rowId }
          )
      if (mounted.current && currentFile.current === target) apply(result.subtitle)
    } catch (reason) {
      if (mounted.current && currentFile.current === target) setError(String(reason))
    }
  }
  const importSubtitle = async () => {
    if (!subtitle) return
    const result = await run({
      action: 'subtitle',
      rowId: row.rowId,
      externalToken: subtitle.token,
      import: true,
      encoding: settings.encoding,
    })
    apply(result?.subtitle)
  }

  const changeSubtitleEncoding = async (v: string | null) => {
    if (!subtitle || !v) return
    try {
      const result = await window.explorer.request({
        action: 'subtitle',
        rowId: row.rowId,
        ...(subtitles.some((s) => s.id === subtitle.token)
          ? { fileId: subtitle.token }
          : { externalToken: subtitle.token }),
        encoding: v,
      })
      if (result.subtitle) {
        const parsed = parseSubtitles(result.subtitle.text)
        setCues(parsed)
        setSubtitle(result.subtitle)
        setSettings((s) => ({ ...s, encoding: v as SubtitlePrefs['encoding'] }))
      }
    } catch (e) {
      setError(String(e))
    }
  }

  useEffect(() => {
    mounted.current = true

    const target = viewer.current,
      changed = () => {
        setFullscreen(document.fullscreenElement === target)
        setActive(true)
      }

    document.addEventListener('fullscreenchange', changed)

    return () => {
      mounted.current = false
      pendingStart.current = false
      nextRef.current = undefined

      if (hideTimer.current) clearTimeout(hideTimer.current)
      if (clickTimer.current) clearTimeout(clickTimer.current)

      document.removeEventListener('fullscreenchange', changed)

      if (target && document.fullscreenElement === target)
        void document.exitFullscreen().catch(() => {})
    }
  }, [])

  useEffect(() => {
    setSubtitle(undefined)
    setCues([])
    setError('')
    setTime(0)
    setDuration(0)
    setBuffered(0)
    setFiles([])
    setSubtitleSection(null)
    setPaused(true)
    setWaiting(false)
    countdown()
    setMenuOpen(false)
    showControls()
  }, [file?.id])

  useEffect(() => {
    wantsPlayback.current = !!initialFileId || autoplay
    if (!autoplay) pendingStart.current = false
  }, [autoplay])

  useEffect(() => {
    const node = video.current
    if (!node || !audio.ready) return

    node.volume = audio.volume
    node.muted = audio.muted

    if (pendingStart.current && node.readyState >= 1) void playSelected(node)
  }, [audio.ready, file?.id])

  useEffect(() => {
    const visibility = () => {
      if (!background && document.hidden) {
        wantsPlayback.current = false
        pendingStart.current = false
        video.current?.pause()
        countdown()
      }
    }

    document.addEventListener('visibilitychange', visibility)
    return () => document.removeEventListener('visibilitychange', visibility)
  }, [])

  useEffect(() => {
    let alive = true,
      observed = false

    const apply = (visible: boolean | undefined) => {
      windowVisible.current = background || visible !== false

      if (!background && visible === false) {
        wantsPlayback.current = false
        pendingStart.current = false
        video.current?.pause()
        countdown()
      }
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

    return () => {
      alive = false
      remove()
    }
  }, [])

  useEffect(() => {
    const update = () => {
      const node = video.current,
        container = stage.current
      if (!node || !container) return

      const bounds = container.getBoundingClientRect(),
        ratio = (node.videoWidth || 16) / (node.videoHeight || 9),
        width = Math.min(bounds.width, bounds.height * ratio),
        height = width / ratio

      setStageSize({ width: bounds.width, height: bounds.height })
      setBox({
        left: (bounds.width - width) / 2,
        bottom: (bounds.height - height) / 2,
        width,
        height,
      })
      setControlHeight(controls.current?.getBoundingClientRect().height ?? 80)
    }

    const node = video.current,
      observer = new ResizeObserver(update)

    if (stage.current) observer.observe(stage.current)
    if (controls.current) observer.observe(controls.current)

    node?.addEventListener('loadedmetadata', update)
    update()

    return () => {
      observer.disconnect()
      node?.removeEventListener('loadedmetadata', update)
    }
  }, [file?.id])

  useEffect(() => {
    if (menuOpen) {
      countdown()
      setActive(true)
    }
  }, [menuOpen])

  useEffect(() => {
    if (!autoNext) countdown()
  }, [autoNext])

  useEffect(() => {
    if (!upNext || !autoNext) return

    const timer = setInterval(() => {
      const current = nextRef.current,
        list = filesLive.current

      if (
        !current ||
        (!background && document.hidden) ||
        !windowVisible.current ||
        current.fileId !== currentFile.current
      ) {
        countdown()
        return
      }

      const next = list[list.findIndex((entry) => entry.id === current.fileId) + 1]

      if (!next || next.id !== current.nextId) {
        countdown()
        return
      }

      if (current.remaining > 1) countdown({ ...current, remaining: current.remaining - 1 })
      else {
        countdown()
        selectVideo(next)
      }
    }, 1000)

    return () => clearInterval(timer)
  }, [upNext?.fileId, autoNext])

  useEffect(() => {
    const element = strip.current
    if (!element) return

    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || element.scrollWidth <= element.clientWidth) return

      const delta =
          (Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY) *
          (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientWidth : 1),
        next = Math.max(
          0,
          Math.min(element.scrollWidth - element.clientWidth, element.scrollLeft + delta)
        )

      if (next !== element.scrollLeft) {
        event.preventDefault()
        element.scrollLeft = next
      }
    }

    element.addEventListener('wheel', wheel, { passive: false })
    return () => element.removeEventListener('wheel', wheel)
  }, [entries])

  const keyboard = (event: React.KeyboardEvent) => {
    if (event.ctrlKey || event.altKey || event.metaKey || event.nativeEvent.isComposing || menuOpen)
      return

    const target = event.target as HTMLElement

    if (target.closest('input,select,textarea,[contenteditable="true"]')) return

    const key = event.key.toLowerCase(),
      node = video.current
    if (!node) return

    if (event.repeat && ['k', ' ', 'm', 'f', 'c'].includes(key)) return

    if (key === ' ' && target.closest('button')) return

    if (
      [
        'k',
        ' ',
        'm',
        'f',
        'c',
        'j',
        'l',
        'arrowleft',
        'arrowright',
        'arrowup',
        'arrowdown',
      ].includes(key)
    ) {
      event.preventDefault()
      event.stopPropagation()
      showControls()

      if (key === 'k' || key === ' ') togglePlay()
      else if (key === 'm')
        changeAudio(audio.volume || 0.5, audio.volume === 0 ? false : !audio.muted)
      else if (key === 'f') void toggleFullscreen()
      else if (key === 'c') toggleCaptions()
      else if (['j', 'l', 'arrowleft', 'arrowright'].includes(key))
        seek(
          node.currentTime +
            (['j', 'arrowleft'].includes(key) ? -1 : 1) * (['j', 'l'].includes(key) ? 10 : 5)
        )
      else
        changeAudio(
          Math.max(0, Math.min(1, audio.volume + (key === 'arrowup' ? 0.05 : -0.05))),
          false
        )
    }
  }

  const controlsVisible = active || paused || audioDragging || menuOpen || !!error || !!upNext

  const visible = captions
    ? cues
        .filter((cue) => time >= cue.start + settings.offset && time < cue.end + settings.offset)
        .map((cue) => cue.text)
        .join('\n')
    : ''

  const upcoming = videos.find((entry) => entry.id === upNext?.nextId)

  if (!file) return <div className="video-empty">{tr('此資料夾沒有直接影片')}</div>

  return (
    <div className="video-viewer" ref={viewer}>
      <div
        className="video-stage custom-video-stage"
        ref={stage}
        tabIndex={0}
        aria-label={tr('影片播放器')}
        onKeyDown={keyboard}
        onFocusCapture={showControls}
        onPointerMove={showControls}
        onPointerDown={showControls}
        onDoubleClick={(event) => {
          if (event.target === video.current || event.target === stage.current) {
            if (clickTimer.current) clearTimeout(clickTimer.current)
            void toggleFullscreen()
          }
        }}
        onDragOver={(event) => {
          if (
            event.dataTransfer.types.includes('Files') ||
            event.dataTransfer.types.includes('application/x-media-subtitle')
          )
            event.preventDefault()
        }}
        onDrop={(event) => {
          event.preventDefault()
          const id = event.dataTransfer.getData('application/x-media-subtitle')
          if (id) {
            const entry = subtitles.find((item) => item.id === id)
            if (entry) void load(entry)
          } else {
            const incoming = [...event.dataTransfer.files]
            setFiles(incoming)
            if (incoming.length > 1) openSubtitles()
            if (incoming.length === 1) void load(undefined, incoming[0])
          }
        }}
      >
        <VideoPlayer key={file.id}>
          <Video
            ref={bindVideo}
            src={file.url}
            playsInline
            autoPlay={false}
            controls={false}
            preload="metadata"

            onClick={() => {
              if (clickTimer.current) clearTimeout(clickTimer.current)
              clickTimer.current = setTimeout(togglePlay, 200)
            }}

            onPlay={(event) => {
              if (
                event.currentTarget !== video.current ||
                !event.currentTarget.isConnected ||
                (!background && document.hidden) ||
                !windowVisible.current
              )
                event.currentTarget.pause()
              else {
                setPaused(false)
                countdown()
                showControls()
              }
            }}

            onPause={(event) => {
              if (event.currentTarget === video.current) setPaused(true)
            }}
            onTimeUpdate={(event) => {
              if (event.currentTarget === video.current) setTime(event.currentTarget.currentTime)
            }}

            onLoadedMetadata={(event) => {
              const node = event.currentTarget
              if (node !== video.current) return
              setDuration(Number.isFinite(node.duration) ? node.duration : 0)
              node.playbackRate = speed.current
              if (wantsPlayback.current) void playSelected(node)
            }}

            onDurationChange={(event) => {
              if (event.currentTarget === video.current)
                setDuration(
                  Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0
                )
            }}

            onProgress={(event) => {
              const node = event.currentTarget
              if (node === video.current && node.buffered.length)
                setBuffered(node.buffered.end(node.buffered.length - 1))
            }}

            onWaiting={() => setWaiting(true)}
            onPlaying={() => setWaiting(false)}
            onCanPlay={() => setWaiting(false)}

            onEnded={(event) => {
              if (event.currentTarget !== video.current) return
              setPaused(true)
              setWaiting(false)
              const next = videos[index + 1]
              if (
                autoNext &&
                !menuOpen &&
                !(!background && document.hidden) &&
                windowVisible.current &&
                next
              )
                countdown({ fileId: file.id, nextId: next.id, remaining: 5 })
            }}

            onError={(event) => {
              if (event.currentTarget === video.current) {
                countdown()
                setWaiting(false)
                reportDecodeFailure()
              }
            }}
          />
        </VideoPlayer>

        {visible && (
          <div
            className="subtitle-overlay"
            style={{
              left: box.left,
              width: box.width || '100%',
              bottom: Math.max(
                box.bottom + (box.height * settings.bottom) / 100,
                controlsVisible ? controlHeight + 8 : 8
              ),
              fontSize: settings.size,
              color: settings.color,
            }}
          >
            <span style={{ background: settings.background + 'c0' }}>{visible}</span>
          </div>
        )}

        {waiting && !paused && !error && (
          <div className="video-waiting" role="status">
            {tr('影片緩衝中…')}
          </div>
        )}

        {(error || audio.error) && (
          <div className="video-error" role="alert">
            {failure && failure.fileId === file?.id && failureCause(failure.probe)
              ? failureCause(failure.probe)
              : error || audio.error}
            {failure && failure.fileId === file?.id && file && (
              <div className="video-error-actions">
                <button
                  type="button"
                  onClick={() =>
                    void run({ action: 'openFile', rowId: row.rowId, fileId: file.id })
                  }
                >
                  {tr('用系統預設播放器開啟')}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void run({ action: 'revealFile', rowId: row.rowId, fileId: file.id })
                  }
                >
                  {tr('在檔案總管顯示')}
                </button>
              </div>
            )}
          </div>
        )}

        {upNext && upcoming && (
          <div className="video-up-next" role="status">
            <strong>{tr('{0} 秒後播放下一部', upNext.remaining)}</strong>
            <span title={upcoming.name}>{upcoming.name}</span>
            <div>
              <button type="button" onClick={() => countdown()}>
                {tr('取消接續播放')}
              </button>
              <button type="button" onClick={() => selectVideo(upcoming)}>
                {tr('立即播放')}
              </button>
            </div>
          </div>
        )}

        <VideoControls
          controls={controls}
          stage={stage}
          panelHeight={Math.max(80, Math.min(440, stageSize.height - controlHeight - 20))}
          panelWidth={Math.max(200, Math.min(360, stageSize.width - 24))}
          interacting={setAudioDragging}
          visible={controlsVisible}
          paused={paused}
          time={time}
          duration={duration}
          buffered={buffered}
          volume={audio.volume}
          muted={audio.muted}
          rate={rate}
          audioReady={audio.ready}
          fullscreen={fullscreen}
          canPrevious={index > 0}
          canNext={index >= 0 && index < videos.length - 1}
          menuOpen={menuOpen}
          menu={(opened) => {
            if (opened) {
              setSubtitleSection(null)
              setSubtitleExpanded(false)
            }
            setMenuOpen(opened)
          }}
          play={togglePlay}
          seek={seek}
          audio={changeAudio}
          speed={changeRate}
          previous={() => {
            const previous = videos[index - 1]
            if (previous) selectVideo(previous)
          }}
          next={() => {
            const next = videos[index + 1]
            if (next) selectVideo(next)
          }}
          subtitleSettings={
            <Accordion
              className="player-subtitle-group"
              value={subtitleExpanded ? 'subtitles' : null}
              onChange={(value) => setSubtitleExpanded(!!value)}
              transitionDuration={0}
            >
              <Accordion.Item value="subtitles">
                <Accordion.Control>{tr('字幕設定')}</Accordion.Control>
                <Accordion.Panel>
                  <VideoSubtitleSettings
                    captions={captions}
                    toggleCaptions={toggleCaptions}
                    section={subtitleSection}
                    changeSection={setSubtitleSection}
                    error={error}
                    subtitle={subtitle}
                    files={files}
                    subtitles={subtitles}
                    settings={settings}
                    readonly={row.readonly}
                    load={load}
                    clear={() => {
                      setSubtitle(undefined)
                      setCues([])
                    }}
                    save={save}
                    importSubtitle={importSubtitle}
                    changeEncoding={changeSubtitleEncoding}
                    setSettings={setSettings}
                  />
                </Accordion.Panel>
              </Accordion.Item>
            </Accordion>
          }
          full={() => void toggleFullscreen()}
        />
      </div>

      {!hideStrip && (
        <div ref={strip} className="video-strip" aria-label={tr('資料夾影片')}>
          {videos.map((entry) => (
            <button
              key={entry.id}
              className={'video-tile ' + (entry.id === file.id ? 'active' : '')}
              aria-label={tr('播放 ') + entry.name}
              title={entry.name}
              onClick={() => selectVideo(entry)}
            >
              {entry.thumb ? (
                <img
                  src={entry.thumb}
                  alt=""
                  onError={(event) => {
                    event.currentTarget.style.display = 'none'
                  }}
                />
              ) : (
                <span className="video-symbol">
                  <Icon name="play" size={24} />
                </span>
              )}
              <span>{entry.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
