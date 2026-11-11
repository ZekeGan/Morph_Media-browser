import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  type ReactNode,
} from 'react'
import { MantineProvider, Menu, Modal, Popover } from '@mantine/core'
import type { ThemeId } from '../../shared/themes'
import type { LocaleId } from '../../shared/locales'
import { setLocale, useLocale } from '../i18n'

export const themes = [
  {
    id: 'dark',
    name: '深色經典',
    description: '石墨灰介面與柔和青綠，保留熟悉的閱讀氛圍。',
    scheme: 'dark',
    accent: 'teal',
  },
  {
    id: 'glass',
    name: '霧白玻璃',
    description: '通透白色、柔和藍光與輕盈層次，靈感來自 macOS。',
    scheme: 'light',
    accent: 'blue',
  },
  {
    id: 'paper',
    name: '暖紙墨橘',
    description: '米白紙面、俐落黑線與醒目橘色，重現設計稿的編輯感。',
    scheme: 'light',
    accent: 'orange',
  },
] as const
const ThemeContext = createContext<
  | {
      theme: ThemeId
      saved: ThemeId
      ready: boolean
      error: string
      locale: LocaleId
      savedLocale: LocaleId
      preview: (theme: ThemeId) => void
      previewLocale: (locale: LocaleId) => void
      save: (theme: ThemeId, locale: LocaleId) => Promise<void>
    }
  | undefined
>(undefined)
export function useAppTheme() {
  const value = useContext(ThemeContext)
  // i18n-ignore: a programming error seen only by developers
  if (!value) throw new Error('缺少主題提供者')
  return value
}

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeId>('dark'),
    [saved, setSaved] = useState<ThemeId>('dark'),
    [ready, setReady] = useState(false),
    [error, setError] = useState('')
  const locale = useLocale(),
    [savedLocale, setSavedLocale] = useState<LocaleId>('en')
  useEffect(() => {
    let alive = true
    window.desktop
      .workspace()
      .then((state) => {
        if (alive) {
          const id = state.prefs.theme ?? 'dark',
            locale = state.prefs.locale ?? 'en'
          setTheme(id)
          setSaved(id)
          setLocale(locale)
          setSavedLocale(locale)
          setError(state.error ?? '')
          setReady(true)
        }
      })
      .catch((e) => {
        if (alive) {
          setError(String(e))
          setReady(true)
        }
      })
    return () => {
      alive = false
    }
  }, [])
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])
  const definition = themes.find((item) => item.id === theme)!
  const save = async (id: ThemeId, locale: LocaleId) => {
    if (error) throw new Error(error)
    const state = await window.desktop.updateWorkspace({ action: 'appearance', theme: id, locale })
    setSaved(state.prefs.theme ?? 'dark')
    setTheme(state.prefs.theme ?? 'dark')
    setSavedLocale(state.prefs.locale ?? 'en')
    setLocale(state.prefs.locale ?? 'en')
  }
  return (
    <ThemeContext.Provider
      value={{
        theme,
        saved,
        ready,
        error,
        locale,
        savedLocale,
        preview: setTheme,
        previewLocale: setLocale,
        save,
      }}
    >
      <MantineProvider
        forceColorScheme={definition.scheme}
        theme={{
          primaryColor: definition.accent,
          defaultRadius: theme === 'paper' ? 'xs' : 'md',
          fontFamily: "system-ui, 'Microsoft JhengHei', sans-serif",
          respectReducedMotion: true,
          components: {
            Modal: Modal.extend({
              defaultProps: { transitionProps: { transition: 'pop', duration: 150 } },
            }),
            Menu: Menu.extend({
              defaultProps: { transitionProps: { transition: 'pop', duration: 120 } },
            }),
            Popover: Popover.extend({
              defaultProps: { transitionProps: { transition: 'pop', duration: 120 } },
            }),
          },
        }}
      >
        {children}
      </MantineProvider>
    </ThemeContext.Provider>
  )
}
