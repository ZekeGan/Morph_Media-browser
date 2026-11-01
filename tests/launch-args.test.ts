import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseLaunchArgs } from '../shared/launchArgs'

test('launch arguments accept pasted Windows paths and still reject real mistakes', () => {
  assert.deepEqual(parseLaunchArgs(''), [])
  assert.deepEqual(parseLaunchArgs('[]'), [])
  assert.deepEqual(parseLaunchArgs('["-run","D:\\\\Media\\\\game.exe"]'), [
    '-run',
    'D:\\Media\\game.exe',
  ])
  // Single backslashes, as pasted from Explorer, are fixed instead of failing.
  assert.deepEqual(parseLaunchArgs('["-run","D:\\Media\\gal\\遊戲\\game.exe"]'), [
    '-run',
    'D:\\Media\\gal\\遊戲\\game.exe',
  ])
  // A path such as D:\new\test.exe must keep its backslash-letter pairs, not turn into control characters.
  assert.deepEqual(parseLaunchArgs('["D:\\new\\test.exe"]'), ['D:\\new\\test.exe'])
  assert.deepEqual(parseLaunchArgs('["--title","含 空白 的值"]'), ['--title', '含 空白 的值'])
  assert.equal(parseLaunchArgs('-run D:\\game.exe'), undefined)
  assert.equal(parseLaunchArgs('["unterminated'), undefined)
  assert.equal(parseLaunchArgs('[1,2]'), undefined)
  assert.equal(parseLaunchArgs('{"a":"b"}'), undefined)
})
