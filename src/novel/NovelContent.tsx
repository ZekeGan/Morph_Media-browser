import { createElement, Fragment, memo, type ReactNode } from 'react'
import { packagePath, rubyPieces, type TextPiece } from '../../shared/novel'

// R-282: one chapter as React elements. TXT lines become paragraphs with web-novel ruby; EPUB XHTML is rebuilt from a
// short list of text elements (no scripts, styles, links or event handlers), and pictures only come from the book.

// In vertical text, short runs of half-width digits stand upright in one cell (縦中横).
function upright(text: string, vertical: boolean, key: string): ReactNode {
  if (!vertical || !/[0-9!?]/.test(text)) return text
  return text.split(/(\b[0-9]{1,2}\b|!!|!\?|\?!)/).map((part, index) =>
    index % 2 ? (
      <span key={key + index} className="novel-tcy">
        {part}
      </span>
    ) : (
      part
    )
  )
}
const pieces = (list: TextPiece[], vertical: boolean, key: string) =>
  list.map((piece, index) =>
    typeof piece === 'string' ? (
      <Fragment key={key + index}>{upright(piece, vertical, key + index + '-')}</Fragment>
    ) : (
      <ruby key={key + index}>
        {piece.base}
        <rp>(</rp>
        <rt>{piece.ruby}</rt>
        <rp>)</rp>
      </ruby>
    )
  )

export const TextChapter = memo(function TextChapter({
  title,
  text,
  vertical,
}: {
  title: string
  text: string
  vertical: boolean
}) {
  return (
    <>
      {title && <h2 className="novel-chapter-title">{title}</h2>}
      {text
        .split('\n')
        .map((line, index) =>
          line.trim() ? (
            <p key={index}>{pieces(rubyPieces(line), vertical, String(index))}</p>
          ) : (
            <p key={index} className="novel-blank" aria-hidden="true" />
          )
        )}
    </>
  )
})

const allowed = new Set([
  'p',
  'div',
  'span',
  'section',
  'article',
  'header',
  'footer',
  'main',
  'aside',
  'figure',
  'figcaption',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'br',
  'hr',
  'em',
  'i',
  'b',
  'strong',
  'u',
  's',
  'small',
  'sub',
  'sup',
  'ruby',
  'rb',
  'rt',
  'rp',
  'blockquote',
  'ul',
  'ol',
  'li',
  'dl',
  'dt',
  'dd',
  'table',
  'thead',
  'tbody',
  'tr',
  'td',
  'th',
  'pre',
  'code',
  'cite',
  'q',
])
const dropped = new Set([
  'script',
  'style',
  'head',
  'title',
  'link',
  'meta',
  'iframe',
  'object',
  'embed',
  'form',
  'button',
  'input',
  'textarea',
  'select',
  'video',
  'audio',
  'canvas',
  'template',
  'noscript',
])

function build(
  node: Node,
  context: { path: string; images: Record<string, string>; vertical: boolean },
  key: string
): ReactNode {
  if (node.nodeType === Node.TEXT_NODE)
    return upright(node.textContent ?? '', context.vertical, key)
  if (node.nodeType !== Node.ELEMENT_NODE) return null
  const element = node as Element,
    tag = element.localName.toLowerCase()
  if (dropped.has(tag)) return null
  // Pictures: <img src> and SVG <image href> inside the book, served by the read-only archive stream.
  if (tag === 'img' || tag === 'image') {
    const href =
      element.getAttribute('src') ??
      element.getAttribute('href') ??
      element.getAttributeNS('http://www.w3.org/1999/xlink', 'href')
    const target = href ? packagePath(context.path, href) : undefined,
      url = target ? context.images[target] : undefined
    return url ? (
      <img key={key} className="novel-image" src={url} alt={element.getAttribute('alt') ?? ''} />
    ) : null
  }
  const children = [...element.childNodes].map((child, index) =>
    build(child, context, key + '.' + index)
  )
  if (tag === 'svg' || tag === 'a' || !allowed.has(tag))
    return <Fragment key={key}>{children}</Fragment>
  return createElement(tag, { key }, ...(tag === 'br' || tag === 'hr' ? [] : children))
}

export const HtmlChapter = memo(function HtmlChapter({
  html,
  path,
  images,
  vertical,
}: {
  html: string
  path: string
  images: Record<string, string>
  vertical: boolean
}) {
  let doc = new DOMParser().parseFromString(html, 'application/xhtml+xml')
  if (doc.querySelector('parsererror')) doc = new DOMParser().parseFromString(html, 'text/html')
  const body = doc.body ?? doc.documentElement
  return (
    <>
      {[...body.childNodes].map((child, index) =>
        build(child, { path, images, vertical }, String(index))
      )}
    </>
  )
})

// Plain text of a chapter, for searching.
export function chapterText(chapter: { text?: string; html?: string }) {
  if (chapter.text !== undefined) return chapter.text
  const doc = new DOMParser().parseFromString(chapter.html ?? '', 'text/html')
  for (const node of doc.querySelectorAll('script,style,rt,rp')) node.remove()
  return doc.body?.textContent ?? ''
}
