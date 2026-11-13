import { useEffect, type DependencyList, type RefObject } from 'react'

// R-371: what the manga reader and the novel reader do the same way when taking keys and the wheel. What each key
// or wheel turn means stays in the reader that owns it.

// A reader takes its keys before anything under it: on the window, in the capture phase, with this render's handler.
export function useCapturedKeys(handler: (event: KeyboardEvent) => void) {
  useEffect(() => {
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  })
}

// A wheel listener that may cancel the browser's own scrolling or zooming (React's onWheel is passive). Without
// deps it is bound again on every render, so the handler always sees this render's values.
export function useWheel(
  target: RefObject<HTMLElement | null>,
  handler: (event: WheelEvent, element: HTMLElement) => void,
  deps?: DependencyList
) {
  useEffect(() => {
    const element = target.current
    if (!element) return
    const wheel = (event: WheelEvent) => handler(event, element)
    element.addEventListener('wheel', wheel, { passive: false })
    return () => element.removeEventListener('wheel', wheel)
  }, deps)
}

// The key was the reader's: nothing else acts on it.
export function consume(event: Event) {
  event.preventDefault()
  event.stopImmediatePropagation()
}

// Keys go back to the reading surface once the current change is on screen.
export const focusNextFrame = (target: RefObject<HTMLElement | null>) =>
  requestAnimationFrame(() => target.current?.focus({ preventScroll: true }))
