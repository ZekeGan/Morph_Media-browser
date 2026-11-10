import type { PointerEvent, ReactNode, RefObject } from 'react'

// The single frame of the right-hand folder panel: resizer, header, optional tabs, scroll body and footer.
// Pages differ only in the slots they fill; navigation state stays in the owner.
export function RightPanel({
  className = '',
  label,
  resizerLabel,
  width,
  onResizeStart,
  onResizeMove,
  onResizeEnd,
  header,
  tabs,
  bodyRef,
  footer,
  children,
}: {
  className?: string
  label: string
  resizerLabel: string
  width: number
  onResizeStart: (event: PointerEvent<HTMLDivElement>) => void
  onResizeMove: (event: PointerEvent<HTMLDivElement>) => void
  onResizeEnd: (event: PointerEvent<HTMLDivElement>) => void
  header: ReactNode
  tabs?: ReactNode
  bodyRef: RefObject<HTMLDivElement | null>
  footer?: ReactNode
  children: ReactNode
}) {
  return (
    <>
      <div
        role="separator"
        aria-label={resizerLabel}
        className="panel-resizer"
        onPointerDown={onResizeStart}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeEnd}
      />
      <aside className={'folder-panel ' + className} aria-label={label} style={{ width }}>
        <div className="folder-panel-header">{header}</div>
        {tabs}
        <div ref={bodyRef} className="folder-panel-body">
          {children}
        </div>
        {footer}
      </aside>
    </>
  )
}
