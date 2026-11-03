import { t as tr } from './i18n'
import type { CommonFieldNames } from '../shared/layouts'

export const commonFieldNames = (): CommonFieldNames => ({
  rating: tr('評分'),
  tags: tr('標籤'),
  status: tr('狀態'),
  statuses: [tr('未開始'), tr('進行中'), tr('已完成')],
  note: tr('備註'),
})
