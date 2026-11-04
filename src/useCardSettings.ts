import { useEffect, useRef, useState, type RefObject } from 'react'
import { cardDisplay } from '../shared/browse'
import type { Project, Request, Response } from '../shared/model'
import { t as tr } from './i18n'

type Act = (request: Request) => Promise<Response | undefined>

// The CARD display settings (level, layout mode) and density (cards per row, page size) are edited live and
// saved to the project a moment after the last change; a newer edit wins over a save still in flight.
export function useCardSettings({
  project,
  deepest,
  busy,
  act,
  mounted,
}: {
  project: Project
  deepest: number
  busy: boolean
  act: Act
  mounted: RefObject<boolean>
}) {
  const [display, setDisplay] = useState(cardDisplay(project)),
    [density, setDensity] = useState<{ itemsPerRow: number | string; pageSize: number | string }>(
      project.list
    )
  const [cardPending, setCardPending] = useState(false),
    [cardSaveError, setCardSaveError] = useState('')
  const cardEdit = useRef(0),
    cardSaving = useRef(false),
    projectLive = useRef(project)
  projectLive.current = project
  const validDensity =
    typeof density.itemsPerRow === 'number' &&
    Number.isInteger(density.itemsPerRow) &&
    density.itemsPerRow >= 1 &&
    density.itemsPerRow <= 6 &&
    typeof density.pageSize === 'number' &&
    Number.isInteger(density.pageSize) &&
    density.pageSize >= 1 &&
    density.pageSize <= 500
  const liveList = validDensity
    ? { itemsPerRow: Number(density.itemsPerRow), pageSize: Number(density.pageSize) }
    : project.list
  const changedCard = () => {
    cardEdit.current++
    setCardPending(true)
    setCardSaveError('')
  }
  useEffect(() => {
    if (cardPending) return
    const next = cardDisplay(project)
    setDisplay({ ...next, level: next.level === 'all' ? 'all' : Math.min(next.level, deepest) })
    setDensity(project.list)
  }, [project.revision, deepest])
  useEffect(() => {
    if (!cardPending || !validDensity || busy || cardSaving.current) return
    const edit = cardEdit.current,
      projectId = project.projectId
    const timeout = setTimeout(() => {
      cardSaving.current = true
      void act({
        action: 'saveProject',
        project: { ...projectLive.current, cardView: display, list: liveList },
      })
        .then((result) => {
          if (!mounted.current || projectLive.current.projectId !== projectId) return
          if (edit === cardEdit.current) {
            setCardPending(false)
            if (!result) setCardSaveError(tr('顯示設定未保存，請重試'))
          }
        })
        .finally(() => {
          cardSaving.current = false
        })
    }, 300)
    return () => clearTimeout(timeout)
  }, [cardPending, display, density, busy, project.revision])
  return { display, setDisplay, density, setDensity, liveList, cardSaveError, changedCard }
}
