import { useSyncExternalStore } from 'react'
import type { LocaleId } from '../../shared/locales'
import { catalog } from './catalog'
import { hasMessage, renderMessages } from '../../shared/message'
let language: LocaleId = 'en'
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
export const currentLocale = () => language
export function setLocale(locale: LocaleId) {
  language = locale
  if (typeof document !== 'undefined') document.documentElement.lang = locale
  for (const listener of listeners) listener()
}
export const useLocale = () => useSyncExternalStore(subscribe, currentLocale)
export function t(source: string, ...values: unknown[]): string {
  // Main-process messages sent with their values (R-281): translate each sentence, then fill its values in.
  if (hasMessage(source))
    return renderMessages(source, (key, sent) =>
      t(key, ...sent.map((value) => (hasMessage(value) ? t(value) : value)))
    )
  const key = source.replace(/\s+/g, ' ').trim(),
    translated = catalog[language][key]
  const message =
    translated === undefined
      ? source
      : (source.match(/^\s*/)?.[0] ?? '') + translated + (source.match(/\s*$/)?.[0] ?? '')
  return message.replace(/\{(\d+)\}/g, (placeholder, index) =>
    Number(index) < values.length ? String(values[Number(index)]) : placeholder
  )
}

export function fieldTypeLabel(type: string): string {
  const labels = {
    string: '文字',
    tags: '標籤',
    number: '數字',
    datetime: '日期時間',
    boolean: '是／否',
    enum: '單選',
    url: '網址',
    date: '日期',
  } as Record<string, string>
  const label = Object.hasOwn(labels, type) ? labels[type] : undefined
  return label ? t(label) : type
}
