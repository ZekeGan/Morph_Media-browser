import { t as tr, useLocale } from './i18n'
import { useEffect } from 'react'
import { Notification, Portal } from '@mantine/core'
import type { ReactNode } from 'react'
import type { Notice } from '../shared/notifications'

export function Toasts({
  notice,
  version,
  close,
  progress,
}: {
  notice?: Notice
  version: number
  close: () => void
  progress: ReactNode
}) {
  useLocale()
  useEffect(() => {
    if (!notice || notice.level !== 'success') return
    const timer = setTimeout(close, 5000)
    return () => clearTimeout(timer)
  }, [notice, version, close])

  return (
    <Portal>
      <div className="app-toasts" aria-live="polite">
        {progress && (
          <Notification withCloseButton={false} loading title={tr('處理進度')}>
            {progress}
          </Notification>
        )}
        {notice && (
          <Notification
            color={
              notice.level === 'error' ? 'red' : notice.level === 'warning' ? 'orange' : 'teal'
            }
            title={
              notice.level === 'error'
                ? tr('操作未完成')
                : notice.level === 'warning'
                  ? tr('需要注意')
                  : tr('提示')
            }
            onClose={close}
            role={notice.level === 'success' ? 'status' : 'alert'}
            data-level={notice.level}
          >
            <div className="message">{notice.message}</div>
            {notice.hint && <div className="notice-hint">{notice.hint}</div>}
            {notice.detail && (
              <details className="notice-detail">
                <summary>{tr('技術細節')}</summary>
                <code>{notice.detail}</code>
              </details>
            )}
          </Notification>
        )}
      </div>
    </Portal>
  )
}
