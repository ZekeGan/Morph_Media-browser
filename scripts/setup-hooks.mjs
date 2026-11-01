// Points git at the shared hooks in .githooks (runs after `pnpm install`). Silent when this is not a git checkout.
import { spawnSync } from 'node:child_process'

const result = spawnSync('git', ['config', 'core.hooksPath', '.githooks'], { stdio: 'ignore' })
if (result.status === 0)
  console.log('git hooks: .githooks enabled (types, format and doc links before each commit)')
