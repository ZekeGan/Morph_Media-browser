import { Component, type ReactNode } from 'react'
import { t as tr } from '../i18n'
import { describeError } from './errors'

// Last resort for render failures: say what happened and offer a reload instead of leaving a blank window.
export class ErrorBoundary extends Component<{ children: ReactNode }, { error?: unknown }> {
  state: { error?: unknown } = {}
  static getDerivedStateFromError(error: unknown) {
    return { error }
  }
  componentDidCatch(error: unknown) {
    console.error('Renderer error', error)
  }
  render() {
    if (this.state.error === undefined) return this.props.children
    const { detail, message } = describeError(this.state.error)
    return (
      <div className="error-boundary" role="alert">
        <h2>{tr('畫面發生未預期的錯誤')}</h2>
        <p>{tr('你的資料夾與資料夾資訊不會因此被改動。重新載入後可以繼續使用。')}</p>
        <button type="button" onClick={() => window.location.reload()}>
          {tr('重新載入')}
        </button>
        <details>
          <summary>{tr('技術細節')}</summary>
          <code>{detail ?? message}</code>
        </details>
      </div>
    )
  }
}
