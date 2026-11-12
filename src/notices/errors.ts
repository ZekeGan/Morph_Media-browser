import { t as tr } from '../i18n'
import { classifyError, errorMessage } from '../../shared/notifications'
import { plainMessage } from '../../shared/message'

// Turns any thrown value into text a user can act on; the original wording is kept as `detail` when it was rewritten.
export function describeError(raw: unknown): { message: string; hint?: string; detail?: string } {
  const sent = errorMessage(raw instanceof Error ? raw.message : String(raw)),
    // The technical wording shown beside a rewritten message, with any sent values filled in (R-281).
    detail = plainMessage(sent)
  if (detail === '備用欄位必須存在且型別可相容顯示')
    return { message: tr('備用欄位必須存在且型別可相容顯示') }
  switch (classifyError(detail)) {
    case 'permission':
      return {
        message: tr('沒有權限完成這個操作'),
        hint: tr('請確認檔案或資料夾沒有設為唯讀，也沒有被其他程式開啟，然後再試一次。'),
        detail,
      }
    case 'busy':
      return {
        message: tr('檔案正被其他程式使用'),
        hint: tr('關閉正在使用它的程式後再試一次。'),
        detail,
      }
    case 'diskFull':
      return {
        message: tr('磁碟空間不足'),
        hint: tr('清出空間後再試一次；原始檔案沒有被改動。'),
        detail,
      }
    case 'missing':
      return {
        message: tr('找不到檔案或資料夾'),
        hint: tr('它可能已被移動或刪除；重新整理，或重新連結專案後再試。'),
        detail,
      }
    case 'offline':
      return {
        message: tr('無法連線'),
        hint: tr('請檢查網路連線與網址是否正確，然後再試一次。'),
        detail,
      }
    case 'conflict':
      return {
        message: tr(sent),
        hint: tr('資料已在別處更新，請重新載入後再試一次；你的修改不會被自動覆蓋。'),
      }
    case 'newer':
      return {
        message: tr('這份資料來自較新版本的 M:orph'),
        hint: tr('請更新程式。在那之前只能查看，不會寫入、復原或清除。'),
        detail,
      }
    default:
      // Main-process sentences are translated here when they have a key (R-281).
      return { message: tr(sent) }
  }
}
