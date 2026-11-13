import { test } from 'node:test'
import assert from 'node:assert/strict'
// @ts-expect-error - a plain .mjs tooling module without type declarations
import { failureSummary } from '../scripts/test-report.mjs'

test('R-356: a failed UI test is reported by its error, its values and the line it stopped at', () => {
  const output = [
    '\x1b[2mbuild noise\x1b[22m',
    'AssertionError [ERR_ASSERTION]: tabs height 13.6',
    '    at <anonymous> (D:\\project\\tests\\novel-ui.ts:353:10)',
    '    at process.processTicksAndRejections (node:internal/process/task_queues:105:5) {',
    '  actual: false,',
    '  expected: true,',
    "  operator: '==',",
    '}',
    'Artifacts: D:\\project\\.test-output\\novel-ui-abc',
    'Node.js v24.13.0',
  ].join('\n')
  const summary = failureSummary(output, 'novel-ui')
  assert.match(summary, /^AssertionError \[ERR_ASSERTION\]: tabs height 13\.6/)
  assert.match(summary, /actual: false/)
  assert.match(summary, /Stopped at: <anonymous> \(D:\\project\\tests\\novel-ui\.ts:353:10\)/)
  assert.match(summary, /Artifacts: /)
  assert.doesNotMatch(summary, /build noise|processTicksAndRejections|Node\.js v/)
})

test('R-356: output without an error line falls back to its last lines', () => {
  const lines = Array.from({ length: 30 }, (_, i) => 'line ' + i)
  assert.equal(failureSummary(lines.join('\n'), 'x'), lines.slice(-12).join('\n'))
})
