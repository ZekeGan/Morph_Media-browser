import { decode } from '../metadata-common'

// What a website adapter gets: the pasted address, fixed-host requests and helpers that collect preview values.
export interface Site {
  input: URL
  source: string
  // The address path must match the site's work-page pattern; otherwise the user is asked for a full work address.
  match(expression: RegExp): RegExpExecArray
  request(url: string, body?: unknown): Promise<string>
  json(url: string, body?: unknown): Promise<any>
  text(key: string, value: unknown): void
  list(key: string, value: unknown): void
  number(key: string, value: unknown): void
}
export interface SiteResult {
  title: string
  canonical: string
  image?: string
}
export type Adapter = (site: Site) => Promise<SiteResult>

export const clean = (value: unknown) =>
  decode(value)
    .replace(/<[^>]*>/g, '')
    .slice(0, 10000)
export const tags = (value: unknown) =>
  Array.isArray(value)
    ? [
        ...new Set(
          value
            .filter((item): item is string => typeof item === 'string')
            .map((item) => clean(item).slice(0, 100))
            .filter(Boolean)
        ),
      ].slice(0, 200)
    : []
