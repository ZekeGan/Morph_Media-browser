import type { LocaleId } from './locales'
const messages = {
  選擇備份位置: {
    ja: 'バックアップの保存先を選択',
    'zh-CN': '选择备份位置',
    en: 'Choose where to save the backup',
    es: 'Elige dónde guardar la copia',
  },
  選擇備份資料夾: {
    ja: 'バックアップフォルダーを選択',
    'zh-CN': '选择备份文件夹',
    en: 'Choose a backup folder',
    es: 'Elige una carpeta de copia',
  },
  選擇要放入資料的根資料夾: {
    ja: 'データを入れるルートフォルダーを選択',
    'zh-CN': '选择要放入数据的根文件夹',
    en: 'Choose the root folder to import into',
    es: 'Elige la carpeta raíz donde importar',
  },
  '部分資料清理失敗：': {
    ja: '一部のデータを消去できませんでした：',
    'zh-CN': '部分数据清理失败：',
    en: 'Some data could not be cleared:',
    es: 'No se pudieron borrar algunos datos:',
  },
  操作仍在進行: {
    ja: '処理が進行中です',
    'zh-CN': '操作仍在进行',
    en: 'Operation in progress',
    es: 'Operación en curso',
  },
  '請等候保存完成；掃描可先按「取消掃描」，再關閉程式。': {
    ja: '保存が完了するまでお待ちください。スキャン中は中止してから閉じてください。',
    'zh-CN': '请等待保存完成；扫描可先按“取消扫描”，再关闭程序。',
    en: 'Wait for saving to finish. Cancel an active scan before closing the app.',
    es: 'Espera a que termine el guardado. Cancela el escaneo antes de cerrar la aplicación.',
  },
  繼續等待: { ja: '待機を続ける', 'zh-CN': '继续等待', en: 'Keep waiting', es: 'Seguir esperando' },
  '要放棄尚未保存的變更嗎？': {
    ja: '未保存の変更を破棄しますか？',
    'zh-CN': '要放弃未保存的更改吗？',
    en: 'Discard unsaved changes?',
    es: '¿Descartar los cambios sin guardar?',
  },
  '返回可繼續編輯；放棄後會關閉或重新載入畫面。': {
    ja: '戻ると編集を続けられます。破棄すると画面を閉じるか再読み込みします。',
    'zh-CN': '返回可继续编辑；放弃后会关闭或重新加载界面。',
    en: 'Go back to keep editing, or discard to close or reload the window.',
    es: 'Vuelve para seguir editando o descarta para cerrar o recargar la ventana.',
  },
  返回編輯: { ja: '編集に戻る', 'zh-CN': '返回编辑', en: 'Keep editing', es: 'Seguir editando' },
  放棄變更: {
    ja: '変更を破棄',
    'zh-CN': '放弃更改',
    en: 'Discard changes',
    es: 'Descartar cambios',
  },
  圖片: { ja: '画像', 'zh-CN': '图片', en: 'Images', es: 'Imágenes' },
  程式: { ja: '実行ファイル', 'zh-CN': '程序', en: 'Applications', es: 'Aplicaciones' },
  字幕: { ja: '字幕', 'zh-CN': '字幕', en: 'Subtitles', es: 'Subtítulos' },
  啟動失敗: {
    ja: '起動できませんでした',
    'zh-CN': '启动失败',
    en: 'Startup failed',
    es: 'Error al iniciar',
  },
} as const
export function nativeText(source: keyof typeof messages, locale: LocaleId) {
  return locale === 'zh-TW' ? source : messages[source][locale]
}
