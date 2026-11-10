import type { CellKind } from '../../shared/model'

// Field type -> the cell kind that displays it.
export const typeKinds: Record<string, CellKind> = {
  string: 'field-text',
  tags: 'field-tags',
  number: 'field-number',
  datetime: 'field-date',
  boolean: 'field-boolean',
  enum: 'field-enum',
  url: 'field-url',
  date: 'field-date-only',
}
