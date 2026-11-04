import { isNewerFormat } from './upgrade'

export type NoticeLevel = 'success' | 'warning' | 'error'

// Transient operation feedback. Never stored in portable folder/project records.
export interface Notice {
  level: NoticeLevel
  message: string
  // Next step for the user, and the original technical text when the message was rewritten.
  hint?: string
  detail?: string
}

export function completionNotice(completed: number, issues: number, message: string): Notice {
  return {
    level: issues === 0 ? 'success' : completed > 0 ? 'warning' : 'error',
    message,
  }
}

// Electron prefixes rejected IPC calls with "Error invoking remote method '<channel>': "; users should only see the cause.
export function errorMessage(text: string): string {
  return text
    .replace(/^(?:Error: )*Error invoking remote method '[^']*': /, '')
    .replace(/^(?:Error: )+/, '')
}

export type ErrorKind =
  'permission' | 'busy' | 'diskFull' | 'missing' | 'offline' | 'conflict' | 'newer' | 'unknown'

// Classifies raw system errors (Node error codes, network failures) so the UI can say what to do next.
export function classifyError(text: string): ErrorKind {
  if (/\b(EPERM|EACCES)\b|permission denied|operation not permitted/i.test(text))
    return 'permission'
  if (/\b(EBUSY|ETXTBSY|EMFILE)\b|being used by another process/i.test(text)) return 'busy'
  if (/\bENOSPC\b|no space left/i.test(text)) return 'diskFull'
  if (/\bENOENT\b|no such file or directory/i.test(text)) return 'missing'
  if (
    /\b(ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN)\b|fetch failed|net::ERR/i.test(text)
  )
    return 'offline'
  if (/版本衝突/.test(text)) return 'conflict'
  if (isNewerFormat(text)) return 'newer'
  return 'unknown'
}
