import { useEffect, useState } from 'react'
import type { GameExtras } from '../../shared/explorer'
import type { FolderRow } from '../../shared/model'

// What main found for this game beyond its bound actions (R-305–R-310). Read again when the record changes, so a
// newly imported Steam or store address shows its button at once.
export function useGameExtras(row: FolderRow, enabled = true) {
  const [extras, setExtras] = useState<GameExtras>()
  useEffect(() => {
    if (!enabled || !row.record) return
    let alive = true
    void window.explorer
      .request({ action: 'gameExtras', rowId: row.rowId })
      .then((result) => alive && setExtras(result.extras))
      .catch(() => alive && setExtras(undefined))
    return () => {
      alive = false
    }
  }, [enabled, row.rowId, row.record?.revision])
  return extras
}
