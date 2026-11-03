import { t as tr } from './i18n'

// What the right panel shows while a folder's content is on its way: the shape of the page, not an empty line.
export function PanelSkeleton() {
  return (
    <div className="panel-skeleton" role="status" aria-busy="true" aria-label={tr('載入內容…')}>
      <i style={{ width: '38%' }} />
      <i style={{ width: '92%' }} />
      <i style={{ width: '78%' }} />
      <div>
        <i />
        <i />
        <i />
      </div>
    </div>
  )
}
