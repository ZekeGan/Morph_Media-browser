import type { MediaEntry } from '../../shared/explorer'
import { t as tr } from '../i18n'

// A file's kind in words, with its extension ("Image · PNG"), and its size for people (shared by the file list and
// the file page).
export const friendlyType = (entry: Pick<MediaEntry, 'name' | 'kind'>) => {
  const extension = entry.name.includes('.') ? entry.name.split('.').pop()!.toUpperCase() : ''
  const label = {
    image: tr('圖片'),
    video: tr('影片'),
    audio: tr('音樂'),
    subtitle: tr('字幕'),
    archive: tr('壓縮檔'),
    pdf: tr('PDF 文件'),
    text: tr('文字書'),
    folder: tr('資料夾'),
    other: tr('其他'),
  }[entry.kind]
  return extension && entry.kind !== 'pdf' ? label + ' · ' + extension : label
}
export const fileSize = (bytes: number) =>
  bytes >= 1024 * 1024
    ? (bytes / 1024 / 1024).toFixed(1) + ' MB'
    : (bytes / 1024).toFixed(1) + ' KB'
