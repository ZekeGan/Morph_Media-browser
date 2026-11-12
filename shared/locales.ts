export const localeIds = ['zh-TW', 'ja', 'zh-CN', 'en', 'es'] as const
export type LocaleId = (typeof localeIds)[number]
export const isLocaleId = (value: unknown): value is LocaleId =>
  typeof value === 'string' && localeIds.includes(value as LocaleId)
export const localeOptions = [
  { value: 'zh-TW', label: '繁體中文' }, // i18n-ignore: shown in its own language
  { value: 'ja', label: '日本語' }, // i18n-ignore: shown in its own language
  { value: 'zh-CN', label: '简体中文' }, // i18n-ignore: shown in its own language
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
]
export function systemLocale(languages: readonly string[]): LocaleId {
  for (const language of languages) {
    const tag = language.toLowerCase().replaceAll('_', '-')
    if (/^zh(?:-|$)/.test(tag)) return /(?:hant|tw|hk|mo)/.test(tag) ? 'zh-TW' : 'zh-CN'
    if (/^ja(?:-|$)/.test(tag)) return 'ja'
    if (/^en(?:-|$)/.test(tag)) return 'en'
    if (/^es(?:-|$)/.test(tag)) return 'es'
  }
  return 'en'
}
